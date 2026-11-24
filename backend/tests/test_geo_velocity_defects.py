"""Regression tests for two geo-velocity detector defects.

Impossibility floor: an impossible-travel leg must carry a meaningful impossibility
severity FLOOR even when every risk_score in the pack is 0/absent (the
model-generated concordia pack). The floor comes from the geometry (card-present
at both ends above the speed bound), never from the fraud label, so severity must
not collapse to 0.0.

One Decision per arc: the globe draws one arc PER impossible-travel pair, but the
detector historically emitted only ONE hero Decision, so a labeled txn outside
the hero pair had no matching pill. The detector must emit one Decision PER arc,
each keyed to its own pair's trigger ids, hero (max-speed) first.
"""

from __future__ import annotations

from pathlib import Path

from _rule_fixtures import _GEO_RULE, _seed_full_signature, _seed_impossible_pair

import rules as rules_module
from db import connect, init_db

# The impossibility severity floor at full strength (implied speed >= 2,000 mph),
# expressed on the 0..1 Decision scale.
_IMPOSSIBILITY_FLOOR = 0.9


def _seed_confirmed_fraud_zero_risk(dbfile, card_id="c1", account_id="ac1"):
    """The concordia failure mode in miniature: an impossible CP pair whose
    risk_score is 0 (the model pack seeds no risk). Houston -> Lagos in ~2h
    (~3,260 mph), both card-present, landing labelled fraud."""
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, risk_score) VALUES "
            f"('grocery','{card_id}','{account_id}','2026-05-26T19:32:00Z',82.0,'Cobstead Grocers',"
            "29.78,-95.46,'5411','grocery',900.0,'US',1,0,0)"
        )
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, risk_score) VALUES "
            f"('lag1','{card_id}','{account_id}','2026-05-26T21:32:00Z',300.0,'Lagos ATM',"
            "6.45,3.47,'6011','atm',600.0,'NG',1,1,0)"
        )
        conn.commit()
    finally:
        conn.close()


# --- the impossibility floor engages despite risk_score = 0 ---


def test_impossible_travel_floors_severity_when_risk_zero(tmp_path):
    """An impossible-travel pair with risk_score=0 must NOT collapse to severity
    0.0 - the geometric impossibility is itself high-confidence, so the
    impossibility floor engages."""
    dbfile = tmp_path / "data" / "zero.db"
    _seed_confirmed_fraud_zero_risk(dbfile)
    conn = connect(dbfile)
    try:
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    d = decisions[0]
    assert d.subject_path_kind == "fraud"  # landing leg is confirmed fraud
    assert d.severity >= _IMPOSSIBILITY_FLOOR, (
        f"impossible travel with risk_score=0 collapsed to severity {d.severity}; "
        f"expected the impossibility floor (>= {_IMPOSSIBILITY_FLOOR})"
    )


def test_high_risk_score_still_maps_to_peak_risk_severity(tmp_path):
    """The authored card-fraud path is unchanged: with a real fraud cluster the
    peak risk score (981/1000) drives severity ~0.98, above the floor."""
    dbfile = tmp_path / "data" / "authored.db"
    _seed_full_signature(dbfile)
    conn = connect(dbfile)
    try:
        d = rules_module._eval_geo_velocity(conn, _GEO_RULE)[0]
    finally:
        conn.close()

    # peak Lagos risk in the fixture is 981 -> 0.98, well above the floor.
    assert d.severity == 0.98


# --- one Decision per impossible arc ---


def _seed_alternating_cp(dbfile, card_id="gen-card-001"):
    """The frozen concordia CP shape in miniature: 5 card-present rows on ONE
    card, alternating US(auth) / NG(fraud), 6 min apart, risk_score=0.
    detect_arcs -> 4 consecutive impossible arcs."""
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        legs = [
            ("gen-tx-0002", "2026-05-27T08:12:00-05:00", "NG", 6.52, 3.38, 1),
            ("gen-tx-0003", "2026-05-27T08:18:00-05:00", "US", 29.76, -95.36, 0),
            ("gen-tx-0004", "2026-05-27T08:24:00-05:00", "NG", 6.52, 3.38, 1),
            ("gen-tx-0005", "2026-05-27T08:30:00-05:00", "US", 29.76, -95.36, 0),
            ("gen-tx-0006", "2026-05-27T08:36:00-05:00", "NG", 6.52, 3.38, 1),
        ]
        for tid, ts, country, lat, lng, fraud in legs:
            conn.execute(
                "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
                "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
                "merchant_country, is_card_present, is_fraud, risk_score) VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    tid,
                    card_id,
                    "gen-acct-001",
                    ts,
                    100.0,
                    "M",
                    lat,
                    lng,
                    "5411",
                    "g",
                    0.0,
                    country,
                    1,
                    fraud,
                    0,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def test_emits_one_decision_per_impossible_arc(tmp_path):
    """N>=2 impossible arcs -> N geo-velocity Decisions, each keyed to its own
    pair's trigger ids, covering every arc endpoint; hero (max speed) first."""
    dbfile = tmp_path / "data" / "multi.db"
    _seed_alternating_cp(dbfile)
    conn = connect(dbfile)
    try:
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()

    # 5 alternating CP rows -> 4 consecutive impossible arcs -> 4 decisions.
    assert len(decisions) == 4

    trigger_pairs = [tuple(d.trigger_entity_ids) for d in decisions]
    # Each decision is keyed to a distinct consecutive pair (disjoint pairings).
    assert set(trigger_pairs) == {
        ("gen-tx-0002", "gen-tx-0003"),
        ("gen-tx-0003", "gen-tx-0004"),
        ("gen-tx-0004", "gen-tx-0005"),
        ("gen-tx-0005", "gen-tx-0006"),
    }
    # Every arc endpoint is covered by some decision's trigger ids.
    covered = {tid for pair in trigger_pairs for tid in pair}
    assert covered == {
        "gen-tx-0002",
        "gen-tx-0003",
        "gen-tx-0004",
        "gen-tx-0005",
        "gen-tx-0006",
    }
    # Decision ids are unique per pair (no id collision when N arcs share a rule).
    assert len({d.id for d in decisions}) == 4
    # Every arc carries the impossibility floor, the non-fraud-landing arcs (the US
    # legs, is_fraud = 0) included: the floor reads geometry, never the label.
    assert {d.subject_path_kind for d in decisions} == {"fraud", "auth"}
    for d in decisions:
        assert _IMPOSSIBILITY_FLOOR <= d.severity <= 1.0


def test_single_arc_pack_still_emits_exactly_one_decision(tmp_path):
    """The authored single-hero UX is unchanged: 1 arc -> 1 decision."""
    dbfile = tmp_path / "data" / "single.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    try:
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    assert decisions[0].trigger_entity_ids == ["grocery", "lag1"]


def test_concordia_frozen_db_yields_four_decisions(tmp_path):
    """Against the real frozen concordia DB shape (5 CP rows alternating US/NG
    -> 4 arcs) the detector emits 4 geo-velocity decisions, each with a matching
    pill-able pair. Guards this end-to-end on the shipped data."""
    concordia = Path(__file__).resolve().parents[2] / "data" / "card-fraud-concordia.db"
    if not concordia.exists():
        import pytest

        pytest.skip("frozen concordia DB not built")
    conn = connect(concordia)
    try:
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()

    assert len(decisions) == 4
    covered = {tid for d in decisions for tid in d.trigger_entity_ids}
    # Every fraud-landing txn the client labels (0002/0004/0006) is covered.
    assert {"gen-tx-0002", "gen-tx-0004", "gen-tx-0006"} <= covered
