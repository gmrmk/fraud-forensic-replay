"""The `agent-runs-shared-key` manifest: seven file-backed kinds, declared entirely by the manifest,
read the way the app reads them. The rows and the sums are tested in
test_agent_runs_shared_key_pack.py; this file pins the seam between the manifest and the rows. The
drift and word rules are the ones test_platform_manifest.py defines, imported and not copied."""

from __future__ import annotations

import json
import math
import re
import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_agent_runs_shared_key as sk
from db import PROJECT_ROOT
from tests.test_platform_manifest import (
    PLACEHOLDER,
    SCENARIOS,
    _pivot_with,
    _raw,
    _served_rows,
    drift_problems,
    label_problems,
    lane_problems,
)

PACK_ID = "agent-runs-shared-key"
MANIFEST = SCENARIOS / f"{PACK_ID}.scenario.json"
TIMED = {
    "run_start": "timestamp",
    "run_end": "timestamp",
    "key_reach": "timestamp",
    "signin": "timestamp",
    "decision": "decided_at",
}
PLACED = ["org", "run_start", "run_end", "key_reach", "signin", "decision"]  # declare coords
HOP_KEYS = ("seconds_since_previous", "km_from_previous")  # key_reach is the path kind
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
def pack(manifest) -> dict[str, list[dict]]:
    return {k: manifest.json_rows(k) for k in manifest.kinds}


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def test_the_manifest_declares_seven_file_backed_kinds_and_no_rule(manifest):
    assert manifest.id == PACK_ID and manifest.label == "Platform · runs and a shared key"
    assert manifest.kinds == list(sk.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists()
    assert manifest.focal == {}, "a population pack: no single subject"
    assert manifest.raw["rules"] == [] and manifest.raw["arrows"] == []
    assert manifest.raw["home"] == {"lat": 42, "lng": -95, "zoom": 2.6}
    assert "lanes" not in manifest.raw, "five run ends do not lie on a grid: no lane"
    assert "annotations" not in manifest.raw


def test_the_files_are_the_generators_output(manifest):
    built = sk.generate()
    for kind in sk.KINDS:
        assert manifest.json_rows(kind) == built[kind], kind


def test_the_pack_database_holds_the_schema_and_no_row(manifest):
    conn = sqlite3.connect(manifest.db_path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        assert "transactions" in tables
        for name in tables:
            assert conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] == 0, name
    finally:
        conn.close()


def test_every_declared_field_is_a_column_of_every_row_of_its_node(manifest, pack):
    """The headline, the popout sections, the pivots, the timestamp and the decision mapping read
    only columns that every row of the kind carries. One exemption: a key_reach row whose
    `credential_id` has no earlier key_reach row (its key's first) may hold null in the two hop
    figures; the keys themselves are columns of every row."""
    firsts: dict[str, str] = {}
    for row in sorted(pack["key_reach"], key=lambda r: (r["timestamp"], r["id"])):
        firsts.setdefault(row["credential_id"], row["id"])
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        named |= set(node.get("pivotable", []))
        if node.get("timestamp"):
            named.add(node["timestamp"])
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], (node["kind"], section)
            named |= set(section["fields"])
        if "decision" in node:
            named |= set(node["decision"].values())
        assert named, node["kind"]
        for row in pack[node["kind"]]:
            may_be_null = HOP_KEYS if firsts.get(row.get("credential_id")) == row["id"] else ()
            missing = sorted(
                f for f in named if f not in row or (row[f] in (None, "") and f not in may_be_null)
            )
            assert not missing, (node["kind"], row["id"], missing)


def test_the_timed_kinds_declare_their_stamp_and_the_others_declare_none(manifest):
    assert {n["kind"]: n.get("timestamp") for n in manifest.nodes if n.get("timestamp")} == TIMED
    untimed = [n for n in manifest.nodes if not n.get("timestamp")]
    assert [n["kind"] for n in untimed] == ["org", "workspace"]


def test_only_the_six_placed_kinds_declare_a_place_only_key_reach_a_path_and_none_a_magnitude(
    manifest,
):
    for node in manifest.nodes:
        assert "magnitude" not in node, node["kind"]
        if node["kind"] == "key_reach":
            # One line for each key, through the workspaces it reached.
            path = (node["path"], node["pathBy"], node["territory"])
            assert path == (True, "credential_id", False)
        else:
            assert not {"path", "pathBy", "territory"} & set(node), node["kind"]
        assert re.fullmatch(r"#[0-9a-f]{6}", node["palette"]), node["kind"]
    assert [n["kind"] for n in manifest.nodes if "coords" in n] == PLACED
    for node in manifest.nodes:
        if "coords" in node:
            assert node["coords"] == {"lat": "lat", "lng": "lng"}, node["kind"]
    palettes = [n["palette"] for n in manifest.nodes]
    assert len(set(palettes)) == len(palettes)


def test_the_rows_of_the_placed_kinds_hold_a_number_for_each_coords_column_and_no_other_does(
    manifest, pack
):
    for node in manifest.nodes:
        for row in pack[node["kind"]]:
            if "coords" in node:
                assert all(type(row[c]) in (int, float) for c in node["coords"].values()), row["id"]
            else:
                assert not {"lat", "lng"} & set(row), (node["kind"], row["id"])


def test_a_run_start_a_run_end_and_a_key_reach_show_their_place_in_an_address_section(manifest):
    address = {"id": "address", "label": "Address", "fields": ["network_id", "city", "country"]}
    nodes = {n["kind"]: n for n in manifest.nodes}
    for kind in ("run_start", "run_end", "key_reach"):
        assert nodes[kind]["sections"][-1] == address, kind
        assert "network_id" not in nodes[kind]["pivotable"], kind  # carried, not observed
    assert nodes["run_start"]["sections"] == [address]


def test_the_signin_node_sits_before_the_decision_and_draws_two_sections(manifest):
    node = manifest._node("signin")
    assert [n["kind"] for n in manifest.nodes][-2:] == ["signin", "decision"]
    assert node["label"] == "Sign-in" and node["palette"] == "#ff9bd2"
    assert node["file"] == "data/agent-runs-shared-key/signin.json"
    assert node["sections"] == SIGNIN_SECTIONS
    assert node["pivotable"] == ["workspace_id", "network_id"]
    assert node["primary"] == f"${{outcome}} {MIDDOT} ${{workspace_id}}"
    assert node["secondary"] == f"${{network_id}} {MIDDOT} ${{city}}"
    assert "filter" not in node, "only key-many-networks declares a filter"


def test_a_node_with_no_time_key_and_only_filler_stamps_declares_omit_timestamp(manifest, pack):
    """The Inspector leaves the filler out where the node names no time: exactly org and
    workspace here, and the key stays on every row."""
    filler = [
        n["kind"]
        for n in manifest.nodes
        if "timestamp" not in n and all(r.get("timestamp") == 0 for r in pack[n["kind"]])
    ]
    assert filler == ["org", "workspace"]
    assert [n["kind"] for n in manifest.nodes if "omit" in n] == filler
    for node in manifest.nodes:
        if "omit" in node:
            assert node["omit"] == ["timestamp"], node["kind"]
            assert all("timestamp" in r for r in pack[node["kind"]]), node["kind"]


def test_the_decision_node_declares_its_mapping_and_every_row_carries_the_fields(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert set(mapping) == {"status", "outcome", "note", "actor", "target", "key", "event"}
    assert (mapping["key"], mapping["event"]) == ("org_id", "event_ids")
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and all(
            isinstance(e, str) for e in row["event_ids"]
        )


def test_the_rows_declaration_is_the_credential_and_its_workspaces():
    raw = _raw(PACK_ID)
    assert raw["rows"] == {"by": "credential_id", "member": "workspace_id"}, "no rows.name"
    assert raw["fields"]["credential_id"]["label"] == "API key"
    assert raw["fields"]["workspace_id"]["label"] == "Workspace"
    for name in ("credential_id", "workspace_id"):
        reach = next(n for n in raw["nodes"] if n["kind"] == "key_reach")
        assert name in reach["pivotable"]


def test_the_declared_rows_and_words_hold_on_the_rows_the_endpoint_serves(client):
    raw = _raw(PACK_ID)
    served = _served_rows(client, raw)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []
    assert lane_problems(raw, served) == []
    # The pack's shared key opens to its two workspaces: one credential, two workspace ids.
    members: dict[str, set[str]] = {}
    for r in served["key_reach"]:
        members.setdefault(r["credential_id"], set()).add(r["workspace_id"])
    assert sorted(len(v) for v in members.values()) == [1, 1, 1, 2]


def test_each_drift_rule_fires_alone_on_this_pack(client):
    raw = _raw(PACK_ID)
    served = _served_rows(client, raw)
    for key in ("by", "member"):
        good = raw["rows"][key]
        no_entry = {**raw, "fields": {k: v for k, v in raw["fields"].items() if k != good}}
        assert drift_problems(no_entry, served) == [f"rows.{key} {good!r} has no entry in fields"]
        ghost = f"no_such_{key}"
        ghosted = {
            **raw,
            "rows": {**raw["rows"], key: ghost},
            "nodes": _pivot_with(raw, ghost, "key_reach"),
            "fields": {**raw["fields"], ghost: {"label": "Ghost"}},
        }
        assert drift_problems(ghosted, served) == [f"rows.{key} {ghost!r} is a column of no row"]


def test_the_word_rules_hold_and_fail_on_25_characters():
    raw = _raw(PACK_ID)
    assert label_problems(raw) == []
    too_long = {**raw, "fields": {**raw["fields"], "credential_id": {"label": "x" * 25}}}
    assert label_problems(too_long)
    for entry in raw["fields"].values():
        assert 1 <= len(entry["label"]) <= 24 and "unit" not in entry
    assert raw["label"].strip()


def test_no_label_or_word_states_a_conclusion():
    raw = _raw(PACK_ID)
    words = [raw["label"], *[n["label"] for n in raw["nodes"]]]
    words += [e["label"] for e in raw["fields"].values()]
    for word in words:
        assert not re.search(
            r"fraud|breach|violat|misuse|takeover|abuse|risk|alert|flag", word, re.I
        ), word


def test_the_endpoint_serves_the_root_keys_unchanged_and_the_rows(client):
    raw = _raw(PACK_ID)
    assert client.post("/api/scenario/select", json={"id": PACK_ID}).status_code == 200
    served = client.get("/api/scenario").json()
    assert served["label"] == "Platform · runs and a shared key" and served["home"]["zoom"] == 2.6
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key
    built = sk.generate()
    for kind in sk.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == built[kind], kind
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    assert client.get("/api/decisions").json() == [], "no rule is declared (V8)"
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


def test_the_manifest_file_is_plain_json_with_a_relative_db():
    raw = json.loads(MANIFEST.read_text("utf-8"))
    assert raw["db"] == "data/agent-runs-shared-key.db"
    assert all(n["file"] == f"data/{PACK_ID}/{n['kind']}.json" for n in raw["nodes"])


def test_the_story_opens_on_its_own_places(manifest, pack):
    # A story's opening view holds its decision: the home is near the decision row's place.
    home = manifest.raw["home"]
    assert home == {"lat": 42, "lng": -95, "zoom": 2.6}
    (row,) = pack["decision"]
    p1, p2 = math.radians(home["lat"]), math.radians(row["lat"])
    dlng = math.radians(row["lng"] - home["lng"])
    cos = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlng)
    assert math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= 75
