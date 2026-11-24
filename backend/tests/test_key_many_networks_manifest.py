"""The `key-many-networks` manifest: nine file-backed kinds, seven of them placed, the key's path
on the network kind, the seats' paths on the sign-in kind and two Layers filters, read the way
the app reads them. The story is tested in test_key_many_networks_pack.py (the generator); this
file pins the seam between the manifest and the rows, on the model of test_platform_manifest.py:
the headline and section fields are columns, `rows.by` and `rows.member` obey the drift rules,
the words are within the bounded-string limits, and the endpoint serves the root keys unchanged."""

from __future__ import annotations

import json
import math
import re

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_key_many_networks as km
from db import PROJECT_ROOT
from tests.test_platform_manifest import _served_rows, drift_problems, label_problems

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
MANIFEST = SCENARIOS / "key-many-networks.scenario.json"
PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
# The fields the design's table gives each kind (DESIGN-CASES.md, story 1), typed here.
DESIGN_FIELDS = {
    "org": ["org_id", "org_name", "plan", "networks_both_orgs"],
    "principal": ["principal_id", "principal_name", "networks_seen", "requests_18d"],
    "network_seen": ["principal_id", "network_id", "network_type", "previous_network"],
    "reset": ["org_id", "seat_id", "after_offer_s", "other_seats"],
    "usage_day": ["requests", "output_tokens_m"],
    "decision": ["status", "outcome", "note", "decided_by", "target_label", "org_id", "event_ids"],
}
TIMED = {"network_seen", "reset", "usage_day", "signin", "key_event", "request_sample", "decision"}
# DATA section 4, the sections of every node but the decision, typed here: (id, label, fields).
SECTIONS = {
    "org": [
        ("org", "Organisation", ["org_id", "org_name", "plan", "networks_both_orgs"]),
        ("account", "Account", ["billing_city", "billing_country", "created_on", "seats_total",
            "seats_active_7d"]),
        ("controls", "Controls", ["single_sign_on", "admin_seat_id", "keys_active",
            "networks_30d"]),
        ("spend", "Spend", ["spend_limit_usd", "spend_30d_usd"]),
    ],
    "principal": [
        ("principal", "Key or seat", ["principal_id", "principal_name", "networks_seen",
            "requests_18d"]),
        ("use", "Use", ["last_used_at", "last_network_id", "networks_7d", "requests_7d", "client"]),
        ("setup", "Setup", ["org_id", "created_on", "created_in", "scopes", "rotations"]),
    ],
    "network_seen": [
        ("network", "Network", ["principal_id", "network_id", "network_type", "previous_network",
            "timestamp"]),
        ("address", "Address", ["ip", "host_name", "city", "country"]),
        ("activity", "Activity", ["seconds_since_previous", "km_from_previous",
            "requests_on_network", "others_on_network", "first_seen_at", "client"]),
    ],
    "reset": [
        ("reset", "Reset", ["org_id", "seat_id", "after_offer_s", "other_seats", "timestamp"]),
        ("request", "Request", ["channel", "network_id", "ip", "city", "country"]),
        ("limit", "Limit", ["limit_name", "used_before_percent", "requests_before", "offer_code"]),
    ],
    "usage_day": [
        ("usage", "Day", ["requests", "output_tokens_m", "timestamp"]),
        ("split", "Split", ["requests_by_key", "requests_by_seats", "networks"]),
        ("load", "Load", ["input_tokens_m", "error_responses", "peak_hour_utc"]),
    ],
    "signin": [
        ("sign-in", "Sign-in", ["seat_id", "org_id", "outcome", "method", "client", "timestamp",
            "seconds_since_previous", "km_from_previous"]),
        ("address", "Address", ["network_id", "network_type", "ip", "city", "country"]),
    ],
    "key_event": [
        ("key-event", "Key event", ["principal_id", "event", "change", "seat_id", "channel",
            "timestamp"]),
        ("address", "Address", ["network_id", "ip", "city", "country"]),
    ],
    "request_sample": [
        ("request", "Request", ["principal_id", "endpoint", "response_code", "milliseconds",
            "output_tokens", "timestamp"]),
        ("address", "Address", ["network_id", "network_type", "ip", "city", "country"]),
    ],
}  # fmt: skip
PIVOTABLE = {
    "org": ["org_id"],
    "principal": ["principal_id", "org_id"],
    "network_seen": ["principal_id", "network_id"],
    "reset": ["org_id", "seat_id", "network_id"],
    "usage_day": [],
    "signin": ["seat_id", "org_id", "network_id"],
    "key_event": ["principal_id", "seat_id", "network_id"],
    "request_sample": ["principal_id", "network_id"],
    "decision": ["org_id"],
}
# What the three new nodes show as a headline: label, palette, primary, secondary. The middle dot
# of a template is built from its code point so this file holds no such character.
DOT = chr(0xB7)
NEW_NODES = {
    "signin": ("Sign-in", "#ff9bd2", f"${{outcome}} {DOT} ${{seat_id}}",
        f"${{network_id}} {DOT} ${{city}}"),
    "key_event": ("Key event", "#a5d6ff", f"${{event}} {DOT} ${{principal_id}}",
        f"${{seat_id}} {DOT} ${{city}}"),
    "request_sample": ("Request", "#56d4dd", f"${{response_code}} {DOT} ${{endpoint}}",
        f"${{network_id}} {DOT} ${{city}}"),
}  # fmt: skip


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


def test_the_manifest_declares_nine_file_backed_kinds_and_no_rule(manifest, raw):
    assert manifest.id == "key-many-networks"
    assert manifest.label == "Platform · one key, many networks"
    assert manifest.kinds == list(km.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists() and manifest.db_path.name == "key-many-networks.db"
    assert manifest.focal == {}
    assert raw["arrows"] == [] and raw["rules"] == []  # V8: no rule and no arrow
    assert raw["home"] == {"lat": 30, "lng": -40, "zoom": 1.4}  # V10
    assert "lanes" not in raw and "annotations" not in raw


def test_the_files_are_the_generators_output(manifest):
    built = km.generate()
    for kind in km.KINDS:
        on_disk = json.loads((PROJECT_ROOT / manifest._node(kind)["file"]).read_text("utf-8"))
        assert on_disk == built[kind], kind
        assert manifest._node(kind)["file"] == f"data/key-many-networks/{kind}.json"


def test_the_pack_database_is_empty(manifest):
    import sqlite3

    conn = sqlite3.connect(manifest.db_path)
    try:
        names = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        assert names
        assert sum(conn.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names) == 0
    finally:
        conn.close()


def test_every_declared_field_is_a_column_of_every_row_of_its_node(manifest, pack):
    for node in manifest.nodes:
        declared = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        declared |= set(node.get("pivotable", []))
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], section
            declared |= set(section["fields"])
        for key in ("timestamp", "magnitude", "pathBy"):
            if key in node:
                declared.add(node[key])
        declared |= set(node.get("coords", {}).values())
        if "filter" in node:
            declared.add(node["filter"]["field"])
        declared |= set(node.get("decision", {}).values())
        for row in pack[node["kind"]]:
            assert declared <= set(row), (node["kind"], row["id"], sorted(declared - set(row)))
    # The table's own fields are columns of every row of the kind, whether or not a node shows them.
    for kind, fields in DESIGN_FIELDS.items():
        for row in pack[kind]:
            assert set(fields) <= set(row), (kind, row["id"])


def test_the_headline_fields_hold_a_value_on_every_row(manifest, pack):
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for row in pack[node["kind"]]:
            missing = sorted(f for f in named if row.get(f) in (None, ""))
            assert not missing, (node["kind"], row["id"], missing)


PLACED = ["org", "network_seen", "reset", "signin", "key_event", "request_sample", "decision"]


def test_exactly_seven_nodes_declare_coords_and_only_their_rows_have_a_place(manifest, pack):
    assert [n["kind"] for n in manifest.nodes if "coords" in n] == PLACED
    assert all(n["coords"] == {"lat": "lat", "lng": "lng"} for n in manifest.nodes if "coords" in n)
    for kind, items in pack.items():
        placed = [r["id"] for r in items if {"lat", "lng"} & set(r)]
        assert placed == ([r["id"] for r in items] if kind in PLACED else []), kind


def test_the_network_node_declares_the_keys_path_and_the_signin_node_the_seats_paths(raw):
    paths = {n["kind"]: n for n in raw["nodes"] if "path" in n}
    assert list(paths) == ["network_seen", "signin"]
    for kind, by in (("network_seen", "principal_id"), ("signin", "seat_id")):
        node = paths[kind]
        assert (node["path"], node["pathBy"], node["territory"]) == (True, by, False), kind
    # A path joins the records of one key or one seat: no other node names `pathBy` or `territory`.
    named = [n["kind"] for n in raw["nodes"] if {"pathBy", "territory"} & set(n)]
    assert named == ["network_seen", "signin"]


def test_the_signin_and_decision_nodes_declare_the_two_layers_filters_and_no_other_does(raw):
    nodes = {n["kind"]: n for n in raw["nodes"]}
    assert nodes["signin"]["filter"] == {"field": "network_type", "label": "Network type"}
    assert nodes["decision"]["filter"] == {"field": "status", "label": "Status"}
    assert [n["kind"] for n in raw["nodes"] if "filter" in n] == ["signin", "decision"]


def test_exactly_the_timed_kinds_declare_a_timestamp(manifest):
    declared = {n["kind"]: n.get("timestamp") for n in manifest.nodes}
    assert {k for k, v in declared.items() if v} == TIMED
    assert declared["decision"] == "decided_at"
    assert all(declared[k] == "timestamp" for k in TIMED - {"decision"})


def test_the_timed_carriers_of_the_key_and_the_network_are_the_kinds_that_hold_them(manifest, pack):
    """The kinds that list the key or the network as pivotable are the timed kinds that hold the
    column; the day and decision rows hold neither and list neither, and a reset holds the
    network but no key."""
    carriers = [
        n["kind"]
        for n in manifest.nodes
        if n.get("timestamp") and "principal_id" in n.get("pivotable", [])
    ]
    assert carriers == ["network_seen", "key_event", "request_sample"]
    carriers = [
        n["kind"]
        for n in manifest.nodes
        if n.get("timestamp") and "network_id" in n.get("pivotable", [])
    ]
    assert carriers == ["network_seen", "reset", "signin", "key_event", "request_sample"]
    for kind in ("usage_day", "decision"):
        assert not {"principal_id", "network_id"} & set(pack[kind][0]), kind
    assert "principal_id" not in pack["reset"][0] and "network_id" in pack["reset"][0]


def test_every_node_declares_the_sections_and_pivotable_fields_of_the_table(raw):
    nodes = {n["kind"]: n for n in raw["nodes"]}
    assert list(nodes) == list(km.KINDS)
    for kind, sections in SECTIONS.items():
        assert [
            (s["id"], s["label"], s["fields"]) for s in nodes[kind]["sections"]
        ] == sections, kind
    for kind, pivotable in PIVOTABLE.items():
        assert nodes[kind]["pivotable"] == pivotable, kind
    # The decision node is not changed.
    assert "sections" not in nodes["decision"] and nodes["decision"]["pivotable"] == ["org_id"]


def test_the_three_new_nodes_are_timed_file_backed_and_say_what_they_show(raw):
    nodes = {n["kind"]: n for n in raw["nodes"]}
    palettes = [n["palette"] for n in raw["nodes"]]
    assert len(set(palettes)) == len(palettes)  # a colour names one kind
    for kind, (label, palette, primary, secondary) in NEW_NODES.items():
        node = nodes[kind]
        assert node["label"] == label and node["palette"] == palette, kind
        assert (node["primary"], node["secondary"]) == (primary, secondary), kind
        assert node["source"] == "json" and node["timestamp"] == "timestamp", kind
        assert node["file"] == f"data/key-many-networks/{kind}.json", kind
        # A place; the sign-in alone declares a filter (tested apart) and a path (the seats').
        assert node["coords"] == {"lat": "lat", "lng": "lng"}, kind
        if kind != "signin":
            assert not {"path", "pathBy", "territory"} & set(node), kind


def test_a_node_with_no_time_key_and_only_filler_stamps_declares_omit_timestamp(raw, pack):
    """The Inspector leaves out the filler `timestamp` 0 of a record with no time: the manifest
    says so on exactly the nodes that name no time key and whose rows hold the filler."""
    filler = [
        n["kind"]
        for n in raw["nodes"]
        if "timestamp" not in n and all(r.get("timestamp") == 0 for r in pack[n["kind"]])
    ]
    assert filler == ["org", "principal"]
    declared = [n["kind"] for n in raw["nodes"] if "omit" in n]
    assert declared == filler
    for node in raw["nodes"]:
        if node["kind"] in filler:
            assert node["omit"] == ["timestamp"], node["kind"]
            # The key stays on every row: only the Inspector leaves it out.
            assert all(r["timestamp"] == 0 for r in pack[node["kind"]])


def test_rows_by_and_member_name_the_key_and_the_network_and_have_words(raw):
    assert raw["rows"] == {"by": "principal_id", "member": "network_id"}  # no rows.name
    assert raw["fields"]["principal_id"]["label"] == "Key or seat"
    assert raw["fields"]["network_id"]["label"] == "Network"
    assert set(raw["fields"]) == {"principal_id", "network_id"}


def test_the_declared_rows_and_words_hold_on_the_rows_the_endpoint_serves(client, raw):
    served = _served_rows(client, raw)
    assert set(served) == set(km.KINDS)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []


def test_each_drift_rule_fires_for_this_pack(client, raw):
    served = _served_rows(client, raw)
    # Not pivotable on a timed node: take both columns out of every node (the limit reset lists
    # the network too, so the network node alone would leave the member rule quiet).
    stripped = [
        {
            **n,
            "pivotable": [f for f in n["pivotable"] if f not in ("principal_id", "network_id")],
        }
        for n in raw["nodes"]
    ]
    problems = drift_problems({**raw, "nodes": stripped}, served)
    assert problems == [
        "rows.by 'principal_id' is in no timed node's pivotable",
        "rows.member 'network_id' is in no timed node's pivotable",
    ]
    # No words for the key column.
    no_entry = {**raw, "fields": {"network_id": raw["fields"]["network_id"]}}
    assert drift_problems(no_entry, served) == ["rows.by 'principal_id' has no entry in fields"]
    # A column no row has.
    ghost = {**raw, "rows": {**raw["rows"], "name": "no_such_name"}}
    assert drift_problems(ghost, served) == [
        f"rows.name 'no_such_name' is not a column of {kind!r}"
        for kind in ("network_seen", "key_event", "request_sample")
    ]


def test_the_label_and_name_words_are_within_the_bounded_string_limits(raw):
    for entry in raw["fields"].values():
        assert 1 <= len(entry["label"]) <= 24
        assert 1 <= len(entry.get("unit", "x")) <= 16
    for node in raw["nodes"]:
        if "magnitude" in node:
            assert 1 <= len(node["magnitudeLabel"]) <= 24
            assert 1 <= len(node["magnitudeUnit"]) <= 16
    assert label_problems({**raw, "fields": {"principal_id": {"label": "x" * 25}}})


def test_the_day_count_is_the_one_magnitude_and_every_value_is_a_number(manifest, pack, raw):
    assert [n["kind"] for n in manifest.nodes if "magnitude" in n] == ["usage_day"]
    node = manifest._node("usage_day")
    assert node["magnitude"] == "requests"
    assert all(isinstance(r["requests"], int) and r["requests"] > 0 for r in pack["usage_day"])
    # D1: the lane's day bucket is not declared here; the playbar design holds "hour" only.
    assert "lanes" not in raw


def test_the_decision_mapping_names_columns_the_rows_carry(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert (mapping["key"], mapping["event"]) == ("org_id", "event_ids")
    assert set(mapping) == {"status", "outcome", "note", "actor", "target", "key", "event"}
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and all(
            isinstance(e, str) for e in row["event_ids"]
        )


def test_no_node_words_a_conclusion(raw):
    words = " ".join(
        [raw["label"]]
        + [
            n["label"] + n["primary"] + n["secondary"]
            for n in raw["nodes"]
            if n["kind"] != "decision"
        ]
    )
    assert not re.search(r"fraud|takeover|stolen|abuse|attack|suspicious|bot|script", words, re.I)


def test_the_pack_serves_its_rows_through_the_api(client, pack):
    assert client.post("/api/scenario/select", json={"id": "key-many-networks"}).status_code == 200
    served = client.get("/api/scenario").json()
    assert served["label"] == "Platform · one key, many networks" and served["home"]["zoom"] == 1.4
    for kind in km.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == pack[kind]
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    # /api/decisions evaluates rules and the pack declares none (V8); its one decision is the
    # entity of kind "decision" served above.
    assert client.get("/api/decisions").json() == []
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


def test_the_registry_lists_the_pack_and_the_endpoint_serves_the_root_keys_unchanged(client, raw):
    assert "key-many-networks" in {s["id"] for s in client.get("/api/scenarios").json()}
    assert client.post("/api/scenario/select", json={"id": raw["id"]}).status_code == 200
    served = client.get("/api/scenario").json()
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key


def test_the_story_opens_on_its_own_places(manifest, pack):
    # A story's opening view holds its decision: the home is near the decision row's place.
    home = manifest.raw["home"]
    assert home == {"lat": 30, "lng": -40, "zoom": 1.4}
    (row,) = pack["decision"]
    p1, p2 = math.radians(home["lat"]), math.radians(row["lat"])
    dlng = math.radians(row["lng"] - home["lng"])
    cos = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlng)
    assert math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= 75
