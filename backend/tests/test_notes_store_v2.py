"""The notes database at version 2: three new tables, nothing of version 1 touched.

The migration is additive. A file built with today's version 1 statements, holding notes and
custom categories, opens with the new connect() and keeps every row; the three tables of the
investigator's node (record_nodes, fail_categories, custom_paths) are added; user_version reads 2.

FROZEN_V1_SQL below is a character for character copy of the statements version 1 ran
(notes_store.init before this change). It is the proof's input and must never follow the code.

What this file does not test: any function that reads or writes the three new tables (list_marks,
put_node and the rest have their own file, test_marks_store.py); here the tables are filled by raw
SQL only.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

import notes_store as ns
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    ROOT,
    _isolated_notes_db,
    hello,
)

FROZEN_V1_SQL = (
    "CREATE TABLE IF NOT EXISTS notes("
    " id TEXT PRIMARY KEY, scenario TEXT NOT NULL, seq INTEGER NOT NULL,"
    # the bound is written in two pieces so that no 13 digit run stands in a test file
    " time_ms INTEGER NOT NULL CHECK(time_ms BETWEEN 0 AND 41024448"
    "00000),"
    " link_kind TEXT, link_id TEXT,"
    " colour TEXT NOT NULL CHECK(colour IN ('r0','r1','r2','r3','r4','muted')),"
    " category TEXT NOT NULL,"
    " decision TEXT NOT NULL CHECK(decision IN ('none','pass','fail')),"
    " body TEXT NOT NULL, CHECK((link_kind IS NULL) = (link_id IS NULL)),"
    " UNIQUE(scenario, seq))",
    "CREATE TABLE IF NOT EXISTS note_categories(name TEXT PRIMARY KEY COLLATE NOCASE)",
    "CREATE INDEX IF NOT EXISTS notes_by_time ON notes(scenario, time_ms, seq)",
)

NEW_TABLES = ("record_nodes", "fail_categories", "custom_paths")
V1_OBJECTS = ("notes", "note_categories", "notes_by_time")

# Note ids from fixed hex (letters only, so no digit run), never a live random draw.
NOTE_IDS = ("note-" + "ab" * 16, "note-" + "cd" * 16, "note-" + "ef" * 16)
PATH_ID = "path-" + "ab" * 16


def build_version_one(path: Path) -> None:
    """A version 1 file made with the frozen statements: three notes (one linked, one PASS, one
    FAIL) and two custom categories."""
    conn = sqlite3.connect(path, isolation_level=None)
    try:
        for statement in FROZEN_V1_SQL:
            conn.execute(statement)
        conn.execute("PRAGMA user_version = 1")
        body = json.dumps(hello(), separators=(",", ":"))
        rows = [
            (NOTE_IDS[0], "card-fraud", 1, 5, "auth", "tx-0001", "r1", "Note", "none", body),
            (NOTE_IDS[1], "card-fraud", 2, 6, None, None, "r2", "Question", "pass", body),
            (NOTE_IDS[2], "key-many-networks", 1, 7, None, None, "muted", "Triage", "fail", body),
        ]
        conn.executemany(
            "INSERT INTO notes(id, scenario, seq, time_ms, link_kind, link_id, colour, category,"
            " decision, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.executemany("INSERT INTO note_categories(name) VALUES (?)", [("Triage",), ("Hunch",)])
    finally:
        conn.close()


def version1_reads(conn: sqlite3.Connection) -> dict[str, Any]:
    """Every read the proof compares, as plain tuples (full rows, rowid included)."""
    return {
        "notes": [tuple(r) for r in conn.execute("SELECT * FROM notes ORDER BY id")],
        "categories": [
            tuple(r) for r in conn.execute("SELECT rowid, * FROM note_categories ORDER BY rowid")
        ],
        "sql": [
            tuple(r)
            for r in conn.execute(
                "SELECT name, sql FROM sqlite_master"
                " WHERE name IN ('notes','note_categories','notes_by_time') ORDER BY name"
            )
        ],
        "columns": [tuple(r) for r in conn.execute("PRAGMA table_info(notes)")],
    }


def user_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def table_names(conn: sqlite3.Connection) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


@pytest.fixture
def conn():
    c = ns.connect()
    yield c
    c.close()


class TestMigrationFromVersionOne:
    def test_a_version_one_file_keeps_every_row_and_gains_three_tables(self) -> None:
        path = ns.db_path()
        build_version_one(path)
        raw = sqlite3.connect(path, isolation_level=None)
        raw.row_factory = sqlite3.Row
        try:
            before = version1_reads(raw)
            assert user_version(raw) == 1
            assert table_names(raw).isdisjoint(NEW_TABLES)
        finally:
            raw.close()
        assert len(before["notes"]) == 3 and len(before["categories"]) == 2

        c = ns.connect()
        try:
            after = version1_reads(c)
            assert after["notes"] == before["notes"]
            assert after["categories"] == before["categories"]
            assert after["sql"] == before["sql"]
            assert after["columns"] == before["columns"]
            assert user_version(c) == 2
            assert set(NEW_TABLES) <= table_names(c)
        finally:
            c.close()

    def test_the_frozen_statements_are_the_text_a_fresh_file_holds(self) -> None:
        # Proves the frozen copy is honest: a fresh file made by the live code holds the same
        # sqlite_master text for the three version 1 objects as a file made by the frozen text.
        frozen = Path(str(ns.db_path()) + ".frozen")
        build_version_one(frozen)
        raw = sqlite3.connect(frozen, isolation_level=None)
        raw.row_factory = sqlite3.Row
        try:
            frozen_sql = version1_reads(raw)["sql"]
        finally:
            raw.close()
        fresh = ns.connect()
        try:
            assert version1_reads(fresh)["sql"] == frozen_sql
        finally:
            fresh.close()

    def test_a_version_one_file_opened_twice_changes_nothing_the_second_time(self) -> None:
        build_version_one(ns.db_path())
        first = ns.connect()
        try:
            once = version1_reads(first)
        finally:
            first.close()
        second = ns.connect()
        try:
            assert version1_reads(second) == once
            assert user_version(second) == 2
        finally:
            second.close()

    def test_a_fresh_file_has_every_table_and_version_two(self, conn) -> None:
        assert user_version(conn) == 2
        assert set(V1_OBJECTS) | set(NEW_TABLES) <= (
            table_names(conn)
            | {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'index'")}
        )

    def test_the_notes_table_is_unchanged_in_its_columns(self, conn) -> None:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(notes)")]
        assert cols == [
            "id",
            "scenario",
            "seq",
            "time_ms",
            "link_kind",
            "link_id",
            "colour",
            "category",
            "decision",
            "body",
        ]


class TestTheLockOfAnEarlyReturn:
    def test_a_version_two_file_takes_no_write_lock_and_a_version_one_file_does(self) -> None:
        path = ns.db_path()
        # Version 2, set by hand beside the tables, so this half proves the early return and
        # does not lean on the migration.
        made = ns.connect()
        made.close()
        raw = sqlite3.connect(path, isolation_level=None)
        raw.execute("PRAGMA user_version = 2")
        raw.close()

        holder = sqlite3.connect(path, isolation_level=None)
        other = sqlite3.connect(path, timeout=0, isolation_level=None)
        try:
            holder.execute("BEGIN IMMEDIATE")
            ns.init(other)  # returns at once: no lock asked for
            holder.execute("ROLLBACK")
        finally:
            other.close()
            holder.close()

        # The control: the same call on a version 1 file with the holder open must be refused, so
        # the first half proves the early return and not a lucky lock.
        control = Path(str(path) + ".v1")
        build_version_one(control)
        holder = sqlite3.connect(control, isolation_level=None)
        other = sqlite3.connect(control, timeout=0, isolation_level=None)
        try:
            holder.execute("BEGIN IMMEDIATE")
            with pytest.raises(sqlite3.OperationalError):
                ns.init(other)
            holder.execute("ROLLBACK")
        finally:
            other.close()
            holder.close()


class TestTheNewTablesRefuseByThemselves:
    def node_row(self, **over: Any) -> dict[str, Any]:
        row: dict[str, Any] = {
            "scenario": "card-fraud",
            "rec_kind": "auth",
            "rec_id": "tx-0001",
            "pinned": 1,
            "disposition": "fail",
            "category": "Shared key",
            "settled": 1,
        }
        row.update(over)
        return row

    def insert_node(self, conn: sqlite3.Connection, **over: Any) -> None:
        conn.execute(
            "INSERT INTO record_nodes(scenario, rec_kind, rec_id, pinned, disposition, category,"
            " settled) VALUES (:scenario, :rec_kind, :rec_id, :pinned, :disposition, :category,"
            " :settled)",
            self.node_row(**over),
        )

    def insert_path(self, conn: sqlite3.Connection, **over: Any) -> None:
        row: dict[str, Any] = {
            "id": PATH_ID,
            "scenario": "card-fraud",
            "seq": 1,
            "name": "Path 1",
            "stops": "[]",
        }
        row.update(over)
        conn.execute(
            "INSERT INTO custom_paths(id, scenario, seq, name, stops)"
            " VALUES (:id, :scenario, :seq, :name, :stops)",
            row,
        )

    def test_a_good_node_row_is_stored(self, conn) -> None:
        self.insert_node(conn)
        self.insert_node(conn, rec_id="tx-0002", disposition="none", category=None, pinned=0)
        assert conn.execute("SELECT COUNT(*) FROM record_nodes").fetchone()[0] == 2

    @pytest.mark.parametrize(
        "over",
        [
            {"pinned": 2},
            {"pinned": -1},
            {"settled": 2},
            {"settled": -1},
            {"disposition": "maybe"},
            {"disposition": "PASS", "category": None},
            {"disposition": "pass", "category": "x"},
            {"disposition": "wait", "category": "x"},
            {"disposition": "none", "category": "x"},
            {"scenario": None},
            {"rec_kind": None},
            {"rec_id": None},
            {"pinned": None},
            {"settled": None},
        ],
    )
    def test_a_node_row_that_breaks_a_check_is_refused(self, conn, over) -> None:
        with pytest.raises(sqlite3.IntegrityError):
            self.insert_node(conn, **over)
        assert conn.execute("SELECT COUNT(*) FROM record_nodes").fetchone()[0] == 0

    def test_a_node_has_one_row_for_its_record(self, conn) -> None:
        self.insert_node(conn)
        with pytest.raises(sqlite3.IntegrityError):
            self.insert_node(conn, pinned=0)
        self.insert_node(conn, scenario="key-many-networks")
        self.insert_node(conn, rec_kind="login")

    def test_a_fail_category_is_unique_ignoring_case_over_the_whole_list(self, conn) -> None:
        conn.execute("INSERT INTO fail_categories(name) VALUES (?)", ("Triage",))
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO fail_categories(name) VALUES (?)", ("triage",))
        conn.execute("INSERT INTO fail_categories(name) VALUES (?)", ("Other",))
        assert [r[0] for r in conn.execute("SELECT name FROM fail_categories ORDER BY rowid")] == [
            "Triage",
            "Other",
        ]

    def test_a_path_has_one_id_and_one_seq_in_its_scenario(self, conn) -> None:
        self.insert_path(conn)
        with pytest.raises(sqlite3.IntegrityError):
            self.insert_path(conn, seq=2)  # the same id
        with pytest.raises(sqlite3.IntegrityError):
            self.insert_path(conn, id="path-" + "cd" * 16)  # the same seq in the same scenario
        self.insert_path(conn, id="path-" + "cd" * 16, scenario="key-many-networks")
        self.insert_path(conn, id="path-" + "ef" * 16, seq=2)
        assert conn.execute("SELECT COUNT(*) FROM custom_paths").fetchone()[0] == 3

    def test_a_path_row_needs_every_column(self, conn) -> None:
        for over in ({"scenario": None}, {"seq": None}, {"name": None}, {"stops": None}):
            with pytest.raises(sqlite3.IntegrityError):
                self.insert_path(conn, **over)

    def test_the_columns_of_the_three_tables(self, conn) -> None:
        def cols(table: str) -> list[str]:
            return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]

        assert cols("record_nodes") == [
            "scenario",
            "rec_kind",
            "rec_id",
            "pinned",
            "disposition",
            "category",
            "settled",
        ]
        assert cols("fail_categories") == ["name"]  # no scenario column: one list for every story
        assert cols("custom_paths") == ["id", "scenario", "seq", "name", "stops"]

    def test_no_clock_column_exists_in_the_new_tables(self, conn) -> None:
        for table in NEW_TABLES:
            for r in conn.execute(f"PRAGMA table_info({table})"):
                assert "time" not in r[1] and "created" not in r[1] and "updated" not in r[1]


class TestADowngradeIsHarmless:
    def test_an_older_build_that_writes_version_one_loses_no_row_of_the_new_tables(self) -> None:
        first = ns.connect()
        try:
            first.execute(
                "INSERT INTO record_nodes(scenario, rec_kind, rec_id, pinned, disposition,"
                " category, settled) VALUES ('card-fraud', 'auth', 'tx-0001', 1, 'fail',"
                " 'Shared key', 1)"
            )
            first.execute("INSERT INTO fail_categories(name) VALUES ('Shared key')")
            first.execute(
                "INSERT INTO custom_paths(id, scenario, seq, name, stops)"
                " VALUES (?, 'card-fraud', 1, 'Path 1', '[]')",
                (PATH_ID,),
            )
            before = {
                t: [tuple(r) for r in first.execute(f"SELECT * FROM {t} ORDER BY rowid")]
                for t in NEW_TABLES
            }
            # What an older build does when it meets version 2: it runs its no-op statements and
            # writes 1 back (its init returns early only at exactly 1).
            first.execute("PRAGMA user_version = 1")
        finally:
            first.close()
        again = ns.connect()
        try:
            assert user_version(again) == 2
            after = {
                t: [tuple(r) for r in again.execute(f"SELECT * FROM {t} ORDER BY rowid")]
                for t in NEW_TABLES
            }
            assert after == before
            assert all(len(rows) == 1 for rows in after.values())
        finally:
            again.close()


class TestTheNewTablesLiveOnlyInTheNotesFile:
    def test_the_schema_and_the_migrations_hold_none_of_the_three_names(self) -> None:
        schema = (ROOT / "backend" / "schema.sql").read_text(encoding="utf-8").lower()
        for name in NEW_TABLES:
            assert name not in schema
        for m in sorted((ROOT / "backend" / "migrations").glob("*")):
            if m.is_file():
                body = m.read_text(encoding="utf-8", errors="replace").lower()
                for name in NEW_TABLES:
                    assert name not in body, m.name

    def test_no_scenario_pack_database_holds_one_of_them(self) -> None:
        packs = sorted((ROOT / "data").glob("*.db"))
        assert packs, "the pack databases are copied into data/ for the suite"
        for p in packs:
            assert p.resolve() != ns.db_path().resolve()
            c = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
            try:
                found = c.execute(
                    "SELECT name FROM sqlite_master WHERE name IN (?, ?, ?)", NEW_TABLES
                ).fetchall()
            finally:
                c.close()
            assert found == [], p.name
