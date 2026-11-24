"""Priya's account-takeover pack is AUTHORED deterministically (the same fidelity
tier as Marcus's hand-authored seed rows) - see sim/scripted.py for why the model
is not asked. 2026-06-10 realism program: the pack is a 30-day baseline plus the
full canon kill chain (email change, payee add, $4,200 wire, velocity-blocked
second wire), at research-grounded density (~3 tx/day, ~4% fraud rows).

This is the second signal that the signature fires: it builds the REAL pack
through the REAL pipeline and runs the REAL rules.evaluate over it."""

from pathlib import Path

import db
import rules
from generators.concordia.clock import ScenarioClock
from generators.concordia.pipeline import build_pack
from generators.concordia.scenarios import SCENARIOS
from generators.concordia.sim.scripted import (
    PRIYA_ATO_READBACK,
    STEP_MINUTES,
    WINDOW_START,
)

_PACK_REL = "data/priya-ato.db"
_TAKEOVER_LOGIN_ID = "gen-login-40927"  # day 28, 10:07 -> step 28*1440+607


def _build(tmp_path):
    clock = ScenarioClock(start=WINDOW_START, step_minutes=STEP_MINUTES)
    return build_pack(PRIYA_ATO_READBACK, out_dir=tmp_path, clock=clock, scenario="priya-ato")


def _query(tmp_path, sql: str):
    conn = db.connect(tmp_path / _PACK_REL)
    try:
        return [dict(r) for r in conn.execute(sql).fetchall()]
    finally:
        conn.close()


def test_every_authored_action_is_valid_and_dense(tmp_path):
    summary = _build(tmp_path)
    assert summary["dropped"] == 0
    assert summary["transactions"] == 93  # ~3.1/day: Sparkov urban 1-6/day band
    assert summary["logins"] == 27  # near-daily mobile banker + weekly laptop
    assert summary["transfers"] == 12  # 10 baseline tamsinmere transfers + 2 wires
    assert summary["account_events"] == 2  # email change + payee add


def test_pack_fires_account_takeover_plus_compromise_velocity(tmp_path):
    """The pack fires the account-takeover (login-anomaly) decision once, AND the
    account-change-velocity detector fires on the same session's rapid profile
    changes (email change + payee add) - the two manifest rules, both real on the
    authored pack."""
    _build(tmp_path)
    conn = db.connect(tmp_path / _PACK_REL)
    try:
        decisions = rules.evaluate(conn, SCENARIOS["priya-ato"].rules)
    finally:
        conn.close()

    takeovers = [d for d in decisions if d.verdict == "ACCOUNT TAKEOVER"]
    assert len(takeovers) == 1
    t = takeovers[0]
    assert t.decision == "STEP-UP"
    assert t.trigger_entity_ids == [_TAKEOVER_LOGIN_ID]

    velocity = [d for d in decisions if d.rule["kind"] == "account-change-velocity"]
    assert len(velocity) == 1
    assert velocity[0].verdict == "COMPROMISE VELOCITY"
    # the two seeded account events (email change + payee add) = an elevated burst
    assert velocity[0].trigger_entity_ids == [
        r["id"] for r in _query(tmp_path, "SELECT id FROM account_events ORDER BY timestamp, id")
    ]


def test_takeover_login_is_clean_2fa_on_a_new_datacenter_device(tmp_path):
    """Research re-key (user-approved): the attacker phished the OTP, so the
    login passes 2FA; the tell is the never-seen device on a datacenter exit."""
    _build(tmp_path)
    (row,) = _query(tmp_path, f"SELECT * FROM login_events WHERE id='{_TAKEOVER_LOGIN_ID}'")
    assert row["outcome"] == "challenge_passed"
    assert row["two_fa_used"] == 1
    assert row["device_trust"] == "new"
    assert row["ip_type"] == "datacenter"
    assert row["device_first_seen_at"] == row["timestamp"]
    assert row["session_id"] == "sess-takeover"


def test_decision_carries_quantified_kill_chain_evidence(tmp_path):
    """Ladleton-Radar-style computed-at-read factors: every number is earned from
    the account's own seeded history, never asserted."""
    _build(tmp_path)
    conn = db.connect(tmp_path / _PACK_REL)
    try:
        d = rules.evaluate(conn, SCENARIOS["priya-ato"].rules)[0]
    finally:
        conn.close()
    by_label = {e["label"]: e["value"] for e in d.evidence}
    assert "median P2P" in by_label["Amount vs baseline"]  # $4,200 vs her ~$40 median
    assert "zero prior payment history" in by_label["Beneficiary age"]
    assert "BLOCKED" in by_label["System response"]
    assert "velocity rule" in by_label["System response"]
    assert "4 account-touching events" in by_label["Profile-change velocity"]


def test_established_device_is_priya_not_dana(tmp_path):
    _build(tmp_path)
    conn = db.connect(tmp_path / _PACK_REL)
    try:
        d = rules.evaluate(conn, SCENARIOS["priya-ato"].rules)[0]
    finally:
        conn.close()
    inputs = {i["label"]: i["value"] for i in d.inputs}
    assert inputs["Established device"] == "Handset-14-Priya"
    assert inputs["New device"] == "Handset-Unknown-9f2"
    assert "Dana" not in inputs["Established device"]


def test_kill_chain_is_one_session_thread_with_canon_spacing(tmp_path):
    _build(tmp_path)
    rows = _query(
        tmp_path,
        "SELECT timestamp FROM login_events WHERE session_id='sess-takeover' "
        "UNION ALL SELECT timestamp FROM account_events WHERE session_id='sess-takeover' "
        "UNION ALL SELECT timestamp FROM transfers WHERE session_id='sess-takeover' "
        "ORDER BY timestamp",
    )
    assert len(rows) == 5  # login, email change, payee add, wire, wire
    assert [r["timestamp"][11:16] for r in rows] == ["10:07", "10:14", "10:23", "10:36", "11:06"]


def test_wire_two_ships_blocked_with_velocity_reason(tmp_path):
    _build(tmp_path)
    wires = _query(tmp_path, "SELECT * FROM transfers WHERE rail='wire' ORDER BY timestamp")
    assert [w["status"] for w in wires] == ["sent", "blocked"]
    assert wires[0]["amount"] == 4200.0 and wires[1]["amount"] == 3800.0
    assert wires[1]["decline_reason"] == "velocity_rule"
    assert all(w["is_fraud"] == 1 for w in wires)


def test_jamie_k_hook_tamsinmere_is_canon(tmp_path):
    """PROFILES: the spear-phish references a real $47 Tamsinmere to Jamie K. the
    night before - Day 25, 21:14, then ~48h of silence before the takeover."""
    _build(tmp_path)
    (z,) = _query(
        tmp_path,
        "SELECT t.*, p.name FROM transfers t JOIN payees p ON p.id=t.payee_id "
        "WHERE t.amount=47.0",
    )
    assert z["name"] == "Jamie K." and z["rail"] == "tamsinmere" and z["is_fraud"] == 0
    assert z["timestamp"].startswith("2026-05-22T21:14")  # day 25 = Friday May 22


def test_daniel_reyes_is_born_at_the_payee_add(tmp_path):
    _build(tmp_path)
    (p,) = _query(tmp_path, "SELECT * FROM payees WHERE risk_flag='elevated_risk'")
    assert p["name"] == "Daniel Reyes"
    (ae,) = _query(tmp_path, "SELECT * FROM account_events WHERE kind='payee_add'")
    assert ae["payee_id"] == p["id"]
    assert p["first_seen_at"] == ae["timestamp"]  # zero prior history, by data
    baseline = _query(tmp_path, "SELECT * FROM payees WHERE risk_flag='none'")
    assert all(b["first_seen_at"] < "2026-04-27" for b in baseline)  # established


def test_fraud_rows_are_exactly_the_kill_chain(tmp_path):
    _build(tmp_path)
    assert _query(tmp_path, "SELECT COUNT(*) n FROM transactions WHERE is_fraud=1")[0]["n"] == 0
    assert _query(tmp_path, "SELECT COUNT(*) n FROM transfers WHERE is_fraud=1")[0]["n"] == 2
    assert _query(tmp_path, "SELECT COUNT(*) n FROM account_events WHERE is_fraud=1")[0]["n"] == 2


def test_no_phantom_impossible_travel_arc(tmp_path):
    """Customer B has no card arc: card-present rows are all same-metro Houston and
    CNP rows are excluded from arc detection. (The takeover is a login, so its
    Frankfurt exit draws no arc either.)"""
    _build(tmp_path)
    assert _query(tmp_path, "SELECT COUNT(*) n FROM arcs")[0]["n"] == 0


def test_takeover_login_exits_in_frankfurt(tmp_path):
    """Owner, 2026-10-06: the takeover sign-in comes through a Frankfurt data
    center, seven time zones east of her Houston home, so the time-zone overlay
    shows it. Built pack and frozen pack agree."""
    _build(tmp_path)
    want = [{"ip_country": "DE", "ip_lat": 50.1109, "ip_lng": 8.6821, "ip_type": "datacenter"}]
    sql = (
        "SELECT ip_country, ip_lat, ip_lng, ip_type FROM login_events WHERE id = 'gen-login-40927'"
    )
    assert _query(tmp_path, sql) == want
    frozen = db.connect(Path(__file__).resolve().parents[2] / "data" / "priya-ato.db")
    try:
        assert [dict(r) for r in frozen.execute(sql).fetchall()] == want
    finally:
        frozen.close()


def test_cnp_rows_read_ecom_never_chip(tmp_path):
    _build(tmp_path)
    bad = _query(
        tmp_path,
        "SELECT COUNT(*) n FROM transactions WHERE is_card_present=0 AND pos_entry_mode='chip'",
    )
    assert bad[0]["n"] == 0


def test_baseline_continues_after_the_takeover(tmp_path):
    """Days 28-29 still carry her coffee/Nevgate rhythm - she hasn't noticed."""
    _build(tmp_path)
    after = _query(
        tmp_path,
        "SELECT COUNT(*) n FROM transactions WHERE is_fraud=0 "
        "AND timestamp > '2026-05-25T11:06'",
    )
    assert after[0]["n"] > 0


def test_generic_entities_endpoint_serves_the_behavioral_kinds(tmp_path):
    """The platform seam: /api/entities?kind=... runs the manifest node query,
    so account_event and transfer need NO new endpoints. The manifest also
    carries the phish annotation (a story beat, never a data row)."""
    import main
    import scenario_registry as sr

    summary = _build(tmp_path)
    scen_dir = tmp_path / "scenarios"
    scen_dir.mkdir()
    (scen_dir / "priya-ato.scenario.json").write_text(
        (summary["manifest_path"]).read_text(encoding="utf-8"), encoding="utf-8"
    )
    sr.init_registry(scen_dir, base_dir=tmp_path, default_id="priya-ato")
    try:
        transfers = main.entities(kind="transfer")
        events = main.entities(kind="account_event")
        manifest = main.scenario()
    finally:
        # Re-point the module registry away from the tmp pack for other tests.
        sr._REGISTRY, sr._ACTIVE_ID = {}, None
    assert len(transfers) == 12 and len(events) == 2
    assert {t["rail"] for t in transfers} == {"tamsinmere", "wire"}
    assert {e["kind"] for e in events} == {"profile_change", "payee_add"}
    assert manifest["annotations"][0]["label"].startswith("Spear-phish")
    kinds = {n["kind"] for n in manifest["nodes"]}
    assert kinds == {"auth", "login", "account_event", "transfer", "decision"}
