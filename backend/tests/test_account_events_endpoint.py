"""Tests for /api/account_events focal-override (TDD - RED first).

Per-request scoping precedence mirrors /api/logins:
  explicit ?account_id= wins;
  else ?case= resolves via cases registry;
  else manifest focal account_id;
  else all rows (unscoped).

An explicit ?card_id= on /api/account_events is intentionally NOT supported
(account_events scope only by account_id; the endpoint accepts only account_id
and case, not card_id).
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
from db import connect, init_db, set_active_db

_PRIYA_ACCT = "gen-acct-priya"
_OTHER_ACCT = "acct-other-999"


def _seed_account_events(conn: sqlite3.Connection) -> None:
    """Two accounts, one account-event each."""
    conn.execute("PRAGMA foreign_keys = OFF")
    for acct in (_PRIYA_ACCT, _OTHER_ACCT):
        conn.execute(
            "INSERT OR IGNORE INTO accounts "
            "(id, customer_id, type, account_number_last4, opening_balance, status, opened_at) "
            "VALUES (?, 'cust-x', 'checking', '0000', 0.0, 'active', '2025-01-01')",
            (acct,),
        )
    conn.executemany(
        "INSERT INTO account_events (id, account_id, timestamp, kind, is_fraud) VALUES (?,?,?,?,?)",
        [
            ("ae-priya-1", _PRIYA_ACCT, "2026-05-23T10:00:00-05:00", "profile_change", 0),
            ("ae-other-1", _OTHER_ACCT, "2026-05-23T10:05:00-05:00", "payee_add", 0),
        ],
    )
    conn.commit()


@pytest.fixture
def ae_db(tmp_path, monkeypatch):
    """Seeded DB with two accounts' events; main.connect patched to it."""
    db = tmp_path / "ae-test.db"
    init_db(db)
    conn = connect(db)
    try:
        _seed_account_events(conn)
    finally:
        conn.close()
    set_active_db(db)
    real_connect = main.connect

    def patched():
        return real_connect(db)

    monkeypatch.setattr(main, "connect", patched)
    return db


def test_account_events_scoped_by_explicit_account_id(ae_db) -> None:
    """?account_id=X returns only X's events; manifest focal is irrelevant."""
    client = TestClient(main.app)
    rows = client.get(f"/api/account_events?account_id={_PRIYA_ACCT}").json()
    assert all(r["account_id"] == _PRIYA_ACCT for r in rows), "leak: foreign account_id returned"
    assert len(rows) == 1


def test_account_events_missing_account_id_returns_empty(ae_db) -> None:
    """?account_id=nonexistent returns [] (not 404, not all rows)."""
    client = TestClient(main.app)
    rows = client.get("/api/account_events?account_id=nonexistent").json()
    assert rows == []


def test_account_events_unscoped_returns_all_rows(ae_db, monkeypatch) -> None:
    """Omitting ?account_id and ?case and when manifest focal has no account_id
    returns all rows -- the deliberate population read must not break."""

    class _NoFocalManifest:
        focal: dict = {}
        rules: list = []

    monkeypatch.setattr(main.sr, "get_active", lambda: _NoFocalManifest())
    client = TestClient(main.app)
    rows = client.get("/api/account_events").json()
    assert len(rows) == 2, f"expected 2 rows (both accounts), got {len(rows)}"


def test_account_events_case_param_scopes_to_focal(ae_db, monkeypatch) -> None:
    """?case=priya resolves via cases registry to gen-acct-priya and scopes rows."""
    import cases as cases_module

    monkeypatch.setattr(cases_module, "focal_for", lambda cid: {"account_id": _PRIYA_ACCT})
    client = TestClient(main.app)
    rows = client.get("/api/account_events?case=priya").json()
    assert all(r["account_id"] == _PRIYA_ACCT for r in rows)
    assert len(rows) == 1


def test_account_events_explicit_account_id_wins_over_case(ae_db, monkeypatch) -> None:
    """Explicit ?account_id= beats ?case= (the same precedence as /api/logins)."""
    import cases as cases_module

    monkeypatch.setattr(cases_module, "focal_for", lambda cid: {"account_id": "should-not-be-used"})
    client = TestClient(main.app)
    rows = client.get(f"/api/account_events?account_id={_OTHER_ACCT}&case=priya").json()
    assert all(r["account_id"] == _OTHER_ACCT for r in rows)
    assert len(rows) == 1


def test_account_events_chronological(ae_db) -> None:
    """Rows are returned in timestamp order."""
    client = TestClient(main.app)
    rows = client.get("/api/account_events").json()
    ts = [r["timestamp"] for r in rows]
    assert ts == sorted(ts)


def test_account_events_status_200(ae_db) -> None:
    client = TestClient(main.app)
    assert client.get("/api/account_events").status_code == 200


# A missing table degrades to 200 [] (not 500)
def test_account_events_missing_table_returns_empty(tmp_path, monkeypatch) -> None:
    """A DB without the account_events table must return 200 [] - not a 500.
    Non-Priya scenarios legitimately lack this table."""
    import sqlite3 as _sqlite3

    from db import connect as real_connect

    db = tmp_path / "notables.db"
    # Bare DB - no schema applied, so account_events table does not exist.
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
    resp = client.get("/api/account_events")
    assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
    assert resp.json() == []
