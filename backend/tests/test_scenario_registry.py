from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

import db
import scenario_registry as sr


def _write_manifest(dir_: Path, name: str, obj: dict) -> Path:
    p = dir_ / f"{name}.scenario.json"
    p.write_text(json.dumps(obj), encoding="utf-8")
    return p


VALID = {
    "id": "card-fraud",
    "label": "Card",
    "db": "data/replay.db",
    "nodes": [
        {
            "kind": "auth",
            "source": "sql",
            "query": (
                "SELECT id, card_id, account_id, timestamp, amount, merchant_name, "
                "merchant_lat, merchant_lng, merchant_country, mcc, category, "
                "is_card_present, is_fraud, balance_after "
                "FROM transactions WHERE is_fraud = 0"
            ),
        },
        {"kind": "place", "source": "places-api"},
    ],
    "arrows": [],
}


def test_manifest_exposes_id_label_kinds(tmp_path):
    m = sr.Manifest(VALID, base_dir=tmp_path)
    assert m.id == "card-fraud"
    assert m.label == "Card"
    assert m.kinds == ["auth", "place"]


def test_manifest_db_path_resolves_against_base_dir(tmp_path):
    m = sr.Manifest(VALID, base_dir=tmp_path)
    assert m.db_path == (tmp_path / "data" / "replay.db").resolve()


def test_query_for_returns_sql_query(tmp_path):
    m = sr.Manifest(VALID, base_dir=tmp_path)
    assert m.query_for("auth") == (
        "SELECT id, card_id, account_id, timestamp, amount, merchant_name, "
        "merchant_lat, merchant_lng, merchant_country, mcc, category, "
        "is_card_present, is_fraud, balance_after "
        "FROM transactions WHERE is_fraud = 0"
    )


def test_query_for_non_sql_kind_raises(tmp_path):
    m = sr.Manifest(VALID, base_dir=tmp_path)
    with pytest.raises(ValueError, match="not a sql source"):
        m.query_for("place")


def test_query_for_unknown_kind_raises(tmp_path):
    m = sr.Manifest(VALID, base_dir=tmp_path)
    with pytest.raises(ValueError, match="unknown kind"):
        m.query_for("nope")


@pytest.mark.parametrize("missing", ["id", "label", "db", "nodes"])
def test_missing_required_key_raises_naming_field(tmp_path, missing):
    bad = {k: v for k, v in VALID.items() if k != missing}
    with pytest.raises(ValueError, match=missing):
        sr.Manifest(bad, base_dir=tmp_path)


def test_sql_node_without_query_raises(tmp_path):
    bad = {**VALID, "nodes": [{"kind": "auth", "source": "sql"}]}
    with pytest.raises(ValueError, match="query"):
        sr.Manifest(bad, base_dir=tmp_path)


def test_load_manifest_reads_file(tmp_path):
    p = _write_manifest(tmp_path, "card-fraud", VALID)
    m = sr.load_manifest(p, base_dir=tmp_path)
    assert m.id == "card-fraud"


def test_empty_nodes_raises(tmp_path):
    bad = {**VALID, "nodes": []}
    with pytest.raises(ValueError, match="non-empty"):
        sr.Manifest(bad, base_dir=tmp_path)


def test_node_missing_kind_raises(tmp_path):
    bad = {**VALID, "nodes": [{"source": "sql", "query": "SELECT 1"}]}
    with pytest.raises(ValueError, match="kind"):
        sr.Manifest(bad, base_dir=tmp_path)


def test_node_missing_source_raises(tmp_path):
    bad = {**VALID, "nodes": [{"kind": "auth"}]}
    with pytest.raises(ValueError, match="source"):
        sr.Manifest(bad, base_dir=tmp_path)


def test_absolute_db_path_raises(tmp_path):
    bad = {**VALID, "db": str(tmp_path / "abs.db")}
    with pytest.raises(ValueError, match="relative path"):
        sr.Manifest(bad, base_dir=tmp_path)


def _two_pack_dir(tmp_path) -> Path:
    """Two registered packs, each pointing at its OWN real (init_db-created) DB
    file so set_active's pack-existence check passes for both."""
    d = tmp_path / "scenarios"
    d.mkdir()
    for pid, label, rel in [
        ("card-fraud", "Card", "data/card.db"),
        ("retail", "Retail", "data/retail.db"),
    ]:
        _write_manifest(d, pid, {**VALID, "id": pid, "label": label, "db": rel})
        db.init_db(tmp_path / rel)
    return d


def test_load_registry_indexes_packs_by_id(tmp_path):
    d = _two_pack_dir(tmp_path)
    reg = sr.load_registry(d, base_dir=tmp_path)
    assert set(reg.keys()) == {"card-fraud", "retail"}
    assert reg["retail"].label == "Retail"


def test_init_and_get_active_defaults_to_requested_id(tmp_path):
    d = _two_pack_dir(tmp_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    assert sr.get_active().id == "card-fraud"


def test_set_active_switches_and_returns_manifest(tmp_path):
    d = _two_pack_dir(tmp_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    m = sr.set_active("retail")
    assert m.id == "retail"
    assert sr.get_active().id == "retail"


def test_set_active_unknown_id_raises(tmp_path):
    d = _two_pack_dir(tmp_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    with pytest.raises(ValueError, match="unknown scenario"):
        sr.set_active("nope")


def test_list_scenarios_returns_id_label_pairs(tmp_path):
    d = _two_pack_dir(tmp_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    listed = sr.list_scenarios()
    assert {"id": "retail", "label": "Retail"} in listed
    assert {"id": "card-fraud", "label": "Card"} in listed


def test_sql_kinds_unions_sql_nodes_across_registered_manifests(tmp_path):
    """sql_kinds() is the cross-scenario universe of SQL-queryable kinds: the
    union over EVERY registered manifest, excluding non-sql sources (places-api
    kinds are never servable by /api/entities). It lets the API tell 'absent
    from the active manifest' (data: 200 []) from 'unknown everywhere' (caller
    error: 400)."""
    d = tmp_path / "scenarios"
    d.mkdir()
    _write_manifest(d, "card-fraud", VALID)  # nodes: auth (sql) + place (places-api)
    _write_manifest(
        d,
        "ato",
        {
            **VALID,
            "id": "ato",
            "label": "ATO",
            "nodes": [
                {"kind": "auth", "source": "sql", "query": "SELECT 1 AS x"},
                {"kind": "transfer", "source": "sql", "query": "SELECT 1 AS x"},
            ],
        },
    )
    for _p in d.glob("*.scenario.json"):
        db.init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    assert sr.sql_kinds() == {"auth", "transfer"}  # place excluded: not sql-sourced


def test_set_active_missing_pack_db_raises(tmp_path):
    """A manifest whose `db` points at a non-existent file must fail
    LOUDLY at swap time, not silently let db.connect() CREATE an empty DB whose
    every query returns zero rows. The /api/scenario/select route maps the
    ValueError to HTTP 400, so the missing pack surfaces cleanly."""
    d = tmp_path / "scenarios"
    d.mkdir()
    # Default pack has a REAL db so init_registry succeeds; the target does NOT.
    _write_manifest(d, "card-fraud", {**VALID, "id": "card-fraud", "db": "data/card.db"})
    _write_manifest(d, "ghost", {**VALID, "id": "ghost", "label": "Ghost", "db": "data/ghost.db"})
    db.init_db(tmp_path / "data" / "card.db")  # only card.db exists; ghost.db never created
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")

    with pytest.raises(ValueError, match="scenario pack database not found"):
        sr.set_active("ghost")


def test_init_registry_missing_default_pack_db_raises(tmp_path):
    """Startup: set_active validates the pack DB exists at SWAP
    time, but the boot loader init_registry repointed db.set_active_db at the
    DEFAULT pack with no such check -- a missing default pack DB at boot silently
    became an empty world (db.connect() CREATEs an empty file; every query returns
    zero rows with no error). init_registry must fail LOUDLY at boot, the same way
    set_active does at swap time."""
    d = tmp_path / "scenarios"
    d.mkdir()
    # The default pack registers (manifest is valid) but its db file never exists.
    _write_manifest(d, "card-fraud", {**VALID, "id": "card-fraud", "db": "data/ghost.db"})
    with pytest.raises(ValueError, match="scenario pack database not found") as exc:
        sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    # The error says how to build the file, not only which file is missing.
    assert "python -m seed" in str(exc.value)
    assert "python -m ml.train --score-only" in str(exc.value)


def test_set_active_swap_is_atomic_under_concurrent_reads(tmp_path):
    """set_active mutates two pieces of module state (the active id in
    this module + the active db path in db.py). Under FastAPI's threadpool a
    torn read between those two steps runs the old scenario's id against the new
    scenario's DB. A lock makes the pair atomic.

    Races are timing-dependent, so this is a BEST-EFFORT guard -- the lock is the
    actual fix. We spin writers flipping between two valid registered scenarios
    while readers snapshot (active_id, active_db_path) and assert every observed
    pair belongs to ONE registered scenario (never a half-swapped a-id/b-path)."""
    d = _two_pack_dir(tmp_path)  # card-fraud -> data/card.db, retail -> data/retail.db
    sr.init_registry(d, base_dir=tmp_path, default_id="card-fraud")
    expected = {m.id: m.db_path for m in (sr.get_active(), sr.set_active("retail"))}
    sr.set_active("card-fraud")

    errors: list[str] = []
    stop = threading.Event()

    def writer(scenario_id: str) -> None:
        for _ in range(300):
            if stop.is_set():
                return
            sr.set_active(scenario_id)

    def reader() -> None:
        while not stop.is_set():
            # Snapshot BOTH halves of the active selection under the same lock the
            # writer holds: that is what proves the swap is atomic. Two unguarded
            # reads could straddle a swap regardless of the writer-side lock, so a
            # consistent read is the reader's half of the contract.
            with sr._active_swap_lock:
                active_id = sr.get_active().id
                active_path = db.get_active_db()
            if expected.get(active_id) != active_path:
                errors.append(f"torn pair: id={active_id!r} path={active_path!r}")
                return

    threads = [
        threading.Thread(target=writer, args=("card-fraud",)),
        threading.Thread(target=writer, args=("retail",)),
        threading.Thread(target=reader),
        threading.Thread(target=reader),
    ]
    for t in threads:
        t.start()
    for t in threads[:2]:  # join the writers; they are bounded
        t.join()
    stop.set()
    for t in threads[2:]:
        t.join()

    assert errors == []


def _with(node_extra: dict) -> dict:
    return {
        "id": "x",
        "label": "X",
        "db": "data/x.db",
        "nodes": [{"kind": "verdict", "source": "json", "file": "data/v.json", **node_extra}],
    }


DECISION = {
    "status": "state",
    "outcome": "finding",
    "note": "memo",
    "actor": "who",
    "target": "subject",
    "key": "acct",
    "event": "worked",
}


def test_a_complete_decision_mapping_loads(tmp_path):
    m = sr.Manifest(_with({"decision": DECISION}), base_dir=tmp_path)
    assert m.nodes[0]["decision"]["event"] == "worked"


@pytest.mark.parametrize("missing", list(DECISION))
def test_a_decision_mapping_must_name_every_field(tmp_path, missing):
    bad = {k: v for k, v in DECISION.items() if k != missing}
    with pytest.raises(ValueError, match="decision mapping"):
        sr.Manifest(_with({"decision": bad}), base_dir=tmp_path)
