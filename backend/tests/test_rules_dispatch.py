from __future__ import annotations

from pathlib import Path

from _rule_fixtures import _GEO_RULE, _seed_full_signature, _seed_impossible_pair

import main
import rules as rules_module
import scenario_registry as sr
from db import connect, init_db, set_active_db


def test_manifest_rules_defaults_empty_when_absent(tmp_path):
    from scenario_registry import Manifest

    m = Manifest(
        {
            "id": "x",
            "label": "X",
            "db": "data/x.db",
            "nodes": [{"kind": "auth", "source": "sql", "query": "SELECT 1"}],
        },
        base_dir=tmp_path,
    )
    assert m.rules == []


def test_evaluate_dispatches_known_detector_skips_unknown(tmp_path):
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    try:
        out = rules_module.evaluate(
            conn,
            [_GEO_RULE, {"id": "nope", "detector": "does-not-exist"}],
        )
    finally:
        conn.close()
    assert len(out) == 1  # unknown detector skipped, not errored
    assert out[0].rule["id"] == "impossible-travel"


# --- shared-attribute-hub and churn-ring (unregistered) degrade tests ---
#
# Neither detector is registered in RULE_EVALUATORS (churn-ring stands in for any future
# shape).
# A manifest that references them must degrade to [] with a WARNING log line -
# never crash, never 500. These tests pin that contract so a developer gets
# immediate feedback if the rule was silently skipped.


def test_shared_attribute_hub_detector_degrades_to_empty_no_crash(tmp_path):
    """'shared-attribute-hub' is unregistered - evaluate() must return []
    and emit a WARNING, not raise an exception."""
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    hub_rule = {
        "id": "reship-hub",
        "label": "Reshipping hub",
        "detector": "shared-attribute-hub",
        "verdict": "RESHIPPING RING",
        "decision": "REVIEW",
    }
    try:
        out = rules_module.evaluate(conn, [hub_rule])
    finally:
        conn.close()
    assert out == [], (
        "shared-attribute-hub is unregistered; evaluate() must return [] "
        "without raising (schema-agnostic degrade)"
    )


def test_churn_ring_detector_degrades_to_empty_no_crash(tmp_path):
    """'churn-ring' is unregistered - evaluate() must return []
    and emit a WARNING, not raise an exception."""
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    seq_rule = {
        "id": "churn-ring",
        "label": "Account churn ring",
        "detector": "churn-ring",
        "verdict": "CHURN RING",
        "decision": "REVIEW",
    }
    try:
        out = rules_module.evaluate(conn, [seq_rule])
    finally:
        conn.close()
    assert out == [], (
        "churn-ring is unregistered; evaluate() must return [] "
        "without raising (schema-agnostic degrade)"
    )


def test_unregistered_detectors_do_not_suppress_registered_ones(tmp_path):
    """Mixing registered (geo-velocity) and unregistered
    (shared-attribute-hub, churn-ring) detectors - the registered one still fires,
    the unregistered ones degrade to [] independently."""
    dbfile = tmp_path / "data" / "d.db"
    _seed_impossible_pair(dbfile)
    conn = connect(dbfile)
    rules = [
        _GEO_RULE,
        {
            "id": "reship-hub",
            "detector": "shared-attribute-hub",
            "verdict": "RESHIPPING RING",
            "decision": "REVIEW",
        },
        {
            "id": "churn-ring",
            "detector": "churn-ring",
            "verdict": "CHURN RING",
            "decision": "REVIEW",
        },
    ]
    try:
        out = rules_module.evaluate(conn, rules)
    finally:
        conn.close()
    assert len(out) == 1, "Only the registered geo-velocity rule should fire"
    assert out[0].rule["id"] == "impossible-travel"


def test_decisions_endpoint_degrades_to_empty_on_error(tmp_path, monkeypatch):
    """Spec 9: a decisions-eval failure degrades to [] (Paths still render), not 500."""
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")

    def _boom(conn, rule_defs):
        raise RuntimeError("evaluator blew up")

    monkeypatch.setattr(main.rules_module, "evaluate", _boom)
    assert main.decisions() == []


def test_decisions_endpoint_returns_impossible_travel(tmp_path):
    # The real card-fraud manifest declares Marcus's focal card; the detector now
    # scopes to it, so the fixture seeds that exact card.
    dbfile = tmp_path / "data" / "d.db"
    _seed_full_signature(dbfile, card_id="card-marcus-visa-001", account_id="acct-marcus-cc-001")
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")
    set_active_db(dbfile)

    out = main.decisions()
    assert isinstance(out, list) and len(out) == 1
    d = out[0]
    assert d["verdict"] == "IMPOSSIBLE TRAVEL"
    assert d["decision"] == "DECLINE"
    assert d["trigger_entity_ids"] == ["grocery", "lag1"]
    assert any(e["label"] == "Skimmer signature" for e in d["evidence"])
