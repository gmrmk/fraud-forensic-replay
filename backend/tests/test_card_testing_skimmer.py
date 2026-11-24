from __future__ import annotations

from _rule_fixtures import _CT_RULE, _SK_RULE, _insert_tx

import rules as rules_module
from db import connect, init_db


def test_card_testing_fires_on_a_small_cnp_burst(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(
        conn,
        [
            ("base", "2026-05-21T07:00:00-05:00", 52.0, 1, 0, "chip", 80),
            ("p1", "2026-05-21T09:14:00-05:00", 0.99, 0, 1, "cnp_key", 610),
            ("p2", "2026-05-21T09:15:00-05:00", 4.99, 0, 1, "cnp_key", 640),
            ("p3", "2026-05-21T09:17:00-05:00", 9.99, 0, 1, "cnp_key", 620),
            ("after", "2026-05-21T15:00:00-05:00", 54.0, 1, 0, "chip", 90),
        ],
    )
    try:
        decisions = rules_module._eval_card_testing(conn, _CT_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "CARD TESTING"
    assert d.decision == "FLAG"
    assert d.trigger_entity_ids == ["p1", "p2", "p3"]
    assert 0.0 <= d.severity <= 1.0
    count = next(t for t in d.thresholds if t["label"] == "Probe count")
    assert count["breached"] is True


def test_card_testing_ignores_isolated_small_cnp(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(
        conn,
        [
            ("s1", "2026-05-01T09:00:00-05:00", 4.99, 0, 0, "cnp_token", 40),
            ("s2", "2026-05-01T11:30:00-05:00", 2.99, 0, 0, "cnp_token", 35),
        ],
    )
    try:
        assert rules_module._eval_card_testing(conn, _CT_RULE) == []
    finally:
        conn.close()


def test_card_testing_ignores_normal_sized_cnp_bursts(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(
        conn,
        [
            ("b1", "2026-05-01T09:00:00-05:00", 49.99, 0, 0, "ecom", 60),
            ("b2", "2026-05-01T09:05:00-05:00", 89.99, 0, 0, "ecom", 70),
            ("b3", "2026-05-01T09:09:00-05:00", 35.00, 0, 0, "ecom", 55),
        ],
    )
    try:
        assert rules_module._eval_card_testing(conn, _CT_RULE) == []
    finally:
        conn.close()


def test_skimmer_signature_fires_on_a_fallback_run(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    chip_baseline = [
        (f"chip{i}", f"2026-05-0{i + 1}T08:00:00-05:00", 20.0 + i, 1, 0, "chip", 50)
        for i in range(5)
    ]
    _insert_tx(
        conn,
        chip_baseline
        + [
            ("f1", "2026-05-27T07:41:00-05:00", 580.4, 1, 1, "chip_fallback_swipe", 940),
            ("f2", "2026-05-27T07:42:00-05:00", 580.4, 1, 1, "chip_fallback_swipe", 942),
            ("f3", "2026-05-27T07:45:00-05:00", 1240.0, 1, 1, "chip_fallback_swipe", 967),
            ("f4", "2026-05-27T07:49:00-05:00", 890.5, 1, 1, "chip_fallback_swipe", 981),
        ],
    )
    try:
        decisions = rules_module._eval_skimmer_signature(conn, _SK_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "SKIMMER SIGNATURE"
    assert d.decision == "REVIEW"
    assert d.trigger_entity_ids == ["f1", "f2", "f3", "f4"]
    run = next(t for t in d.thresholds if t["label"] == "Fallback run")
    assert run["breached"] is True


def test_skimmer_signature_ignores_isolated_fallbacks(tmp_path):
    """Legitimate fallback happens as singletons (a worn reader) - never a finding."""
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    chip_baseline = [
        (f"chip{i}", f"2026-05-0{i + 1}T08:00:00-05:00", 20.0 + i, 1, 0, "chip", 50)
        for i in range(5)
    ]
    _insert_tx(
        conn,
        chip_baseline
        + [
            ("lone1", "2026-05-10T09:00:00-05:00", 65.01, 1, 0, "chip_fallback_swipe", 105),
            ("lone2", "2026-05-18T21:00:00-05:00", 87.57, 1, 0, "chip_fallback_swipe", 21),
        ],
    )
    try:
        assert rules_module._eval_skimmer_signature(conn, _SK_RULE) == []
    finally:
        conn.close()


def test_skimmer_signature_requires_a_chip_baseline(tmp_path):
    """A stripe-only card falling back is not a counterfeit tell."""
    dbfile = tmp_path / "data" / "d.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    _insert_tx(
        conn,
        [
            ("f1", "2026-05-27T07:41:00-05:00", 50.0, 1, 0, "chip_fallback_swipe", 200),
            ("f2", "2026-05-27T07:42:00-05:00", 60.0, 1, 0, "chip_fallback_swipe", 210),
            ("f3", "2026-05-27T07:45:00-05:00", 70.0, 1, 0, "chip_fallback_swipe", 220),
        ],
    )
    try:
        assert rules_module._eval_skimmer_signature(conn, _SK_RULE) == []
    finally:
        conn.close()
