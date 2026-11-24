from __future__ import annotations

from pathlib import Path

import pytest
from _rule_fixtures import _GEO_RULE, _insert_tx, _seed_full_signature, _seed_impossible_pair

import main
import rules as rules_module
import scenario_registry as sr
from db import connect, init_db


def test_geo_velocity_emits_one_decision_with_verdict(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    try:
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "IMPOSSIBLE TRAVEL"
    assert d.decision == "DECLINE"
    assert d.subject_path_kind == "fraud"  # the landing tx is fraud
    assert d.trigger_entity_ids == ["grocery", "lag1"]
    assert d.rule["id"] == "impossible-travel"
    assert 0.0 <= d.severity <= 1.0


def test_geo_velocity_thresholds_show_speed_breach(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    try:
        d = rules_module._eval_geo_velocity(conn, _GEO_RULE)[0]
    finally:
        conn.close()

    speed = next(t for t in d.thresholds if t["label"] == "Implied travel speed")
    assert speed["breached"] is True
    assert "mph" in speed["actual"]
    sep = next(t for t in d.thresholds if t["label"] == "Min separation")
    assert sep["breached"] is False
    dist_input = next(i for i in d.inputs if i["label"] == "Great-circle distance")
    assert "mi" in dist_input["value"]


def test_geo_velocity_no_arc_returns_empty(tmp_path):
    """Two same-city swipes -> no impossible arc -> no decision."""
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        for i, lng in enumerate((-95.37, -95.38)):
            conn.execute(
                "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
                "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
                "is_card_present, is_fraud) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    f"t{i}",
                    "c1",
                    "ac1",
                    f"2026-05-26T1{i}:00:00Z",
                    5.0,
                    "M",
                    29.76,
                    lng,
                    "5411",
                    "grocery",
                    5.0,
                    1,
                    0,
                ),
            )
        conn.commit()
        decisions = rules_module._eval_geo_velocity(conn, _GEO_RULE)
    finally:
        conn.close()
    assert decisions == []


def test_evidence_chain_surfaces_the_signature(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    _seed_full_signature(dbfile)
    conn = connect(dbfile)
    # The precursor is a card-testing burst (>= 2 micro CNP probes), not a lone charge
    # and not a fraud-labelled row: add the second probe beside the fixture's $1 one.
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(conn, [("micro2", "2026-05-27T05:09:00Z", 4.99, 0, 0, "cnp_token", 650)])
    try:
        d = rules_module._eval_geo_velocity(conn, _GEO_RULE)[0]
    finally:
        conn.close()

    labels = {e["label"]: e["value"] for e in d.evidence}
    assert "Skimmer signature" in labels
    assert labels["Skimmer signature"].startswith("3x chip-fallback-swipe")
    assert "Auth routing" in labels and "STIP" in labels["Auth routing"]
    assert "Risk scores" in labels
    assert "942" in labels["Risk scores"] and "981" in labels["Risk scores"]
    assert labels.get("Currency") == "NGN"
    assert "Precursor" in labels and "CNP" in labels["Precursor"]
    # the STIP + precursor rows carry an entity_ref back to the globe
    assert any(e.get("entity_ref") == "lag1" for e in d.evidence)
    assert any(e.get("entity_ref") == "micro" for e in d.evidence)


@pytest.mark.parametrize(
    ("code", "words"),
    [(None, "approved"), ("00", "approved"), ("05", "declined")],
)
def test_stip_line_words_the_landing_rows_own_response_code(tmp_path, code, words):
    """The Auth routing line says what the landing row's response code says: a stand-in
    approval for "00" or the column's default, a stand-in decline for any other code."""
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    if code is not None:
        conn.execute("UPDATE transactions SET auth_response_code = ? WHERE id = 'lag1'", (code,))
        conn.commit()
    try:
        d = rules_module._eval_geo_velocity(conn, _GEO_RULE)[0]
    finally:
        conn.close()
    (line,) = [e for e in d.evidence if e["label"] == "Auth routing"]
    assert line["value"] == f"STIP - issuer offline, stand-in {words}"
    assert line["entity_ref"] == "lag1"


def test_card_manifest_declares_impossible_travel_rule(tmp_path):
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")
    rules = sr.get_active().rules
    assert any(r["detector"] == "geo-velocity" and r["decision"] == "DECLINE" for r in rules)


def test_geo_velocity_scopes_to_focal_card(tmp_path):
    """The population DB interleaves 301 cards; consecutive card-present rows
    from DIFFERENT cards in different metros imply infinite speed and crashed
    the evaluator (FIX-2026-06-10-geo-velocity-overflow-population-db). With a
    focal card the detector evaluates ONE subject's path."""
    dbfile = tmp_path / "pop.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    base = (
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, merchant_name, "
        "merchant_lat, merchant_lng, merchant_country, mcc, category, is_card_present, is_fraud, "
        "balance_after) VALUES "
    )
    rows = [
        # The cross-card trap: same timestamp, Houston vs Seattle, both card-present.
        "('x1','card-other','a9','2026-05-01T08:00:00-05:00',10,'Hou',29.76,-95.36,"
        "'US','5411','g',1,0,0)",
        "('x2','card-other-2','a8','2026-05-01T08:00:00-05:00',10,'Sea',47.60,-122.33,"
        "'US','5411','g',1,0,0)",
        # The focal card's genuine impossible pair: Houston -> Lagos in 2 hours.
        "('m1','card-focal','a1','2026-05-02T08:00:00-05:00',25,'Hou',29.76,-95.36,"
        "'US','5411','g',1,0,0)",
        "('m2','card-focal','a1','2026-05-02T10:00:00-05:00',900,'Lagos',6.52,3.38,"
        "'NG','6011','cash',1,1,0)",
    ]
    conn.execute(base + ", ".join(rows))
    conn.commit()
    try:
        decisions = rules_module.evaluate(conn, [_GEO_RULE], focal={"card_id": "card-focal"})
    finally:
        conn.close()
    assert len(decisions) == 1
    assert set(decisions[0].trigger_entity_ids) == {"m1", "m2"}


def test_geo_velocity_skips_nonfinite_arcs_without_focal(tmp_path):
    """Defense in depth: even unscoped, a zero-elapsed (infinite-speed) pair can
    never be the hero arc - no OverflowError, no nonsense headline."""
    dbfile = tmp_path / "inf.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, merchant_name, "
        "merchant_lat, merchant_lng, merchant_country, mcc, category, is_card_present, is_fraud, "
        "balance_after) VALUES "
        "('i1','c1','a1','2026-05-01T08:00:00-05:00',10,'Hou',29.76,-95.36,'US','5411','g',1,0,0),"
        "('i2','c2','a2','2026-05-01T08:00:00-05:00',10,'Sea',47.60,-122.33,'US','5411','g',1,0,0)"
    )
    conn.commit()
    try:
        decisions = rules_module.evaluate(conn, [_GEO_RULE])  # must not raise
    finally:
        conn.close()
    assert decisions == []  # the only candidate pair is non-finite -> no hero
