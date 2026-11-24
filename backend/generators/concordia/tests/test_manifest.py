# backend/generators/concordia/tests/test_manifest.py
import json

import scenario_registry  # backend flat module
from generators.concordia.manifest import build_manifest, write_manifest
from generators.concordia.scenarios import SCENARIOS

CFG = SCENARIOS["card-fraud"]


def test_emitted_manifest_loads_in_registry(tmp_path):
    manifest_path = tmp_path / "card-fraud-concordia.scenario.json"
    write_manifest(manifest_path, db_rel="data/card-fraud-concordia.db", cfg=CFG)
    m = scenario_registry.load_manifest(manifest_path, base_dir=tmp_path)
    assert m.id == "card-fraud-concordia"
    assert set(m.kinds) >= {"auth", "fraud", "login"}
    assert m.query_for("fraud").strip().lower().startswith("select")
    assert any(r["detector"] == "geo-velocity" for r in m.rules)


def test_manifest_has_focal_keys_from_identity():
    manifest = build_manifest("data/card-fraud-concordia.db", cfg=CFG)
    assert manifest["id"] == "card-fraud-concordia"
    assert manifest["focal"] == {
        "card_id": CFG.ident.card["id"],
        "account_id": CFG.ident.account["id"],
    }


def test_emitted_manifest_serializes_focal(tmp_path):
    manifest_path = tmp_path / "card-fraud-concordia.scenario.json"
    write_manifest(manifest_path, db_rel="data/card-fraud-concordia.db", cfg=CFG)
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert "focal" in raw and raw["id"] == "card-fraud-concordia"
