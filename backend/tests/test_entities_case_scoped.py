"""Case-scoping guard for /api/entities.

The manifest node queries are whole-DB (`SELECT * FROM transactions WHERE
is_fraud = 0 ...`) with NO card scope, because each scenario once owned its own
single-customer DB. Under one bank that is the load-bearing leak surface: a
case-scoped read of `auth` must return ONLY the focal card's rows, while an
UNSCOPED read (no ?case=) must still return the whole population (the
unscoped read the file-backed kinds depend on).

This mirrors the synthetic-two-customer fixture idiom in test_one_bank_leak.py.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from db import connect, init_db, set_active_db

_MARCUS_CARD = "card-marcus-visa-001"
_MARCUS_ACCT = "acct-marcus-cc-001"
_INTRUDER_CARD = "card-intruder-999"
_INTRUDER_ACCT = "acct-intruder-999"


def _seed_two_customers(conn: sqlite3.Connection) -> None:
    """One Marcus auth + one intruder auth, both clean (is_fraud=0), both US."""
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


def _client_over(merged: Path) -> TestClient:
    """A TestClient whose endpoints read THIS fixture DB. set_active_db after
    import so the fixture wins regardless of import-time registry init."""
    import main

    set_active_db(merged)
    return TestClient(main.app)


def test_entities_auth_case_scoped_excludes_other_customers(tmp_path: Path) -> None:
    """/api/entities?kind=auth&case=marcus returns ONLY Marcus's auths."""
    merged = tmp_path / "replay.db"
    init_db(merged)
    conn = connect(merged)
    try:
        _seed_two_customers(conn)
    finally:
        conn.close()

    client = _client_over(merged)
    response = client.get("/api/entities?kind=auth&case=marcus")
    assert response.status_code == 200
    rows = response.json()
    card_ids = {r["card_id"] for r in rows}
    assert card_ids == {_MARCUS_CARD}, f"LEAK: case-scoped auth returned foreign cards {card_ids}"


def test_entities_auth_unscoped_returns_whole_population(tmp_path: Path) -> None:
    """/api/entities?kind=auth with NO case returns BOTH customers (the
    deliberate unscoped read -- must not break)."""
    merged = tmp_path / "replay.db"
    init_db(merged)
    conn = connect(merged)
    try:
        _seed_two_customers(conn)
    finally:
        conn.close()

    client = _client_over(merged)
    response = client.get("/api/entities?kind=auth")
    assert response.status_code == 200
    rows = response.json()
    card_ids = {r["card_id"] for r in rows}
    assert card_ids == {
        _MARCUS_CARD,
        _INTRUDER_CARD,
    }, f"population read regressed: expected both cards, got {card_ids}"
