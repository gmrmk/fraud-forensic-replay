"""The investigators' decisions for the two canonical packs (Marcus card fraud, Priya ATO), drawn
as capsules the way the platform-access pack draws its own. Each decision works one pack event and
sits on that event's node; a coordless event (an account change, a transfer) sits where its session
signed in. Every number a note states is checked against the rows."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
from db import PROJECT_ROOT

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
TAKEOVER_LOGIN = "gen-login-40927"

PACKS: dict[str, dict[str, Any]] = {
    "card-fraud": {
        "prefix": "dec-card-",
        "key": ("card_id", "card-marcus-visa-001"),
        "target": "Marcus Chen · Houston, TX",
        "session_login": None,
        "tally": [("FAIL", "FRAUD")] * 2 + [("PASS", "PASSED")] * 2 + [("WAITING", "WAITING")],
    },
    "priya-ato": {
        "prefix": "dec-ato-",
        "key": ("account_id", "gen-acct-priya"),
        "target": "Priya Patel · Houston, TX",
        "session_login": TAKEOVER_LOGIN,
        "tally": [("FAIL", "ATO")] * 3 + [("FAIL", "FRAUD")] * 2 + [("PASS", "PASSED")],
    },
}


def _at(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def _rows(conn: sqlite3.Connection, sql: str, *args) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


@pytest.fixture(scope="module", params=sorted(PACKS))
def pack(request):
    pid = request.param
    manifest = sr.load_manifest(SCENARIOS / f"{pid}.scenario.json", base_dir=PROJECT_ROOT)
    conn = sqlite3.connect(f"file:{manifest.db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    events: dict[str, tuple[dict, dict]] = {}
    for node in manifest.nodes:
        if node.get("source") == "sql":
            for row in _rows(conn, node["query"]):
                events[row["id"]] = (node, row)
    yield {
        "id": pid,
        "manifest": manifest,
        "conn": conn,
        "events": events,
        "decisions": manifest.json_rows("decision"),
        **PACKS[pid],
    }
    conn.close()


def test_every_row_carries_every_mapped_field(pack):
    node = pack["manifest"]._node("decision")
    assert node["source"] == "json" and node["timestamp"] == "decided_at"
    assert node["coords"] == {"lat": "lat", "lng": "lng"}
    mapping = node["decision"]
    key_field, key_value = pack["key"]
    assert mapping == {
        "status": "status",
        "outcome": "outcome",
        "note": "note",
        "actor": "decided_by",
        "target": "target_label",
        "key": key_field,
        "event": "event_id",
    }
    fields = [*mapping.values(), "id", "decided_at", "lat", "lng"]
    for d in pack["decisions"]:
        missing = [f for f in fields if d.get(f) in (None, "")]
        assert not missing, (d["id"], missing)
        assert d[key_field] == key_value
        assert d["target_label"] == pack["target"]
        assert d["decided_by"] == "investigator"


def test_the_tally_of_statuses_and_outcomes(pack):
    assert sorted((d["status"], d["outcome"]) for d in pack["decisions"]) == sorted(pack["tally"])


def test_ids_are_unique_prefixed_and_absent_from_the_pack_tables(pack):
    ids = [d["id"] for d in pack["decisions"]]
    assert len(set(ids)) == len(ids)
    assert all(i.startswith(pack["prefix"]) for i in ids)
    conn = pack["conn"]
    tables = [r["name"] for r in _rows(conn, "SELECT name FROM sqlite_master WHERE type='table'")]
    for t in tables:
        if "id" in {c["name"] for c in _rows(conn, f"PRAGMA table_info({t})")}:
            marks = ",".join("?" * len(ids))
            assert not _rows(conn, f"SELECT id FROM {t} WHERE id IN ({marks})", *ids), t


def test_each_decision_works_one_event_of_its_subject_and_follows_it(pack):
    events = [d["event_id"] for d in pack["decisions"]]
    assert len(set(events)) == len(events)
    key_field, key_value = pack["key"]
    for d in pack["decisions"]:
        node, row = pack["events"][d["event_id"]]
        assert row[key_field] == key_value, d["id"]
        assert _at(d["decided_at"]) > _at(row[node["timestamp"]]), d["id"]


def test_each_decision_sits_on_its_event_node_or_where_the_session_signed_in(pack):
    conn = pack["conn"]
    for d in pack["decisions"]:
        node, row = pack["events"][d["event_id"]]
        if node["coords"]:
            where = (row[node["coords"]["lat"]], row[node["coords"]["lng"]])
        else:
            (login,) = _rows(
                conn, "SELECT * FROM login_events WHERE session_id=?", row["session_id"]
            )
            assert login["id"] == pack["session_login"]
            where = (login["ip_lat"], login["ip_lng"])
        assert (d["lat"], d["lng"]) == where, d["id"]


def test_the_api_serves_the_decisions(pack):
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id=pack["id"])
    try:
        r = TestClient(main.app).get("/api/entities", params={"kind": "decision"})
        assert (r.status_code, r.json()) == (200, pack["decisions"])
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def _note(pack: dict, event_id: str) -> str:
    (d,) = [d for d in pack["decisions"] if d["event_id"] == event_id]
    return d["note"]


def _minutes(a: str, b: str) -> float:
    return (_at(b) - _at(a)).total_seconds() / 60


def test_marcus_notes_state_what_the_rows_show():
    manifest = sr.load_manifest(SCENARIOS / "card-fraud.scenario.json", base_dir=PROJECT_ROOT)
    p = {"decisions": manifest.json_rows("decision")}
    conn = sqlite3.connect(f"file:{manifest.db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    card = "card-marcus-visa-001"
    tx = _rows(conn, "SELECT * FROM transactions WHERE card_id=? ORDER BY timestamp", card)
    conn_all = _rows(conn, "SELECT card_id, terminal_id, timestamp, is_fraud FROM transactions")
    conn.close()
    by_id = {t["id"]: t for t in tx}

    # "Three new subscription merchants in three minutes."
    tests = [t for t in tx if t["category"] == "subscription" and t["is_fraud"]]
    assert [t["id"] for t in tests][-1] == f"tx-{card}-0110"
    assert len(tests) == 3 and {t["category"] for t in tests} == {"subscription"}
    assert _minutes(tests[0]["timestamp"], tests[-1]["timestamp"]) == 3
    earlier = {t["merchant_name"] for t in tx if t["timestamp"] < tests[0]["timestamp"]}
    assert not earlier & {t["merchant_name"] for t in tests}
    assert _note(p, f"tx-{card}-0110").startswith("Three new subscription merchants in three")

    # "Four stripe fallbacks in eight minutes in Lekki, after 69 chip reads in Texas."
    lekki = [t for t in tx if t["merchant_country"] == "NG"]
    assert [t["id"] for t in lekki][0] == f"tx-{card}-0140"
    assert [t["id"] for t in lekki][-1] == f"tx-{card}-0143"
    assert len(lekki) == 4 and {t["pos_entry_mode"] for t in lekki} == {"chip_fallback_swipe"}
    assert all("Lekki" in t["merchant_name"] for t in lekki)
    assert _minutes(lekki[0]["timestamp"], lekki[-1]["timestamp"]) == 8
    assert lekki[0]["auth_response_code"] != "00"  # declined first try
    chip = [
        t for t in tx if t["pos_entry_mode"] == "chip" and t["timestamp"] < lekki[0]["timestamp"]
    ]
    assert len(chip) == 69
    # ponytail: a lat/lng box, not a state check (it also covers slivers of OK, NM, LA, AR);
    # the rows carry no state column. Upgrade: reverse-geocode or add merchant_state.
    assert all(25.8 < t["merchant_lat"] < 36.5 and -106.7 < t["merchant_lng"] < -93.5 for t in chip)
    assert _note(p, f"tx-{card}-0143").startswith(
        "Four stripe fallbacks in eight minutes in Lekki, after 69 chip reads in Texas."
    )
    assert not [t for t in tx if t["timestamp"] > lekki[-1]["timestamp"]]  # blocked, no later use

    # "Genuine $44 fuel purchase ... all 30 cards used here from May 4 to May 13 ..."
    pump = by_id[f"tx-{card}-0057"]
    assert pump["amount"] == 44.0 and pump["category"] == "gas" and not pump["is_fraud"]
    visits = [r for r in conn_all if r["terminal_id"] == pump["terminal_id"]]
    first: dict[str, str] = {}
    for v in sorted(visits, key=lambda r: r["timestamp"]):
        first.setdefault(v["card_id"], v["timestamp"])
    assert len(first) == len(visits) == 30
    assert min(first.values())[:10] == "2026-05-04" and max(first.values())[:10] == "2026-05-13"
    for c, ts in first.items():
        assert any(r["card_id"] == c and r["is_fraud"] and r["timestamp"] > ts for r in conn_all)
    assert "all 30 cards used here from May 4 to May 13" in _note(p, f"tx-{card}-0057")

    # "One stripe fallback at Birchcrofte Bistro": a chip read before it, contactless the next
    # morning. The rows record no cause, so the note names none.
    i = [t["id"] for t in tx].index(f"tx-{card}-0065")
    assert tx[i]["pos_entry_mode"] == "chip_fallback_swipe"
    assert tx[i]["merchant_name"] == "Birchcrofte Bistro"
    assert tx[i - 1]["pos_entry_mode"] == "chip"
    assert round(_minutes(tx[i - 1]["timestamp"], tx[i]["timestamp"])) == 45
    after = next(t for t in tx[i + 1 :] if t["is_card_present"])
    assert after["pos_entry_mode"] == "contactless" and after["timestamp"][:10] == "2026-05-11"
    assert _note(p, f"tx-{card}-0065") == (
        "One stripe fallback at Birchcrofte Bistro. The card read by chip 45 minutes before "
        "and by contactless the next morning."
    )


def test_priya_notes_state_what_the_rows_show():
    manifest = sr.load_manifest(SCENARIOS / "priya-ato.scenario.json", base_dir=PROJECT_ROOT)
    p = {"decisions": manifest.json_rows("decision")}
    conn = sqlite3.connect(f"file:{manifest.db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    (login,) = _rows(conn, "SELECT * FROM login_events WHERE id=?", TAKEOVER_LOGIN)
    (email,) = _rows(conn, "SELECT * FROM account_events WHERE id='gen-ae-40934'")
    (add,) = _rows(conn, "SELECT * FROM account_events WHERE id='gen-ae-40943'")
    (payee,) = _rows(conn, "SELECT * FROM payees WHERE id=?", add["payee_id"])
    (sent,) = _rows(conn, "SELECT * FROM transfers WHERE id='gen-tr-40956'")
    (held,) = _rows(conn, "SELECT * FROM transfers WHERE id='gen-tr-40986'")
    (laptop,) = _rows(conn, "SELECT * FROM login_events WHERE id='gen-login-40110'")
    handset = _rows(conn, "SELECT * FROM login_events WHERE device_fp='Handset-14-Priya'")
    conn.close()

    assert email["field"] == "email" and _minutes(login["timestamp"], email["timestamp"]) == 7
    assert (
        _note(p, email["id"]) == "Email on file changed seven minutes into the session. Reverted."
    )
    assert payee["risk_flag"] == "elevated_risk" and payee["first_seen_at"] == add["timestamp"]
    assert "elevated-risk list" in _note(p, add["id"])
    assert sent["status"] == "sent" and sent["amount"] == 4200.0
    assert (
        sent["payee_id"] == add["payee_id"] and _minutes(add["timestamp"], sent["timestamp"]) == 13
    )
    assert _note(p, sent["id"]).startswith("$4,200 sent to a payee added 13 minutes earlier.")
    assert (held["status"], held["decline_reason"], held["amount"]) == (
        "blocked",
        "velocity_rule",
        3800.0,
    )
    assert _note(p, held["id"]).startswith("The velocity rule blocked this $3,800 wire.")
    assert (
        laptop["device_first_seen_at"].startswith("2025-06") and laptop["ip_type"] == "residential"
    )
    assert {h["ip_asn"] for h in handset} == {laptop["ip_asn"]}  # her home connection
    assert _note(p, laptop["id"]) == "Her own laptop since June 2025, on her home connection."
