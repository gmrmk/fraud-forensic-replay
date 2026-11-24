"""The seats-two-networks manifest: nine file-backed kinds, five placed, no rule and no arrow, read
the way the app reads them. The pack's story is tested in test_seats_two_networks_pack.py; this
file pins the seam between the manifest and the rows, on the model of test_platform_manifest.py.
The drift and bounded-string checks are that file's own functions, not copies of them."""

from __future__ import annotations

import json
import math
import re

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_seats_two_networks as sp
from db import PROJECT_ROOT
from tests.test_platform_manifest import (
    PLACEHOLDER,
    _served_rows,
    drift_problems,
    label_problems,
)

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
MANIFEST = SCENARIOS / "seats-two-networks.scenario.json"
PACK_ID = "seats-two-networks"
# No event row may say what it is; a decision row is the business's own record and is exempt.
LABEL_KEY = re.compile(r"fraud|label|truth|verdict|^is_", re.IGNORECASE)
PLACED = ["org", "switch_sample", "reset", "signin", "decision"]  # the nodes that declare coords
HOP_KEYS = ("seconds_since_previous", "km_from_previous")  # the sign-in is the path kind
MIDDOT = chr(0xB7)  # the one character the templates join their parts with
SIGNIN_SECTIONS = [
    {
        "id": "sign-in",
        "label": "Sign-in",
        "fields": [
            "seat_id",
            "org_id",
            "outcome",
            "method",
            "client",
            "timestamp",
            "seconds_since_previous",
            "km_from_previous",
        ],
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


def _raw() -> dict:
    return json.loads(MANIFEST.read_text("utf-8"))


def test_the_manifest_declares_nine_file_backed_kinds_and_no_rule_and_no_arrow(manifest):
    assert manifest.id == PACK_ID and manifest.label == "Platform · seats on two networks"
    assert manifest.kinds == list(sp.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists() and manifest.db_path.name == "seats-two-networks.db"
    assert manifest.focal == {}, "a pack with no single subject"
    assert manifest.raw["rules"] == [] and manifest.raw["arrows"] == []
    assert manifest.raw["home"] == {"lat": 41, "lng": -118, "zoom": 3}
    assert "annotations" not in manifest.raw


def test_only_the_five_placed_kinds_declare_a_place_and_their_rows_hold_numbers(manifest, pack):
    assert [n["kind"] for n in manifest.nodes if "coords" in n] == PLACED
    for node in manifest.nodes:
        for row in pack[node["kind"]]:
            if "coords" in node:
                assert node["coords"] == {"lat": "lat", "lng": "lng"}, node["kind"]
                assert all(type(row[c]) in (int, float) for c in node["coords"].values()), row["id"]
            else:
                assert not {"lat", "lng"} & set(row), (node["kind"], row["id"])


def test_the_network_change_and_the_reset_show_their_place_in_an_address_section(manifest):
    nodes = {n["kind"]: n for n in manifest.nodes}
    change = nodes["switch_sample"]["sections"]
    assert change[-1] == {"id": "address", "label": "Address", "fields": ["city", "country"]}
    assert change[0]["fields"] == ["seat_id", "network_id", "previous_network", "timestamp"]
    address = {"id": "address", "label": "Address", "fields": ["network_id", "city", "country"]}
    assert nodes["reset"]["sections"] == [address]
    assert "network_id" not in nodes["reset"]["pivotable"], "carried, not observed"


def test_the_signin_node_sits_before_the_decision_and_draws_two_sections(manifest):
    node = manifest._node("signin")
    assert [n["kind"] for n in manifest.nodes][-2:] == ["signin", "decision"]
    assert node["label"] == "Sign-in" and node["palette"] == "#ffd166"
    assert node["file"] == "data/seats-two-networks/signin.json"
    assert node["sections"] == SIGNIN_SECTIONS
    assert node["pivotable"] == ["seat_id", "org_id", "network_id"]
    assert node["primary"] == f"${{outcome}} {MIDDOT} ${{seat_id}}"
    assert node["secondary"] == f"${{network_id}} {MIDDOT} ${{city}}"
    assert "filter" not in node, "only key-many-networks declares a filter"
    # One line for each seat, through its sign-ins; no other node declares a path.
    assert (node["path"], node["pathBy"], node["territory"]) == (True, "seat_id", False)
    assert [n["kind"] for n in manifest.nodes if {"path", "pathBy", "territory"} & set(n)] == [
        "signin"
    ]
    palettes = [n["palette"] for n in manifest.nodes]
    assert len(set(palettes)) == len(palettes)


def test_a_node_with_no_time_key_and_only_filler_stamps_declares_omit_timestamp(manifest, pack):
    """The Inspector leaves the filler out where the node names no time: exactly org and seat
    here, and the key stays on every row."""
    filler = [
        n["kind"]
        for n in manifest.nodes
        if "timestamp" not in n and all(r.get("timestamp") == 0 for r in pack[n["kind"]])
    ]
    assert filler == ["org", "seat"]
    assert [n["kind"] for n in manifest.nodes if "omit" in n] == filler
    for node in manifest.nodes:
        if "omit" in node:
            assert node["omit"] == ["timestamp"], node["kind"]
            assert all("timestamp" in r for r in pack[node["kind"]]), node["kind"]


def test_the_files_are_the_generators_output(manifest):
    built = sp.generate()
    for kind in sp.KINDS:
        on_disk = json.loads((PROJECT_ROOT / manifest._node(kind)["file"]).read_text("utf-8"))
        assert on_disk == built[kind], kind


def test_every_node_names_the_file_of_its_kind(manifest):
    for node in manifest.nodes:
        assert node["file"] == f"data/seats-two-networks/{node['kind']}.json", node["kind"]


def test_timed_nodes_declare_a_timestamp_and_the_two_untimed_kinds_none(manifest):
    declared = {n["kind"]: n.get("timestamp") for n in manifest.nodes}
    assert declared == {
        "org": None,
        "seat": None,
        "switch_sample": "timestamp",
        "reset": "timestamp",
        "safeguard_hour": "timestamp",
        "usage_day": "timestamp",
        "enrolment": "timestamp",
        "signin": "timestamp",
        "decision": "decided_at",
    }


def test_every_headline_and_section_field_is_present_on_every_row(manifest, pack):
    """The ticker headline and the popout sections read only fields every row carries. One
    exemption: a sign-in whose seat has no earlier sign-in (its seat's first) may hold null in the
    two hop figures; the keys themselves are columns of every sign-in."""
    firsts: dict[str, str] = {}
    for row in sorted(pack["signin"], key=lambda r: (r["timestamp"], r["id"])):
        firsts.setdefault(row["seat_id"], row["id"])
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], (node["kind"], section)
            named |= set(section["fields"])
        for row in pack[node["kind"]]:
            first_signin = node["kind"] == "signin" and firsts[row["seat_id"]] == row["id"]
            missing = []
            for field in sorted(named):
                if first_signin and field in HOP_KEYS:
                    empty = field not in row  # null is allowed, an absent column is not
                else:
                    empty = row.get(field) in (None, "")
                if empty:
                    missing.append(field)
            assert not missing, (node["kind"], row["id"], missing)


def test_every_pivot_field_is_a_non_empty_column_of_every_row_of_its_node(manifest, pack):
    for node in manifest.nodes:
        for row in pack[node["kind"]]:
            empty = [f for f in node.get("pivotable", []) if row.get(f) in (None, "")]
            assert not empty, (node["kind"], row["id"], empty)
    declared = set().union(*(set(n.get("pivotable", [])) for n in manifest.nodes))
    assert {"seat_id", "network_id", "org_id"} <= declared


def test_no_event_row_carries_a_label(pack):
    for kind, items in pack.items():
        if kind == "decision":
            continue
        for row in items:
            assert not [k for k in row if LABEL_KEY.search(k)], (kind, row["id"])


def test_the_decision_node_declares_its_mapping_and_the_row_carries_the_columns(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert mapping == {
        "status": "status",
        "outcome": "outcome",
        "note": "note",
        "actor": "decided_by",
        "target": "target_label",
        "key": "org_id",
        "event": "event_ids",
    }
    ids = {r["id"] for items in pack.values() for r in items}
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and set(row["event_ids"]) <= ids


def test_two_nodes_declare_a_magnitude_with_words_within_the_limits(manifest, pack):
    magnitude = {n["kind"]: n for n in manifest.nodes if "magnitude" in n}
    assert {k: n["magnitude"] for k, n in magnitude.items()} == {
        "safeguard_hour": "events",
        "usage_day": "requests",
    }
    for kind, node in magnitude.items():
        assert 1 <= len(node["magnitudeLabel"]) <= 24, kind
        assert 1 <= len(node["magnitudeUnit"]) <= 16, kind
        assert all(
            isinstance(r[node["magnitude"]], int) and r[node["magnitude"]] >= 0 for r in pack[kind]
        ), kind


def test_rows_group_by_seat_and_list_networks_as_members(manifest):
    raw = manifest.raw
    assert raw["rows"] == {"by": "seat_id", "member": "network_id"}
    assert raw["fields"]["seat_id"]["label"] == "Seat"
    assert raw["fields"]["network_id"]["label"] == "Network"


def test_the_pack_declares_no_lane_of_its_own(manifest):
    """A day bucket is not accepted (D1 measures it); the two lanes are the nodes' magnitudes."""
    assert "lanes" not in manifest.raw


def test_the_declared_rows_and_words_hold_on_the_rows_the_endpoint_serves(client):
    raw = _raw()
    served = _served_rows(client, raw)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []


def test_the_pack_serves_its_rows_through_the_api(client, pack):
    assert client.post("/api/scenario/select", json={"id": PACK_ID}).status_code == 200
    served = client.get("/api/scenario").json()
    assert served["label"] == "Platform · seats on two networks"
    assert served["home"]["zoom"] == 3
    for kind in sp.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == pack[kind], kind
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    assert client.get("/api/decisions").json() == []
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


def test_the_endpoint_serves_the_root_keys_unchanged(client):
    raw = _raw()
    assert client.post("/api/scenario/select", json={"id": PACK_ID}).status_code == 200
    served = client.get("/api/scenario").json()
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key


def test_the_story_opens_on_its_own_places(manifest, pack):
    # A story's opening view holds its decision: the home is near the decision row's place.
    home = manifest.raw["home"]
    assert home == {"lat": 41, "lng": -118, "zoom": 3}
    (row,) = pack["decision"]
    p1, p2 = math.radians(home["lat"]), math.radians(row["lat"])
    dlng = math.radians(row["lng"] - home["lng"])
    cos = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlng)
    assert math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= 75
