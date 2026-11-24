"""The notes store: its own database file, the seq rule, checked reads, import and delete."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any

import pytest

import notes_store as ns
from notes_schema import NoteRefused, check_file, make_note_id
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    GOOD_ID,
    ROOT,
    VISA,
    VISA_ID,
    _isolated_notes_db,
    doc,
    draft,
    fields,
    hello,
    para,
    rich_body,
    text,
)

NOTE_KEYS = {"id", "scenario", "time", "seq", "link", "colour", "category", "decision", "body"}


def refusal(fn: Any, *args: Any) -> tuple[str, str]:
    with pytest.raises(NoteRefused) as info:
        fn(*args)
    return info.value.code, info.value.where


@pytest.fixture
def conn():
    c = ns.connect()
    yield c
    c.close()


def raw_row(conn: sqlite3.Connection, **over: Any) -> None:
    """A row written by hand, around every check of the store."""
    row: dict[str, Any] = {
        "id": "note-" + uuid.uuid4().hex,
        "scenario": "card-fraud",
        "seq": 500,
        "time_ms": 7,
        "link_kind": None,
        "link_id": None,
        "colour": "r1",
        "category": "Note",
        "decision": "none",
        "body": json.dumps(hello(), separators=(",", ":")),
    }
    row.update(over)
    conn.execute(
        "INSERT INTO notes(id, scenario, seq, time_ms, link_kind, link_id, colour, category,"
        " decision, body) VALUES (:id, :scenario, :seq, :time_ms, :link_kind, :link_id, :colour,"
        " :category, :decision, :body)",
        row,
    )


class TestFileAndSchema:
    def test_the_default_file_is_data_notes_sqlite3(self, monkeypatch) -> None:
        monkeypatch.delenv("FFR_NOTES_DB")
        assert ns.db_path() == ROOT / "data" / "notes.sqlite3"

    def test_the_override_is_read_at_every_call(self, tmp_path, monkeypatch) -> None:
        monkeypatch.setenv("FFR_NOTES_DB", str(tmp_path / "other.sqlite3"))
        assert ns.db_path() == tmp_path / "other.sqlite3"

    def test_connect_makes_the_file_with_user_version_two(self, conn) -> None:
        assert ns.db_path().exists()
        assert conn.execute("PRAGMA user_version").fetchone()[0] == 2

    def test_init_is_idempotent(self, conn) -> None:
        ns.insert_note(conn, draft())
        ns.init(conn)
        ns.init(conn)
        assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 1

    def test_secure_delete_is_on(self, conn) -> None:
        assert conn.execute("PRAGMA secure_delete").fetchone()[0] == 1

    def test_the_tables_and_the_index(self, conn) -> None:
        names = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
        }
        assert {"notes", "note_categories", "notes_by_time"} <= names

    def test_no_clock_column_exists(self, conn) -> None:
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

    def test_the_table_refuses_a_bad_colour_and_a_half_link(self, conn) -> None:
        with pytest.raises(sqlite3.IntegrityError):
            raw_row(conn, colour="alarm")
        with pytest.raises(sqlite3.IntegrityError):
            raw_row(conn, link_kind="auth")
        with pytest.raises(sqlite3.IntegrityError):
            raw_row(conn, time_ms=-1)

    def test_a_reseed_and_the_scenario_packs_never_meet_the_notes_file(self) -> None:
        assert "notes" not in (ROOT / "backend" / "schema.sql").read_text(encoding="utf-8").lower()
        migrations = sorted((ROOT / "backend" / "migrations").glob("*"))
        for m in migrations:
            if m.is_file():
                assert "note_categories" not in m.read_text(encoding="utf-8", errors="replace")

    def test_no_scenario_pack_database_holds_a_notes_table(self) -> None:
        packs = sorted((ROOT / "data").glob("*.db"))
        assert packs, "the pack databases are copied into data/ for the suite"
        for p in packs:
            assert p.resolve() != ns.db_path().resolve()
            c = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
            try:
                found = c.execute(
                    "SELECT name FROM sqlite_master WHERE name LIKE 'note%'"
                    " AND name NOT LIKE 'notes_%_idx'"
                ).fetchall()
            finally:
                c.close()
            assert found == [], p.name


class TestSeq:
    def test_two_inserts_give_two_sequence_numbers(self, conn) -> None:
        a = ns.insert_note(conn, draft())
        b = ns.insert_note(conn, draft())
        assert (a["seq"], b["seq"]) == (1, 2)

    def test_each_scenario_counts_for_itself(self, conn) -> None:
        ns.insert_note(conn, draft("card-fraud"))
        ns.insert_note(conn, draft("card-fraud"))
        assert ns.insert_note(conn, draft("priya-ato"))["seq"] == 1

    def test_seq_is_the_highest_plus_one_even_after_a_delete_in_the_middle(self, conn) -> None:
        a, b, c = (ns.insert_note(conn, draft()) for _ in range(3))
        ns.delete_note(conn, b["id"])
        assert ns.insert_note(conn, draft())["seq"] == 4
        assert a["seq"] == 1 and c["seq"] == 3

    def test_inserts_from_several_connections_never_share_a_seq(self) -> None:
        results: list[int] = []
        errors: list[BaseException] = []
        gate = threading.Barrier(6)

        def work() -> None:
            c = ns.connect()
            try:
                gate.wait()
                for _ in range(5):
                    results.append(ns.insert_note(c, draft())["seq"])
            except BaseException as e:  # noqa: BLE001 - reported below
                errors.append(e)
            finally:
                c.close()

        threads = [threading.Thread(target=work) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
        assert errors == []
        assert sorted(results) == list(range(1, 31))


class TestInsertUpdateDelete:
    def test_insert_returns_the_note_with_exactly_the_nine_keys(self, conn) -> None:
        n = ns.insert_note(conn, draft(link={"kind": "auth", "id": "tx-1"}, body=rich_body()))
        assert set(n) == NOTE_KEYS
        assert n["time"] == 1_700_000_000_000 and n["link"] == {"kind": "auth", "id": "tx-1"}
        assert n["body"] == rich_body()
        assert n["id"].startswith("note-") and len(n["id"]) == 37

    def test_the_body_is_stored_as_compact_json_text(self, conn) -> None:
        n = ns.insert_note(conn, draft(body=rich_body()))
        stored = conn.execute("SELECT body FROM notes WHERE id = ?", (n["id"],)).fetchone()[0]
        assert stored == json.dumps(rich_body(), ensure_ascii=False, separators=(",", ":"))

    def test_a_refused_id_is_drawn_again(self, conn, monkeypatch) -> None:
        draws = [
            uuid.UUID(hex=VISA + "abcdefabcdefabcd"),
            uuid.UUID(hex="0123456789abcdef0123456789abcdef"),
        ]
        monkeypatch.setattr(ns, "_uuid_source", lambda: draws.pop(0))
        assert ns.insert_note(conn, draft())["id"] == GOOD_ID
        assert (
            conn.execute("SELECT COUNT(*) FROM notes WHERE id LIKE 'note-4111%'").fetchone()[0] == 0
        )

    def test_insert_checks_its_input_again(self, conn) -> None:
        assert refusal(ns.insert_note, conn, draft(body=hello(VISA))) == ("card_number", "body")
        assert refusal(ns.insert_note, conn, {**draft(), "extra": 1})[0] == "bad_request"
        assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0

    def test_the_limit_is_a_thousand_notes_per_scenario(self, conn) -> None:
        conn.execute("BEGIN")
        for i in range(1000):
            raw_row(conn, seq=i + 1)
        conn.execute("COMMIT")
        assert refusal(ns.insert_note, conn, draft()) == ("limit_reached", "")
        assert ns.insert_note(conn, draft("priya-ato"))["seq"] == 1  # another scenario is free

    def test_update_changes_the_five_fields_and_keeps_the_rest(self, conn) -> None:
        n = ns.insert_note(conn, draft(time=42))
        out = ns.update_note(
            conn,
            n["id"],
            fields(
                colour="r3",
                category="Question",
                decision="fail",
                body=hello("new"),
                link={"kind": "a", "id": "b"},
            ),
        )
        assert out["id"] == n["id"] and out["seq"] == n["seq"] == 1
        assert (out["time"], out["scenario"]) == (42, "card-fraud")
        assert (out["colour"], out["category"], out["decision"]) == ("r3", "Question", "fail")
        assert out["body"] == hello("new") and out["link"] == {"kind": "a", "id": "b"}
        assert ns.list_notes(conn, "card-fraud")[0] == [out]

    def test_update_of_an_unknown_or_malformed_id_is_not_found(self, conn) -> None:
        assert refusal(ns.update_note, conn, GOOD_ID, fields()) == ("not_found", "")
        assert refusal(ns.update_note, conn, "nope", fields()) == ("not_found", "")
        assert refusal(ns.update_note, conn, VISA_ID, fields()) == ("not_found", "")

    def test_update_checks_its_input(self, conn) -> None:
        n = ns.insert_note(conn, draft())
        assert refusal(ns.update_note, conn, n["id"], fields(category=VISA)) == (
            "card_number",
            "category",
        )
        assert ns.list_notes(conn, "card-fraud")[0][0]["category"] == "Note"

    def test_delete(self, conn) -> None:
        n = ns.insert_note(conn, draft())
        ns.delete_note(conn, n["id"])
        assert ns.list_notes(conn, "card-fraud")[0] == []
        assert refusal(ns.delete_note, conn, n["id"]) == ("not_found", "")
        assert refusal(ns.delete_note, conn, "nope") == ("not_found", "")

    def test_a_deleted_note_leaves_no_text_in_the_file(self) -> None:
        marker = "zebra-marker-" + "q" * 400
        c = ns.connect()
        try:
            ids = [ns.insert_note(c, draft(body=hello(marker[:300])))["id"] for _ in range(6)]
            for i in ids:
                ns.delete_note(c, i)
        finally:
            c.close()
        data = Path(ns.db_path()).read_bytes()
        assert b"zebra-marker" not in data


class TestCategories:
    def test_add_and_list_in_insertion_order(self, conn) -> None:
        assert ns.add_category(conn, "Triage") == "Triage"
        assert ns.add_category(conn, "Alpha") == "Alpha"
        assert ns.list_notes(conn, "card-fraud")[1] == ["Triage", "Alpha"]

    @pytest.mark.parametrize("name", ["Note", "note", "FOLLOW UP", "Context"])
    def test_a_starter_name_exists_already(self, conn, name: str) -> None:
        assert refusal(ns.add_category, conn, name) == ("category_exists", "")

    def test_a_name_exists_ignoring_case_also_beyond_ascii(self, conn) -> None:
        ns.add_category(conn, "Zur" + chr(0xFC) + "ck")
        assert refusal(ns.add_category, conn, "ZUR" + chr(0xDC) + "CK") == ("category_exists", "")
        ns.add_category(conn, "Triage")
        assert refusal(ns.add_category, conn, "triage") == ("category_exists", "")

    def test_a_bad_name_is_refused(self, conn) -> None:
        assert refusal(ns.add_category, conn, VISA) == ("card_number", "name")
        assert refusal(ns.add_category, conn, " x")[0] == "bad_request"
        assert refusal(ns.add_category, conn, "x" * 25)[0] == "too_long"
        assert conn.execute("SELECT COUNT(*) FROM note_categories").fetchone()[0] == 0


class TestCheckedReads:
    def test_order_is_time_then_seq(self, conn) -> None:
        ns.insert_note(conn, draft(time=30))
        ns.insert_note(conn, draft(time=10))
        ns.insert_note(conn, draft(time=10))
        ns.insert_note(conn, draft("priya-ato", time=1))
        notes, _, skipped = ns.list_notes(conn, "card-fraud")
        assert [(n["time"], n["seq"]) for n in notes] == [(10, 2), (10, 3), (30, 1)]
        assert skipped == 0

    def test_an_empty_scenario(self, conn) -> None:
        assert ns.list_notes(conn, "card-fraud") == ([], [], 0)

    BAD_ROWS: list[tuple[str, dict[str, Any]]] = [
        ("body that is not json", {"body": "{not json"}),
        ("body with a script node", {"body": json.dumps(doc({"type": "script"}))}),
        ("body with an extra key", {"body": json.dumps({"v": 1, "content": [], "x": 1})}),
        ("body that holds a card number", {"body": json.dumps(hello(VISA))}),
        ("body of 4001 characters", {"body": json.dumps(hello("a" * 4001))}),
        ("category of 200 characters", {"category": "c" * 200}),
        ("category that holds a card number", {"category": VISA}),
        ("category not NFC", {"category": "e" + chr(0x0301)}),
        ("category with a space around it", {"category": " Note "}),
        ("link kind that holds a card number", {"link_kind": "k" + VISA, "link_id": "x"}),
        ("link id that holds a card number", {"link_kind": "auth", "link_id": "tx-" + VISA}),
        ("link id out of pattern", {"link_kind": "auth", "link_id": "bad id"}),
        ("id out of pattern", {"id": "note-xyz"}),
        ("id that holds a card number", {"id": VISA_ID}),
        ("seq below one", {"seq": 0}),
    ]

    @pytest.mark.parametrize("name,over", BAD_ROWS, ids=[n for n, _ in BAD_ROWS])
    def test_a_row_that_breaks_the_schema_is_skipped_and_counted(
        self, conn, name: str, over: dict
    ) -> None:
        good = ns.insert_note(conn, draft())
        raw_row(conn, **over)
        notes, _, skipped = ns.list_notes(conn, "card-fraud")
        assert [n["id"] for n in notes] == [good["id"]]
        assert skipped == 1
        exported = ns.export_file(conn, "card-fraud")
        assert [n["id"] for n in exported["notes"]] == [good["id"]]

    def test_every_bad_row_at_once(self, conn) -> None:
        ns.insert_note(conn, draft())
        for i, (_, over) in enumerate(self.BAD_ROWS):
            raw_row(conn, **{"seq": 600 + i, **over})
        notes, _, skipped = ns.list_notes(conn, "card-fraud")
        assert len(notes) == 1 and skipped == len(self.BAD_ROWS)

    def test_a_bad_category_name_is_skipped_and_counted(self, conn) -> None:
        ns.add_category(conn, "Triage")
        for bad in ("c" * 200, VISA, "e" + chr(0x0301), " x"):
            conn.execute("INSERT INTO note_categories(name) VALUES (?)", (bad,))
        _, categories, skipped = ns.list_notes(conn, "card-fraud")
        assert categories == ["Triage"] and skipped == 4
        assert ns.export_file(conn, "card-fraud")["categories"] == ["Triage"]

    def test_the_text_of_a_skipped_row_is_in_no_return_value(self, conn) -> None:
        raw_row(conn, category="c" * 200, body=json.dumps(hello("SECRET-MARKER-1")))
        result = ns.list_notes(conn, "card-fraud")
        assert "SECRET-MARKER-1" not in repr(result) and "ccccc" not in repr(result)


class TestExportAndImport:
    def test_an_export_of_a_scenario_with_no_notes(self, conn) -> None:
        out = ns.export_file(conn, "card-fraud")
        assert out == {
            "format": "ffr-notes",
            "version": 2,
            "scenario": "card-fraud",
            "categories": [],
            "notes": [],
            "nodes": [],
            "paths": [],
            "failCategories": [],
        }
        assert check_file(out) == out

    def test_an_export_holds_the_eight_file_keys_and_custom_categories_only(self, conn) -> None:
        ns.add_category(conn, "Triage")
        ns.insert_note(
            conn, draft(category="Triage", body=rich_body(), link={"kind": "a", "id": "b"})
        )
        out = ns.export_file(conn, "card-fraud")
        assert list(out) == [
            "format",
            "version",
            "scenario",
            "categories",
            "notes",
            "nodes",
            "paths",
            "failCategories",
        ]
        assert out["categories"] == ["Triage"]
        assert set(out["notes"][0]) == {
            "id",
            "time",
            "link",
            "colour",
            "category",
            "decision",
            "seq",
            "body",
        }
        assert check_file(out) == out

    def test_an_export_only_holds_its_own_scenario(self, conn) -> None:
        ns.insert_note(conn, draft("priya-ato"))
        assert ns.export_file(conn, "card-fraud")["notes"] == []

    def file(
        self,
        notes: list[dict[str, Any]],
        categories: list[str] | None = None,
        scenario="card-fraud",
    ) -> dict:
        return {
            "format": "ffr-notes",
            "version": 1,
            "scenario": scenario,
            "categories": categories or [],
            "notes": notes,
        }

    def note(self, id_: str | None = None, seq: int = 1, **over: Any) -> dict[str, Any]:
        n = {
            "id": id_ or make_note_id(),
            "time": 9,
            "link": None,
            "colour": "r4",
            "category": "Note",
            "decision": "pass",
            "seq": seq,
            "body": hello("from a file"),
        }
        n.update(over)
        return n

    def test_new_ids_take_the_next_seq_in_file_order_and_a_held_id_is_replaced(self, conn) -> None:
        held = ns.insert_note(conn, draft(time=5))
        a, b = self.note(seq=77), self.note(seq=3)
        replaced = self.note(held["id"], seq=99, body=hello("replaced"), time=6)
        result = ns.import_file(conn, self.file([a, replaced, b]))
        assert result == {
            "added": 2,
            "replaced": 1,
            "nodesAdded": 0,
            "nodesReplaced": 0,
            "pathsAdded": 0,
            "pathsReplaced": 0,
        }
        notes = {n["id"]: n for n in ns.list_notes(conn, "card-fraud")[0]}
        assert notes[a["id"]]["seq"] == 2 and notes[b["id"]]["seq"] == 3
        assert notes[held["id"]]["seq"] == 1  # a replaced note keeps its seq
        assert notes[held["id"]]["body"] == hello("replaced") and notes[held["id"]]["time"] == 6

    def test_categories_merge_without_duplicates(self, conn) -> None:
        ns.add_category(conn, "Triage")
        ns.import_file(conn, self.file([], ["triage", "Alpha", "Note"]))
        assert ns.list_notes(conn, "card-fraud")[1] == ["Triage", "Alpha"]

    def test_an_import_is_one_transaction(self, conn) -> None:
        other = ns.insert_note(conn, draft("priya-ato"))
        before = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        first = self.note()
        clash = self.note(other["id"])  # an id held by another scenario
        assert refusal(ns.import_file, conn, self.file([first, clash], ["Fresh"])) == (
            "bad_file",
            "notes[1].id",
        )
        assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == before
        assert ns.list_notes(conn, "card-fraud") == ([], [], 0)
        assert ns.list_notes(conn, "priya-ato")[0][0]["id"] == other["id"]

    def test_an_import_that_passes_the_limit_applies_nothing(self, conn) -> None:
        conn.execute("BEGIN")
        for i in range(999):
            raw_row(conn, seq=i + 1)
        conn.execute("COMMIT")
        out = refusal(ns.import_file, conn, self.file([self.note(), self.note()]))
        assert out == ("limit_reached", "")
        assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 999

    def test_an_import_is_checked_again_and_holds_no_card_number(self, conn) -> None:
        bad = self.file([self.note(body=hello(VISA))])
        assert refusal(ns.import_file, conn, bad) == ("card_number", "notes[0].body")
        assert refusal(ns.import_file, conn, self.file([self.note(VISA_ID)])) == (
            "card_number",
            "notes[0].id",
        )
        assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0
