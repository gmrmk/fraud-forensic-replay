"""Tests for /api/transfers focal-override (TDD - RED first).

Per-request scoping precedence mirrors /api/logins and /api/account_events:
  explicit ?account_id= wins;
  else ?case= resolves via cases registry;
  else manifest focal account_id;
  else all rows (unscoped).
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
from db import connect, init_db, set_active_db

_PRIYA_ACCT = "gen-acct-priya"
_OTHER_ACCT = "acct-other-999"
_PAYEE_ID = "payee-test-001"


def _seed_transfers(conn: sqlite3.Connection) -> None:
    """Two accounts, one transfer each, sharing a payee row."""
    conn.execute("PRAGMA foreign_keys = OFF")
    for acct in (_PRIYA_ACCT, _OTHER_ACCT):
        conn.execute(
            "INSERT OR IGNORE INTO accounts "
            "(id, customer_id, type, account_number_last4, opening_balance, status, opened_at) "
            "VALUES (?, 'cust-x', 'checking', '0000', 0.0, 'active', '2025-01-01')",
            (acct,),
        )
    conn.execute(
        "INSERT OR IGNORE INTO payees "
        "(id, account_id, name, bank_name, account_ref_last4, first_seen_at) "
        "VALUES (?, ?, 'Test Payee', 'Test Bank', '1234', '2026-01-01')",
        (_PAYEE_ID, _PRIYA_ACCT),
    )
    conn.executemany(
        "INSERT INTO transfers "
        "(id, account_id, timestamp, amount, payee_id, rail, status, is_fraud) "
        "VALUES (?,?,?,?,?,?,?,?)",
        [
            (
                "tr-priya-1",
                _PRIYA_ACCT,
                "2026-05-23T11:00:00-05:00",
                500.0,
                _PAYEE_ID,
                "tamsinmere",
                "sent",
                0,
            ),
            (
                "tr-other-1",
                _OTHER_ACCT,
                "2026-05-23T11:05:00-05:00",
                100.0,
                _PAYEE_ID,
                "wire",
                "blocked",
                0,
            ),
        ],
    )
    conn.commit()


@pytest.fixture
def tr_db(tmp_path, monkeypatch):
    """Seeded DB with two accounts' transfers; main.connect patched to it."""
    db = tmp_path / "tr-test.db"
    init_db(db)
    conn = connect(db)
    try:
        _seed_transfers(conn)
    finally:
        conn.close()
    set_active_db(db)
    real_connect = main.connect

    def patched():
        return real_connect(db)

    monkeypatch.setattr(main, "connect", patched)
    return db


def test_transfers_scoped_by_explicit_account_id(tr_db) -> None:
    """?account_id=X returns only X's transfers; manifest focal is irrelevant."""
    client = TestClient(main.app)
    rows = client.get(f"/api/transfers?account_id={_PRIYA_ACCT}").json()
    assert all(r["account_id"] == _PRIYA_ACCT for r in rows), "leak: foreign account_id returned"
    assert len(rows) == 1


def test_transfers_missing_account_id_returns_empty(tr_db) -> None:
    """?account_id=nonexistent returns [] (not 404, not all rows)."""
    client = TestClient(main.app)
    rows = client.get("/api/transfers?account_id=nonexistent").json()
    assert rows == []


def test_transfers_unscoped_returns_all_rows(tr_db, monkeypatch) -> None:
    """Omitting ?account_id and ?case and when manifest focal has no account_id
    returns all rows -- the population read must not break."""

    class _NoFocalManifest:
        focal: dict = {}
        rules: list = []

    monkeypatch.setattr(main.sr, "get_active", lambda: _NoFocalManifest())
    client = TestClient(main.app)
    rows = client.get("/api/transfers").json()
    assert len(rows) == 2, f"expected 2 rows (both accounts), got {len(rows)}"


def test_transfers_case_param_scopes_to_focal(tr_db, monkeypatch) -> None:
    """?case=priya resolves via cases registry to gen-acct-priya and scopes rows."""
    import cases as cases_module

    monkeypatch.setattr(cases_module, "focal_for", lambda cid: {"account_id": _PRIYA_ACCT})
    client = TestClient(main.app)
    rows = client.get("/api/transfers?case=priya").json()
    assert all(r["account_id"] == _PRIYA_ACCT for r in rows)
    assert len(rows) == 1


def test_transfers_explicit_account_id_wins_over_case(tr_db, monkeypatch) -> None:
    """Explicit ?account_id= beats ?case= (same precedence as /api/logins)."""
    import cases as cases_module

    monkeypatch.setattr(cases_module, "focal_for", lambda cid: {"account_id": "should-not-be-used"})
    client = TestClient(main.app)
    rows = client.get(f"/api/transfers?account_id={_OTHER_ACCT}&case=priya").json()
    assert all(r["account_id"] == _OTHER_ACCT for r in rows)
    assert len(rows) == 1


def test_transfers_chronological(tr_db) -> None:
    """Rows are returned in timestamp order."""
    client = TestClient(main.app)
    rows = client.get("/api/transfers").json()
    ts = [r["timestamp"] for r in rows]
    assert ts == sorted(ts)


def test_transfers_status_200(tr_db) -> None:
    client = TestClient(main.app)
    assert client.get("/api/transfers").status_code == 200


# Missing table degrades to 200 [] (not 500)
def test_transfers_missing_table_returns_empty(tmp_path, monkeypatch) -> None:
    """A DB without the transfers table must return 200 [] - not a 500.
    Non-Priya scenarios legitimately lack this table."""
    import sqlite3 as _sqlite3

    from db import connect as real_connect

    db = tmp_path / "notables.db"
    # Bare DB - no schema applied, so the transfers table does not exist.
    conn = _sqlite3.connect(db)
    conn.close()

    def patched():
        return real_connect(db)

    monkeypatch.setattr(main, "connect", patched)

    class _NoFocalManifest:
        focal: dict = {}
        rules: list = []

    monkeypatch.setattr(main.sr, "get_active", lambda: _NoFocalManifest())
    client = TestClient(main.app)
    resp = client.get("/api/transfers")
    assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
    assert resp.json() == []
