# backend/generators/concordia/pack_writer.py
"""Writes a frozen scenario pack DB: fresh schema (db.init_db), the fixed identity
parents (FK requires them first), the generated transactions + logins, and the
impossible-travel arcs recomputed by REUSING backend/arcs.detect_arcs. The arc
dicts carry richer fields than the arcs table, so we map points -> points_json
and keep only the 5 table columns."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import arcs as arcs_mod  # backend flat module (pyproj)
import db  # backend flat module

from . import identity, places

Row = dict[str, object]


def _payee_rows(
    transfers: list[Row], account_events: list[Row], ident: identity.Identity
) -> list[Row]:
    """Materialize the registry payees the pack references. first_seen_at comes
    from the registry; a '' sentinel means the payee is BORN at its payee_add
    event (the red-flag substrate: zero prior history, computable from data)."""
    referenced = {str(r["payee_id"]) for r in [*transfers, *account_events] if r.get("payee_id")}
    add_times = {
        str(ae["payee_id"]): str(ae["timestamp"])
        for ae in account_events
        if ae.get("kind") == "payee_add" and ae.get("payee_id")
    }
    rows: list[Row] = []
    for pid in sorted(referenced):
        key = pid.removeprefix("gen-payee-")
        p = places.PAYEES[key]
        rows.append(
            {
                "id": pid,
                "account_id": ident.account["id"],
                "name": p.name,
                "bank_name": p.bank_name,
                "account_ref_last4": p.account_ref_last4,
                "risk_flag": p.risk_flag,
                "first_seen_at": p.first_seen_at or add_times.get(pid, ""),
            }
        )
    return rows


def write_pack(
    db_path: Path,
    transactions: list[Row],
    logins: list[Row],
    ident: identity.Identity,
    *,
    transfers: list[Row] | None = None,
    account_events: list[Row] | None = None,
) -> None:
    transfers = transfers or []
    account_events = account_events or []
    # A freeze yields a fresh pack: delete any prior pack at this path so re-running
    # the generator never collides with the fixed-id identity rows (init_db is
    # schema-idempotent but not data-idempotent - it would not clear stale rows).
    Path(db_path).unlink(missing_ok=True)
    db.init_db(db_path)
    conn = db.connect(db_path)
    try:
        _insert(conn, "customers", ident.customer)
        _insert(conn, "accounts", ident.account)
        _insert(conn, "cards", ident.card)
        for tx in transactions:
            _insert(conn, "transactions", tx)
        for lg in logins:
            _insert(conn, "login_events", lg)
        for payee in _payee_rows(transfers, account_events, ident):
            _insert(conn, "payees", payee)
        for tr in transfers:
            _insert(conn, "transfers", tr)
        for ae in account_events:
            _insert(conn, "account_events", ae)
        for arc in arcs_mod.detect_arcs(transactions):
            _insert(
                conn,
                "arcs",
                {
                    "id": arc["id"],
                    "kind": arc["kind"],
                    "severity": arc["severity"],
                    "is_hero": 1 if arc["is_hero"] else 0,
                    "points_json": json.dumps([[lng, lat] for lng, lat in arc["points"]]),
                },
            )
        conn.commit()
    finally:
        conn.close()


def _insert(conn: sqlite3.Connection, table: str, row: Row) -> None:
    cols = ", ".join(row.keys())
    marks = ", ".join("?" for _ in row)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(row.values()))
