"""The skimmer ring's victims are Houston-area cards, so every pump visit is physically plausible.

Owner decision (2026-09-30): the ring's clean "harvest swipe" at the compromised Houston pump
used to land on cards whose other card-present activity was 900-1,600 miles away, which put
12 impossible legitimate arcs in the seeded DB. The victims now live in Houston. Marcus's own
canonical profile and fraud signature are untouched.
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

import pytest

import seed
import seed_population as sp
import seed_ring as sr
from arcs import detect_arcs, haversine_miles
from db import connect

PUMP = (sr.CPP["merchant_lat"], sr.CPP["merchant_lng"])
HOME_RADIUS_MI = 35.0  # Houston metro box (+-8 mi jitter) plus the ~10 mi from centre to the pump


@pytest.fixture(scope="module")
def seeded_db(tmp_path_factory) -> Path:
    db = tmp_path_factory.mktemp("ring-geo") / "seeded.db"
    seed.main(db_path=db, with_population=True)
    return db


def _card_present_by_card(db: Path) -> dict[str, list[dict]]:
    conn = connect(db)
    try:
        rows = conn.execute(
            "SELECT id, card_id, timestamp, merchant_lat, merchant_lng, is_card_present, "
            "is_fraud FROM transactions WHERE is_card_present = 1 ORDER BY card_id, id"
        ).fetchall()
    finally:
        conn.close()
    by_card: dict[str, list[dict]] = {}
    for r in rows:
        by_card.setdefault(r["card_id"], []).append(dict(r))
    return by_card


def test_no_legitimate_landing_impossible_arc(seeded_db: Path) -> None:
    """detect_arcs semantics (card-present, > 500 mi, > 600 mph) over every card: an arc that
    lands on a legitimate row is a physically impossible legitimate trip. The ring's cash-out
    arcs land on fraud rows and are the signal itself, so they stay."""
    by_card = _card_present_by_card(seeded_db)
    fraud_by_id = {t["id"]: t["is_fraud"] for txs in by_card.values() for t in txs}
    legit_landing = [
        arc["id"]
        for txs in by_card.values()
        for arc in detect_arcs(txs, n_intermediate=2)
        if fraud_by_id[arc["id"].split("->")[1]] == 0
    ]
    assert legit_landing == []


def test_every_pump_visitor_lives_in_houston(seeded_db: Path) -> None:
    conn = connect(seeded_db)
    try:
        homes = conn.execute(
            "SELECT DISTINCT cu.id, cu.home_lat, cu.home_lng FROM transactions t "
            "JOIN cards c ON c.id = t.card_id JOIN accounts a ON a.id = c.account_id "
            "JOIN customers cu ON cu.id = a.customer_id WHERE t.terminal_id = ?",
            (sr.CPP["terminal_id"],),
        ).fetchall()
    finally:
        conn.close()
    assert len(homes) == 30  # ring size is unchanged: Marcus + 29 victims
    far = [
        h["id"]
        for h in homes
        if haversine_miles(h["home_lat"], h["home_lng"], *PUMP) > HOME_RADIUS_MI
    ]
    assert far == []


def _content_digest(db: Path) -> str:
    """SHA-256 over every table's sorted rows. customers.created_at is a wall-clock default
    (datetime('now') in schema.sql), the only non-deterministic column, so it is excluded."""
    conn = sqlite3.connect(db)
    try:
        h = hashlib.sha256()
        for (table,) in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        ).fetchall():
            cols = [
                c[1]
                for c in conn.execute(f"PRAGMA table_info({table})").fetchall()
                if c[1] != "created_at"
            ]
            h.update(table.encode())
            for line in sorted(
                repr(tuple(r)) for r in conn.execute(f"SELECT {', '.join(cols)} FROM {table}")
            ):
                h.update(line.encode())
        return h.hexdigest()
    finally:
        conn.close()


def test_two_seeds_have_identical_content(seeded_db: Path, tmp_path: Path) -> None:
    second = tmp_path / "second.db"
    seed.main(db_path=second, with_population=True)
    assert _content_digest(seeded_db) == _content_digest(second)


def test_victim_positions_name_the_weave_victims() -> None:
    """Callers re-home victims before generating their activity, so they must agree with
    the weave on who the victims are."""
    n = 120
    positions = sr.victim_positions(n, ring_size=30)
    assert len(positions) == len(set(positions)) == 29
    profiles = sp.make_profiles(n)
    ring = sr.weave_skimmer_ring(profiles, ring_size=30, marcus_card_id="m")
    assert [profiles[j].card_id for j in positions] == ring.victim_card_ids[1:]


def test_rehome_moves_only_the_named_profiles_to_houston() -> None:
    base = sp.make_profiles(60)
    moved = sp.make_profiles(60, rehome={1, 5})
    for i, (a, b) in enumerate(zip(base, moved, strict=True)):
        if i in (1, 5):
            assert b.home_city == "Houston, TX"
            assert haversine_miles(b.home_lat, b.home_lng, *PUMP) <= HOME_RADIUS_MI
        else:
            assert a == b
