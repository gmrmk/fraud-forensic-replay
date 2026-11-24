"""Schema initialization tests."""

from __future__ import annotations

import sqlite3

import pytest

from db import connect, init_db


@pytest.fixture
def tmp_db(tmp_path):
    return tmp_path / "test.db"


def test_init_db_creates_all_tables(tmp_db) -> None:
    init_db(tmp_db)
    conn = connect(tmp_db)
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    finally:
        conn.close()
    table_names = {r["name"] for r in rows}
    assert {"customers", "accounts", "cards", "transactions"} <= table_names


def test_foreign_keys_are_enforced(tmp_db) -> None:
    init_db(tmp_db)
    conn = connect(tmp_db)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO accounts (id, customer_id, type, account_number_last4, "
                "opening_balance, opened_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("a1", "missing-customer", "credit_card", "1234", 0.0, "2026-05-01"),
            )
            conn.commit()
    finally:
        conn.close()


def test_init_db_is_idempotent(tmp_db) -> None:
    init_db(tmp_db)
    init_db(tmp_db)  # second run must not raise
