"""The volume-step manifest: eight file-backed kinds, three placed, no rule, no arrow, declared
entirely by the manifest and read the way the app reads it. The rows are tested in
test_volume_step_pack.py; this file pins the seam between the manifest and the rows. The drift
and word checks are the ones test_platform_manifest.py holds, reused and not copied."""

from __future__ import annotations

import json
import math
import re

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_volume_step as sv
from db import PROJECT_ROOT
from tests.test_platform_manifest import (
    FIELD_NAME,
    LABEL_MAX,
    UNIT_MAX,
    _served_rows,
    drift_problems,
    label_problems,
)

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
MANIFEST = SCENARIOS / "volume-step.scenario.json"
PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
MAGNITUDES = {"usage_day": "requests", "failed_call_day": "failed_calls"}
PLACED = ["org", "signin", "decision"]  # the nodes that declare coords
MIDDOT = chr(0xB7)  # the one character the templates join their parts with
SIGNIN_SECTIONS = [
    {
        "id": "sign-in",
        "label": "Sign-in",
        "fields": ["workspace_id", "outcome", "method", "client", "timestamp"],
    },
    {"id": "address", "label": "Address", "fields": ["network_id", "ip", "city", "country"]},
]


@pytest.fixture(scope="module")
def manifest() -> sr.Manifest:
    return sr.load_manifest(MANIFEST, base_dir=PROJECT_ROOT)


@pytest.fixture(scope="module")
def raw() -> dict:
    return json.loads(MANIFEST.read_text("utf-8"))


@pytest.fixture(scope="module")
def pack(manifest) -> dict[str, list[dict]]:
    return {k: manifest.json_rows(k) for k in manifest.kinds}


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def test_the_manifest_declares_eight_file_backed_kinds_and_nothing_that_detects(manifest, raw):
    assert manifest.id == "volume-step"
    assert manifest.label == "Platform · daily volume and failed calls"
    assert manifest.kinds == list(sv.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists() and manifest.db_path.name == "volume-step.db"
    assert manifest.focal == {}
    assert raw.get("rules", []) == [] and raw.get("arrows", []) == [], "V8: no rule, no arrow"
    assert "lanes" not in raw, "a day bucket is not built; the lane waits on its own item"
    assert raw["home"] == {"lat": 40.5, "lng": -111, "zoom": 3.5}, "V10: a camera on its own places"


def test_only_org_signin_and_decision_declare_a_place_and_their_rows_hold_numbers(manifest, pack):
    assert [n["kind"] for n in manifest.nodes if "coords" in n] == PLACED
    for node in manifest.nodes:
        for row in pack[node["kind"]]:
            if "coords" in node:
                assert node["coords"] == {"lat": "lat", "lng": "lng"}, node["kind"]
                assert all(type(row[c]) in (int, float) for c in node["coords"].values()), row["id"]
            else:
                assert not {"lat", "lng"} & set(row), (node["kind"], row["id"])


def test_the_signin_node_sits_before_the_decision_and_draws_two_sections(manifest):
    node = manifest._node("signin")
    assert [n["kind"] for n in manifest.nodes][-2:] == ["signin", "decision"]
    assert node["label"] == "Sign-in" and node["palette"] == "#ff9bd2"
    assert node["file"] == "data/volume-step/signin.json"
    assert node["sections"] == SIGNIN_SECTIONS
    assert node["pivotable"] == ["workspace_id", "network_id"]
    assert node["primary"] == f"${{outcome}} {MIDDOT} ${{workspace_id}}"
    assert node["secondary"] == f"${{network_id}} {MIDDOT} ${{city}}"
    assert "filter" not in node, "only key-many-networks declares a filter"
    palettes = [n["palette"] for n in manifest.nodes]
    assert len(set(palettes)) == len(palettes)


def test_no_node_declares_omit_because_the_untimed_rows_hold_no_filler_stamp(manifest, pack):
    """The Inspector's omit key hides the filler `timestamp` 0. The org and workspace rows of this
    story carry no `timestamp` key at all, so there is nothing to hide and no node declares it."""
    untimed = [n["kind"] for n in manifest.nodes if "timestamp" not in n]
    assert untimed == ["org", "workspace"]
    for kind in untimed:
        assert not [r for r in pack[kind] if "timestamp" in r], kind
    assert not [n["kind"] for n in manifest.nodes if "omit" in n]


def test_the_files_are_the_generators_output(manifest):
    built = sv.generate()
    for kind in sv.KINDS:
        on_disk = json.loads((PROJECT_ROOT / manifest._node(kind)["file"]).read_text("utf-8"))
        assert on_disk == built[kind], kind


def test_every_declared_field_is_a_column_of_every_row_of_its_node(manifest, pack):
    for node in manifest.nodes:
        declared = set(node.get("pivotable", []))
        declared |= set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], (node["kind"], section)
            declared |= set(section["fields"])
        for key in ("timestamp", "magnitude"):
            if key in node:
                declared.add(node[key])
        declared |= {v for v in node.get("decision", {}).values()}
        for row in pack[node["kind"]]:
            assert declared <= set(row), (node["kind"], row["id"], sorted(declared - set(row)))


def test_every_headline_and_section_field_has_a_value_on_every_row(manifest, pack):
    """The ticker headline and the popout sections read only fields every row has a value for."""
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for section in node.get("sections", []):
            named |= set(section["fields"])
        for row in pack[node["kind"]]:
            missing = sorted(f for f in named if row.get(f) in (None, ""))
            assert not missing, (node["kind"], row["id"], missing)


def test_timed_nodes_name_their_stamp_and_the_untimed_two_have_none(manifest):
    stamp = {n["kind"]: n.get("timestamp") for n in manifest.nodes}
    assert stamp == {
        "org": None,
        "workspace": None,
        "usage_day": "timestamp",
        "period": "timestamp",
        "failed_call_day": "timestamp",
        "notice": "timestamp",
        "signin": "timestamp",
        "decision": "decided_at",
    }


def test_the_rows_section_groups_by_workspace_and_has_no_member(raw, client):
    assert raw["rows"] == {"by": "workspace_id"}
    assert raw["fields"] == {"workspace_id": {"label": "Workspace"}}
    served = _served_rows(client, raw)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []
    # The drift rule bites on this pack: a column that no timed node pivots on is refused.
    broken = {**raw, "rows": {"by": "workspace_name"}, "fields": {"workspace_name": {"label": "N"}}}
    assert drift_problems(broken, served)


def test_the_two_day_kinds_declare_their_magnitude_and_the_period_kind_none(manifest, pack):
    declared = {n["kind"]: n["magnitude"] for n in manifest.nodes if "magnitude" in n}
    assert declared == MAGNITUDES
    for node in manifest.nodes:
        if node["kind"] in MAGNITUDES:
            label, unit = node.get("magnitudeLabel"), node.get("magnitudeUnit")
            assert isinstance(label, str) and 1 <= len(label) <= LABEL_MAX, label
            assert isinstance(unit, str) and 1 <= len(unit) <= UNIT_MAX, unit
            assert FIELD_NAME.match(node["magnitude"])
            rows = pack[node["kind"]]
            assert all(type(r[node["magnitude"]]) is int and r[node["magnitude"]] > 0 for r in rows)


def test_the_decision_node_declares_its_mapping_and_the_row_carries_the_fields(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert (mapping["key"], mapping["event"]) == ("org_id", "event_ids")
    assert set(mapping) == {"status", "outcome", "note", "actor", "target", "key", "event"}
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and all(
            isinstance(e, str) for e in row["event_ids"]
        )


def test_the_pack_serves_its_rows_through_the_api(client, pack):
    assert client.post("/api/scenario/select", json={"id": "volume-step"}).status_code == 200
    served = client.get("/api/scenario").json()
    assert served["label"] == "Platform · daily volume and failed calls"
    assert served["home"]["zoom"] == 3.5
    for kind in sv.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == pack[kind]
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    # The rules engine reads rules, and the pack declares none (V8): the one decision row is
    # served as a kind above, and no rule queues anything.
    assert client.get("/api/decisions").json() == []
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


def test_the_endpoint_serves_the_root_keys_unchanged(client, raw):
    assert client.post("/api/scenario/select", json={"id": "volume-step"}).status_code == 200
    served = client.get("/api/scenario").json()
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key


def test_the_story_opens_on_its_own_places(manifest, pack):
    # A story's opening view holds its decision: the home is near the decision row's place.
    home = manifest.raw["home"]
    assert home == {"lat": 40.5, "lng": -111, "zoom": 3.5}
    (row,) = pack["decision"]
    p1, p2 = math.radians(home["lat"]), math.radians(row["lat"])
    dlng = math.radians(row["lng"] - home["lng"])
    cos = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlng)
    assert math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= 75
