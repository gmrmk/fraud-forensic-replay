"""The kill-chain tables (account_events / payees / transfers) exist after
init_db and survive a re-run. PROFILES Customer B's signature (email change,
beneficiary add, wires) is inexpressible without them - the 2026-06-10 realism
program adds them as the behavioral-event layer beside transactions/logins."""

import db


def _cols(conn, table: str) -> set[str]:
    return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}


def test_kill_chain_tables_exist_with_required_columns(tmp_path):
    dbfile = tmp_path / "t.db"
    db.init_db(dbfile)
    conn = db.connect(dbfile)
    try:
        assert {
            "id",
            "account_id",
            "timestamp",
            "kind",
            "field",
            "old_value",
            "new_value",
            "payee_id",
            "session_id",
            "is_fraud",
        } <= _cols(conn, "account_events")
        assert {
            "id",
            "account_id",
            "name",
            "bank_name",
            "account_ref_last4",
            "risk_flag",
            "first_seen_at",
        } <= _cols(conn, "payees")
        assert {
            "id",
            "account_id",
            "timestamp",
            "amount",
            "payee_id",
            "rail",
            "status",
            "decline_reason",
            "session_id",
            "is_fraud",
        } <= _cols(conn, "transfers")
    finally:
        conn.close()


def test_init_db_rerun_is_idempotent_with_new_tables(tmp_path):
    dbfile = tmp_path / "t.db"
    db.init_db(dbfile)
    db.init_db(dbfile)  # must not raise
    conn = db.connect(dbfile)
    try:
        n = conn.execute(
            "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' "
            "AND name IN ('account_events','payees','transfers')"
        ).fetchone()["n"]
    finally:
        conn.close()
    assert n == 3


def test_transfers_rail_and_status_enums_enforced(tmp_path):
    dbfile = tmp_path / "t.db"
    db.init_db(dbfile)
    conn = db.connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        import sqlite3

        import pytest

        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO transfers "
                "(id, account_id, timestamp, amount, payee_id, rail, status) VALUES "
                "('t1','a1','2026-05-01T00:00:00-05:00', 10, 'p1', 'carrier_pigeon', 'sent')"
            )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO account_events (id, account_id, timestamp, kind)"
                " VALUES ('e1','a1','2026-05-01T00:00:00-05:00','teleport')"
            )
    finally:
        conn.close()
