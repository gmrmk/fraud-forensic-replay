"""The marks part of a version 2 notes file (check_file and check_file_marks).

A file refusal speaks in the file's few codes (bad_file, too_large, bad_scenario, card_number) with
a path of fixed names and indices; it never holds a value. The wire file is FILE_V2_WIRE of
tests/test_notes_fixtures.py. Every digit run here is a published test number (VISA, VISA_PATH_ID)
or a four digit id.

What this file does not test: the checks of one node or one path (test_marks_schema.py), the store
writes and the import that applies a file (test_marks_store.py) and the routes
(test_marks_routes.py).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from notes_schema import NoteRefused, check_file
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    FILE_V2_WIRE,
    GOOD_PATH_ID,
    VISA,
    VISA_GROUPED,
    VISA_PATH_ID,
    _isolated_notes_db,
)

STOP_A = {"kind": "auth", "id": "tx-0001"}


def refusal(fn: Any, *args: Any) -> tuple[str, str]:
    with pytest.raises(NoteRefused) as info:
        fn(*args)
    return info.value.code, info.value.where


def file_v2(**over: Any) -> dict[str, Any]:
    """A fresh copy of FILE_V2_WIRE (the nested lists too), with keys replaced."""
    base = copy.deepcopy(FILE_V2_WIRE)
    base.update(over)
    return base


FILE_KEYS = [
    "format",
    "version",
    "scenario",
    "categories",
    "notes",
    "nodes",
    "paths",
    "failCategories",
]


def file_node(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = copy.deepcopy(FILE_V2_WIRE["nodes"][0])
    base.update(over)
    return base


def file_path(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = copy.deepcopy(FILE_V2_WIRE["paths"][0])
    base.update(over)
    return base


class TestFileMarks:
    def test_the_wire_file_comes_back_equal_with_its_keys_in_order(self) -> None:
        out = check_file(file_v2())
        assert out == FILE_V2_WIRE
        assert list(out) == FILE_KEYS
        assert list(out["nodes"][0]) == ["record", "pinned", "disposition", "category", "settled"]
        assert list(out["paths"][0]) == ["id", "seq", "name", "stops"]

    def test_the_result_is_rebuilt_not_the_input(self) -> None:
        raw = file_v2()
        out = check_file(raw)
        assert out["nodes"][0] is not raw["nodes"][0] and out["paths"] is not raw["paths"]

    def test_a_version_one_file_is_lifted_with_empty_marks(self) -> None:
        v1 = {k: v for k, v in file_v2(version=1).items() if k in FILE_KEYS[:5]}
        out = check_file(v1)
        assert out == {**v1, "version": 2, "nodes": [], "paths": [], "failCategories": []}
        assert list(out) == FILE_KEYS

    def test_the_two_versions_take_their_own_key_sets_only(self) -> None:
        five = {k: v for k, v in file_v2().items() if k in FILE_KEYS[:5]}
        assert refusal(check_file, five) == ("bad_file", "")  # version 2 with five keys
        assert refusal(check_file, file_v2(version=1)) == ("bad_file", "")  # version 1, eight keys
        for bad in (True, False, 3, 0, "2", None, 2.5):
            assert refusal(check_file, file_v2(version=bad)) == ("bad_file", "")
        assert refusal(check_file, {**file_v2(), "extra": 1}) == ("bad_file", "")
        assert refusal(check_file, file_v2(format="other")) == ("bad_file", "")
        assert refusal(check_file, {k: v for k, v in file_v2().items() if k != "paths"}) == (
            "bad_file",
            "",
        )

    def test_the_scenario_list_is_still_honoured(self) -> None:
        assert check_file(file_v2(), ["card-fraud"])["scenario"] == "card-fraud"
        assert refusal(check_file, file_v2(), ["other"]) == ("bad_scenario", "scenario")

    def test_a_part_that_is_not_a_list_refuses_at_its_name(self) -> None:
        for name in ("nodes", "paths", "failCategories"):
            assert refusal(check_file, file_v2(**{name: {}})) == ("bad_file", name)
            assert refusal(check_file, file_v2(**{name: None})) == ("bad_file", name)

    def test_the_counts_are_limited_before_any_entry_is_read(self) -> None:
        assert refusal(check_file, file_v2(nodes=[None] * 1001)) == ("too_large", "nodes")
        assert refusal(check_file, file_v2(paths=[None] * 21)) == ("too_large", "paths")
        assert refusal(check_file, file_v2(failCategories=[None] * 101)) == (
            "too_large",
            "failCategories",
        )

    def test_the_limits_hold_exactly_at_the_edge(self) -> None:
        nodes = [file_node(record={"kind": "auth", "id": f"tx-{i:04d}"}) for i in range(1000)]
        assert len(check_file(file_v2(nodes=nodes))["nodes"]) == 1000
        paths = [
            file_path(id="path-" + f"{i:x}".rjust(32, "a"), seq=i + 1, name=f"P {i}")
            for i in range(20)
        ]
        assert len(check_file(file_v2(paths=paths))["paths"]) == 20
        names = [f"Name {i}" for i in range(100)]
        assert len(check_file(file_v2(failCategories=names))["failCategories"]) == 100

    def test_a_node_entry_is_closed_and_holds_no_scenario(self) -> None:
        for bad in (
            {**file_node(), "extra": 1},
            {**file_node(), "scenario": "card-fraud"},
            {k: v for k, v in file_node().items() if k != "settled"},
            {k: v for k, v in file_node().items() if k != "record"},
            {**file_node(), "ifUnsettled": False},
            "text",
            None,
        ):
            assert refusal(check_file, file_v2(nodes=[bad])) == ("bad_file", "nodes[0]")

    def test_a_node_field_refusal_is_a_bad_file_with_its_path(self) -> None:
        cases = [
            (file_node(pinned=1), "nodes[0].pinned"),
            (file_node(settled=1), "nodes[0].settled"),
            (file_node(settled="true"), "nodes[0].settled"),
            (file_node(disposition="maybe"), "nodes[0].disposition"),
            (file_node(disposition="pass"), "nodes[0].category"),  # category only with fail
            (file_node(category="c" * 25), "nodes[0].category"),
            (file_node(record={"kind": "bad kind", "id": "x"}), "nodes[0].record.kind"),
        ]
        for node, where in cases:
            assert refusal(check_file, file_v2(nodes=[node])) == ("bad_file", where)

    def test_a_node_record_written_as_fraud_comes_back_as_auth(self) -> None:
        out = check_file(file_v2(nodes=[file_node(record={"kind": "fraud", "id": "tx-0001"})]))
        assert out["nodes"][0]["record"] == {"kind": "auth", "id": "tx-0001"}

    def test_two_nodes_for_one_record_refuse_at_the_second_record(self) -> None:
        pair = [
            file_node(record={"kind": "fraud", "id": "tx-1"}),
            file_node(record={"kind": "auth", "id": "tx-1"}),
        ]
        assert refusal(check_file, file_v2(nodes=pair)) == ("bad_file", "nodes[1].record")

    def test_a_path_entry_is_closed_and_judged_like_a_stored_path(self) -> None:
        cases = [
            ({**file_path(), "scenario": "card-fraud"}, "paths[0]"),
            ({**file_path(), "extra": 1}, "paths[0]"),
            ({k: v for k, v in file_path().items() if k != "stops"}, "paths[0]"),
            (file_path(id="nope"), "paths[0].id"),
            (file_path(id=GOOD_PATH_ID.upper()), "paths[0].id"),
            (file_path(seq=0), "paths[0].seq"),
            (file_path(seq=True), "paths[0].seq"),
            (file_path(name=""), "paths[0].name"),
            (file_path(name="c" * 25), "paths[0].name"),
            (file_path(stops=[STOP_A]), "paths[0].stops"),
            (file_path(stops=[STOP_A, STOP_A]), "paths[0].stops[1]"),
            (file_path(stops=[STOP_A, {"kind": "x y", "id": "z"}]), "paths[0].stops[1].kind"),
        ]
        for entry, where in cases:
            assert refusal(check_file, file_v2(paths=[entry])) == ("bad_file", where)

    def test_two_paths_with_one_id_refuse_at_the_second_id(self) -> None:
        assert refusal(check_file, file_v2(paths=[file_path(), file_path(seq=2)])) == (
            "bad_file",
            "paths[1].id",
        )

    def test_fail_categories_that_repeat_ignoring_case_refuse(self) -> None:
        assert refusal(check_file, file_v2(failCategories=["Triage", "TRIAGE"])) == (
            "bad_file",
            "failCategories[1]",
        )
        assert refusal(check_file, file_v2(failCategories=["x", 5])) == (
            "bad_file",
            "failCategories[1]",
        )
        assert refusal(check_file, file_v2(failCategories=["c" * 25])) == (
            "bad_file",
            "failCategories[0]",
        )

    def test_a_card_number_anywhere_in_the_marks_refuses_the_file_with_a_path(self) -> None:
        bad_node = file_node(record={"kind": "auth", "id": "tx-" + VISA})
        assert refusal(check_file, file_v2(nodes=[bad_node])) == (
            "card_number",
            "nodes[0].record.id",
        )
        bad_cat = file_node(category=VISA_GROUPED)
        assert refusal(check_file, file_v2(nodes=[bad_cat])) == ("card_number", "nodes[0].category")
        assert refusal(check_file, file_v2(paths=[file_path(name=VISA)])) == (
            "card_number",
            "paths[0].name",
        )
        assert refusal(check_file, file_v2(paths=[file_path(id=VISA_PATH_ID)])) == (
            "card_number",
            "paths[0].id",
        )
        stops = [STOP_A, {"kind": "auth", "id": "tx-" + VISA}]
        assert refusal(check_file, file_v2(paths=[file_path(stops=stops)])) == (
            "card_number",
            "paths[0].stops[1].id",
        )
        assert refusal(check_file, file_v2(failCategories=["ok", VISA])) == (
            "card_number",
            "failCategories[1]",
        )

    def test_the_version_one_check_of_the_notes_part_is_unchanged(self) -> None:
        bad = file_v2(categories=["x", "X"])
        assert refusal(check_file, bad) == ("bad_file", "categories[1]")
