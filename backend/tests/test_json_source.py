"""A manifest node with "source": "json" serves rows straight from a file: the no-SQL ingest
path. The platform-access pack is that path in use: five files and a manifest, no app code."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr

BACKEND = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND.parent
SCENARIOS = BACKEND / "scenarios"


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def _manifest(node: dict, base_dir: Path) -> sr.Manifest:
    return sr.Manifest(
        {"id": "x", "label": "x", "db": "data/x.db", "nodes": [node]}, base_dir=base_dir
    )


def test_a_json_node_needs_a_file():
    with pytest.raises(ValueError, match="file"):
        _manifest({"kind": "m", "source": "json"}, PROJECT_ROOT)


def test_a_json_file_outside_the_project_is_refused(tmp_path):
    m = _manifest({"kind": "m", "source": "json", "file": "../outside.json"}, tmp_path / "proj")
    with pytest.raises(ValueError, match="outside"):
        m.json_rows("m")


def test_a_json_file_must_hold_an_array_of_objects(tmp_path):
    (tmp_path / "rows.json").write_text('{"not": "an array"}', encoding="utf-8")
    m = _manifest({"kind": "m", "source": "json", "file": "rows.json"}, tmp_path)
    with pytest.raises(ValueError, match="array of objects"):
        m.json_rows("m")


def test_json_kinds_are_known_across_scenarios(client):
    assert "usage" in sr.sql_kinds()
    assert (
        client.get("/api/entities", params={"kind": "usage"}).json() == []
    )  # absent here, not an error


def test_a_pack_serves_its_rows_from_the_json_file(client):
    rows = json.loads((PROJECT_ROOT / "data" / "platform-access" / "org.json").read_text("utf-8"))
    assert client.post("/api/scenario/select", json={"id": "platform-access"}).status_code == 200
    got = client.get("/api/entities", params={"kind": "org"}).json()
    assert got == rows and len(got) == 30
    assert all(r["domain"].endswith(".example") for r in got)
    # the bank kinds are absent-as-data on this pack, and the switch back restores Marcus
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()
    assert client.get("/api/entities", params={"kind": "org"}).json() == []
