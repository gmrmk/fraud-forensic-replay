"""The platform-access pack: a pure function of seed_platform, synthetic by construction,
and telling exactly the story its docstring tells.

Story facts are asserted from the rows (never from a second copy of the numbers), so a
change to the authored incident must change the generator, not this file."""

from __future__ import annotations

import ipaddress
import json
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from statistics import median

import pytest

import seed_platform as sp

DOC_NETS = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
DOC_ASNS = set(range(64496, 64512)) | set(range(65536, 65552))  # RFC 5398
WINDOW = (datetime(2026, 6, 1, tzinfo=UTC), datetime(2026, 6, 10, tzinfo=UTC))
INCIDENT_DAY = datetime(2026, 6, 8, tzinfo=UTC)


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return sp.generate()


def _at(row: dict, key: str = "timestamp") -> datetime:
    return datetime.fromisoformat(row[key])


def _minted(rows: dict[str, list[dict]]) -> list[dict]:
    """The key-created events made on the attacker's device."""
    return [
        k
        for k in rows["key_event"]
        if k["event"] == "created" and k["device_id"] == sp.ATTACK_DEVICE
    ]


def _org_median(rows: dict[str, list[dict]], org_id: str, before: datetime) -> float | None:
    """Median hourly cost of an organisation's keys in the week before `before`; None when the
    organisation has no history yet (nothing can be judged against nothing)."""
    values = [
        u["spend_usd"]
        for u in rows["usage"]
        if u["org_id"] == org_id
        and before - timedelta(hours=168) <= _at(u) < before
        and u["spend_usd"] > 0
    ]
    return median(values) if values else None


def test_the_pack_is_a_pure_function_of_the_module():
    assert sp.generate() == sp.generate()


def test_every_kind_is_present_with_unique_ids(rows):
    assert tuple(rows) == sp.KINDS == ("org", "console_signin", "key_event", "usage", "decision")
    for kind, items in rows.items():
        assert items, kind
        ids = [r["id"] for r in items]
        assert len(ids) == len(set(ids)), kind
        assert all(next(iter(r)) == "id" for r in items), kind


def test_thirty_organisations_with_fictional_domains(rows):
    orgs = rows["org"]
    assert len(orgs) == 30
    assert len({o["org_id"] for o in orgs}) == 30
    assert len({o["org_name"] for o in orgs}) == 30
    for o in orgs:
        assert o["domain"].endswith(".example")
        assert 2 <= o["seats"] <= 4
        assert -90 <= o["lat"] <= 90 and -180 <= o["lng"] <= 180
    assert len({o["country"] for o in orgs}) >= 8, "the world spans continents"


def test_one_device_signs_in_to_nine_organisations_and_mints_a_key_on_each(rows):
    minted = _minted(rows)
    assert len(minted) == len(sp.TAKEOVERS) == 9
    assert len({k["org_id"] for k in minted}) == 9
    assert len({k["credential_id"] for k in minted}) == 9

    attack_signins = [s for s in rows["console_signin"] if s["device_id"] == sp.ATTACK_DEVICE]
    assert len(attack_signins) == 9, "the device appears on the nine takeover sign-ins only"
    by_session = {s["session_id"]: s for s in attack_signins}

    for key in minted:
        signin = by_session[key["session_id"]]
        assert signin["seat_id"] == key["seat_id"] and signin["org_id"] == key["org_id"]
        assert signin["ip_asn"] == sp.ATTACK_ASN and signin["ip_type"] == "datacenter"
        gap = (_at(key) - _at(signin)).total_seconds()
        assert 120 <= gap <= 360, gap
        assert (
            INCIDENT_DAY + timedelta(hours=13) <= _at(signin) < INCIDENT_DAY + timedelta(hours=16)
        )
        # New to the seat: no earlier sign-in by this seat on this device.
        assert not [
            s
            for s in rows["console_signin"]
            if s["seat_id"] == key["seat_id"]
            and s["device_id"] == sp.ATTACK_DEVICE
            and _at(s) < _at(signin)
        ]


def test_the_minted_keys_burn_that_night_from_a_network_nobody_else_uses(rows):
    minted = {k["credential_id"]: k for k in _minted(rows)}
    start, end = INCIDENT_DAY + timedelta(hours=22), INCIDENT_DAY + timedelta(hours=28)
    for credential_id, key in minted.items():
        usage = [u for u in rows["usage"] if u["credential_id"] == credential_id]
        assert len(usage) >= 5, credential_id
        # Judged against the organisation's own week up to the moment the burst starts.
        baseline = _org_median(rows, key["org_id"], start)
        assert baseline is not None
        for u in usage:
            assert u["ip_asn"] == sp.BURST_ASN
            assert start <= _at(u) < end
            assert u["spend_usd"] >= 30 * baseline, (credential_id, u["spend_usd"], baseline)
    others = [u for u in rows["usage"] if u["credential_id"] not in minted]
    assert others and all(u["ip_asn"] != sp.BURST_ASN for u in others)


def test_a_legitimate_admin_on_a_company_vpn_also_creates_a_key_minutes_after_signing_in(rows):
    created = [
        k
        for k in rows["key_event"]
        if k["event"] == "created" and k["device_id"] != sp.ATTACK_DEVICE
    ]
    signin = {s["session_id"]: s for s in rows["console_signin"]}
    queued = []
    for key in created:
        s = signin[key["session_id"]]
        new_device = not any(
            o["seat_id"] == s["seat_id"] and o["device_id"] == s["device_id"] and _at(o) < _at(s)
            for o in rows["console_signin"]
        )
        gap_min = (_at(key) - _at(s)).total_seconds() / 60
        if new_device and s["ip_type"] == "datacenter" and gap_min <= 10:
            queued.append((key, s))
    assert len(queued) == 1
    key, s = queued[0]
    assert s["ip_asn"] == sp.VPN_ASN
    assert key["org_id"] not in {k["org_id"] for k in _minted(rows)}
    # Ordinary key rotations exist too: a known device on a network the seat always uses.
    assert len(created) >= 3


def test_a_planned_batch_job_on_an_old_key_also_runs_hot_from_its_usual_network(rows):
    minted = {k["credential_id"] for k in _minted(rows)}
    hot: dict[str, list[dict]] = {}
    for u in rows["usage"]:
        if u["credential_id"] in minted:
            continue
        baseline = _org_median(rows, u["org_id"], _at(u))
        if baseline is not None and u["spend_usd"] >= 25 and u["spend_usd"] >= 10 * baseline:
            hot.setdefault(u["credential_id"], []).append(u)
    assert list(hot) == [sp.BATCH_CREDENTIAL]
    run = sorted(hot[sp.BATCH_CREDENTIAL], key=_at)
    assert len(run) == 3
    assert [(_at(b) - _at(a)).total_seconds() for a, b in zip(run, run[1:], strict=False)] == [
        3600,
        3600,
    ]
    usual = {
        u["ip_asn"]
        for u in rows["usage"]
        if u["credential_id"] == sp.BATCH_CREDENTIAL and _at(u) < _at(run[0])
    }
    assert usual == {run[0]["ip_asn"]}, "the batch job runs from the key's usual network"


def test_the_platform_revokes_each_minted_key_after_its_decision_and_usage_stops(rows):
    minted = {k["credential_id"]: k for k in _minted(rows)}
    revoked = [k for k in rows["key_event"] if k["event"] == "revoked"]
    assert {k["credential_id"] for k in revoked} == set(minted)
    decided = {e: d for d in rows["decision"] for e in d["event_ids"]}
    for r in revoked:
        assert r["actor"] == "platform" and r["session_id"] is None and r["device_id"] is None
        decision = decided[minted[r["credential_id"]]["id"]]
        lag = (_at(r) - _at(decision, "decided_at")).total_seconds()
        assert 0 < lag <= 60
        after = [
            u
            for u in rows["usage"]
            if u["credential_id"] == r["credential_id"] and _at(u) >= _at(r)
        ]
        assert not after


def test_the_business_decided_every_queued_event(rows):
    decisions = rows["decision"]
    assert sorted((d["status"], d["outcome"]) for d in decisions) == sorted(
        [("FAIL", "KEY TAKEOVER")] * 9 + [("PASS", "PASSED"), ("WAITING", "WAITING")]
    )
    events = {r["id"] for kind in ("key_event", "usage") for r in rows[kind]}
    orgs = {o["org_id"] for o in rows["org"]}
    for d in decisions:
        assert d["event_ids"] and set(d["event_ids"]) <= events
        assert d["org_id"] in orgs
        assert d["decided_by"] == "investigator"
        assert _at(d, "decided_at").date() == datetime(2026, 6, 9).date()
        assert d["note"].strip()


def test_every_identifier_is_synthetic(rows):
    blob = json.dumps(rows)
    assert "sk-" not in blob and "AKIA" not in blob
    assert not re.search(r"[0-9a-fA-F]{32,}", blob), "nothing shaped like a hash or a key"
    assert not re.search(r"[A-Za-z0-9+/]{40,}", blob), "nothing shaped like a token"
    for kind in ("console_signin", "key_event", "usage"):
        for r in rows[kind]:
            if r.get("ip_address") is not None:
                address = ipaddress.ip_address(r["ip_address"])
                assert any(address in net for net in DOC_NETS), r["ip_address"]
            if r.get("ip_asn") is not None:
                match = re.match(r"AS(\d+) ", r["ip_asn"])
                assert match is not None, r["ip_asn"]
                assert int(match.group(1)) in DOC_ASNS, r["ip_asn"]
            if r.get("device_id") is not None:
                assert re.fullmatch(r"[A-Z0-9]{12}", r["device_id"])
            if r.get("credential_id") is not None:
                assert re.fullmatch(r"key-[A-Z0-9]{8}", r["credential_id"])


def test_every_timestamp_is_inside_the_window_and_carries_an_offset(rows):
    stamps = [(r, "timestamp") for k in ("console_signin", "key_event", "usage") for r in rows[k]]
    stamps += [(d, "decided_at") for d in rows["decision"]]
    for row, key in stamps:
        at = _at(row, key)
        assert at.tzinfo is not None
        assert WINDOW[0] <= at < WINDOW[1], row["id"]
    for u in rows["usage"]:
        at = _at(u)
        assert (at.minute, at.second, at.microsecond) == (
            0,
            0,
            0,
        ), "usage buckets start on the hour"


def test_usage_rows_are_plausible(rows):
    for u in rows["usage"]:
        assert u["requests"] > 0
        assert u["input_tokens"] > 0 and u["output_tokens"] > 0
        assert u["spend_usd"] > 0 and round(u["spend_usd"], 2) == u["spend_usd"]
        assert u["ip_type"] == "datacenter", "API traffic comes from cloud networks; that is normal"


def test_write_produces_the_files_and_an_empty_pack_database(tmp_path):
    paths = sp.write(data_dir=tmp_path / "platform-access", db_path=tmp_path / "platform-access.db")
    names = sorted(p.name for p in paths)
    assert names == sorted([*(f"{k}.json" for k in sp.KINDS), "platform-access.db"])
    for kind in sp.KINDS:
        loaded = json.loads((tmp_path / "platform-access" / f"{kind}.json").read_text("utf-8"))
        assert loaded == sp.generate()[kind]
    conn = sqlite3.connect(tmp_path / "platform-access.db")
    try:
        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0
    finally:
        conn.close()
