"""The rules engine must not read the ground-truth `is_fraud` label.

A detector that looks the answer up (`WHERE is_fraud = 1`) cannot explain how it
found anything: the evidence is circular. These tests zero every `is_fraud`
column in a copy of a real pack, re-run the manifest rules, and require the same
decisions, severities and evidence. Only `subject_path_kind` (fraud vs auth path
colouring on the globe) may follow the label; it is display-only.
"""

from __future__ import annotations

import shutil
import sqlite3
from dataclasses import asdict
from pathlib import Path

import pytest
from _rule_fixtures import _GEO_RULE, _insert_tx, _seed_full_signature, _seed_impossible_pair

import db
import rules as rules_module
import scenario_registry as sr
import seed
from db import connect, init_db
from generators.concordia.clock import ScenarioClock
from generators.concordia.pipeline import build_pack
from generators.concordia.sim.scripted import PRIYA_ATO_READBACK, STEP_MINUTES, WINDOW_START
from rules.shared import _kill_chain_evidence

_SCENARIOS = Path(__file__).resolve().parents[1] / "scenarios"
_DISPLAY_ONLY = {"subject_path_kind"}  # path colouring; legitimately follows the label


def _zero_labels(dbfile: Path) -> None:
    """UPDATE <table> SET is_fraud = 0 on every table that carries the column."""
    conn = sqlite3.connect(dbfile)
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        for t in tables:
            cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')]
            if "is_fraud" in cols:
                conn.execute(f'UPDATE "{t}" SET is_fraud = 0')
        conn.commit()
    finally:
        conn.close()


def _label_count(dbfile: Path) -> int:
    conn = sqlite3.connect(dbfile)
    try:
        n = 0
        for (t,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')]
            if "is_fraud" in cols:
                n += conn.execute(f'SELECT COUNT(*) FROM "{t}" WHERE is_fraud = 1').fetchone()[0]
        return n
    finally:
        conn.close()


def _decisions(dbfile: Path, rule_defs: list[dict], focal: dict | None) -> list[dict]:
    conn = db.connect(dbfile)
    try:
        return [asdict(d) for d in rules_module.evaluate(conn, rule_defs, focal)]
    finally:
        conn.close()


def _strip_display(decisions: list[dict]) -> list[dict]:
    return [{k: v for k, v in d.items() if k not in _DISPLAY_ONLY} for d in decisions]


def _manifest(name: str, tmp_path: Path) -> sr.Manifest:
    return sr.load_manifest(_SCENARIOS / f"{name}.scenario.json", base_dir=tmp_path)


@pytest.fixture(scope="module")
def marcus_db(tmp_path_factory) -> Path:
    """Marcus's card-fraud pack on the population DB (the one-bank-leak shape)."""
    p = tmp_path_factory.mktemp("label_blind_marcus") / "replay.db"
    seed.main(db_path=p, with_population=True)
    return p


@pytest.fixture(scope="module")
def priya_db(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("label_blind_priya")
    clock = ScenarioClock(start=WINDOW_START, step_minutes=STEP_MINUTES)
    build_pack(PRIYA_ATO_READBACK, out_dir=out, clock=clock, scenario="priya-ato")
    return out / "data" / "priya-ato.db"


def _assert_label_blind(dbfile: Path, tmp_path: Path, manifest: sr.Manifest) -> list[dict]:
    labeled = _decisions(dbfile, manifest.rules, manifest.focal)
    blind_db = tmp_path / "blind.db"
    shutil.copy(dbfile, blind_db)
    assert _label_count(dbfile) > 0, "fixture has no labelled fraud; the test would be vacuous"
    _zero_labels(blind_db)
    assert _label_count(blind_db) == 0
    blind = _decisions(blind_db, manifest.rules, manifest.focal)

    assert labeled, "no decisions fired; the comparison would be vacuous"
    assert [d["id"] for d in blind] == [d["id"] for d in labeled]
    assert _strip_display(blind) == _strip_display(labeled)
    return labeled


def test_marcus_rules_ignore_the_fraud_label(marcus_db, tmp_path):
    decisions = _assert_label_blind(marcus_db, tmp_path, _manifest("card-fraud", tmp_path))
    kinds = {d["rule"]["kind"] for d in decisions}
    assert {"geo-velocity", "card-testing", "skimmer-signature"} <= kinds


def test_priya_rules_ignore_the_fraud_label(priya_db, tmp_path):
    decisions = _assert_label_blind(priya_db, tmp_path, _manifest("priya-ato", tmp_path))
    kinds = {d["rule"]["kind"] for d in decisions}
    assert {"login-anomaly", "account-change-velocity"} <= kinds


def test_marcus_impossible_travel_values_are_pinned(marcus_db, tmp_path):
    """Severity and the precursor/cluster evidence keep their authored values."""
    m = _manifest("card-fraud", tmp_path)
    (geo,) = [
        d for d in _decisions(marcus_db, m.rules, m.focal) if d["rule"]["kind"] == "geo-velocity"
    ]
    assert geo["severity"] == 0.98  # peak Lagos risk 981 / 1000
    ev = {e["label"]: e for e in geo["evidence"]}
    assert ev["Risk scores"]["value"] == "940 / 942 / 967 / 981 (of 1000)"
    assert ev["Skimmer signature"]["value"].startswith("4x chip-fallback-swipe")
    assert ev["Precursor"]["value"] == "$1 CNP micro-test - Brookharp Audio (risk 610)"
    conn = sqlite3.connect(marcus_db)
    try:
        micro_id = conn.execute(
            "SELECT id FROM transactions WHERE card_id = ? AND amount = 0.99",
            (m.focal["card_id"],),
        ).fetchone()[0]
    finally:
        conn.close()
    assert ev["Precursor"]["entity_ref"] == micro_id  # the $0.99 card-not-present probe


def test_priya_kill_chain_baseline_is_pinned(priya_db, tmp_path):
    m = _manifest("priya-ato", tmp_path)
    (ato,) = [
        d for d in _decisions(priya_db, m.rules, m.focal) if d["verdict"] == "ACCOUNT TAKEOVER"
    ]
    ev = {e["label"]: e["value"] for e in ato["evidence"]}
    assert ev["Amount vs baseline"] == "$4,200 wire ~ 93x the account's median P2P ($45.00)"
    assert ato["severity"] == 0.9


# --- hand-built shapes: bounds of the label-free cluster and precursor ---


def _tx(conn, tid, ts, *, amount=50.0, cp=1, country="US", lat=29.78, lng=-95.46, risk=0):
    conn.execute(
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, merchant_name, "
        "merchant_lat, merchant_lng, mcc, category, balance_after, merchant_country, "
        "is_card_present, is_fraud, pos_entry_mode, risk_score) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)",
        (
            tid,
            "c1",
            "ac1",
            ts,
            amount,
            f"M-{tid}",
            lat,
            lng,
            "5411",
            "g",
            0.0,
            country,
            cp,
            "chip" if cp else "cnp_key",
            risk,
        ),
    )


def _geo(dbfile: Path):
    conn = connect(dbfile)
    try:
        return rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()


def _lagos_pair(conn, landing_ts="2026-05-27T05:18:00Z"):
    _tx(conn, "grocery", "2026-05-26T19:32:00Z")
    _tx(conn, "lag1", landing_ts, country="NG", lat=6.45, lng=3.47, risk=500)


def test_cluster_is_bounded_to_the_hour_after_landing(tmp_path):
    dbfile = tmp_path / "data" / "cluster.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _lagos_pair(conn)
    _tx(conn, "lag2", "2026-05-27T05:48:00Z", country="NG", lat=6.45, lng=3.47, risk=600)
    _tx(conn, "later", "2026-05-29T05:18:00Z", country="NG", lat=6.45, lng=3.47, risk=999)
    conn.commit()
    conn.close()
    (d,) = _geo(dbfile)
    ev = {e["label"]: e["value"] for e in d.evidence}
    assert ev["Risk scores"] == "500 / 600 (of 1000)"  # the 999 two days on is another episode
    assert d.severity == 0.61  # peak 600 sits under the ~668 mph speed-scaled floor (0.6147)


def test_precursor_is_a_card_testing_burst_inside_the_lookback(tmp_path):
    dbfile = tmp_path / "data" / "precursor.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _lagos_pair(conn)
    _tx(conn, "sub", "2026-05-27T01:00:00Z", amount=12.99, cp=0)  # CNP but above the probe size
    _tx(conn, "lone", "2026-05-27T04:00:00Z", amount=2.5, cp=0)  # one micro charge is no burst
    _tx(conn, "old1", "2026-04-01T01:00:00Z", amount=1.0, cp=0)  # a real burst, but weeks before
    _tx(conn, "old2", "2026-04-01T01:05:00Z", amount=1.5, cp=0)
    conn.commit()
    conn.close()
    (d,) = _geo(dbfile)
    assert "Precursor" not in {e["label"] for e in d.evidence}

    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _tx(conn, "mate", "2026-05-27T04:10:00Z", amount=7.0, cp=0)  # completes the burst
    conn.commit()
    conn.close()
    (d,) = _geo(dbfile)
    pre = next(e for e in d.evidence if e["label"] == "Precursor")
    assert pre["entity_ref"] == "lone"  # the smallest probe of the burst


def _zero_risk_severity(tmp_path, name, landing_ts):
    """Severity of the single Houston -> Lagos arc landing at `landing_ts`, with every
    risk_score zeroed (no label, no risk: only the geometry speaks)."""
    dbfile = tmp_path / "data" / f"{name}.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _lagos_pair(conn, landing_ts)
    conn.execute("UPDATE transactions SET risk_score = 0")
    conn.commit()
    conn.close()
    (d,) = _geo(dbfile)
    return d.severity


def test_impossibility_floor_needs_no_label_and_no_risk_score(tmp_path):
    """Card-present at both ends above the speed bound is certain from geometry:
    a zero-risk pair at ~3,260 mph with no fraud label carries the full 0.90 floor."""
    assert _zero_risk_severity(tmp_path, "floor", "2026-05-26T21:32:00Z") == 0.9


def test_impossibility_floor_scales_with_implied_speed(tmp_path):
    """The floor must rank arcs: a ~630 mph landing barely over the 600 mph bound is
    far less certain than a ~3,260 mph one, so on a zero-risk card it scores lower
    (DecisionsSection sorts by severity)."""
    slow = _zero_risk_severity(tmp_path, "slow", "2026-05-27T05:54:00Z")  # ~630 mph
    fast = _zero_risk_severity(tmp_path, "fast", "2026-05-26T21:32:00Z")  # ~3,260 mph
    assert slow < fast
    assert slow < 0.7  # near the 0.6 base of the floor
    assert fast == 0.9  # saturates at the full floor from 2,000 mph


def _tamsinmere(conn, tid, ts, amount, session=""):
    conn.execute(
        "INSERT INTO transfers (id, account_id, timestamp, amount, payee_id, rail, status, "
        "session_id, is_fraud) VALUES (?, 'acct-1', ?, ?, 'payee-1', 'tamsinmere', 'sent', ?, 0)",
        (tid, ts, amount, session),
    )


def test_kill_chain_baseline_excludes_the_flagged_session(tmp_path):
    """The P2P baseline is the account's history OUTSIDE the flagged session: P2P sent
    inside the takeover session must not shift the median. Three large in-session
    tamsinmere transfers would pull an unfiltered median from $45 up to $5,000 and shrink the
    multiple from 93x to 1x."""
    dbfile = tmp_path / "data" / "baseline.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _tamsinmere(conn, "z-old-1", "2026-05-01T09:00:00Z", 40.0)
    _tamsinmere(conn, "z-old-2", "2026-05-02T09:00:00Z", 45.0)
    for i, amt in enumerate((5000.0, 6000.0, 7000.0)):
        _tamsinmere(conn, f"z-sess-{i}", f"2026-05-25T10:0{i}:00Z", amt, "sess-takeover")
    conn.execute(
        "INSERT INTO transfers (id, account_id, timestamp, amount, payee_id, rail, status, "
        "session_id, is_fraud) VALUES ('w1', 'acct-1', '2026-05-25T10:30:00Z', 4200.0, "
        "'payee-new', 'wire', 'sent', 'sess-takeover', 1)"
    )
    conn.commit()
    try:
        ev = {e["label"]: e["value"] for e in _kill_chain_evidence(conn, "sess-takeover")}
    finally:
        conn.close()
    assert ev["Amount vs baseline"] == "$4,200 wire ~ 93x the account's median P2P ($45.00)"


# --- the minimal fixtures the rest of the suite uses, labelled vs unlabelled ---


@pytest.mark.parametrize("focal", [None, {"card_id": "c1"}])
def test_fixture_signature_is_label_blind_scoped_and_unscoped(tmp_path, focal):
    dbfile = tmp_path / "data" / "sig.db"
    _seed_full_signature(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(conn, [("micro2", "2026-05-27T05:09:00Z", 4.99, 0, 1, "cnp_token", 650)])
    conn.close()  # the fixture's lone $1 probe + this one form a card-testing burst
    blind = tmp_path / "data" / "sig-blind.db"
    shutil.copy(dbfile, blind)
    _zero_labels(blind)

    def run(path):
        conn = connect(path)
        try:
            return [asdict(d) for d in rules_module._eval_geo_velocity(conn, _GEO_RULE, focal)]
        finally:
            conn.close()

    labeled, unlabeled = run(dbfile), run(blind)
    assert labeled and labeled[0]["severity"] == 0.98
    assert any(e["label"] == "Precursor" for e in labeled[0]["evidence"])
    assert _strip_display(unlabeled) == _strip_display(labeled)


def test_single_pair_fixture_still_yields_one_decision_without_labels(tmp_path):
    dbfile = tmp_path / "data" / "pair.db"
    _seed_impossible_pair(dbfile)
    _zero_labels(dbfile)
    assert len(_geo(dbfile)) == 1
