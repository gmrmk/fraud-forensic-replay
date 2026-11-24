"""The guard for the five newer stories (key-many-networks, seat-failed-signins,
agent-runs-shared-key, seats-two-networks, volume-step): every row that exists today stays as it
is, and whatever is added keeps the rules for invented story data.

The rows of today are copied byte for byte under tests/golden/stories-rows-original/ (one
folder per story, plus its manifest), made before any seed changed. Each rule below is a pure
function that returns a list of problems, so a test can show the rule bites by feeding it a broken
copy built in memory; the parametrised tests assert that the real data has no problem.

What this file does not do: it states no count and no value of any story (the pack tests do), it
reads no clock and no random source, and it never writes a file.
"""

from __future__ import annotations

import ipaddress
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

import seed_agent_runs_shared_key as ar
import seed_key_many_networks as km
import seed_seat_failed_signins as sf
import seed_seats_two_networks as st
import seed_volume_step as vs
from db import PROJECT_ROOT

Row = dict[str, Any]
Rows = dict[str, list[Row]]  # kind -> rows, in file order
Node = dict[str, Any]

STORIES = (
    "key-many-networks",
    "seat-failed-signins",
    "agent-runs-shared-key",
    "seats-two-networks",
    "volume-step",
)
GOLDEN = Path(__file__).resolve().parent / "golden" / "stories-rows-original"
# The rows as the stories data left them, before the networks were all placed:
# one folder per story, the kind files only.
LANDED = Path(__file__).resolve().parent / "golden" / "stories-rows-unplaced"
SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"

# The stems a new value or label must not hold, matched anywhere in a word and without regard to
# case (so "both" or "robot" in a new value trips "bot"). "residential proxy" is the data's own
# network type, names no conclusion, and is left out of this list on purpose.
CONCLUSION_STEMS = (
    "fraud",
    "suspicious",
    "takeover",
    "compromised",
    "stolen",
    "attack",
    "abuse",
    "malicious",
    "anomal",
    "unusual",
    "risk",
    "threat",
    "bot",
)
CONCLUSION_PATTERN = re.compile("|".join(CONCLUSION_STEMS), re.IGNORECASE)
# A key that says what a row is: a label, a verdict or a truth flag. Only a decision row may.
VERDICT_KEY = re.compile(r"fraud|label|truth|verdict|^is_", re.IGNORECASE)
FIELD_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
DOC_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24", "2001:db8::/32")
)
DOC_HOST_SUFFIXES = (".example.com", ".example.net", ".example.org")


# ---------------------------------------------------------------------------------- loading


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _manifest(story: str) -> Node:
    return _read(SCENARIOS / f"{story}.scenario.json")


def _golden_manifest(story: str) -> Node:
    return _read(GOLDEN / f"{story}.scenario.json")


def _kinds(manifest: Node) -> list[str]:
    return [n["kind"] for n in manifest["nodes"]]


def _rows(story: str, manifest: Node) -> Rows:
    return {k: _read(PROJECT_ROOT / "data" / story / f"{k}.json") for k in _kinds(manifest)}


def _golden_rows(story: str) -> Rows:
    return {p.stem: _read(p) for p in sorted((GOLDEN / story).glob("*.json"))}


def _landed_rows(story: str) -> Rows:
    return {p.stem: _read(p) for p in sorted((LANDED / story).glob("*.json"))}


def _decision_node(manifest: Node) -> Node:
    (node,) = [n for n in manifest["nodes"] if "decision" in n]
    return node


def _same(a: Any, b: Any) -> bool:
    """Equal in value and in type (0 is not False, 1 is not 1.0)."""
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def _strings(value: Any) -> list[str]:
    """Every string inside a value, walking lists and dicts."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    return []


def _invented_org_names() -> dict[str, set[str]]:
    """Each generator's own invented organisation names, read from its module."""
    coined = {a + b for a in st.ORG_STEMS[0] for b in st.ORG_STEMS[1]}
    return {
        "key-many-networks": set(km.ORG_NAMES),
        "seat-failed-signins": set(sf.ORG_NAMES),
        "agent-runs-shared-key": {ar.ORG_NAME},
        "seats-two-networks": {f"{s} {suffix}" for s in coined for suffix in st.ORG_SUFFIXES},
        "volume-step": {vs.ORG_NAME},
    }


# ---------------------------------------------------------------------------------- the rules


def kept_problems(golden: Rows, new: Rows, decision_kind: str) -> list[str]:
    """Every golden row keeps its id, its place in its kind's file and every key and value; a
    decision row may only gain lat and lng; any other kind may gain any key."""
    problems: list[str] = []
    for kind, old_rows in golden.items():
        if kind not in new:
            problems.append(f"{kind}: the kind is gone")
            continue
        old_ids = [r["id"] for r in old_rows]
        new_ids = [r["id"] for r in new[kind]]
        if old_ids != new_ids:
            problems.append(f"{kind}: ids {new_ids} are not {old_ids}")
            continue
        for old, fresh in zip(old_rows, new[kind], strict=True):
            for key, value in old.items():
                if key not in fresh:
                    problems.append(f"{kind} {old['id']}: key {key!r} is gone")
                elif not _same(fresh[key], value):
                    problems.append(f"{kind} {old['id']}: {key!r} is {fresh[key]!r}, was {value!r}")
            extra = set(fresh) - set(old)
            if kind == decision_kind and not extra <= {"lat", "lng"}:
                problems.append(f"{kind} {old['id']}: gained {sorted(extra - {'lat', 'lng'})}")
    return problems


def landed_problems(landed: Rows, new: Rows, decision_kind: str) -> list[str]:
    """Every landed row keeps its id, its place in its file and every key and value it has; a
    decision row is equal as a whole row, and no kind gains or loses a row. A row may gain keys."""
    problems: list[str] = []
    for kind, old_rows in landed.items():
        if kind not in new:
            problems.append(f"{kind}: the kind is gone")
            continue
        old_ids = [r["id"] for r in old_rows]
        new_ids = [r["id"] for r in new[kind]]
        if old_ids != new_ids:
            problems.append(f"{kind}: ids {new_ids} are not {old_ids}")
            continue
        for old, fresh in zip(old_rows, new[kind], strict=True):
            if kind == decision_kind and not _same(old, fresh):
                problems.append(f"{kind} {old['id']}: the decision row is not as it landed")
                continue
            for key, value in old.items():
                if key not in fresh:
                    problems.append(f"{kind} {old['id']}: key {key!r} is gone")
                elif not _same(fresh[key], value):
                    problems.append(f"{kind} {old['id']}: {key!r} is {fresh[key]!r}, was {value!r}")
    return problems


def decision_problems(golden: Rows, new: Rows, manifest: Node) -> list[str]:
    """The story keeps exactly one decision, with the status and the outcome it has today."""
    nodes = [n for n in manifest["nodes"] if "decision" in n]
    if len(nodes) != 1:
        return [f"{len(nodes)} decision nodes"]
    kind, mapping = nodes[0]["kind"], nodes[0]["decision"]
    if len(new[kind]) != 1 or len(golden[kind]) != 1:
        return [f"{kind}: {len(new[kind])} rows, today {len(golden[kind])}"]
    problems = []
    for part in ("status", "outcome"):
        key = mapping[part]
        if not _same(new[kind][0].get(key), golden[kind][0].get(key)):
            problems.append(f"{kind}: {key!r} is {new[kind][0].get(key)!r}")
    return problems


def _timed_nodes(manifest: Node) -> list[Node]:
    return [n for n in manifest["nodes"] if "timestamp" in n and "decision" not in n]


def span_problems(golden_manifest: Node, golden: Rows, manifest: Node, new: Rows) -> list[str]:
    """Every timed row of the manifest, new kinds included, has an offset of zero and lies inside
    today's span: the earliest golden stamp to the golden decision's own time."""
    stamps = [
        datetime.fromisoformat(r[n["timestamp"]])
        for n in _timed_nodes(golden_manifest)
        for r in golden[n["kind"]]
    ]
    decision = _decision_node(golden_manifest)
    low = min(stamps)
    high = datetime.fromisoformat(golden[decision["kind"]][0][decision["timestamp"]])
    problems = []
    for node in _timed_nodes(manifest):
        for row in new[node["kind"]]:
            value = row[node["timestamp"]]
            if not isinstance(value, str):
                problems.append(f"{node['kind']} {row['id']}: stamp {value!r} is not a string")
                continue
            at = datetime.fromisoformat(value)
            if at.utcoffset() != timedelta(0):  # also true of a stamp with no offset at all
                problems.append(f"{node['kind']} {row['id']}: {value} has no zero offset")
            elif not low <= at <= high:
                problems.append(f"{node['kind']} {row['id']}: {value} is outside {low}..{high}")
    return problems


def address_problems(new: Rows) -> list[str]:
    """Every `ip` is a documentation address; every `host_name` is under an example domain."""
    problems = []
    for kind, rows in new.items():
        for row in rows:
            if "ip" in row:
                try:
                    ok = any(ipaddress.ip_address(row["ip"]) in n for n in DOC_NETWORKS)
                except ValueError:
                    ok = False
                if not ok:
                    problems.append(f"{kind} {row['id']}: ip {row['ip']!r}")
            if "host_name" in row and not str(row["host_name"]).endswith(DOC_HOST_SUFFIXES):
                problems.append(f"{kind} {row['id']}: host_name {row['host_name']!r}")
    return problems


def place_problems(manifest: Node, new: Rows) -> list[str]:
    """A story that places any kind places its decision; every row of a kind that declares
    `coords` holds a number for each key the coords name, inside the range of a coordinate."""
    placed = [n for n in manifest["nodes"] if "coords" in n]
    if not placed:
        return []
    problems = []
    if "coords" not in _decision_node(manifest):
        problems.append("a node declares coords but the decision node does not")
    for node in placed:
        coords = node["coords"]
        for axis, bound in (("lat", 90), ("lng", 180)):
            for row in new[node["kind"]]:
                value = row.get(coords.get(axis, axis))
                if (
                    isinstance(value, bool)
                    or not isinstance(value, int | float)
                    or not -bound <= value <= bound
                ):
                    problems.append(f"{node['kind']} {row['id']}: {axis} is {value!r}")
    return problems


def _place_keys(node: Node) -> set[str]:
    coords = node.get("coords")
    return {v for v in coords.values() if isinstance(v, str)} if isinstance(coords, dict) else set()


def filter_problems(node: Node, rows: list[Row]) -> list[str]:
    """A node's `filter`, when present: exactly `field` and `label`; `field` is a plain name that
    is neither the node's time key nor a place key and is a key of every row; `label` is 1 to 24
    characters after trimming."""
    if "filter" not in node:
        return []
    spec = node["filter"]
    if not isinstance(spec, dict) or set(spec) != {"field", "label"}:
        return [f"{node['kind']}: filter is not exactly field and label"]
    field, label = spec["field"], spec["label"]
    if not isinstance(field, str) or not FIELD_NAME.match(field):
        return [f"{node['kind']}: filter field {field!r} is not a field name"]
    problems = []
    if field == node.get("timestamp") or field in _place_keys(node):
        problems.append(f"{node['kind']}: filter field {field!r} is a time or place key")
    if not isinstance(label, str) or not 1 <= len(label.strip()) <= 24:
        problems.append(f"{node['kind']}: filter label {label!r} is not 1 to 24 characters")
    if any(field not in r for r in rows):
        problems.append(f"{node['kind']}: filter field {field!r} is not a key of every row")
    return problems


def key_problems(new: Rows, decision_kind: str) -> list[str]:
    """No key of a non-decision row says what a row is."""
    return [
        f"{kind}: key {key!r}"
        for kind, rows in new.items()
        if kind != decision_kind
        for key in sorted({k for r in rows for k in r})
        if VERDICT_KEY.search(key)
    ]


def _labels(manifest: Node) -> list[str]:
    """Every node label, section label and filter label of a manifest."""
    labels = []
    for node in manifest["nodes"]:
        labels.append(node.get("label", ""))
        labels += [s.get("label", "") for s in node.get("sections", [])]
        spec = node.get("filter")
        if isinstance(spec, dict):
            labels.append(str(spec.get("label", "")))
    return labels


def conclusion_problems(
    golden_manifest: Node,
    golden: Rows,
    manifest: Node,
    new: Rows,
    org_names: set[str],
) -> list[str]:
    """No value or label that is new states a conclusion, and every `org_name` is invented.

    New is: every string of a row with no golden row, the string values of every key a golden row
    does not have, and every node label, section label and filter label the golden manifest does
    not hold. An `org_name` is checked on every row, new or not."""
    problems = []
    for kind, rows in new.items():
        old_by_id = {r["id"]: r for r in golden.get(kind, [])}
        for row in rows:
            old = old_by_id.get(row["id"])
            fresh = row if old is None else {k: v for k, v in row.items() if k not in old}
            for key, value in fresh.items():
                for text in _strings(value):
                    if CONCLUSION_PATTERN.search(text):
                        problems.append(f"{kind} {row['id']}: {key!r} holds {text!r}")
            if "org_name" in row and row["org_name"] not in org_names:
                problems.append(f"{kind} {row['id']}: org_name {row['org_name']!r} is not invented")
    held = set(_labels(golden_manifest))
    problems += [
        f"manifest label {label!r}"
        for label in _labels(manifest)
        if label not in held and CONCLUSION_PATTERN.search(label)
    ]
    return problems


def omit_problems(manifest: Node, new: Rows) -> list[str]:
    """A node's `omit`, when present, is a list of plain strings, each a key of every row of the
    node; none is the node's own time key, a place key or a key one of its sections lists."""
    problems = []
    for node in manifest["nodes"]:
        if "omit" not in node:
            continue
        kind, omit = node["kind"], node["omit"]
        if not isinstance(omit, list) or not all(isinstance(k, str) for k in omit):
            problems.append(f"{kind}: omit is not a list of strings")
            continue
        listed = {f for s in node.get("sections", []) for f in s.get("fields", [])}
        shown = {node.get("timestamp")} | _place_keys(node) | listed
        for key in omit:
            if any(key not in r for r in new[kind]):
                problems.append(f"{kind}: omit names {key!r}, which is not a key of every row")
            if key in shown:
                problems.append(f"{kind}: omit names {key!r}, which the node draws")
    return problems


# ---------------------------------------------------------------------------------- the tests


@pytest.fixture(scope="module", params=STORIES)
def story(request: pytest.FixtureRequest) -> dict[str, Any]:
    name: str = request.param
    manifest = _manifest(name)
    return {
        "name": name,
        "manifest": manifest,
        "golden_manifest": _golden_manifest(name),
        "rows": _rows(name, manifest),
        "golden": _golden_rows(name),
    }


def test_the_golden_copies_are_whole(story):
    # A guard over an empty or missing folder would pass on nothing.
    assert sorted(story["golden"]) == sorted(_kinds(story["golden_manifest"]))
    assert all(story["golden"].values())


def test_the_golden_folder_holds_35_row_files_and_5_manifests():
    files = list(GOLDEN.rglob("*.json"))
    assert sum(1 for p in files if p.parent != GOLDEN) == 35
    assert sum(1 for p in files if p.parent == GOLDEN) == 5


def test_every_row_of_today_keeps_its_place_its_id_and_its_values(story):
    decision_kind = _decision_node(story["manifest"])["kind"]
    assert kept_problems(story["golden"], story["rows"], decision_kind) == []


def test_the_landed_folder_holds_the_41_row_files_of_the_five_stories():
    files = list(LANDED.rglob("*.json"))
    assert len(files) == 41
    assert sorted(p.name for p in LANDED.iterdir()) == sorted(STORIES)


def test_every_row_the_stories_piece_landed_keeps_its_values(story):
    landed = _landed_rows(story["name"])
    assert sorted(landed) == sorted(_kinds(story["manifest"]))
    assert all(landed.values())
    decision_kind = _decision_node(story["manifest"])["kind"]
    assert landed_problems(landed, story["rows"], decision_kind) == []


def test_each_story_keeps_exactly_one_decision(story):
    assert decision_problems(story["golden"], story["rows"], story["manifest"]) == []


def test_every_timed_row_lies_inside_todays_span(story):
    problems = span_problems(
        story["golden_manifest"], story["golden"], story["manifest"], story["rows"]
    )
    assert problems == []


def test_addresses_and_host_names_are_documentation_values(story):
    assert address_problems(story["rows"]) == []


def test_a_placed_story_places_its_decision(story):
    assert place_problems(story["manifest"], story["rows"]) == []


def test_a_filter_names_a_column_of_every_row(story):
    problems = [
        p for n in story["manifest"]["nodes"] for p in filter_problems(n, story["rows"][n["kind"]])
    ]
    assert problems == []


def test_no_new_key_says_what_a_row_is(story):
    decision_kind = _decision_node(story["manifest"])["kind"]
    assert key_problems(story["rows"], decision_kind) == []


def test_no_new_value_or_label_states_a_conclusion(story):
    problems = conclusion_problems(
        story["golden_manifest"],
        story["golden"],
        story["manifest"],
        story["rows"],
        _invented_org_names()[story["name"]],
    )
    assert problems == []


def test_every_omit_names_a_key_the_node_does_not_draw(story):
    assert omit_problems(story["manifest"], story["rows"]) == []


# ------------------------------------------------- each rule bites a broken copy (in memory)


def _copy(value: Any) -> Any:
    return json.loads(json.dumps(value))


@pytest.fixture(scope="module")
def sample() -> dict[str, Any]:
    # Built from the golden copies only, so these self-tests never change when a story changes.
    name = "key-many-networks"
    manifest = _golden_manifest(name)
    return {
        "manifest": manifest,
        "golden_manifest": _golden_manifest(name),
        "rows": _golden_rows(name),
        "golden": _golden_rows(name),
    }


def test_the_kept_rule_bites(sample):
    golden = sample["golden"]
    dropped = _copy(golden)
    dropped["reset"] = dropped["reset"][1:]
    assert kept_problems(golden, dropped, "decision")
    changed = _copy(golden)
    changed["org"][0]["org_name"] = "Other Name"
    assert kept_problems(golden, changed, "decision")
    retyped = _copy(golden)
    retyped["org"][0]["timestamp"] = False
    assert kept_problems(golden, retyped, "decision")
    lost_key = _copy(golden)
    del lost_key["org"][0]["plan"]
    assert kept_problems(golden, lost_key, "decision")
    extra_on_decision = _copy(golden)
    extra_on_decision["decision"][0]["note_extra"] = "x"
    assert kept_problems(golden, extra_on_decision, "decision")
    placed = _copy(golden)
    placed["decision"][0].update(lat=1.5, lng=2.5)
    placed["org"][0]["anything"] = 1
    assert kept_problems(golden, placed, "decision") == []
    assert kept_problems(golden, golden, "decision") == []


def test_the_landed_rule_bites(sample):
    landed = sample["golden"]
    assert landed_problems(landed, landed, "decision") == []
    gained = _copy(landed)
    gained["reset"][0]["city"] = "Anywhere"
    assert landed_problems(landed, gained, "decision") == []  # a new key is allowed
    changed = _copy(landed)
    changed["reset"][0]["seat_id"] = "seat-1"
    assert landed_problems(landed, changed, "decision")
    dropped = _copy(landed)
    dropped["reset"] = dropped["reset"][1:]
    assert landed_problems(landed, dropped, "decision")
    placed = _copy(landed)
    placed["decision"][0]["lat"] = 1.5  # unlike the first guard, a decision may not even gain
    assert landed_problems(landed, placed, "decision")


def test_the_decision_rule_bites(sample):
    golden, manifest = sample["golden"], sample["manifest"]
    two = _copy(golden)
    two["decision"].append(_copy(two["decision"][0]))
    assert decision_problems(golden, two, manifest)
    changed = _copy(golden)
    changed["decision"][0]["status"] = "FAIL"
    assert decision_problems(golden, changed, manifest)


def test_the_span_rule_bites(sample):
    args = (sample["golden_manifest"], sample["golden"], sample["manifest"])
    late = _copy(sample["rows"])
    late["reset"][0]["timestamp"] = "2026-12-31T00:00:00+00:00"
    assert span_problems(*args, late)
    offset = _copy(sample["rows"])
    offset["reset"][0]["timestamp"] = "2026-11-09T10:00:00-08:00"
    assert span_problems(*args, offset)
    naive = _copy(sample["rows"])
    naive["reset"][0]["timestamp"] = "2026-11-09T18:00:00"
    assert span_problems(*args, naive)
    assert span_problems(*args, sample["rows"]) == []


def test_the_address_rule_bites(sample):
    bad_ip = _copy(sample["rows"])
    bad_ip["org"][0]["ip"] = "8.8.8.8"
    assert address_problems(bad_ip)
    bad_host = _copy(sample["rows"])
    bad_host["org"][0]["host_name"] = "host.example.co"
    assert address_problems(bad_host)
    fine = _copy(sample["rows"])
    fine["org"][0].update(ip="203.0.113.9", host_name="cpe-1.res.example.net")
    assert address_problems(fine) == []


def test_the_place_rule_bites(sample):
    manifest, rows = _copy(sample["manifest"]), _copy(sample["rows"])
    for node in manifest["nodes"]:
        if node["kind"] == "org":
            node["coords"] = {"lat": "lat", "lng": "lng"}
    for row in rows["org"]:
        row.update(lat=1.0, lng=2.0)
    assert place_problems(manifest, rows)  # the decision node declares no coords
    for node in manifest["nodes"]:
        if node["kind"] == "decision":
            node["coords"] = {"lat": "lat", "lng": "lng"}
    for row in rows["decision"]:
        row.update(lat=1.0, lng=2.0)
    assert place_problems(manifest, rows) == []
    rows["org"][0]["lat"] = True
    assert place_problems(manifest, rows)
    rows["org"][0]["lat"] = 91
    assert place_problems(manifest, rows)
    rows["org"][0]["lat"] = 1.0
    del rows["org"][0]["lng"]
    assert place_problems(manifest, rows)


def test_the_filter_rule_bites():
    node = {"kind": "x", "timestamp": "when", "coords": {"lat": "la", "lng": "lo"}}
    rows = [{"id": "1", "colour": "a"}, {"id": "2", "colour": "b"}]
    good = {**node, "filter": {"field": "colour", "label": "Colour"}}
    assert filter_problems(good, rows) == []
    for spec in (
        {"field": "missing", "label": "Colour"},
        {"field": "colour", "label": "  "},
        {"field": "colour", "label": "x" * 25},
        {"field": "when", "label": "Time"},
        {"field": "la", "label": "Place"},
        {"field": "9bad", "label": "Colour"},
        {"field": "colour", "label": "Colour", "extra": 1},
        {"field": "colour"},
        "colour",
    ):
        assert filter_problems({**node, "filter": spec}, rows), spec
    assert filter_problems(node, rows) == []


def test_the_key_rule_bites(sample):
    rows = _copy(sample["rows"])
    rows["org"][0]["is_flagged"] = True
    assert key_problems(rows, "decision")
    rows = _copy(sample["rows"])
    rows["org"][0]["verdict_text"] = "x"
    assert key_problems(rows, "decision")
    rows = _copy(sample["rows"])
    rows["decision"][0]["target_label"] = "kept"  # a decision row may
    assert key_problems(rows, "decision") == []


def test_the_conclusion_rule_bites(sample):
    args = (sample["golden_manifest"], sample["golden"], sample["manifest"])
    names = set(km.ORG_NAMES)
    assert conclusion_problems(*args, sample["rows"], names) == []
    new_row = _copy(sample["rows"])
    new_row["reset"].append({"id": "rs-9999", "note": "Stolen key"})
    assert conclusion_problems(*args, new_row, names)
    new_key = _copy(sample["rows"])
    new_key["org"][0]["scopes"] = ["files", "an UNUSUAL thing"]  # inside a list of strings
    assert conclusion_problems(*args, new_key, names)
    new_kind = _copy(sample["rows"])
    new_kind["signin"] = [{"id": "si-0001", "method": "robot"}]  # "bot" inside a word
    assert conclusion_problems(*args, new_kind, names)
    # An old value is not scanned: "Dunsley Robotics" holds "bot" and is there today.
    assert any(r["org_name"] == "Dunsley Robotics" for r in sample["rows"]["org"])
    foreign = _copy(sample["rows"])
    foreign["org"][0]["org_name"] = "Acme Real Bank"
    assert conclusion_problems(*args, foreign, names)
    manifest = _copy(sample["manifest"])
    manifest["nodes"][0]["sections"][0]["label"] = "Takeover"
    assert conclusion_problems(args[0], args[1], manifest, sample["rows"], names)
    manifest = _copy(sample["manifest"])
    manifest["nodes"][0]["filter"] = {"field": "org_id", "label": "Threat"}
    assert conclusion_problems(args[0], args[1], manifest, sample["rows"], names)
    manifest = _copy(sample["manifest"])
    manifest["nodes"][0]["label"] = "Organisation"  # a label the golden manifest holds
    assert conclusion_problems(args[0], args[1], manifest, sample["rows"], names) == []
    # "residential proxy" is the data's network type and is not a stem.
    assert not CONCLUSION_PATTERN.search("residential proxy")


def test_the_omit_rule_bites(sample):
    rows = sample["rows"]
    manifest = _copy(sample["manifest"])
    org = manifest["nodes"][0]
    assert org["kind"] == "org" and "timestamp" not in org
    org["omit"] = ["timestamp"]
    assert omit_problems(manifest, rows) == []  # the filler the Inspector leaves out
    org["omit"] = ["timestampp"]  # a misspelt name
    assert omit_problems(manifest, rows)
    org["omit"] = "timestamp"  # not a list
    assert omit_problems(manifest, rows)
    org["omit"] = ["timestamp", 3]  # not plain strings
    assert omit_problems(manifest, rows)
    org["omit"] = ["org_name"]  # a key a section lists
    assert omit_problems(manifest, rows)
    org["omit"] = ["id"]
    assert omit_problems(manifest, rows) == []
    org["coords"] = {"lat": "id", "lng": "lng"}  # a place key
    assert any("draws" in p for p in omit_problems(manifest, rows))
    manifest = _copy(sample["manifest"])
    next(n for n in manifest["nodes"] if n["kind"] == "reset")["omit"] = ["timestamp"]
    assert omit_problems(manifest, rows)  # the node's own time key
