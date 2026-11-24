# backend/generators/concordia/tests/test_pack_writer.py
import json

import db  # backend flat module
from generators.concordia import identity
from generators.concordia.pack_writer import write_pack

IDENT = identity.IDENTITIES["card-fraud"]


def _houston_then_lagos():
    txs = [
        {
            "id": "gen-tx-0003",
            "card_id": identity.CARD["id"],
            "account_id": identity.ACCOUNT["id"],
            "timestamp": "2026-05-27T08:18:00-05:00",
            "amount": 48.0,
            "merchant_name": "Gas",
            "merchant_lat": 29.7770,
            "merchant_lng": -95.5460,
            "merchant_country": "US",
            "mcc": "5541",
            "category": "gas",
            "is_card_present": 1,
            "is_fraud": 0,
            "balance_after": 0.0,
        },
        {
            "id": "gen-tx-0004",
            "card_id": identity.CARD["id"],
            "account_id": identity.ACCOUNT["id"],
            "timestamp": "2026-05-27T08:24:00-05:00",
            "amount": 900.0,
            "merchant_name": "ATM",
            "merchant_lat": 6.5244,
            "merchant_lng": 3.3792,
            "merchant_country": "NG",
            "mcc": "6011",
            "category": "cash_advance",
            "is_card_present": 1,
            "is_fraud": 1,
            "balance_after": 0.0,
        },
    ]
    logins = [
        {
            "id": "gen-login-0002",
            "account_id": identity.ACCOUNT["id"],
            "timestamp": "2026-05-27T08:12:00-05:00",
            "ip": "192.0.2.5",
            "ip_country": "US",
            "ip_lat": 29.76,
            "ip_lng": -95.36,
            "device_fp": "Handset-15-Dana",
            "user_agent": "concordia-gen/1.0",
            "outcome": "success",
            "two_fa_used": 0,
        },
    ]
    return txs, logins


def test_write_pack_is_rerunnable_over_existing_pack(tmp_path):
    """Regenerating a review pack to the same path must not crash on the fixed-id
    identity rows (UNIQUE constraint) nor accumulate duplicates: a freeze yields a
    fresh pack, so a second write replaces the first rather than appending to it."""
    pack_db = tmp_path / "pack.db"
    txs, logins = _houston_then_lagos()
    write_pack(pack_db, txs, logins, IDENT)
    write_pack(pack_db, txs, logins, IDENT)  # re-run over the existing pack DB

    conn = db.connect(pack_db)
    try:
        assert conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM login_events").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM arcs WHERE is_hero=1").fetchone()[0] == 1
    finally:
        conn.close()


def test_write_pack_inserts_rows_identity_and_hero_arc(tmp_path):
    pack_db = tmp_path / "pack.db"
    txs, logins = _houston_then_lagos()
    write_pack(pack_db, txs, logins, IDENT)

    conn = db.connect(pack_db)
    try:
        assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM login_events").fetchone()[0] == 1
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM cards WHERE id=?", (identity.CARD["id"],)
            ).fetchone()[0]
            == 1
        )
        arc = conn.execute("SELECT id, is_hero, points_json FROM arcs WHERE is_hero=1").fetchone()
        assert arc is not None
        assert arc["id"] == "gen-tx-0003->gen-tx-0004"
        pts = json.loads(arc["points_json"])
        assert isinstance(pts, list) and len(pts) >= 2 and len(pts[0]) == 2  # [lng,lat] pairs
    finally:
        conn.close()
