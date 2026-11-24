"""The seat-failed-signins manifest: eight file-backed kinds declared entirely by the manifest, read
the way the app reads them. The pack's story is tested in test_seat_failed_signins_pack.py (the
generator); this file pins the seam between the manifest and the rows, on the model of
test_platform_manifest.py (the declared fields, the rows drift rules, the bounded words and the
root keys the endpoint serves)."""

from __future__ import annotations

import json
import math
import re

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_seat_failed_signins as sp
from db import PROJECT_ROOT

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
MANIFEST = SCENARIOS / "seat-failed-signins.scenario.json"
PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
LABEL_MAX = 24
UNIT_MAX = 16
FIELD_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
# No event row may say what it is; the decision row is the business's own record, so exempt.
LABEL_KEY = re.compile(r"fraud|label|truth|verdict|^is_", re.IGNORECASE)
# The words of a manifest that states a verdict (no leading text).
VERDICT_WORDS = re.compile(r"takeover|stolen|fraud|attack|compromis|breach|hijack", re.IGNORECASE)


@pytest.fixture(scope="module")
def manifest() -> sr.Manifest:
    return sr.load_manifest(MANIFEST, base_dir=PROJECT_ROOT)


@pytest.fixture(scope="module")
def pack(manifest) -> dict[str, list[dict]]:
    return {k: manifest.json_rows(k) for k in manifest.kinds}


@pytest.fixture(scope="module")
def raw() -> dict:
    return json.loads(MANIFEST.read_text("utf-8"))


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def _timed(raw: dict) -> list[dict]:
    return [n for n in raw["nodes"] if n.get("timestamp")]


# ---- The manifest as a whole -----------------------------------------------------------------


def test_the_manifest_declares_eight_file_backed_kinds_places_on_six_and_no_rule_or_lane(
    manifest, raw
):
    assert manifest.id == "seat-failed-signins"
    assert manifest.label == "Platform · failed sign-ins, then a grant"
    assert manifest.kinds == list(sp.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists() and manifest.db_path.name == "seat-failed-signins.db"
    assert manifest.focal == {}
    assert raw["home"] == {"lat": 42, "lng": -100, "zoom": 2.6}, "V10: a camera on its own places"
    placed = [n["kind"] for n in manifest.nodes if "coords" in n]
    assert placed == ["org", "signin", "request_sample", "credential_event", "reset", "decision"]
    assert all(n["coords"] == {"lat": "lat", "lng": "lng"} for n in manifest.nodes if "coords" in n)
    assert raw.get("rules") == [] and raw.get("arrows") == [], "V8: no rule and no arrow"
    assert "lanes" not in raw and "annotations" not in raw and "focal" not in raw


def test_the_manifest_states_no_verdict_in_a_word(raw):
    assert not VERDICT_WORDS.findall(json.dumps(raw))


def test_the_files_are_the_generators_output(manifest):
    built = sp.generate()
    for kind in sp.KINDS:
        on_disk = json.loads((PROJECT_ROOT / manifest._node(kind)["file"]).read_text("utf-8"))
        assert on_disk == built[kind], kind


def test_only_the_decision_and_the_timed_event_kinds_declare_a_timestamp(raw):
    stamped = {n["kind"]: n["timestamp"] for n in _timed(raw)}
    assert stamped == {
        "signin": "timestamp",
        "request_sample": "timestamp",
        "credential_event": "timestamp",
        "reset": "timestamp",
        "usage_hour": "timestamp",
        "decision": "decided_at",
    }
    assert all(not n.get("timestamp") for n in raw["nodes"] if n["kind"] in ("org", "seat"))


# ---- Declared fields are columns -------------------------------------------------------------


def _declared(node: dict) -> set[str]:
    """Every field name a node declares: its headline words, sections, pivots, magnitude, and the
    columns its decision mapping names."""
    named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
    for section in node.get("sections", []):
        named |= set(section["fields"])
    named |= set(node.get("pivotable", []))
    if "magnitude" in node:
        named.add(node["magnitude"])
    if "timestamp" in node:
        named.add(node["timestamp"])
    if "decision" in node:
        named |= set(node["decision"].values())
    return named


def test_every_declared_field_is_a_column_of_every_row_of_its_node(manifest, pack):
    for node in manifest.nodes:
        assert pack[node["kind"]], node["kind"]
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], (node["kind"], section)
        for row in pack[node["kind"]]:
            missing = sorted(f for f in _declared(node) if f not in row)
            assert not missing, (node["kind"], row["id"], missing)


ADDRESS = {"id": "address", "label": "Address", "fields": ["network_id", "ip", "city", "country"]}


def test_the_sections_of_each_changed_kind_are_the_two_a_record_shows(raw):
    sections = {n["kind"]: n.get("sections") for n in raw["nodes"]}
    assert sections["seat"] == [
        {
            "id": "seat",
            "label": "Seat",
            "fields": [
                "seat_id",
                "seat_name",
                "signins_total",
                "addresses",
                "first_signin_on",
                "role",
                "created_on",
                "client",
            ],
        }
    ]
    assert sections["signin"] == [
        {
            "id": "sign-in",
            "label": "Sign-in",
            "fields": [
                "seat_id",
                "outcome",
                "attempts",
                "window_min",
                "method",
                "client",
                "timestamp",
                "seconds_since_previous",
                "km_from_previous",
            ],
        },
        ADDRESS,
    ]
    assert sections["request_sample"] == [
        {
            "id": "request",
            "label": "Request",
            "fields": ["seat_id", "endpoint", "response_code", "timestamp"],
        },
        ADDRESS,
    ]
    assert sections["credential_event"] == [
        {
            "id": "credential",
            "label": "Credential",
            "fields": ["seat_id", "event", "lifetime_h", "scope", "created_in", "timestamp"],
        },
        ADDRESS,
    ]
    assert sections["reset"] == [
        {"id": "reset", "label": "Reset", "fields": ["seat_id", "timestamp"]},
        {"id": "address", "label": "Address", "fields": ["network_id", "city", "country"]},
    ]
    assert sections["org"] is None and sections["decision"] is None


def test_the_pivots_of_every_kind_are_as_they_were(raw):
    pivots = {n["kind"]: n["pivotable"] for n in raw["nodes"]}
    assert pivots == {
        "org": ["org_id"],
        "seat": ["seat_id"],
        "signin": ["seat_id", "network_id"],
        "request_sample": ["seat_id", "network_id"],
        "credential_event": ["seat_id"],
        "reset": ["seat_id"],
        "usage_hour": ["seat_id"],
        "decision": ["seat_id"],
    }


def test_a_node_with_no_time_key_and_only_filler_stamps_declares_omit_timestamp(raw, pack):
    """AMEND-stories part 4: the nodes that name no `timestamp` key and whose rows all hold the
    filler 0 are exactly the ones that declare `omit`, and the key stays on every row."""
    filler = [
        n["kind"]
        for n in raw["nodes"]
        if "timestamp" not in n and all(r.get("timestamp") == 0 for r in pack[n["kind"]])
    ]
    assert filler == ["org", "seat"]
    assert [n["kind"] for n in raw["nodes"] if "omit" in n] == filler
    for node in raw["nodes"]:
        if node["kind"] in filler:
            assert node["omit"] == ["timestamp"], node["kind"]
            assert all("timestamp" in r for r in pack[node["kind"]]), node["kind"]


def test_the_declared_place_columns_are_numbers_on_every_row_of_a_placed_node(manifest, pack):
    for node in manifest.nodes:
        if "coords" not in node:
            continue
        for axis in ("lat", "lng"):
            column = node["coords"][axis]
            assert all(isinstance(r[column], float) for r in pack[node["kind"]]), node["kind"]


def test_the_headline_fields_are_never_empty(manifest, pack):
    """The ticker headline reads only fields every row carries; a column that holds nothing on
    some row (a seat's unstated total) is for the sections and never the headline."""
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for row in pack[node["kind"]]:
            empty = sorted(f for f in named if row.get(f) in (None, ""))
            assert not empty, (node["kind"], row["id"], empty)


def test_no_event_row_carries_a_label(pack):
    for kind, items in pack.items():
        if kind == "decision":
            continue
        for row in items:
            assert not [k for k in row if LABEL_KEY.search(k)], (kind, row["id"])


def test_the_pivot_fields_name_a_seat_a_network_and_an_organisation(manifest, pack):
    declared = {n["kind"]: set(n.get("pivotable", [])) for n in manifest.nodes}
    assert set().union(*declared.values()) == {"org_id", "seat_id", "network_id"}
    for kind, fields in declared.items():
        for row in pack[kind]:
            assert fields <= set(row), (kind, row["id"])
            assert not {f for f in fields if row[f] in (None, "")}, (kind, row["id"])


# ---- The decision node -----------------------------------------------------------------------


def test_the_decision_node_declares_its_mapping_and_every_row_carries_the_fields(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert set(mapping) == {"status", "outcome", "note", "actor", "target", "key", "event"}
    assert (mapping["key"], mapping["event"]) == ("seat_id", "event_ids")
    ids = {r["id"] for k, items in pack.items() if k != "decision" for r in items}
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and set(row["event_ids"]) <= ids


# ---- The magnitude node ----------------------------------------------------------------------


def test_only_the_hourly_requests_declare_a_magnitude_with_bounded_words(manifest, pack):
    assert [n["kind"] for n in manifest.nodes if "magnitude" in n] == ["usage_hour"]
    node = manifest._node("usage_hour")
    assert node["magnitude"] == "requests"
    for word, limit in (("magnitudeLabel", LABEL_MAX), ("magnitudeUnit", UNIT_MAX)):
        assert isinstance(node.get(word), str) and 1 <= len(node[word].strip()) <= limit, word
    assert all(isinstance(r["requests"], int) and r["requests"] > 0 for r in pack["usage_hour"])


# ---- The rows' declarations (root keys `rows` and `fields`) ----------------------------------


def _word_problems(value: object, limit: int) -> list[str]:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
        return [f"{value!r} is not a string of 1 to {limit} characters"]
    return []


def label_problems(raw: dict) -> list[str]:
    """The bounded-string test: every `fields.<f>.label` and `.unit`."""
    problems: list[str] = []
    for name, entry in raw.get("fields", {}).items():
        if not FIELD_NAME.match(name):
            problems.append(f"fields key {name!r} is not a field name")
        problems += _word_problems(entry.get("label"), LABEL_MAX)
        if "unit" in entry:
            problems += _word_problems(entry["unit"], UNIT_MAX)
    return problems


def drift_problems(raw: dict, served: dict[str, list[dict]]) -> list[str]:
    """A declared field name must be a column of the rows it names."""
    problems: list[str] = []
    rows = raw.get("rows")
    if rows is None:
        return problems
    for key in ("by", "member"):
        name = rows.get(key)
        if name is None:
            continue
        if not any(name in n.get("pivotable", []) and n.get("timestamp") for n in raw["nodes"]):
            problems.append(f"rows.{key} {name!r} is in no timed node's pivotable")
        if name not in raw.get("fields", {}):
            problems.append(f"rows.{key} {name!r} has no entry in fields")
        if not any(name in r for n in raw["nodes"] for r in served.get(n["kind"], [])):
            problems.append(f"rows.{key} {name!r} is a column of no row")
    return problems


def _served(manifest: sr.Manifest) -> dict[str, list[dict]]:
    return {k: manifest.json_rows(k) for k in manifest.kinds}


def test_the_pack_groups_rows_by_seat_and_lists_each_seats_networks(manifest, raw):
    assert raw["rows"] == {"by": "seat_id", "member": "network_id"}
    assert "name" not in raw["rows"], "seat_name is on the seat rows only, so no rows.name"
    assert raw["fields"]["seat_id"]["label"] == "Seat"
    assert raw["fields"]["network_id"]["label"] == "Network"
    served = _served(manifest)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []


@pytest.mark.parametrize("key", ["by", "member"])
def test_each_drift_rule_fires_alone_for_rows_by_and_rows_member(manifest, raw, key):
    served = _served(manifest)
    good = raw["rows"][key]
    assert drift_problems(raw, served) == []
    # Pivotable rule alone: seat_name is a column with words, but no timed node pivots on it.
    unpivoted = {
        **raw,
        "rows": {**raw["rows"], key: "seat_name"},
        "fields": {**raw["fields"], "seat_name": {"label": "Name"}},
    }
    assert drift_problems(unpivoted, served) == [
        f"rows.{key} 'seat_name' is in no timed node's pivotable"
    ]
    # Fields rule alone.
    no_entry = {**raw, "fields": {k: v for k, v in raw["fields"].items() if k != good}}
    assert drift_problems(no_entry, served) == [f"rows.{key} {good!r} has no entry in fields"]
    # Column rule alone: pivotable on a timed node and in fields, but no row has the column.
    ghost = f"no_such_{key}"
    ghosted = {
        **raw,
        "rows": {**raw["rows"], key: ghost},
        "nodes": [
            {**n, "pivotable": [*n["pivotable"], ghost]} if n["kind"] == "signin" else n
            for n in raw["nodes"]
        ],
        "fields": {**raw["fields"], ghost: {"label": "Ghost"}},
    }
    assert drift_problems(ghosted, served) == [f"rows.{key} {ghost!r} is a column of no row"]


def test_the_word_test_fails_on_25_characters(raw):
    def with_field(name: str, entry: dict) -> dict:
        return {**raw, "fields": {**raw["fields"], name: entry}}

    assert label_problems(with_field("seat_id", {"label": "x" * 25}))
    assert label_problems(with_field("seat_id", {"label": "x" * 24})) == []
    assert label_problems(with_field("seat_id", {"label": "  "}))
    assert label_problems(with_field("requests", {"label": "R", "unit": "u" * 17}))
    assert label_problems(with_field("bad name", {"label": "R"}))


# ---- The endpoint ----------------------------------------------------------------------------


def test_the_pack_serves_its_rows_through_the_api(client, pack, raw):
    assert (
        client.post("/api/scenario/select", json={"id": "seat-failed-signins"}).status_code == 200
    )
    served = client.get("/api/scenario").json()
    assert served["label"] == raw["label"] and served["home"]["zoom"] == 2.6
    for kind in sp.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == pack[kind]
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    # No rule is declared, so the rule evaluator queues nothing; the one decision is the file's row.
    assert client.get("/api/decisions").json() == []
    assert len(client.get("/api/entities", params={"kind": "decision"}).json()) == 1
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


def test_the_endpoint_serves_the_root_keys_unchanged(client, raw):
    assert (
        client.post("/api/scenario/select", json={"id": "seat-failed-signins"}).status_code == 200
    )
    served = client.get("/api/scenario").json()
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key


def test_the_story_opens_on_its_own_places(manifest, pack):
    # A story's opening view holds its decision: the home is near the decision row's place.
    home = manifest.raw["home"]
    assert home == {"lat": 42, "lng": -100, "zoom": 2.6}
    (row,) = pack["decision"]
    p1, p2 = math.radians(home["lat"]), math.radians(row["lat"])
    dlng = math.radians(row["lng"] - home["lng"])
    cos = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dlng)
    assert math.degrees(math.acos(max(-1.0, min(1.0, cos)))) <= 75
