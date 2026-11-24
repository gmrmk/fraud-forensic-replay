"""The platform-access pack's two rules and its exported decisions.

The rules run for real over the pack's own rows (no scenario is selected first), and every claim
below is derived from the rows: the stolen sign-ins are the ones made on the single device that
signs in to more than one organisation. A decision lists the events it worked; an event is what a
rule queued, which the app takes to be the LAST trigger of a rule decision. Every number, time,
device, network and key in a note is checked against the row it describes."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from statistics import median

import pytest

import rules as rules_module
import scenario_registry as sr
from db import PROJECT_ROOT

MANIFEST = PROJECT_ROOT / "backend" / "scenarios" / "platform-access.scenario.json"
HOUSTON = timezone(timedelta(hours=-5))  # the app shows every time on the Houston clock
AMSTERDAM = (52.3676, 4.9041)
SINGAPORE = (1.3521, 103.8198)
BATCH_KEY = "key-7QF2M9XA"


def _at(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def _clock(ts: str) -> str:
    at = _at(ts).astimezone(HOUSTON)
    return f"{at.hour % 12 or 12}:{at.minute:02d} {'AM' if at.hour < 12 else 'PM'} CDT"


def _day_clock(ts: str) -> str:
    at = _at(ts).astimezone(HOUSTON)
    return f"{at:%a %b} {at.day}, {_clock(ts)}"


def _seen_before(signins: list[dict], s: dict) -> bool:
    return any(
        o["seat_id"] == s["seat_id"]
        and o["device_id"] == s["device_id"]
        and _at(o["timestamp"]) < _at(s["timestamp"])
        for o in signins
    )


@pytest.fixture(scope="module")
def manifest() -> sr.Manifest:
    return sr.load_manifest(MANIFEST, base_dir=PROJECT_ROOT)


@pytest.fixture(scope="module")
def pack(manifest) -> dict[str, list[dict]]:
    return {k: manifest.json_rows(k) for k in manifest.kinds}


@pytest.fixture(scope="module")
def queued(manifest) -> list[dict]:
    """Both rules, evaluated on the pack's own database, as /api/decisions serves them."""
    conn = sqlite3.connect(manifest.db_path)
    try:
        return [asdict(d) for d in rules_module.evaluate(conn, manifest.rules, manifest.focal)]
    finally:
        conn.close()


@pytest.fixture(scope="module")
def case(pack) -> dict:
    """The incident, read off the rows: one device signs in to more than one organisation."""
    orgs_of: dict[str, set[str]] = defaultdict(set)
    for s in pack["console_signin"]:
        orgs_of[s["device_id"]].add(s["org_id"])
    (shared,) = [device for device, orgs in orgs_of.items() if len(orgs) > 1]
    created = [k for k in pack["key_event"] if k["event"] == "created"]
    minted = [k for k in created if k["device_id"] == shared]
    signin = {s["session_id"]: s for s in pack["console_signin"]}
    (vpn,) = [k for k in created if signin[k["session_id"]]["ip_asn"].endswith("Corporate VPN")]
    return {
        "shared": shared,
        "minted": minted,
        "vpn": vpn,
        "signin": signin,
        "keys": {k["id"]: k for k in pack["key_event"]},
        "usage": {u["id"]: u for u in pack["usage"]},
        "orgs": {o["org_id"]: o for o in pack["org"]},
        "revoked": {k["credential_id"]: k for k in pack["key_event"] if k["event"] == "revoked"},
    }


def _hits(queued: list[dict], rule_id: str) -> list[dict]:
    return [d for d in queued if d["rule"]["id"] == rule_id]


def _burst_by_key(queued: list[dict]) -> dict[str, dict]:
    hits = _hits(queued, "spend-burst")
    by_key = {next(i["value"] for i in d["inputs"] if i["label"] == "API key"): d for d in hits}
    assert len(by_key) == len(hits), "one run per key"
    return by_key


def _spend(pack: dict, credential_id: str) -> list[dict]:
    return [u for u in pack["usage"] if u["credential_id"] == credential_id]


def _median_hour(pack: dict, org_id: str, before: datetime, burning: str) -> float:
    """The organisation's median hourly spend over the week before `before`, the burning key's
    own hours left out: the baseline the burst rule states."""
    return median(
        u["spend_usd"]
        for u in pack["usage"]
        if u["org_id"] == org_id
        and u["credential_id"] != burning
        and before - timedelta(hours=168) <= _at(u["timestamp"]) < before
    )


def test_the_takeover_rule_queues_the_nine_minted_keys_and_the_vpn_admin_and_nothing_else(
    queued, pack, case
):
    hits = _hits(queued, "key-after-new-device")
    assert len(case["minted"]) == 9
    assert sorted(d["trigger_entity_ids"][-1] for d in hits) == sorted(
        k["id"] for k in [*case["minted"], case["vpn"]]
    )
    for d in hits:
        assert (d["verdict"], d["decision"], d["severity"]) == ("KEY TAKEOVER", "FLAG", 0.9)
        signin_id, key_id = d["trigger_entity_ids"]
        key = case["keys"][key_id]
        s = case["signin"][key["session_id"]]
        assert s["id"] == signin_id and s["seat_id"] == key["seat_id"]
        assert s["ip_type"] == "datacenter" and not _seen_before(pack["console_signin"], s)
        assert "Key created" in {e["label"] for e in d["evidence"]}
    # A key rotated from the office on a known device, and a key the platform revoked (no
    # session at all), are not this rule's business.
    queued_ids = {d["trigger_entity_ids"][-1] for d in hits}
    quiet = [k for k in pack["key_event"] if k["id"] not in queued_ids]
    assert {k["event"] for k in quiet} == {"created", "revoked"}
    assert all(k["session_id"] is None for k in quiet if k["event"] == "revoked")


def test_the_burst_rule_queues_the_nine_minted_keys_and_the_batch_job_and_nothing_else(
    queued, pack, case
):
    by_key = _burst_by_key(queued)
    minted = {k["credential_id"] for k in case["minted"]}
    assert set(by_key) == minted | {BATCH_KEY}
    for credential_id, d in by_key.items():
        assert (d["verdict"], d["decision"], d["severity"]) == ("SPEND BURST", "REVIEW", 0.8)
        run = [case["usage"][i] for i in d["trigger_entity_ids"]]
        assert {u["credential_id"] for u in run} == {credential_id}
        gaps = {
            (_at(b["timestamp"]) - _at(a["timestamp"])).total_seconds()
            for a, b in zip(run, run[1:], strict=False)
        }
        assert gaps == {3600.0}, "a run is consecutive hours"
    for credential_id in minted:
        # A minted key has no history of its own: every hour it ever ran is in the run.
        assert by_key[credential_id]["trigger_entity_ids"] == [
            u["id"] for u in _spend(pack, credential_id)
        ]
        assert len(by_key[credential_id]["trigger_entity_ids"]) == 6
    assert len(by_key[BATCH_KEY]["trigger_entity_ids"]) == 3
    # The takeover rule has nothing to say about the batch job: no key was created for it.
    batch_org = case["usage"][by_key[BATCH_KEY]["trigger_entity_ids"][0]]["org_id"]
    assert batch_org not in {
        case["keys"][d["trigger_entity_ids"][-1]]["org_id"]
        for d in _hits(queued, "key-after-new-device")
    }


def test_every_queued_event_is_worked_by_one_decision_and_every_decision_works_queued_events(
    queued, pack
):
    landing = [d["trigger_entity_ids"][-1] for d in queued]
    worked = [e for d in pack["decision"] for e in d["event_ids"]]
    assert len(landing) == len(set(landing)) == 20
    assert sorted(worked) == sorted(landing)


def test_nine_key_takeover_one_passed_one_waiting_on_tuesday_morning(pack, case):
    decisions = pack["decision"]
    assert sorted((d["status"], d["outcome"]) for d in decisions) == sorted(
        [("FAIL", "KEY TAKEOVER")] * 9 + [("PASS", "PASSED"), ("WAITING", "WAITING")]
    )
    assert {d["decided_by"] for d in decisions} == {"investigator"}
    fails = sorted((d for d in decisions if d["status"] == "FAIL"), key=lambda d: d["decided_at"])
    for d in fails:  # 9:40 to 10:08 AM in Houston
        assert "2026-06-09T14:40:00+00:00" <= d["decided_at"] <= "2026-06-09T15:08:00+00:00"
    # Worked in the order the organisations were taken over.
    taken = sorted(case["minted"], key=lambda k: k["timestamp"])
    assert [d["org_id"] for d in fails] == [k["org_id"] for k in taken]
    assert max(d["decided_at"] for d in fails) < min(
        d["decided_at"] for d in decisions if d["status"] != "FAIL"
    )


def test_each_decision_follows_its_events_and_sits_at_its_organisation(pack, case):
    for d in pack["decision"]:
        org = case["orgs"][d["org_id"]]
        assert (d["lat"], d["lng"]) == (org["lat"], org["lng"])
        assert d["target_label"] == f"{org['org_name']} · {org['city']}, {org['country']}"
        for event_id in d["event_ids"]:
            hour = event_id in case["usage"]
            row = case["usage"][event_id] if hour else case["keys"][event_id]
            assert row["org_id"] == d["org_id"], d["id"]
            # A usage row is an hour: the decision comes after that hour has ended.
            ended = _at(row["timestamp"]) + (timedelta(hours=1) if hour else timedelta(0))
            assert _at(d["decided_at"]) > ended, d["id"]


def test_each_key_takeover_note_states_what_the_rows_show(queued, pack, case):
    by_key = _burst_by_key(queued)
    fails = [d for d in pack["decision"] if d["status"] == "FAIL"]
    assert {d["org_id"] for d in fails} == {k["org_id"] for k in case["minted"]}
    for d in fails:
        key_id, last_hour = d["event_ids"]
        key = case["keys"][key_id]
        credential_id = key["credential_id"]
        s = case["signin"][key["session_id"]]
        burn = _spend(pack, credential_id)
        assert burn[-1]["id"] == last_hour

        # "New device ... on AS64511 (Amsterdam hosting)"
        assert s["device_id"] == case["shared"] and not _seen_before(pack["console_signin"], s)
        assert s["ip_asn"].split()[0] == "AS64511" and s["ip_type"] == "datacenter"
        assert (s["lat"], s["lng"]) == AMSTERDAM
        # "on AS64510 (Singapore)"
        assert {(u["ip_asn"].split()[0], u["lat"], u["lng"]) for u in burn} == {
            ("AS64510", *SINGAPORE)
        }
        total = round(sum(u["spend_usd"] for u in burn), 2)
        peak = max(
            u["spend_usd"]
            / _median_hour(pack, key["org_id"], _at(u["timestamp"]), burning=credential_id)
            for u in burn
        )
        assert d["note"] == (
            f"Console takeover. New device {s['device_id']} on AS64511 (Amsterdam hosting) "
            f"signed in to {key['seat_id']} at {_day_clock(s['timestamp'])}; API key "
            f"{credential_id} created at {_clock(key['timestamp'])}. From "
            f"{_day_clock(burn[0]['timestamp'])} the key spent ${total:,.2f} in {len(burn)} hours "
            f"on AS64510 (Singapore), up to {peak:.0f} times the organisation's median hour. "
            f"Revoke {credential_id} and expire the seat's console sessions. "
            "Organisation not suspended."
        ), d["id"]

        # The rule's own finding, shown beside the note, states the same run, peak and total.
        finding = {i["label"]: i["value"] for i in by_key[credential_id]["inputs"]}
        assert finding["Run"] == f"{len(burn)} hours"
        assert finding["Peak"] == f"{peak:.0f} times the baseline"
        assert finding["Total"] == f"${total:,.2f}"

        # "Revoke ...": the platform revokes that key within a minute of the decision.
        lag = _at(case["revoked"][credential_id]["timestamp"]) - _at(d["decided_at"])
        assert timedelta(0) < lag <= timedelta(minutes=1)


def test_the_passed_note_states_what_the_rows_show(pack, case):
    (d,) = [d for d in pack["decision"] if d["status"] == "PASS"]
    assert d["event_ids"] == [case["vpn"]["id"]]
    key = case["vpn"]
    s = case["signin"][key["session_id"]]
    assert s["ip_asn"] == "AS64500 Corporate VPN" and s["ip_type"] == "datacenter"
    assert not _seen_before(pack["console_signin"], s)  # "new laptop"
    assert d["note"] == (
        "Admin confirmed by callback on the number on file: new laptop on the company VPN "
        f"(AS64500). Key {key['credential_id']} left active."
    )
    # "left active": never revoked, and it goes on to run from the organisation's own region.
    assert key["credential_id"] not in case["revoked"]
    later = _spend(pack, key["credential_id"])
    own_region = {
        u["ip_asn"]
        for u in pack["usage"]
        if u["org_id"] == key["org_id"] and u["credential_id"] != key["credential_id"]
    }
    assert later and {u["ip_asn"] for u in later} == own_region
    assert key["org_id"] not in {k["org_id"] for k in case["minted"]}


def test_the_waiting_note_states_what_the_rows_show(queued, pack, case):
    (d,) = [d for d in pack["decision"] if d["status"] == "WAITING"]
    run = [case["usage"][i] for i in _burst_by_key(queued)[BATCH_KEY]["trigger_entity_ids"]]
    assert d["event_ids"] == [run[-1]["id"]]
    total = round(sum(u["spend_usd"] for u in run), 2)
    assert d["note"] == (
        "Planned batch run reported by the organisation's on-call contact, not yet confirmed by "
        f"an admin. Key {BATCH_KEY} spent ${total:,.2f} in {len(run)} hours from "
        f"{_day_clock(run[0]['timestamp'])} on {run[0]['ip_asn'].split()[0]}, the network it has "
        "used all week. Key left active."
    )
    # "the network it has used all week": an old key, on one network since the window opened.
    earlier = [u for u in _spend(pack, BATCH_KEY) if u["timestamp"] < run[0]["timestamp"]]
    assert _at(earlier[0]["timestamp"]).date() <= date(2026, 6, 2)
    assert {u["ip_asn"] for u in earlier} == {u["ip_asn"] for u in run}
    assert BATCH_KEY not in case["revoked"]  # "Key left active"
    assert not [k for k in pack["key_event"] if k["credential_id"] == BATCH_KEY], "an old key"
