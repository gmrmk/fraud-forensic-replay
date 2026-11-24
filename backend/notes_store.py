"""The notes store: one SQLite file of its own, keyed by scenario.

data/notes.sqlite3 (FFR_NOTES_DB overrides it in tests) is git-ignored and is NOT opened through
db.connect() or init_db(): those follow the active scenario pack and apply schema.sql and the
migrations. A re-seed never touches this file, and no scenario pack's database gains a table.

 - All SQL is parameterised. No created_at and no CURRENT_TIMESTAMP: no note value comes from a
   wall clock.
 - PRAGMA secure_delete = ON, so a deleted note's text does not stay in a free page.
 - Version 2 adds three tables for the investigator's node (record_nodes, fail_categories,
   custom_paths) beside the notes; no existing table, column or row is changed (init, below).
 - seq is the highest seq of the scenario plus one, taken inside the same BEGIN IMMEDIATE that
   counts the scenario's notes against the limit.
 - A read judges every column of every row, and every category name, again with the schema and
   the guard. A row that fails is skipped and counted, never served. The export uses that read.
 - A refusal is a NoteRefused with a fixed code. Nothing here puts a value in an error or a log.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from marks_schema import (
    MARK_LIMITS,
    check_node,
    check_path_draft,
    check_path_fields,
    is_path_id,
    make_path_id,
    node_from_row,
    path_from_row,
    stops_to_json,
)
from notes_guard import refuses_text
from notes_schema import (
    LIMITS,
    STARTER_CATEGORIES,
    NoteRefused,
    body_to_json,
    category_exists,
    check_category_name,
    check_draft,
    check_file,
    check_note_fields,
    check_scenario,
    is_note_id,
    make_note_id,
    note_from_row,
)

SCHEMA_VERSION = 2
_ROOT = Path(__file__).resolve().parents[1]
_COLUMNS = "id, scenario, seq, time_ms, link_kind, link_id, colour, category, decision, body"
_FILE_NOTE_KEYS = ("id", "time", "link", "colour", "category", "decision", "seq", "body")
_FILE_NODE_KEYS = ("record", "pinned", "disposition", "category", "settled")
_FILE_PATH_KEYS = ("id", "seq", "name", "stops")
_NODE_COLUMNS = "scenario, rec_kind, rec_id, pinned, disposition, category, settled"


def _uuid_source() -> uuid.UUID:
    return uuid.uuid4()


def db_path() -> Path:
    """The notes database file. FFR_NOTES_DB is read at every call, so a test can point it away."""
    override = os.environ.get("FFR_NOTES_DB")
    return Path(override) if override else _ROOT / "data" / "notes.sqlite3"


def connect() -> sqlite3.Connection:
    """A connection with its own transactions (isolation_level None), a busy timeout and
    secure_delete on. The tables exist when this returns."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA secure_delete = ON")
    init(conn)
    return conn


def init(conn: sqlite3.Connection) -> None:
    """Idempotent: create the tables and set user_version = 2. Takes no write lock once done.

    A version 1 file keeps every row: its three statements are no-ops and the three tables of the
    investigator's node are added. Nothing is altered, rewritten or dropped."""
    if conn.execute("PRAGMA user_version").fetchone()[0] >= SCHEMA_VERSION:
        return
    with _tx(conn):
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes("
            " id TEXT PRIMARY KEY, scenario TEXT NOT NULL, seq INTEGER NOT NULL,"
            " time_ms INTEGER NOT NULL CHECK(time_ms BETWEEN 0 AND 4102444800000),"
            " link_kind TEXT, link_id TEXT,"
            " colour TEXT NOT NULL CHECK(colour IN ('r0','r1','r2','r3','r4','muted')),"
            " category TEXT NOT NULL,"
            " decision TEXT NOT NULL CHECK(decision IN ('none','pass','fail')),"
            " body TEXT NOT NULL, CHECK((link_kind IS NULL) = (link_id IS NULL)),"
            " UNIQUE(scenario, seq))"
        )
        # Custom names only. NOCASE folds ASCII only: the Python check is the real uniqueness rule.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS note_categories(name TEXT PRIMARY KEY COLLATE NOCASE)"
        )
        conn.execute("CREATE INDEX IF NOT EXISTS notes_by_time ON notes(scenario, time_ms, seq)")
        # Version 2: the investigator's node. One row per record of a story (a row is never
        # deleted: clearing writes none, no pin, no category and keeps `settled`), the typed Fail
        # categories (one list shared by every story, NOCASE as for note categories), and
        # the custom paths (`stops` is compact JSON of [{"kind","id"}], checked on every read).
        conn.execute(
            "CREATE TABLE IF NOT EXISTS record_nodes("
            " scenario TEXT NOT NULL, rec_kind TEXT NOT NULL, rec_id TEXT NOT NULL,"
            " pinned INTEGER NOT NULL CHECK(pinned IN (0, 1)),"
            " disposition TEXT NOT NULL CHECK(disposition IN ('none','pass','fail','wait')),"
            " category TEXT,"
            " settled INTEGER NOT NULL CHECK(settled IN (0, 1)),"
            " CHECK(category IS NULL OR disposition = 'fail'),"
            " PRIMARY KEY(scenario, rec_kind, rec_id))"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS fail_categories(name TEXT PRIMARY KEY COLLATE NOCASE)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS custom_paths("
            " id TEXT PRIMARY KEY, scenario TEXT NOT NULL, seq INTEGER NOT NULL,"
            " name TEXT NOT NULL, stops TEXT NOT NULL,"
            " UNIQUE(scenario, seq))"
        )
        conn.execute("PRAGMA user_version = 2")  # SCHEMA_VERSION (a PRAGMA takes no parameter)


@contextmanager
def _tx(conn: sqlite3.Connection) -> Iterator[None]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def _not_found() -> NoteRefused:
    return NoteRefused("not_found", "")


def _usable_id(note_id: Any) -> bool:
    """An id that can name a note. A malformed or refused id names none and never reaches SQL."""
    return is_note_id(note_id) and not refuses_text(note_id)


# ---------------------------------------------------------------------------- reads


def list_notes(
    conn: sqlite3.Connection, scenario: str
) -> tuple[list[dict[str, Any]], list[str], int]:
    """(notes in time then seq order, custom category names in insertion order, skipped count)."""
    scenario = check_scenario(scenario)
    skipped = 0
    notes: list[dict[str, Any]] = []
    rows = conn.execute(
        f"SELECT {_COLUMNS} FROM notes WHERE scenario = ? ORDER BY time_ms, seq", (scenario,)
    ).fetchall()
    for row in rows:
        try:
            notes.append(note_from_row(row))
        except NoteRefused:
            skipped += 1
    categories: list[str] = []
    for (name,) in conn.execute("SELECT name FROM note_categories ORDER BY rowid").fetchall():
        try:
            checked = check_category_name(name, "name")
        except NoteRefused:
            skipped += 1
            continue
        if category_exists(STARTER_CATEGORIES, checked) or category_exists(categories, checked):
            skipped += 1
            continue
        categories.append(checked)
    return notes, categories, skipped


def _list_nodes(conn: sqlite3.Connection, scenario: str) -> tuple[list[dict[str, Any]], int]:
    """(nodes in record key order, skipped count). The order is the joined `kind:id` string by
    code unit (kinds and ids are ASCII): SQL orders the rows by the stored key, and the checked
    nodes are sorted again by their canonical key below. Every row is judged again; a second row
    that reads as an earlier record (a `fraud` row beside an `auth` row of the same id) is
    skipped."""
    nodes: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    skipped = 0
    rows = conn.execute(
        f"SELECT {_NODE_COLUMNS} FROM record_nodes WHERE scenario = ?"
        " ORDER BY rec_kind || ':' || rec_id",
        (scenario,),
    ).fetchall()
    for row in rows:
        try:
            node = node_from_row(row)
        except NoteRefused:
            skipped += 1
            continue
        key = (node["record"]["kind"], node["record"]["id"])
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        nodes.append(node)
    # A stored `fraud` row reads as `auth` and so moves to its canonical place in the order.
    nodes.sort(key=lambda n: f"{n['record']['kind']}:{n['record']['id']}")
    return nodes, skipped


def list_marks(conn: sqlite3.Connection, scenario: str) -> dict[str, Any]:
    """The investigator's marks of one scenario: nodes, paths, typed Fail categories and the
    count of rows skipped because they no longer pass the checks."""
    scenario = check_scenario(scenario)
    nodes, node_skips = _list_nodes(conn, scenario)
    paths, path_skips = _list_paths(conn, scenario)
    names, name_skips = _list_fail_categories(conn)
    return {
        "nodes": nodes,
        "paths": paths,
        "failCategories": names,
        "skipped": node_skips + path_skips + name_skips,
    }


def _list_paths(conn: sqlite3.Connection, scenario: str) -> tuple[list[dict[str, Any]], int]:
    """(paths in seq order, skipped count). Every row is judged again, the guard included."""
    paths: list[dict[str, Any]] = []
    skipped = 0
    rows = conn.execute(
        "SELECT id, scenario, seq, name, stops FROM custom_paths WHERE scenario = ? ORDER BY seq",
        (scenario,),
    ).fetchall()
    for row in rows:
        try:
            paths.append(path_from_row(row))
        except NoteRefused:
            skipped += 1
    return paths, skipped


def _list_fail_categories(conn: sqlite3.Connection) -> tuple[list[str], int]:
    """(every typed Fail category in insertion order, the same list for every story, skipped
    count). A name that fails the category rules, or repeats an earlier one ignoring case, is
    skipped."""
    names: list[str] = []
    skipped = 0
    for (name,) in conn.execute("SELECT name FROM fail_categories ORDER BY rowid").fetchall():
        try:
            checked = check_category_name(name, "name")
        except NoteRefused:
            skipped += 1
            continue
        if category_exists(names, checked):
            skipped += 1
            continue
        names.append(checked)
    return names, skipped


def export_file(conn: sqlite3.Connection, scenario: str) -> dict[str, Any]:
    """The notes file of one scenario at version 2, built from the checked reads: the notes, then
    the investigator's nodes in record key order, paths in seq order and typed Fail categories. The
    file holds the scenario once, so an entry holds none: a node is record, pinned, disposition,
    category and settled; a path is id, seq, name and stops."""
    notes, categories, _skipped = list_notes(conn, scenario)
    marks = list_marks(conn, scenario)
    return {
        "format": "ffr-notes",
        "version": 2,  # the file format's version (not the database's user_version)
        "scenario": scenario,
        "categories": categories,
        "notes": [{k: n[k] for k in _FILE_NOTE_KEYS} for n in notes],
        "nodes": [{k: n[k] for k in _FILE_NODE_KEYS} for n in marks["nodes"]],
        "paths": [{k: p[k] for k in _FILE_PATH_KEYS} for p in marks["paths"]],
        "failCategories": marks["failCategories"],
    }


# ---------------------------------------------------------------------------- writes


def _row(conn: sqlite3.Connection, note_id: str) -> sqlite3.Row:
    row: sqlite3.Row | None = conn.execute(
        f"SELECT {_COLUMNS} FROM notes WHERE id = ?", (note_id,)
    ).fetchone()
    if row is None:
        raise _not_found()
    return row


def insert_note(conn: sqlite3.Connection, draft: Any) -> dict[str, Any]:
    """Add a note. The store checks the draft again: it is the last wall before SQL."""
    d = check_draft(draft)
    note_id = make_note_id(lambda: _uuid_source())
    link = d["link"]
    with _tx(conn):
        count = conn.execute(
            "SELECT COUNT(*) FROM notes WHERE scenario = ?", (d["scenario"],)
        ).fetchone()[0]
        if count >= LIMITS["notes_per_scenario"]:
            raise NoteRefused("limit_reached", "")
        conn.execute(
            "INSERT INTO notes(id, scenario, seq, time_ms, link_kind, link_id, colour, category,"
            " decision, body) VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM notes"
            " WHERE scenario = ?), ?, ?, ?, ?, ?, ?, ?)",
            (
                note_id,
                d["scenario"],
                d["scenario"],
                d["time"],
                link["kind"] if link else None,
                link["id"] if link else None,
                d["colour"],
                d["category"],
                d["decision"],
                body_to_json(d["body"]),
            ),
        )
        row = _row(conn, note_id)
    return note_from_row(row)


def update_note(conn: sqlite3.Connection, note_id: str, fields: Any) -> dict[str, Any]:
    """Replace the five fields a person sets. Id, seq, scenario and time never change."""
    f = check_note_fields(fields)
    if not _usable_id(note_id):
        raise _not_found()
    link = f["link"]
    with _tx(conn):
        cur = conn.execute(
            "UPDATE notes SET link_kind = ?, link_id = ?, colour = ?, category = ?, decision = ?,"
            " body = ? WHERE id = ?",
            (
                link["kind"] if link else None,
                link["id"] if link else None,
                f["colour"],
                f["category"],
                f["decision"],
                body_to_json(f["body"]),
                note_id,
            ),
        )
        if cur.rowcount == 0:
            raise _not_found()
        row = _row(conn, note_id)
    return note_from_row(row)


def delete_note(conn: sqlite3.Connection, note_id: str) -> None:
    if not _usable_id(note_id):
        raise _not_found()
    with _tx(conn):
        if conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount == 0:
            raise _not_found()


def add_category(conn: sqlite3.Connection, name: Any) -> str:
    """Add a custom category. Names are unique ignoring case, starters included."""
    checked = check_category_name(name, "name")
    with _tx(conn):
        existing = [r[0] for r in conn.execute("SELECT name FROM note_categories").fetchall()]
        if category_exists(STARTER_CATEGORIES, checked) or category_exists(existing, checked):
            raise NoteRefused("category_exists", "")
        conn.execute("INSERT INTO note_categories(name) VALUES (?)", (checked,))
    return checked


def put_node(conn: sqlite3.Connection, node: Any, if_unsettled: bool) -> dict[str, Any]:
    """Write the node of one record and answer the row as stored. The store checks the node again.

    if_unsettled False (a press): the row takes the sent pin, disposition and category, and
    `settled` is the held value OR the sent one, so it never goes back to 0. if_unsettled True (the
    move of saved note marks only): an existing row with settled 1 is answered unchanged; a row
    with settled 0 takes the disposition and category, becomes settled and keeps its pin; a record
    with no row gets a new row with the values as sent. A row is never deleted: clearing writes
    no pin, none and no category."""
    n = check_node(node)
    rec = n["record"]
    key = (n["scenario"], rec["kind"], rec["id"])
    insert = (
        f"INSERT INTO record_nodes({_NODE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)"
        " ON CONFLICT(scenario, rec_kind, rec_id) DO UPDATE SET "
    )
    if if_unsettled:
        upsert = insert + (
            "disposition = excluded.disposition, category = excluded.category, settled = 1"
            " WHERE record_nodes.settled = 0"
        )
    else:
        upsert = insert + (
            "pinned = excluded.pinned, disposition = excluded.disposition,"
            " category = excluded.category,"
            " settled = MAX(record_nodes.settled, excluded.settled)"
        )
    values = (
        *key,
        1 if n["pinned"] else 0,
        n["disposition"],
        n["category"],
        1 if n["settled"] else 0,
    )
    with _tx(conn):
        held = conn.execute(
            "SELECT 1 FROM record_nodes WHERE scenario = ? AND rec_kind = ? AND rec_id = ?", key
        ).fetchone()
        if (
            held is None
            and conn.execute(
                "SELECT COUNT(*) FROM record_nodes WHERE scenario = ?", key[:1]
            ).fetchone()[0]
            >= MARK_LIMITS["nodes_per_scenario"]
        ):
            raise NoteRefused("limit_reached", "")
        conn.execute(upsert, values)
        row = conn.execute(
            f"SELECT {_NODE_COLUMNS} FROM record_nodes WHERE scenario = ? AND rec_kind = ?"
            " AND rec_id = ?",
            key,
        ).fetchone()
    return node_from_row(row)


def add_fail_category(conn: sqlite3.Connection, name: Any) -> str:
    """Add a typed Fail category to the one list every story shares. Names are unique ignoring
    case over the whole list (there are no starter names; a note category may share a name, the
    two lists are apart), at most 100 in all, checked inside the same transaction as the write."""
    checked = check_category_name(name, "name")
    with _tx(conn):
        existing = [r[0] for r in conn.execute("SELECT name FROM fail_categories").fetchall()]
        if category_exists(existing, checked):
            raise NoteRefused("category_exists", "")
        if len(existing) >= MARK_LIMITS["fail_categories"]:
            raise NoteRefused("limit_reached", "")
        conn.execute("INSERT INTO fail_categories(name) VALUES (?)", (checked,))
    return checked


def _usable_path_id(path_id: Any) -> bool:
    """An id that can name a path. A malformed or refused id names none and never reaches SQL."""
    return is_path_id(path_id) and not refuses_text(path_id)


_PATH_COLUMNS = "id, scenario, seq, name, stops"


def create_path(conn: sqlite3.Connection, draft: Any) -> dict[str, Any]:
    """Add a path: the id is minted here, the seq is the highest seq of the scenario plus one, and
    at most 20 paths a scenario, all inside one transaction."""
    d = check_path_draft(draft)
    path_id = make_path_id(lambda: _uuid_source())
    with _tx(conn):
        count = conn.execute(
            "SELECT COUNT(*) FROM custom_paths WHERE scenario = ?", (d["scenario"],)
        ).fetchone()[0]
        if count >= MARK_LIMITS["paths_per_scenario"]:
            raise NoteRefused("limit_reached", "")
        conn.execute(
            "INSERT INTO custom_paths(id, scenario, seq, name, stops) VALUES (?, ?,"
            " (SELECT COALESCE(MAX(seq), 0) + 1 FROM custom_paths WHERE scenario = ?), ?, ?)",
            (path_id, d["scenario"], d["scenario"], d["name"], stops_to_json(d["stops"])),
        )
        row = conn.execute(
            f"SELECT {_PATH_COLUMNS} FROM custom_paths WHERE id = ?", (path_id,)
        ).fetchone()
    return path_from_row(row)


def update_path(conn: sqlite3.Connection, path_id: Any, fields: Any) -> dict[str, Any]:
    """Replace a path's name and stops. Id, scenario and seq never change. The fields are checked
    before the id, as for a note."""
    f = check_path_fields(fields)
    if not _usable_path_id(path_id):
        raise _not_found()
    with _tx(conn):
        cur = conn.execute(
            "UPDATE custom_paths SET name = ?, stops = ? WHERE id = ?",
            (f["name"], stops_to_json(f["stops"]), path_id),
        )
        if cur.rowcount == 0:
            raise _not_found()
        row = conn.execute(
            f"SELECT {_PATH_COLUMNS} FROM custom_paths WHERE id = ?", (path_id,)
        ).fetchone()
    return path_from_row(row)


def delete_path(conn: sqlite3.Connection, path_id: Any) -> None:
    if not _usable_path_id(path_id):
        raise _not_found()
    with _tx(conn):
        if conn.execute("DELETE FROM custom_paths WHERE id = ?", (path_id,)).rowcount == 0:
            raise _not_found()


def import_file(
    conn: sqlite3.Connection, file_doc: Any, scenarios: Sequence[str] | None = None
) -> dict[str, int]:
    """Apply a notes file (version 1 or 2) in one transaction. A note whose id is held replaces it
    and keeps its seq; a new id takes the next seq in file order. An id held by another scenario
    is refused (the id is a global key, and a file must not move another scenario's note).
    `scenarios` is the registry's list: a file for any other scenario is refused.

    Version 2 marks, in the same transaction: a file node replaces the node of its record, with
    `settled` the held value OR the file's; a path whose id is held keeps its seq and takes the
    file's name and stops, a new id takes the next seq in file order, and an id held by another
    scenario refuses the file; typed Fail categories merge ignoring case. Nothing is deleted: a
    held node, path or category the file does not name stays. A part over its limit refuses the
    whole file. Returns the six counts."""
    f = check_file(file_doc, scenarios)
    scenario = f["scenario"]
    added = replaced = 0
    with _tx(conn):
        count, top = conn.execute(
            "SELECT COUNT(*), COALESCE(MAX(seq), 0) FROM notes WHERE scenario = ?", (scenario,)
        ).fetchone()
        next_seq = top + 1
        for i, n in enumerate(f["notes"]):
            link = n["link"]
            values = (
                link["kind"] if link else None,
                link["id"] if link else None,
                n["time"],
                n["colour"],
                n["category"],
                n["decision"],
                body_to_json(n["body"]),
            )
            held = conn.execute("SELECT scenario FROM notes WHERE id = ?", (n["id"],)).fetchone()
            if held is None:
                conn.execute(
                    "INSERT INTO notes(id, scenario, seq, link_kind, link_id, time_ms, colour,"
                    " category, decision, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (n["id"], scenario, next_seq, *values),
                )
                next_seq += 1
                added += 1
            elif held[0] != scenario:
                raise NoteRefused("bad_file", f"notes[{i}].id")
            else:
                conn.execute(
                    "UPDATE notes SET link_kind = ?, link_id = ?, time_ms = ?, colour = ?,"
                    " category = ?, decision = ?, body = ? WHERE id = ?",
                    (*values, n["id"]),
                )
                replaced += 1
        if count + added > LIMITS["notes_per_scenario"]:
            raise NoteRefused("limit_reached", "")
        existing = [r[0] for r in conn.execute("SELECT name FROM note_categories").fetchall()]
        for name in f["categories"]:
            if category_exists(STARTER_CATEGORIES, name) or category_exists(existing, name):
                continue
            conn.execute("INSERT INTO note_categories(name) VALUES (?)", (name,))
            existing.append(name)
        marks = _import_marks(conn, scenario, f)
    return {"added": added, "replaced": replaced, **marks}


def _import_marks(conn: sqlite3.Connection, scenario: str, f: dict[str, Any]) -> dict[str, int]:
    """The marks half of an import. It runs inside import_file's transaction and raises inside it,
    so a refusal rolls back the notes as well. Counts are taken once, before the loops."""
    node_count = conn.execute(
        "SELECT COUNT(*) FROM record_nodes WHERE scenario = ?", (scenario,)
    ).fetchone()[0]
    nodes_added = nodes_replaced = 0
    for entry in f["nodes"]:
        rec = entry["record"]
        key = (scenario, rec["kind"], rec["id"])
        held = conn.execute(
            "SELECT 1 FROM record_nodes WHERE scenario = ? AND rec_kind = ? AND rec_id = ?", key
        ).fetchone()
        values = (
            1 if entry["pinned"] else 0,
            entry["disposition"],
            entry["category"],
            1 if entry["settled"] else 0,
        )
        if held is None:
            conn.execute(
                f"INSERT INTO record_nodes({_NODE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (*key, *values),
            )
            nodes_added += 1
        else:
            conn.execute(
                "UPDATE record_nodes SET pinned = ?, disposition = ?, category = ?,"
                " settled = MAX(settled, ?) WHERE scenario = ? AND rec_kind = ? AND rec_id = ?",
                (*values, *key),
            )
            nodes_replaced += 1
    if node_count + nodes_added > MARK_LIMITS["nodes_per_scenario"]:
        raise NoteRefused("limit_reached", "")

    path_count, top = conn.execute(
        "SELECT COUNT(*), COALESCE(MAX(seq), 0) FROM custom_paths WHERE scenario = ?", (scenario,)
    ).fetchone()
    next_seq = top + 1
    paths_added = paths_replaced = 0
    for i, entry in enumerate(f["paths"]):
        stops = stops_to_json(entry["stops"])
        held = conn.execute(
            "SELECT scenario FROM custom_paths WHERE id = ?", (entry["id"],)
        ).fetchone()
        if held is None:
            conn.execute(
                "INSERT INTO custom_paths(id, scenario, seq, name, stops) VALUES (?, ?, ?, ?, ?)",
                (entry["id"], scenario, next_seq, entry["name"], stops),
            )
            next_seq += 1
            paths_added += 1
        elif held[0] != scenario:
            raise NoteRefused("bad_file", f"paths[{i}].id")
        else:
            conn.execute(
                "UPDATE custom_paths SET name = ?, stops = ? WHERE id = ?",
                (entry["name"], stops, entry["id"]),
            )
            paths_replaced += 1
    if path_count + paths_added > MARK_LIMITS["paths_per_scenario"]:
        raise NoteRefused("limit_reached", "")

    # The typed Fail categories are one list shared by every story, as note categories are.
    names = [r[0] for r in conn.execute("SELECT name FROM fail_categories").fetchall()]
    for name in f["failCategories"]:
        if category_exists(names, name):
            continue
        conn.execute("INSERT INTO fail_categories(name) VALUES (?)", (name,))
        names.append(name)
    if len(names) > MARK_LIMITS["fail_categories"]:
        raise NoteRefused("limit_reached", "")
    return {
        "nodesAdded": nodes_added,
        "nodesReplaced": nodes_replaced,
        "pathsAdded": paths_added,
        "pathsReplaced": paths_replaced,
    }
