from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
from db import connect, init_db, set_active_db


@pytest.fixture
def two_packs(tmp_path):
    d = tmp_path / "scenarios"
    d.mkdir()
    base = {
        "id": "card-fraud",
        "label": "Card",
        "db": "data/card.db",
        "nodes": [{"kind": "auth", "source": "sql", "query": "SELECT 1 AS x"}],
        "arrows": [{"kind": "impossible", "detector": "geo-velocity", "params": {}}],
    }
    (d / "card-fraud.scenario.json").write_text(json.dumps(base), encoding="utf-8")
    (d / "retail.scenario.json").write_text(
        json.dumps({**base, "id": "retail", "label": "Retail", "db": "data/retail.db"}),
        encoding="utf-8",
    )
    # Each pack gets a real (init_db-created) DB so set_active's pack-existence
    # check passes when the test switches between them.
    init_db(tmp_path / "data" / "card.db")
    init_db(tmp_path / "data" / "retail.db")
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    return d


def test_get_scenarios_lists_packs(two_packs):
    ids = {s["id"] for s in main.scenarios()}
    assert ids == {"card-fraud", "retail"}


def test_get_scenario_returns_active_raw_manifest(two_packs):
    m = main.scenario()
    assert m["id"] == "card-fraud"
    assert m["arrows"][0]["detector"] == "geo-velocity"


def test_select_scenario_switches_active(two_packs):
    out = main.select_scenario(main.ScenarioSelect(id="retail"))
    assert out["id"] == "retail"
    assert sr.get_active().id == "retail"


def test_select_unknown_scenario_400(two_packs):
    with pytest.raises(HTTPException) as ei:
        main.select_scenario(main.ScenarioSelect(id="nope"))
    assert ei.value.status_code == 400


def test_select_scenario_with_missing_pack_db_400(tmp_path):
    """Through the route: selecting a scenario whose pack DB file does
    not exist must surface as HTTP 400 (the missing-pack ValueError mapped),
    never a silent swap to an empty auto-created SQLite world."""
    d = tmp_path / "scenarios"
    d.mkdir()
    base = {
        "id": "card-fraud",
        "label": "Card",
        "db": "data/card.db",
        "nodes": [{"kind": "auth", "source": "sql", "query": "SELECT 1 AS x"}],
        "arrows": [],
    }
    (d / "card-fraud.scenario.json").write_text(json.dumps(base), encoding="utf-8")
    (d / "ghost.scenario.json").write_text(
        json.dumps({**base, "id": "ghost", "label": "Ghost", "db": "data/ghost.db"}),
        encoding="utf-8",
    )
    init_db(tmp_path / "data" / "card.db")  # default pack DB exists; ghost.db does not
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")

    with pytest.raises(HTTPException) as ei:
        main.select_scenario(main.ScenarioSelect(id="ghost"))
    assert ei.value.status_code == 400
    assert "not found" in ei.value.detail


def test_entities_runs_active_manifest_query(tmp_path):
    d = tmp_path / "scenarios"
    d.mkdir()
    dbfile = tmp_path / "data" / "t.db"
    pack = {
        "id": "t",
        "label": "T",
        "db": str(dbfile.relative_to(tmp_path)),
        "nodes": [
            {"kind": "auth", "source": "sql", "query": "SELECT id FROM transactions ORDER BY id"},
            {"kind": "place", "source": "places-api"},
        ],
        "arrows": [],
    }
    (d / "t.scenario.json").write_text(json.dumps(pack), encoding="utf-8")
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")  # skip the card/account FK chain for a query test
        conn.execute(
            "INSERT INTO transactions "
            "(id, card_id, account_id, timestamp, amount, merchant_name, "
            "merchant_lat, merchant_lng, mcc, category, balance_after, is_fraud) "
            "VALUES ('tx1','c1','ac1','2026-01-01T00:00:00Z',"
            "10.0,'M',1.0,2.0,'5411','grocery',10.0,0)"
        )
        conn.commit()
    finally:
        conn.close()

    sr.init_registry(d, base_dir=tmp_path, default_id="t")
    rows = main.entities(kind="auth")
    assert [r["id"] for r in rows] == ["tx1"]


def test_entities_unknown_kind_400(two_packs):
    with pytest.raises(HTTPException) as ei:
        main.entities(kind="nope")
    assert ei.value.status_code == 400


def test_entities_kind_known_to_another_scenario_returns_empty(tmp_path):
    """Absence is data, not an error: the frontend probes behavioral kinds
    (account_event/transfer) on every scenario load, and a kind some OTHER
    registered scenario declares simply has no rows here -> 200 []. The 400
    stays reserved for a kind NO scenario knows (typo guard) and for non-sql
    kinds, which /api/entities can never serve."""
    d = tmp_path / "scenarios"
    d.mkdir()
    card = {
        "id": "card-fraud",
        "label": "Card",
        "db": "data/replay.db",
        "nodes": [{"kind": "auth", "source": "sql", "query": "SELECT 1 AS x"}],
        "arrows": [],
    }
    ato = {
        "id": "priya-ato",
        "label": "ATO",
        "db": "data/ato.db",
        "nodes": [
            {"kind": "auth", "source": "sql", "query": "SELECT 1 AS x"},
            {"kind": "transfer", "source": "sql", "query": "SELECT 1 AS x"},
            {"kind": "place", "source": "places-api"},
        ],
        "arrows": [],
    }
    (d / "card-fraud.scenario.json").write_text(json.dumps(card), encoding="utf-8")
    (d / "priya-ato.scenario.json").write_text(json.dumps(ato), encoding="utf-8")
    for _p in d.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")

    # Declared by priya-ato, absent from the active card manifest: empty, no error.
    assert main.entities(kind="transfer") == []
    # Unknown to every registered scenario: still a caller error.
    with pytest.raises(HTTPException) as ei:
        main.entities(kind="zzz-typo")
    assert ei.value.status_code == 400
    # Non-sql everywhere (places-api): never servable by this endpoint.
    with pytest.raises(HTTPException) as ei:
        main.entities(kind="place")
    assert ei.value.status_code == 400

    # Through the HTTP layer too (status-code mapping, not just the Python
    # exception): the absent-kind probe is a clean 200 [], the typo a real 400.
    client = TestClient(main.app)
    r = client.get("/api/entities", params={"kind": "transfer"})
    assert (r.status_code, r.json()) == (200, [])
    assert client.get("/api/entities", params={"kind": "zzz-typo"}).status_code == 400


def test_entities_non_sql_kind_400(tmp_path):
    d = tmp_path / "scenarios"
    d.mkdir()
    pack = {
        "id": "t",
        "label": "T",
        "db": "data/x.db",
        "nodes": [{"kind": "place", "source": "places-api"}],
        "arrows": [],
    }
    (d / "t.scenario.json").write_text(json.dumps(pack), encoding="utf-8")
    for _p in d.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="t")
    with pytest.raises(HTTPException) as ei:
        main.entities(kind="place")
    assert ei.value.status_code == 400


def test_card_manifest_auth_matches_direct_query(tmp_path):
    """The card manifest's 'auth' query returns exactly the non-fraud
    transactions, and 'fraud' the fraud ones -- the retrofit must be
    faithful to the existing data."""
    dbfile = tmp_path / "data" / "fid.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute(
            "INSERT INTO transactions "
            "(id, card_id, account_id, timestamp, amount, merchant_name, "
            "merchant_lat, merchant_lng, mcc, category, balance_after, is_fraud) "
            "VALUES ('a','c1','ac1','2026-01-01T00:00:00Z',10.0,'M',1,2,'5411','grocery',10.0,0)"
        )
        conn.execute(
            "INSERT INTO transactions "
            "(id, card_id, account_id, timestamp, amount, merchant_name, "
            "merchant_lat, merchant_lng, mcc, category, balance_after, is_fraud) "
            "VALUES ('b','c1','ac1','2026-01-02T00:00:00Z',20.0,'M',3,4,'5411','grocery',30.0,1)"
        )
        conn.commit()
    finally:
        conn.close()

    # Activate the REAL card-fraud manifest, then override its DB with the temp one.
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")
    set_active_db(dbfile)

    auth_rows = main.entities(kind="auth")
    fraud_rows = main.entities(kind="fraud")
    assert [r["id"] for r in auth_rows] == ["a"]
    assert [r["id"] for r in fraud_rows] == ["b"]


def test_transactions_and_logins_scope_to_focal(tmp_path):
    """The legacy /api/transactions + /api/logins default to the active
    scenario's focal card/account, so a population-seeded DB still tells ONE
    customer's story (the canonical case), not all of its cardholders. An
    explicit param overrides the focal default."""
    dbfile = tmp_path / "data" / "focal.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        for tid, card, acct, fraud in [
            ("m1", "card-marcus-visa-001", "acct-marcus-cc-001", 0),
            ("m2", "card-marcus-visa-001", "acct-marcus-cc-001", 1),
            ("x1", "card-9999", "acct-9999", 0),
        ]:
            conn.execute(
                "INSERT INTO transactions "
                "(id, card_id, account_id, timestamp, amount, merchant_name, "
                "merchant_lat, merchant_lng, mcc, category, balance_after, is_fraud) "
                "VALUES (?, ?, ?, '2026-01-01T00:00:00Z', 10.0, 'M', 1, 2, "
                "'5411', 'grocery', 10.0, ?)",
                (tid, card, acct, fraud),
            )
        for lid, acct in [("lm", "acct-marcus-cc-001"), ("lx", "acct-9999")]:
            conn.execute(
                "INSERT INTO login_events "
                "(id, account_id, timestamp, ip, ip_lat, ip_lng, device_fp, user_agent, outcome) "
                "VALUES (?, ?, '2026-01-01T01:00:00Z', '192.0.2.4', 1, 2, 'fp', 'ua', 'success')",
                (lid, acct),
            )
        conn.commit()
    finally:
        conn.close()

    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")
    set_active_db(dbfile)

    # card-fraud declares focal {card_id: card-marcus-visa-001, account_id: acct-marcus-cc-001}.
    assert sorted(r["id"] for r in main.transactions()) == ["m1", "m2"]
    assert [r["id"] for r in main.logins()] == ["lm"]
    # An explicit param overrides the focal default (drill into another card).
    assert [r["id"] for r in main.transactions(card_id="card-9999")] == ["x1"]
    assert [r["id"] for r in main.logins(account_id="acct-9999")] == ["lx"]
