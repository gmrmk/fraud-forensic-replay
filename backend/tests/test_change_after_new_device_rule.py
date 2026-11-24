"""change-after-new-device: a change within N minutes of a sign-in in the same session, from a
device never seen on that subject, on a listed ip_type. The platform-access pack uses it for
API keys created in a console session. The hand-built rows below use their own neutral names:
the detector takes every kind and field name from the rule."""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient

import main
import rules as rules_module
import scenario_registry as sr
from db import PROJECT_ROOT
from rules.change_after_new_device import changes_after_new_device

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
RULE = {
    "id": "change-new-device",
    "label": "Change after a new-device sign-in",
    "detector": "change-after-new-device",
    "signin_kind": "signin",
    "change_kind": "account_change",
    "subject_field": "member_id",
    "session_field": "session_id",
    "device_field": "device_id",
    "ip_type_field": "ip_type",
    "ip_types": ["datacenter"],
    "window_min": 10,
    "verdict": "TAKEOVER",
    "decision": "FLAG",
    "severity": 0.9,
}


def si(id_, subj, sess, dev, ip_type, hms):
    return {
        "id": id_,
        "member_id": subj,
        "session_id": sess,
        "device_id": dev,
        "ip_type": ip_type,
        "timestamp": f"2026-06-08T{hms}-05:00",
    }


def ch(id_, subj, sess, hms):
    return {
        "id": id_,
        "member_id": subj,
        "session_id": sess,
        "timestamp": f"2026-06-08T{hms}-05:00",
    }


BASE = [si("s0", "p1", "x0", "HOME1", "residential", "08:00:00")]


def test_fires_on_a_new_device_data_center_sign_in_then_a_change_in_session():
    (d,) = changes_after_new_device(
        BASE + [si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00")],
        [ch("c1", "p1", "x1", "09:04:00")],
        RULE,
    )
    assert d.id == "decision:change-new-device:c1"
    assert d.trigger_entity_ids == ["s1", "c1"]
    assert d.subject_path_kind == "account_change"
    assert (d.verdict, d.decision, d.severity) == ("TAKEOVER", "FLAG", 0.9)
    assert all(isinstance(i["value"], str) for i in d.inputs)


@pytest.mark.parametrize(("hms", "fires"), [("09:10:00", True), ("09:10:01", False)])
def test_the_window_is_inclusive(hms, fires):
    out = changes_after_new_device(
        [si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00")], [ch("c1", "p1", "x1", hms)], RULE
    )
    assert bool(out) is fires


def test_silent_when_the_device_was_seen_before_on_that_subject():
    signins = [
        si("s0", "p1", "x0", "NEW1", "residential", "08:00:00"),
        si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00"),
    ]
    assert changes_after_new_device(signins, [ch("c1", "p1", "x1", "09:04:00")], RULE) == []


def test_a_device_seen_only_on_another_subject_is_still_new_here():
    signins = [
        si("s0", "p2", "x0", "NEW1", "datacenter", "08:00:00"),
        si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00"),
    ]
    assert len(changes_after_new_device(signins, [ch("c1", "p1", "x1", "09:04:00")], RULE)) == 1


def test_silent_on_a_residential_sign_in():
    assert (
        changes_after_new_device(
            [si("s1", "p1", "x1", "NEW1", "residential", "09:00:00")],
            [ch("c1", "p1", "x1", "09:04:00")],
            RULE,
        )
        == []
    )


def test_silent_when_the_change_is_in_another_session():
    assert (
        changes_after_new_device(
            [si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00")],
            [ch("c1", "p1", "x9", "09:04:00")],
            RULE,
        )
        == []
    )


def test_silent_when_the_sign_in_comes_after_the_change():
    assert (
        changes_after_new_device(
            [si("s1", "p1", "x1", "NEW1", "datacenter", "09:05:00")],
            [ch("c1", "p1", "x1", "09:04:00")],
            RULE,
        )
        == []
    )


def test_an_incomplete_rule_returns_nothing_and_warns(caplog):
    rule = {k: v for k, v in RULE.items() if k != "window_min"}
    with caplog.at_level(logging.WARNING):
        out = changes_after_new_device(
            [si("s1", "p1", "x1", "NEW1", "datacenter", "09:00:00")],
            [ch("c1", "p1", "x1", "09:04:00")],
            rule,
        )
    assert out == [] and "window_min" in caplog.text


def test_it_is_registered():
    assert "change-after-new-device" in rules_module.RULE_EVALUATORS


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def test_on_the_pack_it_queues_every_data_center_key_and_no_office_rotation(client):
    assert client.post("/api/scenario/select", json={"id": "platform-access"}).status_code == 200
    body = [
        d
        for d in client.get("/api/decisions").json()
        if d["rule"]["kind"] == "change-after-new-device"
    ]
    queued = sorted(d["trigger_entity_ids"][-1] for d in body)
    manifest = sr.load_manifest(SCENARIOS / "platform-access.scenario.json", base_dir=PROJECT_ROOT)
    created = [k for k in manifest.json_rows("key_event") if k["event"] == "created"]
    signin = {s["session_id"]: s for s in manifest.json_rows("console_signin")}
    data_center = [k["id"] for k in created if signin[k["session_id"]]["ip_type"] == "datacenter"]
    office = [k["id"] for k in created if signin[k["session_id"]]["ip_type"] != "datacenter"]
    assert (len(queued), len(data_center), len(office)) == (10, 10, 2)
    assert queued == sorted(data_center) and not set(office) & set(queued)


def _pack_rule(manifest: sr.Manifest) -> dict:
    (rule,) = [r for r in manifest.rules if r["detector"] == "change-after-new-device"]
    return rule


def test_the_manifest_rule_sets_the_window_and_its_sop_names_it():
    manifest = sr.load_manifest(SCENARIOS / "platform-access.scenario.json", base_dir=PROJECT_ROOT)
    rule = _pack_rule(manifest)
    assert rule["window_min"] == 10
    assert f"{rule['window_min']} minutes" in rule["sop"]["what"]


def test_the_pack_rule_reads_its_own_rows_whatever_scenario_is_active():
    """The rows come from the pack the connection belongs to, not the active scenario."""
    import sqlite3

    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    manifest = sr.load_manifest(SCENARIOS / "platform-access.scenario.json", base_dir=PROJECT_ROOT)
    conn = sqlite3.connect(f"file:{manifest.db_path}?mode=ro", uri=True)
    try:
        assert len(rules_module.evaluate(conn, [_pack_rule(manifest)])) == 10
    finally:
        conn.close()


def test_the_pack_rule_reads_its_rows_when_the_registry_lacks_the_pack(monkeypatch):
    """A registry left holding other manifests (a test's own) still finds the pack by its DB."""
    import sqlite3

    card = sr.load_manifest(SCENARIOS / "card-fraud.scenario.json", base_dir=PROJECT_ROOT)
    monkeypatch.setattr(sr, "_REGISTRY", {card.id: card})
    manifest = sr.load_manifest(SCENARIOS / "platform-access.scenario.json", base_dir=PROJECT_ROOT)
    conn = sqlite3.connect(f"file:{manifest.db_path}?mode=ro", uri=True)
    try:
        assert len(rules_module.evaluate(conn, [_pack_rule(manifest)])) == 10
    finally:
        conn.close()


def test_a_change_with_no_session_is_skipped():
    # A platform-made change (a key revoked by the system) has no session and no sign-in.
    system_change = {
        "id": "c9",
        "member_id": "p1",
        "session_id": None,
        "timestamp": "2026-06-08T09:10:00-05:00",
    }
    signin_without_session = {
        **si("s9", "p1", "x9", "NEW9", "datacenter", "09:05:00"),
        "session_id": None,
    }
    assert changes_after_new_device([*BASE, signin_without_session], [system_change], RULE) == []


def test_the_evidence_names_the_change_as_the_manifest_does():
    signins = [*BASE, si("s1", "p1", "x1", "NEW1", "datacenter", "09:04:00")]
    changes = [ch("c1", "p1", "x1", "09:08:00")]
    (d,) = changes_after_new_device(signins, changes, {**RULE, "change_label": "Key created"})
    assert [e["label"] for e in d.evidence] == ["Sign-in", "Key created"]


def test_without_a_label_or_a_verdict_the_wording_is_neutral():
    signins = [*BASE, si("s1", "p1", "x1", "NEW1", "datacenter", "09:04:00")]
    changes = [ch("c1", "p1", "x1", "09:08:00")]
    rule = {k: v for k, v in RULE.items() if k != "verdict"}
    (d,) = changes_after_new_device(signins, changes, rule)
    assert [e["label"] for e in d.evidence] == ["Sign-in", "Change"]
    assert d.verdict == "CHANGE AFTER NEW DEVICE"
