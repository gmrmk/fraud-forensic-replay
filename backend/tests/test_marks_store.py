"""The marks in the notes store: nodes, typed Fail categories and custom paths (notes_store.py).

A node row is never deleted and `settled` never goes back to 0. A read judges every row again and
skips and counts a bad row. Every path or note id minted here comes from a fixed source (a uuid
built from an integer, inside range(200)), never from a live random draw. Every digit run in this
file is a published test number from tests/test_notes_fixtures.py (VISA, GOOD_PATH_ID,
VISA_PATH_ID).

It covers the store functions and the import of a version 2 file (list_marks, put_node,
add_fail_category, create_path, update_path, delete_path, import_file). What this file does not
test: the closed checks of a node and a path (test_marks_schema.py), the file check
(test_marks_file.py), the migration (test_notes_store_v2.py) and the routes (test_marks_routes.py).
"""

from __future__ import annotations

import re
import sqlite3
import uuid
from typing import Any

import pytest

import marks_schema as ms
import notes_store as ns
from notes_schema import NoteRefused
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    FILE_V2_WIRE,
    GOOD_PATH_ID,
    LIST_WIRE,
    NODE_WIRE,
    PATH_UUID,
    PATH_WIRE,
    ROOT,
    VISA,
    VISA_GROUPED,
    VISA_PATH_ID,
    _isolated_notes_db,
    node_doc,
    path_draft,
    wire_text,
)

A = "card-fraud"
B = "priya-ato"
MARKER = "SECRET-MARKER-5512"
# Three spellings of one name with an acute accent on the e (code points 0xC9 and 0xE9), equal
# ignoring case. SQLite's NOCASE folds ASCII only, so its key lets all three in and the Python rule
# is the real one. Built from code points: no non-ASCII character is typed into a source file.
NAME_A = chr(0xC9) + "t" + chr(0xE9)
NAME_B = chr(0xE9) + "T" + chr(0xC9)
NAME_C = chr(0xE9) + "t" + chr(0xC9)


def refusal(fn: Any, *args: Any) -> tuple[str, str]:
    with pytest.raises(NoteRefused) as info:
        fn(*args)
    return info.value.code, info.value.where


@pytest.fixture
def conn():
    c = ns.connect()
    yield c
    c.close()


def raw_node(conn: sqlite3.Connection, **over: Any) -> None:
    """A node row written by hand, around every check of the store."""
    row: dict[str, Any] = {
        "scenario": A,
        "rec_kind": "auth",
        "rec_id": "tx-0001",
        "pinned": 0,
        "disposition": "none",
        "category": None,
        "settled": 0,
    }
    row.update(over)
    conn.execute(
        "INSERT INTO record_nodes(scenario, rec_kind, rec_id, pinned, disposition, category,"
        " settled) VALUES (:scenario, :rec_kind, :rec_id, :pinned, :disposition, :category,"
        " :settled)",
        row,
    )


def raw_path(conn: sqlite3.Connection, **over: Any) -> None:
    """A path row written by hand."""
    row: dict[str, Any] = {
        "id": GOOD_PATH_ID,
        "scenario": A,
        "seq": 1,
        "name": "Path 1",
        "stops": '[{"kind":"auth","id":"tx-0001"},{"kind":"login","id":"lg-0002"}]',
    }
    row.update(over)
    conn.execute(
        "INSERT INTO custom_paths(id, scenario, seq, name, stops)"
        " VALUES (:id, :scenario, :seq, :name, :stops)",
        row,
    )


def node_rows(conn: sqlite3.Connection) -> list[tuple[Any, ...]]:
    return [
        tuple(r)
        for r in conn.execute(
            "SELECT scenario, rec_kind, rec_id, pinned, disposition, category, settled"
            " FROM record_nodes ORDER BY rowid"
        )
    ]


def note_rows(conn: sqlite3.Connection) -> list[tuple[Any, ...]]:
    """Every column of every note row, by name."""
    return [
        tuple(r)
        for r in conn.execute(
            "SELECT id, scenario, seq, time_ms, link_kind, link_id, colour, category, decision,"
            " body FROM notes ORDER BY id"
        )
    ]


class TestNodes:
    def test_a_story_with_nothing_lists_four_empty_parts(self, conn) -> None:
        assert ns.list_marks(conn, A) == {
            "nodes": [],
            "paths": [],
            "failCategories": [],
            "skipped": 0,
        }

    def test_a_bad_scenario_refuses_before_sql(self, conn) -> None:
        assert refusal(ns.list_marks, conn, VISA_GROUPED.replace(" ", "-"))[0] == "card_number"
        assert refusal(ns.list_marks, conn, "bad scenario")[0] == "bad_scenario"

    def test_a_put_then_a_list_gives_the_node_in_wire_order(self, conn) -> None:
        stored = ns.put_node(conn, NODE_WIRE, False)
        assert stored == NODE_WIRE and list(stored) == list(NODE_WIRE)
        listed = ns.list_marks(conn, A)
        assert listed["nodes"] == [NODE_WIRE] and listed["skipped"] == 0
        assert list(listed["nodes"][0]) == list(NODE_WIRE)

    def test_a_second_put_of_the_record_changes_the_three_fields_and_keeps_one_row(
        self, conn
    ) -> None:
        ns.put_node(conn, node_doc(pinned=True), False)
        out = ns.put_node(conn, node_doc(disposition="fail", category="Triage"), False)
        assert (out["pinned"], out["disposition"], out["category"]) == (False, "fail", "Triage")
        assert conn.execute("SELECT COUNT(*) FROM record_nodes").fetchone()[0] == 1

    def test_a_fraud_record_is_stored_as_auth_and_an_auth_put_updates_the_same_row(
        self, conn
    ) -> None:
        first = ns.put_node(conn, node_doc(record={"kind": "fraud", "id": "tx-9"}), False)
        assert first["record"] == {"kind": "auth", "id": "tx-9"}
        assert [r[0] for r in conn.execute("SELECT rec_kind FROM record_nodes")] == ["auth"]
        again = ns.put_node(
            conn, node_doc(record={"kind": "auth", "id": "tx-9"}, disposition="pass"), False
        )
        assert again["disposition"] == "pass"
        assert conn.execute("SELECT COUNT(*) FROM record_nodes").fetchone()[0] == 1

    def test_the_store_checks_the_node_again(self, conn) -> None:
        bad_id = node_doc(record={"kind": "auth", "id": "tx-" + VISA})
        assert refusal(ns.put_node, conn, bad_id, False) == ("card_number", "record.id")
        no_settled = {k: v for k, v in node_doc().items() if k != "settled"}
        assert refusal(ns.put_node, conn, no_settled, False) == ("bad_request", "")
        assert refusal(ns.put_node, conn, node_doc(settled=1), False) == (
            "bad_request",
            "settled",
        )
        assert refusal(ns.put_node, conn, node_doc(category="x"), False) == (
            "bad_request",
            "category",
        )
        assert node_rows(conn) == []

    # ---- settled: held OR sent, never back to false

    def test_a_put_with_settled_false_over_a_settled_row_keeps_it_true(self, conn) -> None:
        ns.put_node(conn, node_doc(settled=True, disposition="pass"), False)
        out = ns.put_node(conn, node_doc(pinned=True, settled=False), False)
        assert out["settled"] is True and out["disposition"] == "none" and out["pinned"] is True
        assert conn.execute("SELECT settled FROM record_nodes").fetchone()[0] == 1

    def test_settled_fills_in_when_a_press_sends_it(self, conn) -> None:
        ns.put_node(conn, node_doc(pinned=True), False)
        assert ns.list_marks(conn, A)["nodes"][0]["settled"] is False
        out = ns.put_node(conn, node_doc(pinned=True, disposition="wait", settled=True), False)
        assert out["settled"] is True

    def test_a_cleared_row_stays_settled(self, conn) -> None:
        ns.put_node(conn, node_doc(disposition="fail", category="Triage", settled=True), False)
        cleared = ns.put_node(conn, node_doc(settled=True), False)
        assert cleared == node_doc(settled=True)
        assert ns.put_node(conn, node_doc(settled=False), False)["settled"] is True

    # ---- ifUnsettled true: the move

    def test_if_unsettled_on_a_settled_row_answers_it_unchanged_and_changes_nothing(
        self, conn
    ) -> None:
        held = node_doc(pinned=True, disposition="fail", category="A", settled=True)
        ns.put_node(conn, held, False)
        before = node_rows(conn)
        out = ns.put_node(conn, node_doc(pinned=False, disposition="pass", settled=True), True)
        assert out == node_doc(pinned=True, disposition="fail", category="A", settled=True)
        assert node_rows(conn) == before

    def test_if_unsettled_on_a_pinned_only_row_writes_the_disposition_and_keeps_the_pin(
        self, conn
    ) -> None:
        ns.put_node(conn, node_doc(pinned=True), False)
        out = ns.put_node(
            conn, node_doc(pinned=False, disposition="fail", category="Triage", settled=True), True
        )
        assert out == node_doc(pinned=True, disposition="fail", category="Triage", settled=True)
        assert node_rows(conn) == [(A, "auth", "tx-0001", 1, "fail", "Triage", 1)]

    def test_if_unsettled_on_an_unsettled_row_with_a_category_replaces_it(self, conn) -> None:
        raw_node(conn, disposition="fail", category="Old")
        out = ns.put_node(conn, node_doc(disposition="pass", settled=True), True)
        assert (out["disposition"], out["category"], out["settled"]) == ("pass", None, True)

    def test_if_unsettled_on_no_row_inserts_what_is_sent(self, conn) -> None:
        out = ns.put_node(conn, node_doc(disposition="pass", settled=True), True)
        assert out == node_doc(disposition="pass", settled=True)
        assert node_rows(conn) == [(A, "auth", "tx-0001", 0, "pass", None, 1)]

    def test_a_node_write_leaves_every_note_row_equal_as_a_full_row(self, conn, ids) -> None:
        # The proof of C3.3 for the store: a node write, moved (ifUnsettled) or pressed, never
        # touches the notes table, so every note row is equal before and after.
        ns.insert_note(conn, _note_draft())
        before = note_rows(conn)
        assert len(before) == 1
        ns.put_node(conn, node_doc(disposition="pass", settled=True), True)
        ns.put_node(conn, node_doc(disposition="fail", settled=True), False)
        assert note_rows(conn) == before

    # ---- order, limits, bad rows

    def test_nodes_list_in_the_order_of_the_joined_key(self, conn) -> None:
        for kind in ("a", "a1", "login", "auth"):
            ns.put_node(conn, node_doc(record={"kind": kind, "id": "x"}), False)
        keys = [
            f"{n['record']['kind']}:{n['record']['id']}" for n in ns.list_marks(conn, A)["nodes"]
        ]
        assert keys == ["a1:x", "a:x", "auth:x", "login:x"]
        assert keys == sorted(keys)

    def test_the_limit_refuses_a_new_record_and_still_updates_a_held_one(self, conn) -> None:
        conn.execute("BEGIN")
        for i in range(1000):
            raw_node(conn, rec_id=f"tx-{i:04d}")
        conn.execute("COMMIT")
        fresh = node_doc(record={"kind": "auth", "id": "new"})
        assert refusal(ns.put_node, conn, fresh, False) == ("limit_reached", "")
        held = node_doc(record={"kind": "auth", "id": "tx-0007"}, pinned=True)
        assert ns.put_node(conn, held, False)["pinned"] is True
        assert conn.execute("SELECT COUNT(*) FROM record_nodes").fetchone()[0] == 1000

    def test_the_limit_counts_a_cleared_row_and_not_another_story(self, conn) -> None:
        conn.execute("BEGIN")
        for i in range(1000):
            raw_node(conn, rec_id=f"tx-{i:04d}", settled=1)
        conn.execute("COMMIT")
        # A cleared row (none, no pin, no category, settled) still counts.
        fresh = node_doc(record={"kind": "auth", "id": "new"})
        assert refusal(ns.put_node, conn, fresh, False)[0] == "limit_reached"
        other = node_doc(scenario=B, record={"kind": "auth", "id": "new"})
        assert ns.put_node(conn, other, False)["scenario"] == B

    def test_bad_rows_are_skipped_counted_and_their_text_is_in_no_return_value(self, conn) -> None:
        raw_node(conn, rec_id="tx-0001", pinned=1)
        raw_node(conn, rec_id="tx-0002", disposition="fail", category=MARKER + "\x07")
        raw_node(conn, rec_id="tx-" + VISA)
        raw_node(conn, rec_id="tx-0003", rec_kind="fraud")  # no auth row of that id: served as auth
        raw_node(conn, rec_id="tx-0004", rec_kind="auth")
        raw_node(conn, rec_id="tx-0004", rec_kind="fraud")  # a second row that reads as tx-0004
        raw_node(conn, rec_id="tx-0005", rec_kind="bad kind")
        listed = ns.list_marks(conn, A)
        ids = [n["record"]["id"] for n in listed["nodes"]]
        assert ids == ["tx-0001", "tx-0003", "tx-0004"]
        assert listed["skipped"] == 4
        assert MARKER not in repr(listed) and VISA not in repr(listed)

    def test_a_stored_flag_that_is_not_a_flag_is_skipped(self, conn) -> None:
        conn.execute("PRAGMA ignore_check_constraints = ON")
        raw_node(conn, rec_id="tx-0001", pinned=1)
        raw_node(conn, rec_id="tx-0002", pinned=2)
        raw_node(conn, rec_id="tx-0003", settled=3)
        raw_node(conn, rec_id="tx-0004", settled=-1)
        conn.execute("PRAGMA ignore_check_constraints = OFF")
        listed = ns.list_marks(conn, A)
        assert [n["record"]["id"] for n in listed["nodes"]] == ["tx-0001"]
        assert listed["skipped"] == 3

    def test_no_function_and_no_statement_deletes_a_node(self) -> None:
        assert not hasattr(ns, "delete_node")
        src = (ROOT / "backend" / "notes_store.py").read_text(encoding="utf-8")
        assert re.search(r"DELETE\s+FROM\s+record_nodes", src, re.IGNORECASE) is None
        for line in src.splitlines():
            assert not (re.search(r"\bdelete\b", line, re.IGNORECASE) and "record_nodes" in line)


@pytest.fixture
def ids(monkeypatch):
    """Path ids from a fixed source: uuid.UUID(int=1), then 2, ... (never a live draw)."""
    counter = iter(range(1, 200))
    monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(int=next(counter)))


def stop(kind: str, id_: str) -> dict[str, str]:
    return {"kind": kind, "id": id_}


class TestFailCategories:
    def test_they_list_in_insertion_order_not_sorted(self, conn) -> None:
        for name in ("Triage", "Alpha", "Beta"):
            assert ns.add_fail_category(conn, name) == name
        assert ns.list_marks(conn, A)["failCategories"] == ["Triage", "Alpha", "Beta"]

    def test_the_same_name_ignoring_case_refuses_over_the_whole_list(self, conn) -> None:
        ns.add_fail_category(conn, "Triage")
        assert refusal(ns.add_fail_category, conn, "triage") == ("category_exists", "")
        assert refusal(ns.add_fail_category, conn, "TRIAGE") == ("category_exists", "")
        # SQLite's NOCASE folds ASCII only: the Python rule is the real one.
        ns.add_fail_category(conn, NAME_A)
        assert refusal(ns.add_fail_category, conn, NAME_B)[0] == "category_exists"

    def test_the_list_is_one_for_every_story_and_a_starter_name_is_allowed(self, conn) -> None:
        ns.add_fail_category(conn, "Triage")
        assert ns.add_fail_category(conn, "Note") == "Note"  # not a note category: no starters
        assert ns.list_marks(conn, A)["failCategories"] == ["Triage", "Note"]
        assert ns.list_marks(conn, B)["failCategories"] == ["Triage", "Note"]

    def test_the_hundred_and_first_refuses_and_the_count_is_over_the_whole_list(self, conn) -> None:
        conn.execute("BEGIN")
        for i in range(100):
            conn.execute("INSERT INTO fail_categories(name) VALUES (?)", (f"Name {i}",))
        conn.execute("COMMIT")
        assert refusal(ns.add_fail_category, conn, "One more") == ("limit_reached", "")
        assert refusal(ns.add_fail_category, conn, "name 5") == ("category_exists", "")
        assert conn.execute("SELECT COUNT(*) FROM fail_categories").fetchone()[0] == 100

    def test_a_refused_name_never_reaches_sql(self, conn) -> None:
        assert refusal(ns.add_fail_category, conn, VISA) == ("card_number", "name")
        assert refusal(ns.add_fail_category, conn, "c" * 25) == ("too_long", "name")
        assert refusal(ns.add_fail_category, conn, " x") == ("bad_request", "name")
        assert refusal(ns.add_fail_category, conn, "") == ("bad_request", "name")
        assert conn.execute("SELECT COUNT(*) FROM fail_categories").fetchone()[0] == 0

    def test_a_bad_stored_name_is_skipped_and_counted_with_its_text_nowhere(self, conn) -> None:
        ns.add_fail_category(conn, NAME_A)
        for bad in (VISA, "c" * 200, " x", MARKER + "\x07", NAME_C):
            conn.execute("INSERT INTO fail_categories(name) VALUES (?)", (bad,))
        listed = ns.list_marks(conn, A)
        assert listed["failCategories"] == [NAME_A] and listed["skipped"] == 5
        assert MARKER not in repr(listed) and VISA not in repr(listed)


class TestPaths:
    def test_a_created_path_has_an_id_and_seq_one_then_two_and_one_in_another_story(
        self, conn, ids
    ) -> None:
        first = ns.create_path(conn, path_draft())
        second = ns.create_path(conn, path_draft(name="Path 2"))
        other = ns.create_path(conn, path_draft(scenario=B))
        assert [first["seq"], second["seq"], other["seq"]] == [1, 2, 1]
        for p in (first, second, other):
            assert ms.is_path_id(p["id"])
        assert len({first["id"], second["id"], other["id"]}) == 3
        assert list(first) == ["id", "scenario", "seq", "name", "stops"]

    def test_stops_are_stored_as_compact_json_of_canonical_records(self, conn, ids) -> None:
        stops = [stop("fraud", "tx-0001"), stop("login", "lg-0002")]
        out = ns.create_path(conn, path_draft(stops=stops))
        assert out["stops"] == [stop("auth", "tx-0001"), stop("login", "lg-0002")]
        raw = conn.execute("SELECT stops FROM custom_paths").fetchone()[0]
        assert raw == '[{"kind":"auth","id":"tx-0001"},{"kind":"login","id":"lg-0002"}]'

    def test_the_twenty_first_path_refuses_and_another_story_is_not_counted(
        self, conn, ids
    ) -> None:
        for i in range(20):
            ns.create_path(conn, path_draft(name=f"Path {i + 1}"))
        assert refusal(ns.create_path, conn, path_draft()) == ("limit_reached", "")
        assert ns.create_path(conn, path_draft(scenario=B))["seq"] == 1
        assert conn.execute("SELECT COUNT(*) FROM custom_paths").fetchone()[0] == 21

    def test_one_stop_a_repeated_record_and_a_bad_draft_refuse_before_sql(self, conn, ids) -> None:
        one = path_draft(stops=[stop("auth", "tx-0001")])
        assert refusal(ns.create_path, conn, one) == ("bad_request", "stops")
        twice = path_draft(stops=[stop("auth", "tx-0001"), stop("fraud", "tx-0001")])
        assert refusal(ns.create_path, conn, twice) == ("bad_request", "stops[1]")
        assert refusal(ns.create_path, conn, path_draft(name=VISA))[0] == "card_number"
        assert refusal(ns.create_path, conn, {**path_draft(), "extra": 1}) == ("bad_request", "")
        assert conn.execute("SELECT COUNT(*) FROM custom_paths").fetchone()[0] == 0

    def test_an_update_changes_name_and_stops_and_keeps_id_scenario_and_seq(
        self, conn, ids
    ) -> None:
        ns.create_path(conn, path_draft())
        made = ns.create_path(conn, path_draft(name="Second"))
        fields = {"name": "Renamed", "stops": [stop("login", "lg-0002"), stop("auth", "tx-0003")]}
        out = ns.update_path(conn, made["id"], fields)
        assert out == {**made, **fields}
        assert [p["name"] for p in ns.list_marks(conn, A)["paths"]] == ["Path 1", "Renamed"]

    def test_an_unknown_a_malformed_and_a_refused_id_are_not_found_before_sql(self, conn) -> None:
        fields = {"name": "x", "stops": [stop("auth", "a"), stop("auth", "b")]}
        for bad in (GOOD_PATH_ID, "nope", VISA_PATH_ID, GOOD_PATH_ID.upper(), None, 5):
            assert refusal(ns.update_path, conn, bad, fields) == ("not_found", "")
            assert refusal(ns.delete_path, conn, bad) == ("not_found", "")

    def test_an_update_checks_the_fields_before_the_id(self, conn) -> None:
        assert refusal(ns.update_path, conn, "nope", {"name": "x", "stops": []}) == (
            "bad_request",
            "stops",
        )

    def test_a_delete_removes_the_row_and_a_second_delete_is_not_found(self, conn, ids) -> None:
        made = ns.create_path(conn, path_draft())
        ns.delete_path(conn, made["id"])
        assert ns.list_marks(conn, A)["paths"] == []
        assert refusal(ns.delete_path, conn, made["id"]) == ("not_found", "")

    def test_a_new_path_takes_the_highest_seq_plus_one(self, conn, ids) -> None:
        a = ns.create_path(conn, path_draft())
        b = ns.create_path(conn, path_draft(name="Two"))
        ns.delete_path(conn, b["id"])  # the top seq is removed: it comes back
        assert ns.create_path(conn, path_draft(name="Again"))["seq"] == 2
        ns.delete_path(conn, a["id"])
        assert ns.create_path(conn, path_draft(name="Third"))["seq"] == 3

    def test_paths_list_in_seq_order(self, conn) -> None:
        raw_path(conn, id="path-" + "b" * 32, seq=2, name="Second")
        raw_path(conn, id="path-" + "a" * 32, seq=1, name="First")
        assert [p["name"] for p in ns.list_marks(conn, A)["paths"]] == ["First", "Second"]

    def test_a_bad_path_row_is_skipped_counted_and_its_text_is_nowhere(self, conn) -> None:
        raw_path(conn, id="path-" + "a" * 32, seq=1)
        raw_path(conn, id="path-" + "b" * 32, seq=2, stops="[]")
        raw_path(conn, id="path-" + "c" * 32, seq=3, name=VISA)
        raw_path(conn, id="path-" + "d" * 32, seq=4, stops="not json " + MARKER)
        raw_path(conn, id=VISA_PATH_ID, seq=5)
        raw_path(conn, id="path-" + "e" * 32, seq=6, name=MARKER + "\x07")
        raw_path(conn, id="path-" + "f" * 32, seq=7, stops='[{"kind":"auth","id":"x"}]')
        listed = ns.list_marks(conn, A)
        assert [p["seq"] for p in listed["paths"]] == [1] and listed["skipped"] == 6
        assert MARKER not in repr(listed) and VISA not in repr(listed)

    def test_the_wire_fixtures_round_trip_through_the_store(self, conn, monkeypatch) -> None:
        monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(PATH_UUID))
        ns.put_node(conn, NODE_WIRE, False)
        assert ns.add_fail_category(conn, "Shared key") == "Shared key"
        assert ns.create_path(conn, path_draft()) == PATH_WIRE
        listed = ns.list_marks(conn, A)
        assert listed == LIST_WIRE
        assert wire_text(listed) == wire_text(LIST_WIRE)
        assert list(listed) == ["nodes", "paths", "failCategories", "skipped"]


def v2_file(**over: Any) -> dict[str, Any]:
    """A version 2 file for card-fraud with no notes and the wire marks; keys replaced by `over`."""
    base: dict[str, Any] = {k: v for k, v in FILE_V2_WIRE.items()}
    base.update(over)
    return base


def file_node(rec_id: str, **over: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "record": {"kind": "auth", "id": rec_id},
        "pinned": False,
        "disposition": "none",
        "category": None,
        "settled": False,
    }
    base.update(over)
    return base


def file_path(n: int, **over: Any) -> dict[str, Any]:
    """A file path whose id is made of the hex digit n (n 1 to 15 reads as a letter run)."""
    base: dict[str, Any] = {
        "id": "path-" + "abcdef0123456789"[n % 16] * 32,
        "seq": n,
        "name": f"Path {n}",
        "stops": [stop("auth", "tx-0001"), stop("login", "lg-0002")],
    }
    base.update(over)
    return base


TABLES = ("notes", "record_nodes", "custom_paths", "fail_categories")
LIMITS_AT = {"nodes": 1000, "paths": 20, "failCategories": 100}
PART_INDEX = {
    "nodes": 1,
    "paths": 2,
    "failCategories": 3,
}  # the place of the part's table in counts
NEW_ENTRIES: dict[str, list[Any]] = {
    "nodes": [file_node("new-1"), file_node("new-2")],
    "paths": [file_path(1), file_path(2)],
    "failCategories": ["New one", "New two"],
}


def counts(conn: sqlite3.Connection) -> list[int]:
    """The row count of the notes table and of the three tables of the node, in TABLES order."""
    return [conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES]


def fill(conn: sqlite3.Connection, part: str, n: int) -> None:
    """n rows of a part written by hand into card-fraud, in one transaction."""
    conn.execute("BEGIN")
    for i in range(n):
        if part == "nodes":
            raw_node(conn, rec_id=f"tx-{i:04d}")
        elif part == "paths":
            raw_path(conn, id=f"path-{i:x}".ljust(37, "e"), seq=i + 1, name=f"P {i}")
        else:
            conn.execute("INSERT INTO fail_categories(name) VALUES (?)", (f"N {i}",))
    conn.execute("COMMIT")


class TestImportAtVersionTwo:
    def test_the_answer_holds_six_counts(self, conn) -> None:
        out = ns.import_file(conn, v2_file())
        assert out == {
            "added": 0,
            "replaced": 0,
            "nodesAdded": 1,
            "nodesReplaced": 0,
            "pathsAdded": 1,
            "pathsReplaced": 0,
        }
        assert ns.export_file(conn, A) == FILE_V2_WIRE

    def test_a_round_trip_into_a_second_file_gives_the_same_marks(
        self, conn, ids, tmp_path, monkeypatch
    ) -> None:
        ns.insert_note(conn, _note_draft())
        ns.put_node(conn, node_doc(pinned=True, disposition="fail", category="Triage"), False)
        ns.put_node(conn, node_doc(record=stop("login", "lg-0002"), settled=True), False)
        ns.add_fail_category(conn, "Triage")
        ns.add_fail_category(conn, "Alpha")
        ns.create_path(conn, path_draft())
        ns.create_path(
            conn, path_draft(name="Two", stops=[stop("login", "lg-0002"), stop("a", "b")])
        )
        exported = ns.export_file(conn, A)
        assert exported["version"] == 2 and len(exported["nodes"]) == 2
        monkeypatch.setenv("FFR_NOTES_DB", str(tmp_path / "second.sqlite3"))
        second = ns.connect()
        try:
            out = ns.import_file(second, exported)
            assert out == {**out, "added": 1, "nodesAdded": 2, "pathsAdded": 2}
            assert ns.export_file(second, A) == exported
            assert ns.list_marks(second, A)["failCategories"] == ["Triage", "Alpha"]
            again = ns.import_file(second, exported)
            assert (again["nodesAdded"], again["nodesReplaced"]) == (0, 2)
            assert (again["pathsAdded"], again["pathsReplaced"]) == (0, 2)
            assert ns.export_file(second, A) == exported
        finally:
            second.close()

    def test_a_version_one_file_changes_no_mark(self, conn, ids) -> None:
        ns.put_node(conn, node_doc(pinned=True, settled=True), False)
        ns.create_path(conn, path_draft())
        ns.add_fail_category(conn, "Triage")
        before = ns.list_marks(conn, A)
        v1 = {"format": "ffr-notes", "version": 1, "scenario": A, "categories": [], "notes": []}
        out = ns.import_file(conn, v1)
        assert (out["nodesAdded"], out["nodesReplaced"]) == (0, 0)
        assert (out["pathsAdded"], out["pathsReplaced"]) == (0, 0)
        assert ns.list_marks(conn, A) == before

    def test_a_file_node_replaces_the_held_node_of_its_record(self, conn) -> None:
        ns.put_node(conn, node_doc(pinned=True, disposition="pass", settled=True), False)
        node = file_node("tx-0001", disposition="fail", category="Triage", settled=True)
        out = ns.import_file(conn, v2_file(nodes=[node], paths=[], failCategories=[]))
        assert (out["nodesAdded"], out["nodesReplaced"]) == (0, 1)
        assert ns.list_marks(conn, A)["nodes"] == [
            node_doc(pinned=False, disposition="fail", category="Triage", settled=True)
        ]

    def test_a_held_settled_row_and_a_file_node_with_settled_false_keep_settled_true(
        self, conn
    ) -> None:
        ns.put_node(conn, node_doc(disposition="pass", settled=True), False)
        node = file_node("tx-0001", pinned=True, settled=False)
        ns.import_file(conn, v2_file(nodes=[node], paths=[], failCategories=[]))
        held = ns.list_marks(conn, A)["nodes"][0]
        assert (held["pinned"], held["disposition"], held["settled"]) == (True, "none", True)

    def test_a_file_node_with_settled_true_settles_an_unsettled_row(self, conn) -> None:
        ns.put_node(conn, node_doc(pinned=True), False)
        node = file_node("tx-0001", pinned=True, settled=True)
        ns.import_file(conn, v2_file(nodes=[node], paths=[], failCategories=[]))
        assert ns.list_marks(conn, A)["nodes"][0]["settled"] is True

    def test_a_held_node_that_the_file_does_not_name_stays(self, conn) -> None:
        ns.put_node(conn, node_doc(record=stop("login", "lg-0009"), pinned=True), False)
        ns.import_file(conn, v2_file(paths=[], failCategories=[]))
        held = [(n["record"]["kind"], n["record"]["id"]) for n in ns.list_marks(conn, A)["nodes"]]
        assert held == [("auth", "tx-0001"), ("login", "lg-0009")]

    def test_a_node_written_as_fraud_in_a_file_lands_on_the_auth_row(self, conn) -> None:
        ns.put_node(conn, node_doc(pinned=True), False)
        node = file_node("tx-0001", pinned=False)
        node["record"] = stop("fraud", "tx-0001")
        out = ns.import_file(conn, v2_file(nodes=[node], paths=[], failCategories=[]))
        assert (out["nodesAdded"], out["nodesReplaced"]) == (0, 1)
        assert counts(conn)[1] == 1

    def test_a_held_path_keeps_its_seq_and_a_new_path_takes_the_next_seq_in_file_order(
        self, conn, ids
    ) -> None:
        ns.create_path(conn, path_draft())
        held = ns.create_path(conn, path_draft(name="Held"))
        new_a, new_b = file_path(9, seq=77), file_path(5, seq=3)
        renamed = file_path(
            0, id=held["id"], seq=99, name="Renamed", stops=[stop("a", "b"), stop("c", "d")]
        )
        out = ns.import_file(
            conn, v2_file(nodes=[], paths=[new_a, renamed, new_b], failCategories=[])
        )
        assert (out["pathsAdded"], out["pathsReplaced"]) == (2, 1)
        by_id = {p["id"]: p for p in ns.list_marks(conn, A)["paths"]}
        assert by_id[held["id"]]["seq"] == 2 and by_id[held["id"]]["name"] == "Renamed"
        assert by_id[held["id"]]["stops"] == [stop("a", "b"), stop("c", "d")]
        assert by_id[new_a["id"]]["seq"] == 3 and by_id[new_b["id"]]["seq"] == 4

    def test_fail_categories_merge_ignoring_case_and_keep_insertion_order(self, conn) -> None:
        ns.add_fail_category(conn, "Triage")
        names = ["triage", "Alpha", "ALPHA2"]
        ns.import_file(conn, v2_file(nodes=[], paths=[], failCategories=names))
        assert ns.list_marks(conn, A)["failCategories"] == ["Triage", "Alpha", "ALPHA2"]

    def test_an_export_of_either_story_carries_the_shared_list(self, conn) -> None:
        ns.add_fail_category(conn, "Triage")
        ns.add_fail_category(conn, "Alpha")
        assert ns.export_file(conn, A)["failCategories"] == ["Triage", "Alpha"]
        assert ns.export_file(conn, B)["failCategories"] == ["Triage", "Alpha"]

    def test_a_file_for_one_story_merges_into_the_list_every_story_reads(self, conn) -> None:
        ns.add_fail_category(conn, "Triage")
        ns.import_file(conn, v2_file(nodes=[], paths=[], failCategories=["Alpha"]))
        assert ns.list_marks(conn, B)["failCategories"] == ["Triage", "Alpha"]

    def test_two_new_names_into_a_list_of_99_refuse_the_whole_file_and_leave_99(self, conn) -> None:
        fill(conn, "failCategories", 99)
        before = counts(conn)
        f = v2_file(nodes=[file_node("tx-0042")], paths=[file_path(1)])
        f["failCategories"] = ["New one", "New two"]
        assert refusal(ns.import_file, conn, f) == ("limit_reached", "")
        assert counts(conn) == before
        assert conn.execute("SELECT COUNT(*) FROM fail_categories").fetchone()[0] == 99
        assert len(ns.list_marks(conn, A)["failCategories"]) == 99

    def test_a_path_id_held_by_another_story_refuses_and_nothing_is_applied(self, conn) -> None:
        raw_path(conn, scenario=B)  # GOOD_PATH_ID is held by another story
        ns.put_node(conn, node_doc(record=stop("auth", "keep")), False)
        before = counts(conn)
        note = {
            "id": "note-" + "b" * 32,
            "time": 1,
            "link": None,
            "colour": "r1",
            "category": "Note",
            "decision": "none",
            "seq": 1,
            "body": {"v": 1, "content": []},
        }
        f = v2_file(
            notes=[note],
            nodes=[file_node("tx-0042")],
            failCategories=["Fresh"],
            paths=[file_path(1), FILE_V2_WIRE["paths"][0]],
        )
        assert refusal(ns.import_file, conn, f) == ("bad_file", "paths[1].id")
        assert counts(conn) == before
        assert ns.list_marks(conn, A)["failCategories"] == []

    @pytest.mark.parametrize("part", ["nodes", "paths", "failCategories"])
    def test_a_file_that_passes_a_limit_applies_nothing(self, conn, part: str) -> None:
        fill(conn, part, LIMITS_AT[part] - 1)
        before = counts(conn)
        f = v2_file(nodes=[], paths=[], failCategories=[])
        f[part] = NEW_ENTRIES[part][:2]  # one over the limit
        assert refusal(ns.import_file, conn, f) == ("limit_reached", "")
        assert counts(conn) == before

    @pytest.mark.parametrize("part", ["nodes", "paths", "failCategories"])
    def test_a_file_that_lands_exactly_on_a_limit_is_applied(self, conn, part: str) -> None:
        fill(conn, part, LIMITS_AT[part] - 1)
        f = v2_file(nodes=[], paths=[], failCategories=[])
        f[part] = NEW_ENTRIES[part][:1]
        ns.import_file(conn, f)
        assert counts(conn)[PART_INDEX[part]] == LIMITS_AT[part]

    def test_another_story_marks_are_never_touched(self, conn) -> None:
        ns.put_node(conn, node_doc(scenario=B, pinned=True), False)
        ns.import_file(conn, v2_file())
        assert ns.list_marks(conn, B)["nodes"] == [node_doc(scenario=B, pinned=True)]

    def test_a_refused_marks_part_applies_nothing_of_the_file(self, conn) -> None:
        bad = file_node("tx-" + VISA)
        assert refusal(ns.import_file, conn, v2_file(nodes=[bad]))[0] == "card_number"
        assert counts(conn) == [0, 0, 0, 0]


def _note_draft() -> dict[str, Any]:
    from tests.test_notes_fixtures import draft

    return draft(link={"kind": "auth", "id": "tx-0001"}, decision="pass")
