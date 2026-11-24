"""The platform-access manifest: five file-backed kinds, declared entirely by the manifest, read
the way the app reads them. The pack's story is tested in test_platform_pack.py (the generator)
and test_platform_decisions.py (the rules and the exported decisions); this file pins the seam
between the manifest and the rows."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed_platform as sp
from db import PROJECT_ROOT
from tests._left_out import require_files

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
MANIFEST = SCENARIOS / "platform-access.scenario.json"
PLACEHOLDER = re.compile(r"\$\{(\w+)\}")
# A platform revocation has no session: these fields are null on it and on nothing else.
SESSION_FIELDS = {"session_id", "device_id", "ip_address", "ip_asn"}
# No event row may say what it is. The decision rows are the business's own record of what it
# decided, so their wording is exempt.
LABEL_KEY = re.compile(r"fraud|label|truth|verdict|^is_", re.IGNORECASE)


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


def test_the_manifest_declares_five_file_backed_kinds_and_two_rules(manifest):
    assert manifest.id == "platform-access" and manifest.label == "Platform · key takeover"
    assert manifest.kinds == list(sp.KINDS)
    assert all(n["source"] == "json" for n in manifest.nodes)
    assert manifest.db_path.exists()
    assert manifest.focal == {}, "a population pack: no single subject"
    assert [(r["id"], r["detector"]) for r in manifest.raw["rules"]] == [
        ("key-after-new-device", "change-after-new-device"),
        ("spend-burst", "magnitude-burst"),
    ]
    for rule in manifest.raw["rules"]:
        assert all(rule["sop"][k].strip() for k in ("what", "brief")), rule["id"]
        # The why keeps its key; its kept words may be none (tests/test_rule_standing_text.py).
        assert isinstance(rule["sop"]["why"], str), rule["id"]


def test_the_files_are_the_generators_output(manifest):
    built = sp.generate()
    for kind in sp.KINDS:
        on_disk = json.loads((PROJECT_ROOT / manifest._node(kind)["file"]).read_text("utf-8"))
        assert on_disk == built[kind], kind


def test_every_headline_and_section_field_is_present_on_every_row(manifest, pack):
    """The ticker headline and the popout sections read only fields every row carries."""
    for node in manifest.nodes:
        named = set(PLACEHOLDER.findall(node["primary"] + node["secondary"]))
        for section in node.get("sections", []):
            assert section["id"] and section["label"] and section["fields"], (node["kind"], section)
            named |= set(section["fields"])
        for row in pack[node["kind"]]:
            missing = sorted(f for f in named if row.get(f) in (None, ""))
            assert not missing, (node["kind"], row["id"], missing)


def test_every_pivot_field_is_declared_and_null_only_on_a_platform_revocation(manifest, pack):
    declared = {n["kind"]: set(n.get("pivotable", [])) for n in manifest.nodes}
    wanted = {
        "org_id",
        "seat_id",
        "session_id",
        "device_id",
        "ip_address",
        "ip_asn",
        "credential_id",
    }
    assert wanted == set().union(*declared.values())
    for kind, fields in declared.items():
        for row in pack[kind]:
            assert fields <= set(row), (kind, row["id"])
            empty = {f for f in fields if row[f] in (None, "")}
            if kind == "key_event" and row["actor"] == "platform":
                assert empty == SESSION_FIELDS, row["id"]
            else:
                assert not empty, (kind, row["id"], empty)
    revoked = [r for r in pack["key_event"] if r["actor"] == "platform"]
    assert len(revoked) == 9 and all(r["event"] == "revoked" for r in revoked)


def test_no_event_row_carries_a_label(pack):
    """The rules read rows that say only what happened. There is no flag for a rule to read."""
    for kind in ("org", "console_signin", "key_event", "usage"):
        for row in pack[kind]:
            assert not [k for k in row if LABEL_KEY.search(k)], (kind, row["id"])


def test_sign_ins_draw_one_path_per_seat_and_usage_declares_its_magnitude(manifest, pack):
    signin = manifest._node("console_signin")
    assert (signin["path"], signin["pathBy"], signin["territory"]) == (True, "seat_id", False)
    usage = manifest._node("usage")
    assert usage["magnitude"] == "spend_usd"
    label, unit = usage.get("magnitudeLabel"), usage.get("magnitudeUnit")
    assert isinstance(label, str) and 1 <= len(label) <= 24, label
    assert isinstance(unit, str) and 1 <= len(unit) <= 16, unit
    assert all(isinstance(u["spend_usd"], float) and u["spend_usd"] > 0 for u in pack["usage"])
    assert [n["kind"] for n in manifest.nodes if "magnitude" in n] == ["usage"]


def test_the_decision_node_declares_its_mapping_and_every_row_carries_the_fields(manifest, pack):
    mapping = manifest._node("decision")["decision"]
    assert (mapping["key"], mapping["event"]) == ("org_id", "event_ids")
    for row in pack["decision"]:
        missing = [f for f in mapping.values() if row.get(f) in (None, "", [])]
        assert not missing, (row["id"], missing)
        assert isinstance(row["event_ids"], list) and all(
            isinstance(e, str) for e in row["event_ids"]
        )


def test_the_annotation_is_reported_context_placed_before_the_first_takeover(manifest, pack):
    (note,) = manifest.raw["annotations"]
    assert "customer-reported" in note["label"]
    assert note["note"].endswith("Reported context, not a platform record.")
    at = datetime.fromisoformat(note["timestamp"])
    first = min(
        datetime.fromisoformat(s["timestamp"])
        for s in pack["console_signin"]
        if s["device_id"] == sp.ATTACK_DEVICE
    )
    assert at.utcoffset() is not None and at.astimezone(UTC).date() == sp.INCIDENT_DAY
    assert at < first, "the email comes before the first stolen sign-in"
    # "An admin at the Austin organisation": the first organisation taken over is the Austin one.
    first_org = next(
        s["org_id"]
        for s in sorted(pack["console_signin"], key=lambda s: s["timestamp"])
        if s["device_id"] == sp.ATTACK_DEVICE
    )
    assert next(o["city"] for o in pack["org"] if o["org_id"] == first_org) == "Austin"
    # "asked for the password and the one-time code": the stolen sign-ins passed both.
    assert {
        s["auth_method"] for s in pack["console_signin"] if s["device_id"] == sp.ATTACK_DEVICE
    } == {"password+otp"}


def test_the_pack_serves_its_rows_through_the_api(client, pack):
    assert client.post("/api/scenario/select", json={"id": "platform-access"}).status_code == 200
    served = client.get("/api/scenario").json()
    assert served["label"] == "Platform · key takeover" and served["home"]["zoom"] == 2
    for kind in sp.KINDS:
        assert client.get("/api/entities", params={"kind": kind}).json() == pack[kind]
    assert client.get("/api/entities", params={"kind": "auth"}).json() == []
    assert len(client.get("/api/decisions").json()) == 20
    client.post("/api/scenario/select", json={"id": "card-fraud"})
    assert client.get("/api/entities", params={"kind": "auth"}).json()


# ---- The rows' declarations (root keys `rows`, `fields`, `lanes`) -------------------------------
# Each root key is checked two ways, and the two are not one test: a field name against the rows
# the endpoint serves (drift), and a word against its length (a bounded string).

LABEL_MAX = 24
UNIT_MAX = 16
FIELD_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")
# pack id -> (rows.by, rows.name, rows.member, the heading word of `by`, the word of `member`)
EXPECTED_ROWS = {
    "platform-access": ("org_id", "org_name", "credential_id", "Organisation", "API key"),
    "card-fraud": ("merchant_name", None, None, "Merchant", None),
    "priya-ato": ("merchant_name", None, None, "Merchant", None),
    "key-many-networks": ("principal_id", None, "network_id", "Key or seat", "Network"),
    "agent-runs-shared-key": ("credential_id", None, "workspace_id", "API key", "Workspace"),
    "seats-two-networks": ("seat_id", None, "network_id", "Seat", "Network"),
    "volume-step": ("workspace_id", None, None, "Workspace", None),
    "seat-failed-signins": ("seat_id", None, "network_id", "Seat", "Network"),
}
UNDECLARED = ("card-fraud-concordia", "population")
# The two manifests the public copy leaves out: a test that reads one skips when it is absent.
LEFT_OUT = ("card-fraud-concordia", "population")


def _raw(pack_id: str) -> dict:
    return json.loads((SCENARIOS / f"{pack_id}.scenario.json").read_text("utf-8"))


def _served_rows(client: TestClient, raw: dict) -> dict[str, list[dict]]:
    """Each kind's rows as the endpoint serves them, for the kinds that have rows."""
    assert client.post("/api/scenario/select", json={"id": raw["id"]}).status_code == 200
    served = {
        n["kind"]: client.get("/api/entities", params={"kind": n["kind"]}).json()
        for n in raw["nodes"]
        if n["source"] in ("sql", "json")
    }
    # A model score is a join column that /api/transactions adds and the bare node query does not
    # carry, so the transaction kinds are read from the route the app reads them from.
    for kind, is_fraud in (("auth", 0), ("fraud", 1)):
        if kind in served:
            rows = client.get("/api/transactions").json()
            served[kind] = [r for r in rows if r["is_fraud"] == is_fraud]
    return served


def _word_problems(value: object, limit: int) -> list[str]:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
        return [f"{value!r} is not a string of 1 to {limit} characters"]
    return []


def _is_depth_only(lane: dict) -> bool:
    """A lane entry that holds only `id` and `depth`: it adds a depth to the lane a node's own
    `magnitude` already gives, and declares no lane of its own (the token story's `usage`)."""
    return set(lane) <= {"id", "depth"} and "depth" in lane


def label_problems(raw: dict) -> list[str]:
    """The bounded-string test: every `fields.<f>.label` and `.unit`, and each lane's words."""
    problems: list[str] = []
    for name, entry in raw.get("fields", {}).items():
        if not FIELD_NAME.match(name):
            problems.append(f"fields key {name!r} is not a field name")
        problems += _word_problems(entry.get("label"), LABEL_MAX)
        if "unit" in entry:
            problems += _word_problems(entry["unit"], UNIT_MAX)
    for lane in raw.get("lanes", []):
        if _is_depth_only(lane):
            continue  # the entry has no words of its own: the node's lane keeps the node's
        problems += _word_problems(lane.get("name"), LABEL_MAX)
        problems += _word_problems(lane.get("label"), LABEL_MAX)
        problems += _word_problems(lane.get("unit"), UNIT_MAX)
    return problems


def _timed_event_kinds(raw: dict, field: str) -> list[dict]:
    """The nodes that carry `field` as events on the timeline: timed, listing it in `pivotable`,
    and not a decision (a decision is a record about an event, not an event)."""
    return [
        n
        for n in raw["nodes"]
        if n.get("timestamp") and "decision" not in n and field in n.get("pivotable", [])
    ]


def drift_problems(raw: dict, served: dict[str, list[dict]]) -> list[str]:
    """The drift test: a declared field name must be a column of the rows it names."""
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
    name_field = rows.get("name")
    if name_field is not None:
        carriers = _timed_event_kinds(raw, rows["by"])
        if not carriers:
            problems.append(f"no timed kind carries rows.by {rows['by']!r}")
        for node in carriers:
            if not all(name_field in r for r in served.get(node["kind"], [])):
                problems.append(f"rows.name {name_field!r} is not a column of {node['kind']!r}")
    return problems


def lane_problems(raw: dict, served: dict[str, list[dict]]) -> list[str]:
    """The lane cases of the manifest table that the account story's declaration meets."""
    problems: list[str] = []
    lanes = raw.get("lanes", [])
    ids = [lane.get("id") for lane in lanes]
    if len(ids) != len(set(ids)):
        problems.append("lane ids are not unique")
    timed = {n["kind"] for n in raw["nodes"] if n.get("timestamp")}
    for lane in lanes:
        problems += _word_problems(lane.get("id"), 64)
        if _is_depth_only(lane):
            continue  # its id and depth are read by depth_problems
        for kind in lane.get("kinds", []):
            if kind not in timed:
                problems.append(f"lane {lane['id']!r} reads {kind!r}, which is not a timed node")
            elif not all(lane["field"] in r for r in served.get(kind, [])):
                problems.append(f"lane {lane['id']!r} field {lane['field']!r} is no column")
        if lane.get("bucket") != "hour" or lane.get("aggregate") not in ("sum", "max"):
            problems.append(f"lane {lane['id']!r} has a bucket or an aggregate that is unknown")
        top = lane.get("top")
        if top is not None and not (isinstance(top, int | float) and top > 0):
            problems.append(f"lane {lane['id']!r} top {top!r} is not above 0")
        words = " ".join(str(lane.get(k, "")) for k in ("name", "label", "unit"))
        if "%" in words or "probab" in words.lower():
            problems.append(f"lane {lane['id']!r} words name a percentage or a probability")
    return problems


def depth_problems(raw: dict, served: dict[str, list[dict]]) -> list[str]:
    """The lane depth cases (D16): `lanes[].depth` declares `split` only; the split field is a
    bounded-label entry of `fields` and a column of every row of the lane's kinds, with a value in
    each (a row with none would be in no line, and the lines would no longer add up to the lane).
    A depth-only entry names the lane a node's own `magnitude` gives, by that node's kind."""
    problems: list[str] = []
    fields = raw.get("fields", {})
    own = {n["kind"] for n in raw["nodes"] if "magnitude" in n}
    for lane in raw.get("lanes", []):
        depth = lane.get("depth")
        if depth is None:
            continue
        lane_id = lane.get("id")
        if set(depth) != {"split"}:
            problems.append(f"lane {lane_id!r} depth declares {sorted(depth)}, not split alone")
            continue
        split = depth["split"]
        if not isinstance(split, str) or not FIELD_NAME.match(split):
            problems.append(f"lane {lane_id!r} split {split!r} is not a field name")
            continue
        if split not in fields:
            problems.append(f"lane {lane_id!r} split {split!r} has no entry in fields")
        else:
            problems += _word_problems(fields[split].get("label"), LABEL_MAX)
        if _is_depth_only(lane):
            if lane_id not in own:
                problems.append(f"lane {lane_id!r} is no node's own lane, and declares no lane")
            kinds = [lane_id]
        else:
            kinds = lane.get("kinds", [])
        for kind in kinds:
            rows = served.get(kind, [])
            if not rows:
                problems.append(f"lane {lane_id!r} reads {kind!r}, which serves no rows")
            if not all(r.get(split) not in (None, "") for r in rows):
                problems.append(f"lane {lane_id!r} split {split!r} is empty on a row of {kind!r}")
    return problems


@pytest.mark.parametrize("pack_id", EXPECTED_ROWS)
def test_each_grouped_pack_declares_its_rows_and_the_heading_words(pack_id):
    by, name, member, by_word, member_word = EXPECTED_ROWS[pack_id]
    raw = _raw(pack_id)
    declared = raw["rows"]
    assert declared["by"] == by
    assert declared.get("name") == name, "no rows.name where the value is the name"
    assert declared.get("member") == member
    assert set(declared) <= {"by", "name", "member"}
    assert raw["fields"][by]["label"] == by_word
    if member:
        assert raw["fields"][member]["label"] == member_word


@pytest.mark.parametrize("pack_id", EXPECTED_ROWS)
def test_the_declared_rows_and_words_hold_on_the_rows_the_endpoint_serves(client, pack_id):
    raw = _raw(pack_id)
    served = _served_rows(client, raw)
    assert drift_problems(raw, served) == []
    assert label_problems(raw) == []


def _pivot_without(raw: dict, field: str, kinds: set[str]) -> list[dict]:
    """The nodes, with `field` taken out of the pivotable of the named kinds."""
    return [
        {**n, "pivotable": [f for f in n["pivotable"] if f != field]} if n["kind"] in kinds else n
        for n in raw["nodes"]
    ]


def _pivot_with(raw: dict, field: str, kind: str) -> list[dict]:
    """The nodes, with `field` added to the pivotable of the named kind."""
    return [
        {**n, "pivotable": [*n["pivotable"], field]} if n["kind"] == kind else n
        for n in raw["nodes"]
    ]


@pytest.mark.parametrize("key", ["by", "member"])
def test_each_drift_rule_fires_alone_for_rows_by_and_rows_member(client, key):
    """Each case breaks one rule and no other, so the list of problems is exactly that rule's
    message: deleting one branch of drift_problems turns exactly one case red."""
    raw = _raw("platform-access")
    served = _served_rows(client, raw)
    good = raw["rows"][key]
    assert drift_problems(raw, served) == []

    # Pivotable rule alone: org_name is a column and has an entry in fields, but no timed node
    # lists it in pivotable. (rows.name is dropped so that rows.by is still read off org_id.)
    rows = {k: v for k, v in raw["rows"].items() if k != "name"}
    unpivoted = {
        **raw,
        "rows": {**rows, key: "org_name"},
        "fields": {**raw["fields"], "org_name": {"label": "Name"}},
    }
    assert drift_problems(unpivoted, served) == [
        f"rows.{key} 'org_name' is in no timed node's pivotable"
    ]

    # Fields rule alone: the field is declared, pivotable and a column, but has no words.
    no_entry = {**raw, "fields": {k: v for k, v in raw["fields"].items() if k != good}}
    assert drift_problems(no_entry, served) == [f"rows.{key} {good!r} has no entry in fields"]

    # Column rule alone: pivotable on a timed node and in fields, but no row has the column.
    ghost = f"no_such_{key}"
    ghosted = {
        **raw,
        "rows": {**raw["rows"], key: ghost},
        "nodes": _pivot_with(raw, ghost, "key_event"),
        "fields": {**raw["fields"], ghost: {"label": "Ghost"}},
    }
    assert drift_problems(ghosted, served) == [f"rows.{key} {ghost!r} is a column of no row"]


@pytest.mark.parametrize("key", ["by", "member"])
def test_the_pivotable_rule_does_not_count_an_untimed_node(client, key):
    """The second clause of the pivotable rule: a column pivotable only on an untimed node breaks
    the rule. The `org` node has no timestamp; org_name is a column of its rows and has words."""
    raw = _raw("platform-access")
    served = _served_rows(client, raw)
    assert not next(n for n in raw["nodes"] if n["kind"] == "org").get("timestamp")
    # rows.name is dropped so that, for rows.by, the no-carrier rule has nothing to say.
    rows = {k: v for k, v in raw["rows"].items() if k != "name"}
    untimed_only = {
        **raw,
        "rows": {**rows, key: "org_name"},
        "nodes": _pivot_with(raw, "org_name", "org"),
        "fields": {**raw["fields"], "org_name": {"label": "Name"}},
    }
    assert drift_problems(untimed_only, served) == [
        f"rows.{key} 'org_name' is in no timed node's pivotable"
    ]


def test_the_rows_name_rule_and_the_no_carrier_rule_each_fire_alone(client):
    raw = _raw("platform-access")
    served = _served_rows(client, raw)
    # rows.name must be a column of every timed kind that carries rows.by: one finding per kind.
    unnamed = {**raw, "rows": {**raw["rows"], "name": "no_such_name"}}
    assert drift_problems(unnamed, served) == [
        f"rows.name 'no_such_name' is not a column of {kind!r}"
        for kind in ("console_signin", "key_event", "usage")
    ]
    # With org_id off the three event kinds, the decision still lists it in pivotable (so the
    # pivotable rule holds) and no timed event kind carries rows.by.
    carriers_gone = {
        **raw,
        "nodes": _pivot_without(raw, "org_id", {"console_signin", "key_event", "usage"}),
    }
    assert drift_problems(carriers_gone, served) == ["no timed kind carries rows.by 'org_id'"]


def test_the_word_test_fails_on_25_characters(client):
    raw = _raw("platform-access")

    def with_field(name: str, entry: dict) -> dict:
        return {**raw, "fields": {**raw["fields"], name: entry}}

    assert label_problems(with_field("org_id", {"label": "x" * 25}))
    assert label_problems(with_field("org_id", {"label": "x" * 24})) == []
    assert label_problems(with_field("org_id", {"label": "  "}))
    assert label_problems(with_field("requests", {"label": "R", "unit": "u" * 17}))
    assert label_problems(with_field("bad name", {"label": "R"}))


def test_rows_name_is_read_off_the_timed_event_kinds_and_not_the_decision_rows(client):
    """A decision lists org_id in pivotable but has no org_name, so it is no event kind of a row."""
    raw = _raw("platform-access")
    served = _served_rows(client, raw)
    assert [n["kind"] for n in _timed_event_kinds(raw, "org_id")] == [
        "console_signin",
        "key_event",
        "usage",
    ]
    assert all("org_name" not in r for r in served["decision"])


def test_the_account_story_declares_its_spend_lane_as_the_manifest_table_gives_it(client):
    raw = _raw("priya-ato")
    assert raw["lanes"] == [
        {
            "id": "account-spend",
            # 24 characters, the most a lane name may be (LABEL_MAX): "Authorizations and
            # transfers" is 28 and the lane reader would drop the lane for it.
            "name": "Authorizations/transfers",
            "label": "Spend",
            "unit": "USD",
            "kinds": ["auth", "transfer"],
            "field": "amount",
            "bucket": "hour",
            "aggregate": "sum",
        }
    ]
    served = _served_rows(client, raw)
    assert lane_problems(raw, served) == []
    assert label_problems(raw) == []
    # The check above is vacuous over a kind with no rows: the 12 transfers are served and each
    # carries a number in `amount`, so the lane has something to add.
    assert len(served["transfer"]) == 12
    assert all(isinstance(r["amount"], int | float) for r in served["transfer"])

    def with_lane(**changes: object) -> dict:
        return {**raw, "lanes": [{**raw["lanes"][0], **changes}]}

    # A kind that is not timed, a field no row has, an unknown aggregate, a top of zero and a word
    # that names a percentage each fail; so do two lanes with one id.
    assert lane_problems(with_lane(kinds=["place"]), served)
    assert lane_problems(with_lane(kinds=["auth", "login"]), served), "login rows carry no amount"
    assert lane_problems(with_lane(field="no_such_column"), served)
    assert lane_problems(with_lane(aggregate="mean"), served)
    assert lane_problems(with_lane(top=0), served)
    assert lane_problems(with_lane(unit="% of fraud"), served)
    assert lane_problems({**raw, "lanes": [raw["lanes"][0], raw["lanes"][0]]}, served)
    # The token lane is the node's own, so the token story declares no lane of its own here: its one
    # entry holds an id and a depth only (D16; this line pinned "no lanes key" before it).
    assert all(_is_depth_only(lane) for lane in _raw("platform-access")["lanes"])


# Rewritten on purpose by LM2: the account test above pinned that the card story declared no lane.
def test_the_card_story_declares_its_two_lanes_as_the_manifest_table_gives_them(client):
    raw = _raw("card-fraud")
    spend = {
        "id": "card-spend",
        "name": "Authorizations",
        "label": "Spend",
        "unit": "USD",
        "kinds": ["auth", "fraud"],
        "field": "amount",
        "bucket": "hour",
        "aggregate": "sum",
    }
    rank = {
        **spend,
        "id": "card-rank",
        "label": "Highest model rank",
        "unit": "pct",
        "field": "ml_percentile",
        "aggregate": "max",
    }
    assert raw["lanes"] == [spend, rank], "no top is declared on either lane"
    served = _served_rows(client, raw)
    assert served["auth"] and served["fraud"]
    assert lane_problems(raw, served) == []
    assert label_problems(raw) == []

    # The rank lane reads a join column: the endpoint's rows carry it, the table's do not.
    assert all("ml_percentile" in r for k in ("auth", "fraud") for r in served[k])

    def with_lanes(*lanes: dict) -> dict:
        return {**raw, "lanes": list(lanes)}

    assert lane_problems(with_lanes(spend, {**rank, "id": "card-spend"}), served), "ids are unique"
    assert lane_problems(with_lanes(spend, {**rank, "field": "no_such_column"}), served)
    assert lane_problems(with_lanes(spend, {**rank, "label": "Probability of fraud"}), served)
    assert lane_problems(with_lanes(spend, {**rank, "unit": "%"}), served)


def test_the_token_story_declares_the_networks_its_spend_lane_opens_into(client):
    """The lane opens into the networks it came from. The entry holds the lane's id
    and its depth only; the words are the node's own, and the field's word is `fields.ip_asn`."""
    raw = _raw("platform-access")
    assert raw["lanes"] == [{"id": "usage", "depth": {"split": "ip_asn"}}]
    assert raw["fields"]["ip_asn"] == {"label": "Network"}
    served = _served_rows(client, raw)
    assert depth_problems(raw, served) == []
    assert lane_problems(raw, served) == []
    assert label_problems(raw) == []
    # Six networks, each on a usage row, so six lines that add up to the lane's bar in every hour.
    assert len({r["ip_asn"] for r in served["usage"]}) == 6
    assert all(r["ip_asn"] for r in served["usage"])


def test_the_depth_rules_each_fire_alone(client):
    raw = _raw("platform-access")
    served = _served_rows(client, raw)
    good = {"id": "usage", "depth": {"split": "ip_asn"}}

    def with_lane(lane: dict, fields: dict | None = None) -> dict:
        return {**raw, "lanes": [lane], "fields": fields if fields is not None else raw["fields"]}

    # Split alone: any other key is a measure line, which is not supported.
    measures = with_lane({**good, "depth": {"split": "ip_asn", "measures": ["requests"]}})
    assert depth_problems(measures, served) == [
        "lane 'usage' depth declares ['measures', 'split'], not split alone"
    ]
    # A split that is not a field name.
    assert depth_problems(with_lane({**good, "depth": {"split": "ip asn"}}), served) == [
        "lane 'usage' split 'ip asn' is not a field name"
    ]
    # A split with no words in fields, and one with a label of 25 characters.
    no_entry = {k: v for k, v in raw["fields"].items() if k != "ip_asn"}
    assert depth_problems(with_lane(good, no_entry), served) == [
        "lane 'usage' split 'ip_asn' has no entry in fields"
    ]
    assert depth_problems(with_lane(good, {**raw["fields"], "ip_asn": {"label": "x" * 25}}), served)
    # A split that no row carries, and one that is empty on a row.
    ghost = {**raw["fields"], "no_such_column": {"label": "Ghost"}}
    no_column = with_lane({**good, "depth": {"split": "no_such_column"}}, ghost)
    assert depth_problems(no_column, served) == [
        "lane 'usage' split 'no_such_column' is empty on a row of 'usage'"
    ]
    emptied = {**served, "usage": [{**served["usage"][0], "ip_asn": ""}, *served["usage"][1:]]}
    assert depth_problems(with_lane(good), emptied) == [
        "lane 'usage' split 'ip_asn' is empty on a row of 'usage'"
    ]
    # A depth-only entry whose id is no node's own lane declares no lane at all.
    unnamed = depth_problems(with_lane({**good, "id": "no_lane"}), served)
    assert unnamed[0] == "lane 'no_lane' is no node's own lane, and declares no lane"


@pytest.mark.parametrize("pack_id", ["card-fraud", "priya-ato"])
def test_the_card_and_account_stories_declare_no_depth(pack_id):
    assert not any("depth" in lane for lane in _raw(pack_id)["lanes"])


@pytest.mark.parametrize("pack_id", UNDECLARED)
def test_a_pack_that_declares_nothing_keeps_todays_bar(pack_id):
    if pack_id in LEFT_OUT:
        require_files(SCENARIOS / f"{pack_id}.scenario.json")
    assert not {"rows", "fields", "lanes"} & set(_raw(pack_id))


# The population pack's database is built by a seed and is not in the repository, so it cannot be
# selected here; its file is covered by the test above.
@pytest.mark.parametrize("pack_id", [*EXPECTED_ROWS, "card-fraud-concordia"])
def test_the_endpoint_serves_the_root_keys_unchanged(client, pack_id):
    if pack_id in LEFT_OUT:
        require_files(SCENARIOS / f"{pack_id}.scenario.json")
    raw = _raw(pack_id)
    assert client.post("/api/scenario/select", json={"id": pack_id}).status_code == 200
    served = client.get("/api/scenario").json()
    for key in ("rows", "fields", "lanes"):
        assert served.get(key) == raw.get(key), key
