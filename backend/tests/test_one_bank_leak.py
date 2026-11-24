"""One-bank leak guard: case-scoped reads return ZERO rows from other customers."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

import rules as rules_module
from db import connect, init_db, set_active_db

_MARCUS_CARD = "card-marcus-visa-001"
_MARCUS_ACCT = "acct-marcus-cc-001"
_INTRUDER_CARD = "card-intruder-999"
_INTRUDER_ACCT = "acct-intruder-999"


def _seed_two_customers(conn: sqlite3.Connection) -> None:
    """Seed two customers in one DB."""
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executemany(
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
        "merchant_name, merchant_lat, merchant_lng, merchant_country, mcc, category, "
        "is_card_present, is_fraud, balance_after) VALUES "
        "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                "tx-m-0",
                _MARCUS_CARD,
                _MARCUS_ACCT,
                "2026-05-01T10:00:00-05:00",
                12.0,
                "Cobstead Grocers",
                29.7,
                -95.5,
                "US",
                "5411",
                "grocery",
                1,
                0,
                100.0,
            ),
            (
                "tx-x-0",
                _INTRUDER_CARD,
                _INTRUDER_ACCT,
                "2026-05-01T10:05:00-05:00",
                99.0,
                "INTRUDER MART",
                40.0,
                -74.0,
                "US",
                "5411",
                "grocery",
                1,
                0,
                100.0,
            ),
        ],
    )
    conn.commit()


def test_case_scoped_transactions_exclude_other_customers(tmp_path: Path) -> None:
    """RED: unscoped read leaks intruder rows. GREEN when M2 adds case scoping."""
    merged = tmp_path / "replay.db"
    init_db(merged)
    conn = connect(merged)
    try:
        _seed_two_customers(conn)
    finally:
        conn.close()

    import main

    # Point the endpoint at THIS fixture DB. After import (which may run the
    # registry init that repoints the DB), so the fixture wins regardless of
    # whether main was already imported by an earlier test.
    set_active_db(merged)
    client = TestClient(main.app)
    response = client.get("/api/transactions?case=marcus")
    assert response.status_code == 200
    rows = response.json()
    card_ids = set(r["card_id"] for r in rows)
    assert card_ids == set([_MARCUS_CARD]), "LEAK: expected only marcus, got foreign"


def test_case_scoped_decisions_evidence_excludes_other_customers(tmp_path: Path) -> None:
    """A foreign card's same-country fraud must not leak into the focal card's
    decision. The leak surfaces in _gather_evidence's risk-score cluster (line 60)
    and in the peak-risk severity (line 189), both keyed by merchant_country with
    NO card scope. RED until the evidence chain scopes to the focal card."""
    merged = tmp_path / "replay.db"
    init_db(merged)
    conn = connect(merged)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executemany(
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
        "merchant_name, merchant_lat, merchant_lng, merchant_country, mcc, category, "
        "is_card_present, is_fraud, balance_after, risk_score) VALUES "
        "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                "tx-m-cp0",
                _MARCUS_CARD,
                _MARCUS_ACCT,
                "2026-05-10T08:00:00-05:00",
                50.0,
                "Houston CP",
                29.7,
                -95.5,
                "US",
                "5411",
                "grocery",
                1,
                0,
                100.0,
                0,
            ),
            (
                "tx-m-cp1",
                _MARCUS_CARD,
                _MARCUS_ACCT,
                "2026-05-10T08:05:00-05:00",
                800.0,
                "Lagos CP",
                6.5,
                3.4,
                "NG",
                "5999",
                "misc",
                1,
                1,
                100.0,
                950,
            ),
            (
                "tx-x-fraud",
                _INTRUDER_CARD,
                _INTRUDER_ACCT,
                "2026-05-10T09:00:00-05:00",
                1200.0,
                "Intruder Lagos",
                6.5,
                3.4,
                "NG",
                "5999",
                "misc",
                1,
                1,
                100.0,
                999,
            ),
        ],
    )
    conn.commit()

    focal = {"card_id": _MARCUS_CARD, "account_id": _MARCUS_ACCT}
    geo_rule = {
        "id": "impossible-travel",
        "label": "impossible-travel",
        "detector": "geo-velocity",
        "verdict": "IMPOSSIBLE TRAVEL",
        "decision": "DECLINE",
        "sop": {"what": "Card in two places.", "why": "Impossible.", "brief": "Check."},
    }
    try:
        decisions = rules_module.evaluate(conn, [geo_rule], focal)
    finally:
        conn.close()

    assert decisions, "expected an IMPOSSIBLE TRAVEL decision for the focal card"
    decision = decisions[0]
    blob = repr(decision.evidence)
    # The intruder's risk score (999) is the real leak indicator; the amount/merchant
    # never reach the evidence dict, so asserting only those misses the leak.
    assert (
        "999" not in blob and "Intruder Lagos" not in blob and "1200" not in blob
    ), f"leak: a foreign card's fraud row contaminated the evidence chain: {blob}"
    # Severity derives from the focal card's own peak risk (950 -> 0.95), never the
    # intruder's inflated 999 (-> 1.0).
    assert (
        decision.severity == 0.95
    ), f"leak: severity {decision.severity} reflects a foreign card's risk score"
