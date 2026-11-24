"""The closed schema of a record node, a custom path and the id of a path (backend/marks_schema.py).

A refusal is a fixed code and a path of fixed names and indices: never a value, never a key the
input supplied. MARKER stands for a value that must never come back out. Every digit run in this
file is a published test number from tests/test_notes_fixtures.py (VISA, VISA_PATH_ID); the path
ids drawn here come from fixed sources (a uuid built from an integer), never from a live random
draw.

What this file does not test: the marks part of a notes file (test_marks_file.py), the store
functions that write nodes, paths and Fail categories and the routes (test_marks_store.py,
test_marks_routes.py).
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest

import marks_schema as ms
from notes_guard import refuses_text
from notes_schema import NoteRefused
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    GOOD_PATH_ID,
    VISA,
    VISA_GROUPED,
    VISA_PATH_ID,
    _isolated_notes_db,
)

MARKER = "SECRET-MARKER-7731"


def refusal(fn: Any, *args: Any) -> tuple[str, str]:
    with pytest.raises(NoteRefused) as info:
        fn(*args)
    e = info.value
    assert MARKER not in str(e) and MARKER not in repr(e)
    return e.code, e.where


def node_fields(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"pinned": True, "disposition": "fail", "category": "Shared key"}
    base.update(over)
    return base


def node(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "scenario": "card-fraud",
        "record": {"kind": "auth", "id": "tx-0001"},
        "pinned": True,
        "disposition": "fail",
        "category": "Shared key",
        "settled": True,
    }
    base.update(over)
    return base


class TestKind:
    def test_fraud_is_written_as_auth_and_nothing_else_changes(self) -> None:
        assert ms.canonical_kind("fraud") == "auth"
        for kind in ("auth", "login", "place", "account_event", "Fraud", "fraud2"):
            assert ms.canonical_kind(kind) == kind

    def test_the_constants_are_the_contracts(self) -> None:
        assert ms.DISPOSITIONS == ("none", "pass", "fail", "wait")
        assert ms.MARK_LIMITS == {
            "nodes_per_scenario": 1000,
            "paths_per_scenario": 20,
            "stops_min": 2,
            "stops_max": 50,
            "name_chars": 24,
            "fail_categories": 100,
        }


class TestRecord:
    def test_a_fraud_record_comes_back_as_auth(self) -> None:
        assert ms.check_record({"kind": "fraud", "id": "tx-1"}) == {"kind": "auth", "id": "tx-1"}

    def test_the_result_is_a_fresh_dict(self) -> None:
        raw = {"kind": "login", "id": "lg-2"}
        out = ms.check_record(raw)
        assert out == raw and out is not raw

    def test_none_refuses_at_the_path(self) -> None:
        assert refusal(ms.check_record, None) == ("bad_request", "record")
        assert refusal(ms.check_record, None, "stops[3]") == ("bad_request", "stops[3]")

    def test_every_refusal_of_a_link_is_kept(self) -> None:
        assert refusal(ms.check_record, {"kind": "1x", "id": "tx-1"}) == (
            "bad_request",
            "record.kind",
        )
        assert refusal(ms.check_record, {"kind": "auth", "id": "-bad"}) == (
            "bad_request",
            "record.id",
        )
        assert refusal(ms.check_record, {"kind": "auth"}) == ("bad_request", "record")
        assert refusal(ms.check_record, {"kind": "auth", "id": "x", "time": 1}) == (
            "bad_request",
            "record",
        )
        assert refusal(ms.check_record, {"kind": 4, "id": "x"}) == ("bad_request", "record")
        assert refusal(ms.check_record, "auth:tx-1") == ("bad_request", "record")

    def test_a_kind_or_an_id_that_holds_the_test_number_is_refused(self) -> None:
        assert refusal(ms.check_record, {"kind": "a" + VISA, "id": "tx-1"}) == (
            "card_number",
            "record.kind",
        )
        assert refusal(ms.check_record, {"kind": "auth", "id": VISA}) == (
            "card_number",
            "record.id",
        )
        assert refusal(ms.check_record, {"kind": "auth", "id": VISA}, "stops[1]") == (
            "card_number",
            "stops[1].id",
        )


class TestNodeFields:
    def test_a_good_set_comes_back_as_a_fresh_dict_in_order(self) -> None:
        raw = node_fields()
        out = ms.check_node_fields(raw)
        assert out == raw and out is not raw
        assert list(out) == ["pinned", "disposition", "category"]

    def test_every_disposition_is_accepted_and_only_fail_takes_a_category(self) -> None:
        for d in ("none", "pass", "wait"):
            out = ms.check_node_fields(node_fields(disposition=d, category=None))
            assert out["disposition"] == d and out["category"] is None
        assert (
            ms.check_node_fields(node_fields(disposition="fail", category=None))["category"] is None
        )

    def test_the_keys_are_exactly_three(self) -> None:
        for key in ("pinned", "disposition", "category"):
            raw = node_fields()
            del raw[key]
            assert refusal(ms.check_node_fields, raw) == ("bad_request", "")
        assert refusal(ms.check_node_fields, {**node_fields(), "ifAbsent": False}) == (
            "bad_request",
            "",
        )
        assert refusal(ms.check_node_fields, {**node_fields(), "__proto__": {}}) == (
            "bad_request",
            "",
        )
        assert refusal(ms.check_node_fields, {**node_fields(), "settled": True}) == (
            "bad_request",
            "",
        )
        assert refusal(ms.check_node_fields, [node_fields()]) == ("bad_request", "")
        assert refusal(ms.check_node_fields, None) == ("bad_request", "")

    def test_pinned_is_a_json_boolean(self) -> None:
        for bad in (1, 0, "true", None, "", 1.0):
            assert refusal(ms.check_node_fields, node_fields(pinned=bad)) == (
                "bad_request",
                "pinned",
            )
        assert ms.check_node_fields(node_fields(pinned=False))["pinned"] is False

    def test_the_disposition_is_one_of_four(self) -> None:
        for bad in ("maybe", "PASS", "waiting", "", None, 1, ["fail"]):
            assert refusal(ms.check_node_fields, node_fields(disposition=bad)) == (
                "bad_request",
                "disposition",
            )

    def test_the_category_follows_the_note_category_rules(self) -> None:
        assert refusal(ms.check_node_fields, node_fields(category="x" * 25)) == (
            "too_long",
            "category",
        )
        assert refusal(ms.check_node_fields, node_fields(category=VISA_GROUPED)) == (
            "card_number",
            "category",
        )
        assert refusal(ms.check_node_fields, node_fields(category="Shared key ")) == (
            "bad_request",
            "category",
        )
        assert refusal(ms.check_node_fields, node_fields(category="")) == (
            "bad_request",
            "category",
        )
        assert refusal(ms.check_node_fields, node_fields(category="a\nb")) == (
            "bad_request",
            "category",
        )
        assert refusal(ms.check_node_fields, node_fields(category=4)) == (
            "bad_request",
            "category",
        )
        assert ms.check_node_fields(node_fields(category="x" * 24))["category"] == "x" * 24

    def test_a_category_with_any_disposition_but_fail_is_refused(self) -> None:
        for d in ("none", "pass", "wait"):
            assert refusal(ms.check_node_fields, node_fields(disposition=d)) == (
                "bad_request",
                "category",
            )

    def test_the_path_names_the_field_under_a_parent(self) -> None:
        assert refusal(ms.check_node_fields, node_fields(pinned=1), "nodes[2]") == (
            "bad_request",
            "nodes[2].pinned",
        )
        assert refusal(ms.check_node_fields, None, "nodes[2]") == ("bad_request", "nodes[2]")


class TestNode:
    def test_a_good_node_comes_back_in_the_wire_order(self) -> None:
        raw = node()
        out = ms.check_node(raw)
        assert out == raw and out is not raw
        assert list(out) == ["scenario", "record", "pinned", "disposition", "category", "settled"]
        assert out["record"] is not raw["record"]

    def test_a_fraud_record_is_stored_as_auth(self) -> None:
        out = ms.check_node(node(record={"kind": "fraud", "id": "tx-0001"}))
        assert out["record"] == {"kind": "auth", "id": "tx-0001"}

    def test_the_keys_are_exactly_six(self) -> None:
        for key in ("scenario", "record", "pinned", "disposition", "category", "settled"):
            raw = node()
            del raw[key]
            assert refusal(ms.check_node, raw) == ("bad_request", "")
        assert refusal(ms.check_node, {**node(), "ifUnsettled": False}) == ("bad_request", "")
        assert refusal(ms.check_node, {**node(), "ifAbsent": False}) == ("bad_request", "")
        assert refusal(ms.check_node, {**node(), "__proto__": 1}) == ("bad_request", "")

    def test_settled_is_a_json_boolean(self) -> None:
        for bad in (1, 0, "true", None, 2):
            assert refusal(ms.check_node, node(settled=bad)) == ("bad_request", "settled")
        assert ms.check_node(node(settled=False))["settled"] is False

    def test_the_scenario_is_judged_by_the_note_rule(self) -> None:
        assert refusal(ms.check_node, node(scenario="bad scenario")) == (
            "bad_scenario",
            "scenario",
        )
        assert refusal(ms.check_node, node(scenario=VISA)) == ("card_number", "scenario")
        assert refusal(ms.check_node, node(scenario=None)) == ("bad_scenario", "scenario")

    def test_the_record_is_judged_by_the_link_rules_at_its_own_path(self) -> None:
        assert refusal(ms.check_node, node(record=None)) == ("bad_request", "record")
        assert refusal(ms.check_node, node(record={"kind": "auth", "id": VISA})) == (
            "card_number",
            "record.id",
        )

    def test_the_fields_are_judged_as_the_field_check_judges_them(self) -> None:
        assert refusal(ms.check_node, node(pinned=1)) == ("bad_request", "pinned")
        assert refusal(ms.check_node, node(disposition="pass")) == ("bad_request", "category")
        assert refusal(ms.check_node, node(category="x" * 25)) == ("too_long", "category")

    def test_a_cleared_node_is_valid(self) -> None:
        cleared = node(pinned=False, disposition="none", category=None, settled=True)
        assert ms.check_node(cleared) == cleared

    def test_a_shape_that_is_not_a_dict_is_refused(self) -> None:
        shapes: tuple[Any, ...] = (None, [], "node", 4)
        for bad in shapes:
            assert refusal(ms.check_node, bad) == ("bad_request", "")


class TestNodePut:
    def test_a_body_is_a_node_plus_if_unsettled(self) -> None:
        body = {**node(), "ifUnsettled": False}
        out, if_unsettled = ms.check_node_put(body)
        assert out == node() and if_unsettled is False
        assert "ifUnsettled" not in out
        out2, flag2 = ms.check_node_put({**node(), "ifUnsettled": True})
        assert out2 == node() and flag2 is True

    def test_if_unsettled_must_be_a_boolean(self) -> None:
        for bad in (0, 1, "no", "false", None):
            assert refusal(ms.check_node_put, {**node(), "ifUnsettled": bad}) == (
                "bad_request",
                "ifUnsettled",
            )

    def test_if_unsettled_is_required_and_if_absent_is_refused(self) -> None:
        assert refusal(ms.check_node_put, node()) == ("bad_request", "")
        assert refusal(ms.check_node_put, {**node(), "ifAbsent": False}) == ("bad_request", "")
        assert refusal(ms.check_node_put, {**node(), "ifUnsettled": False, "ifAbsent": False}) == (
            "bad_request",
            "",
        )

    def test_the_node_inside_is_judged_in_full(self) -> None:
        assert refusal(ms.check_node_put, {**node(settled=1), "ifUnsettled": False}) == (
            "bad_request",
            "settled",
        )
        assert refusal(ms.check_node_put, {**node(scenario="x y"), "ifUnsettled": True}) == (
            "bad_scenario",
            "scenario",
        )


def row(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "scenario": "card-fraud",
        "rec_kind": "auth",
        "rec_id": "tx-0001",
        "pinned": 1,
        "disposition": "fail",
        "category": "Shared key",
        "settled": 1,
    }
    base.update(over)
    return base


class TestNodeFromRow:
    def test_a_stored_row_reads_as_the_wire_node(self) -> None:
        assert ms.node_from_row(row()) == node()
        cleared = row(pinned=0, disposition="none", category=None, settled=0)
        assert ms.node_from_row(cleared) == node(
            pinned=False, disposition="none", category=None, settled=False
        )

    def test_pinned_is_an_integer_zero_or_one(self) -> None:
        for bad in (2, -1, "1", "0", True, False, 1.0, None):
            assert refusal(ms.node_from_row, row(pinned=bad)) == ("bad_request", "pinned")

    def test_settled_reads_like_pinned(self) -> None:
        for bad in (2, -1, "1", "0", True, False, 1.0, None):
            assert refusal(ms.node_from_row, row(settled=bad)) == ("bad_request", "settled")

    def test_every_column_is_judged_again(self) -> None:
        assert refusal(ms.node_from_row, row(category="a\u0007b"))[0] == "bad_request"
        assert refusal(ms.node_from_row, row(category=VISA_GROUPED))[0] == "card_number"
        assert refusal(ms.node_from_row, row(rec_id=VISA)) == ("card_number", "record.id")
        assert refusal(ms.node_from_row, row(rec_kind="1x")) == ("bad_request", "record.kind")
        assert refusal(ms.node_from_row, row(disposition="maybe")) == (
            "bad_request",
            "disposition",
        )
        assert refusal(ms.node_from_row, row(disposition="pass")) == ("bad_request", "category")
        assert refusal(ms.node_from_row, row(scenario="a b"))[0] == "bad_scenario"

    def test_a_fraud_row_reads_as_auth(self) -> None:
        assert ms.node_from_row(row(rec_kind="fraud"))["record"] == {
            "kind": "auth",
            "id": "tx-0001",
        }


# ---------------------------------------------------------------------------- paths

STOP_A = {"kind": "auth", "id": "tx-0001"}
STOP_B = {"kind": "login", "id": "lg-0002"}


def stops(n: int) -> list[dict[str, str]]:
    return [{"kind": "login", "id": f"lg-{i:04d}"} for i in range(n)]


def path_fields(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"name": "Path 1", "stops": [dict(STOP_A), dict(STOP_B)]}
    base.update(over)
    return base


def path(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": GOOD_PATH_ID,
        "scenario": "card-fraud",
        "seq": 1,
        "name": "Path 1",
        "stops": [dict(STOP_A), dict(STOP_B)],
    }
    base.update(over)
    return base


class TestPathId:
    def test_the_pattern_is_path_dash_and_32_lowercase_hex(self) -> None:
        assert ms.is_path_id(GOOD_PATH_ID) is True
        for bad in (
            GOOD_PATH_ID + "\n",
            GOOD_PATH_ID.upper(),
            "path-" + "A" * 32,
            GOOD_PATH_ID[:-1],
            GOOD_PATH_ID + "0",
            "note-0123456789abcdef0123456789abcdef",
            "",
            None,
            4,
            ["path"],
        ):
            assert ms.is_path_id(bad) is False

    def test_the_crafted_fixture_is_a_good_pattern_that_the_guard_refuses(self) -> None:
        assert ms.is_path_id(VISA_PATH_ID) is True
        assert refuses_text(VISA_PATH_ID) is True

    def test_make_path_id_draws_again_when_the_guard_refuses(self) -> None:
        draws = [
            uuid.UUID(hex=VISA_PATH_ID[5:]),
            uuid.UUID(hex="abcdefabcdefabcd" + VISA),
            uuid.UUID(hex=GOOD_PATH_ID[5:]),
        ]
        assert ms.make_path_id(lambda: draws.pop(0)) == GOOD_PATH_ID
        assert draws == []

    def test_make_path_id_gives_up_without_naming_an_id(self) -> None:
        bad = uuid.UUID(hex=VISA + "abcdefabcdefabcd")
        with pytest.raises(RuntimeError) as info:
            ms.make_path_id(lambda: bad, max_draws=3)
        assert VISA not in str(info.value)

    def test_two_hundred_fixed_draws_all_pass_the_pattern_and_the_guard(self) -> None:
        # A source whose first draw holds the test number, then the uuids of 0 to 199.
        draws = iter(
            [uuid.UUID(hex=VISA + "abcdefabcdefabcd")] + [uuid.UUID(int=i) for i in range(200)]
        )
        made = [ms.make_path_id(lambda: next(draws)) for _ in range(200)]
        assert made[0] == "path-" + uuid.UUID(int=0).hex
        assert len(set(made)) == 200
        for pid in made:
            assert ms.is_path_id(pid) and not refuses_text(pid)
        assert next(draws, None) is None


class TestPathName:
    def test_it_is_the_category_check_with_its_own_where(self) -> None:
        assert ms.check_path_name("Path 1") == "Path 1"
        assert ms.check_path_name("x" * 24) == "x" * 24
        assert refusal(ms.check_path_name, "x" * 25) == ("too_long", "name")
        assert refusal(ms.check_path_name, "") == ("bad_request", "name")
        assert refusal(ms.check_path_name, " Path") == ("bad_request", "name")
        assert refusal(ms.check_path_name, VISA_GROUPED) == ("card_number", "name")
        assert refusal(ms.check_path_name, None) == ("bad_request", "name")
        assert refusal(ms.check_path_name, VISA, "paths[1].name") == (
            "card_number",
            "paths[1].name",
        )


class TestPathFields:
    def test_a_good_pair_comes_back_fresh_and_in_order(self) -> None:
        raw = path_fields()
        out = ms.check_path_fields(raw)
        assert out == raw and out is not raw and out["stops"] is not raw["stops"]
        assert list(out) == ["name", "stops"]

    def test_the_keys_are_exactly_two(self) -> None:
        for key in ("name", "stops"):
            raw = path_fields()
            del raw[key]
            assert refusal(ms.check_path_fields, raw) == ("bad_request", "")
        assert refusal(ms.check_path_fields, {**path_fields(), "id": GOOD_PATH_ID}) == (
            "bad_request",
            "",
        )
        assert refusal(ms.check_path_fields, {**path_fields(), "__proto__": []}) == (
            "bad_request",
            "",
        )
        assert refusal(ms.check_path_fields, None) == ("bad_request", "")

    def test_two_to_fifty_stops(self) -> None:
        assert len(ms.check_path_fields(path_fields(stops=stops(2)))["stops"]) == 2
        assert len(ms.check_path_fields(path_fields(stops=stops(50)))["stops"]) == 50
        for bad in ([], stops(1), stops(51), {"kind": "auth", "id": "x"}, "stops", None):
            assert refusal(ms.check_path_fields, path_fields(stops=bad)) == ("bad_request", "stops")

    def test_each_stop_is_a_record_and_a_refusal_names_its_index(self) -> None:
        bad: list[Any] = list(stops(5))
        bad[3] = {"kind": "login", "id": VISA}
        assert refusal(ms.check_path_fields, path_fields(stops=bad)) == (
            "card_number",
            "stops[3].id",
        )
        bad[3] = {"kind": "login"}
        assert refusal(ms.check_path_fields, path_fields(stops=bad)) == ("bad_request", "stops[3]")
        bad[3] = None
        assert refusal(ms.check_path_fields, path_fields(stops=bad)) == ("bad_request", "stops[3]")
        bad[3] = {"kind": "login", "id": "-x"}
        assert refusal(ms.check_path_fields, path_fields(stops=bad), "paths[0]") == (
            "bad_request",
            "paths[0].stops[3].id",
        )

    def test_a_record_twice_is_refused_at_its_second_place(self) -> None:
        twice = [dict(STOP_A), dict(STOP_B), dict(STOP_A)]
        assert refusal(ms.check_path_fields, path_fields(stops=twice)) == (
            "bad_request",
            "stops[2]",
        )
        mixed = [{"kind": "fraud", "id": "x"}, {"kind": "auth", "id": "x"}]
        assert refusal(ms.check_path_fields, path_fields(stops=mixed)) == (
            "bad_request",
            "stops[1]",
        )

    def test_stops_come_back_canonical(self) -> None:
        out = ms.check_path_fields(
            path_fields(stops=[{"kind": "fraud", "id": "tx-0001"}, dict(STOP_B)])
        )
        assert out["stops"] == [STOP_A, STOP_B]

    def test_the_name_is_judged_at_name(self) -> None:
        assert refusal(ms.check_path_fields, path_fields(name="x" * 25)) == ("too_long", "name")
        assert refusal(ms.check_path_fields, path_fields(name=VISA_GROUPED)) == (
            "card_number",
            "name",
        )


class TestPathDraft:
    def test_exactly_scenario_name_and_stops(self) -> None:
        raw = {"scenario": "card-fraud", **path_fields()}
        out = ms.check_path_draft(raw)
        assert out == raw and list(out) == ["scenario", "name", "stops"]
        for key in ("scenario", "name", "stops"):
            short = dict(raw)
            del short[key]
            assert refusal(ms.check_path_draft, short) == ("bad_request", "")
        assert refusal(ms.check_path_draft, {**raw, "seq": 1}) == ("bad_request", "")
        assert refusal(ms.check_path_draft, {**raw, "id": GOOD_PATH_ID}) == ("bad_request", "")

    def test_the_scenario_is_judged_by_the_note_rule(self) -> None:
        assert refusal(ms.check_path_draft, {"scenario": "a b", **path_fields()}) == (
            "bad_scenario",
            "scenario",
        )
        assert refusal(ms.check_path_draft, {"scenario": VISA, **path_fields()}) == (
            "card_number",
            "scenario",
        )


class TestPath:
    def test_a_good_path_comes_back_fresh_and_in_the_wire_order(self) -> None:
        raw = path()
        out = ms.check_path(raw)
        assert out == raw and out is not raw
        assert list(out) == ["id", "scenario", "seq", "name", "stops"]

    def test_the_keys_are_exactly_five(self) -> None:
        for key in ("id", "scenario", "seq", "name", "stops"):
            raw = path()
            del raw[key]
            assert refusal(ms.check_path, raw) == ("bad_request", "")
        assert refusal(ms.check_path, {**path(), "extra": 1}) == ("bad_request", "")
        assert refusal(ms.check_path, None, "paths[2]") == ("bad_request", "paths[2]")

    def test_the_id_is_a_path_id_and_passes_the_guard(self) -> None:
        for bad in ("path-1", GOOD_PATH_ID.upper(), GOOD_PATH_ID + "\n", None, 4):
            assert refusal(ms.check_path, path(id=bad)) == ("bad_request", "id")
        assert refusal(ms.check_path, path(id=VISA_PATH_ID)) == ("card_number", "id")

    def test_the_seq_is_judged_like_a_note_seq(self) -> None:
        for bad in (0, -1, True, False, "1", None, 10**12, 1.5):
            assert refusal(ms.check_path, path(seq=bad)) == ("bad_request", "seq")
        assert ms.check_path(path(seq=999_999_999_999))["seq"] == 999_999_999_999

    def test_the_scenario_name_and_stops_are_judged(self) -> None:
        assert refusal(ms.check_path, path(scenario="a b")) == ("bad_scenario", "scenario")
        assert refusal(ms.check_path, path(name="")) == ("bad_request", "name")
        assert refusal(ms.check_path, path(stops=stops(1))) == ("bad_request", "stops")

    def test_a_refusal_under_a_parent_carries_the_parent(self) -> None:
        assert refusal(ms.check_path, path(seq=0), "paths[4]") == ("bad_request", "paths[4].seq")
        assert refusal(ms.check_path, path(id="x"), "paths[4]") == ("bad_request", "paths[4].id")


def path_row(**over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": GOOD_PATH_ID,
        "scenario": "card-fraud",
        "seq": 1,
        "name": "Path 1",
        "stops": ms.stops_to_json([STOP_A, STOP_B]),
    }
    base.update(over)
    return base


class TestStopsJson:
    def test_stops_are_stored_as_compact_json(self) -> None:
        assert ms.stops_to_json([STOP_A, STOP_B]) == (
            '[{"kind":"auth","id":"tx-0001"},{"kind":"login","id":"lg-0002"}]'
        )


class TestPathFromRow:
    def test_a_stored_row_reads_as_the_wire_path(self) -> None:
        assert ms.path_from_row(path_row()) == path()

    def test_stops_that_are_not_json_refuse_at_stops(self) -> None:
        for bad in ("not json", "", "[", "NaN", None):
            assert refusal(ms.path_from_row, path_row(stops=bad)) == ("bad_request", "stops")

    def test_stops_that_are_json_but_not_a_good_list_are_refused(self) -> None:
        assert refusal(ms.path_from_row, path_row(stops="[]")) == ("bad_request", "stops")
        assert refusal(ms.path_from_row, path_row(stops="{}")) == ("bad_request", "stops")
        assert refusal(ms.path_from_row, path_row(stops=ms.stops_to_json([STOP_A, STOP_A]))) == (
            "bad_request",
            "stops[1]",
        )

    def test_every_column_is_judged_again(self) -> None:
        assert refusal(ms.path_from_row, path_row(name=VISA_GROUPED)) == ("card_number", "name")
        assert refusal(ms.path_from_row, path_row(id=VISA_PATH_ID)) == ("card_number", "id")
        assert refusal(ms.path_from_row, path_row(id="x")) == ("bad_request", "id")
        assert refusal(ms.path_from_row, path_row(seq=0)) == ("bad_request", "seq")
        assert refusal(ms.path_from_row, path_row(scenario="a b")) == ("bad_scenario", "scenario")
