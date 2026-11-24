"""Record refs (design 2026-11-17-inspector-attributes, item IN4): the three stories declare, per
manifest node, which kinds of record a field's value names, and this file holds each declaration to
the data. A ref is a node-level `refs` object: field name to a list of kind names. The Inspector
reads it through one function and names no field of any pack; so a wrong declaration is caught
here, against the rows, and not on a screen.

The platform story's rows are files, so every value is resolved in the files. The card and account
stories read their event rows from the pack's SQLite database, so their `event_id` values are
resolved there. A missing database fails these tests (build it as the notice says); it does not
skip them.
"""

from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
from db import PROJECT_ROOT
from tests._left_out import require_files

SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
PLATFORM = "platform-access"
CARD = "card-fraud"
ACCOUNT = "priya-ato"

# The table of the design's section 8: story, node kind, the refs that node declares.
DECLARED: dict[tuple[str, str], dict[str, list[str]]] = {
    (PLATFORM, "console_signin"): {"org_id": ["org"]},
    (PLATFORM, "key_event"): {"org_id": ["org"]},
    (PLATFORM, "usage"): {"org_id": ["org"]},
    (PLATFORM, "decision"): {"org_id": ["org"], "event_ids": ["key_event", "usage"]},
    (CARD, "decision"): {"event_id": ["auth", "fraud"]},
    (ACCOUNT, "decision"): {"event_id": ["account_event", "login", "transfer"]},
}
# A node with no entry above declares nothing. The organisation's own id is its identity, so a ref
# on it would offer a link to itself.
NOTHING_DECLARED = [(PLATFORM, "org")]
# Manifests that declare no ref at all.
PACKS_WITHOUT_REFS = ["population", "card-fraud-concordia"]


def _load(story: str) -> sr.Manifest:
    return sr.load_manifest(SCENARIOS / f"{story}.scenario.json", base_dir=PROJECT_ROOT)


@pytest.fixture(scope="module")
def manifests() -> dict[str, sr.Manifest]:
    return {s: _load(s) for s in (PLATFORM, CARD, ACCOUNT)}


def _refs(node: dict) -> dict:
    return node.get("refs", {})


def _values(row: dict, field: str) -> list:
    """The values of one field of a row: the members of a list, or the one scalar."""
    v = row[field]
    return list(v) if isinstance(v, list) else [v]


def _ids(manifest: sr.Manifest, kind: str) -> set[str]:
    """The ids of every record of a kind: the `id` of each row, as the app's adapter gives it."""
    if manifest.source_for(kind) == "json":
        return {str(r["id"]) for r in manifest.json_rows(kind)}
    assert manifest.db_path.exists(), f"{manifest.db_path} is not built"
    con = sqlite3.connect(f"file:{manifest.db_path.as_posix()}?mode=ro", uri=True)
    try:
        return {str(r[0]) for r in con.execute(f"SELECT id FROM ({manifest.query_for(kind)})")}
    finally:
        con.close()


def test_every_story_declares_the_refs_of_the_table(manifests):
    for (story, kind), refs in DECLARED.items():
        assert _refs(manifests[story]._node(kind)) == refs, (story, kind)
    for story, kind in NOTHING_DECLARED:
        assert "refs" not in manifests[story]._node(kind), (story, kind)


def test_a_node_outside_the_table_declares_no_ref(manifests):
    for story, manifest in manifests.items():
        for node in manifest.nodes:
            if (story, node["kind"]) not in DECLARED:
                assert "refs" not in node, (story, node["kind"])


def test_the_two_packs_the_stories_do_not_need_declare_nothing():
    # Both manifests are left out of the public copy (it holds neither pack).
    require_files(*(SCENARIOS / f"{story}.scenario.json" for story in PACKS_WITHOUT_REFS))
    for story in PACKS_WITHOUT_REFS:
        manifest = _load(story)
        assert all("refs" not in n for n in manifest.nodes), story


def test_every_refs_value_is_a_non_empty_list_of_kind_names(manifests):
    for story, manifest in manifests.items():
        for node in manifest.nodes:
            for field, kinds in _refs(node).items():
                assert isinstance(field, str) and field, (story, node["kind"])
                assert isinstance(kinds, list) and kinds, (story, node["kind"], field)
                assert all(isinstance(k, str) for k in kinds), (story, node["kind"], field)
                assert len(set(kinds)) == len(kinds), (story, node["kind"], field)


def test_every_kind_a_ref_names_is_a_node_of_the_manifest(manifests):
    for story, manifest in manifests.items():
        for node in manifest.nodes:
            for field, kinds in _refs(node).items():
                missing = [k for k in kinds if k not in manifest.kinds]
                assert not missing, (story, node["kind"], field, missing)


def test_every_refs_field_is_a_column_of_every_row_of_its_node(manifests):
    for story, manifest in manifests.items():
        for node in manifest.nodes:
            refs = _refs(node)
            if not refs or node["source"] != "json":
                continue
            for row in manifest.json_rows(node["kind"]):
                absent = [f for f in refs if f not in row]
                assert not absent, (story, node["kind"], row["id"], absent)


def test_on_the_platform_story_every_value_resolves_to_a_record_of_a_named_kind(manifests):
    manifest = manifests[PLATFORM]
    checked = 0
    for node in manifest.nodes:
        for field, kinds in _refs(node).items():
            named = set().union(*(_ids(manifest, k) for k in kinds))
            for row in manifest.json_rows(node["kind"]):
                for value in _values(row, field):
                    if value in (None, ""):
                        continue
                    assert value in named, (node["kind"], row["id"], field, value)
                    checked += 1
    assert checked > 0


def test_on_the_card_and_account_stories_every_event_id_resolves_in_the_pack_database(manifests):
    for story in (CARD, ACCOUNT):
        manifest = manifests[story]
        node = manifest._node("decision")
        (field, kinds), *rest = _refs(node).items()
        assert not rest
        named = set().union(*(_ids(manifest, k) for k in kinds))
        rows = manifest.json_rows("decision")
        assert rows, story
        for row in rows:
            assert row[field] in named, (story, row["id"], field, row[field])


def test_the_event_a_decision_names_is_one_of_its_nodes_refs_keys(manifests):
    for story in (PLATFORM, CARD, ACCOUNT):
        node = manifests[story]._node("decision")
        assert node["decision"]["event"] in _refs(node), story


def test_the_served_manifest_carries_refs_through_unchanged(manifests):
    """The backend checks a node's kind, source, query or file and its decision mapping, and
    passes every other key on to the app, so the declaration reaches `refsOf` as written."""
    for (story, kind), refs in DECLARED.items():
        served = json.loads(json.dumps(manifests[story].raw))
        node = next(n for n in served["nodes"] if n["kind"] == kind)
        assert node["refs"] == refs, (story, kind)


@pytest.fixture
def client():
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield TestClient(main.app)
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def test_the_endpoint_the_app_reads_serves_every_declared_ref(client):
    """The app reads the active manifest from /api/scenario, so the key must survive that route."""
    for story in (PLATFORM, CARD, ACCOUNT):
        assert client.post("/api/scenario/select", json={"id": story}).status_code == 200
        nodes = {n["kind"]: n for n in client.get("/api/scenario").json()["nodes"]}
        for (s, kind), refs in DECLARED.items():
            if s == story:
                assert nodes[kind]["refs"] == refs, (story, kind)
        if story == PLATFORM:
            assert "refs" not in nodes["org"]
