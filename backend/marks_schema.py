"""The closed schema for a record node and a custom path: the backend twin of lib/marks/schema.ts.

A node is the investigator's state for one record of one story (a pin, a disposition and a Fail
category); a custom path is a named list of two to fifty records. Whatever comes from a request
body or a database row is checked here before it is stored or served.

 - Each object has exactly the keys named: any other key at any depth is refused.
 - The checker builds a fresh object from the fields it accepts. It never copies its input.
 - A refusal is NoteRefused(code, where): a fixed code and a path of fixed names and indices. It
   never holds a value, and it never names a key the input supplied.
 - The card number guard runs on every string: scenario, record kind and id, category, path id
   and path name.
 - A record's kind is written canonical: `fraud` is `auth` (the page reads the two as one record).

What this file does not do: it never checks that a record exists in the data (the page draws a node
only when it finds the record), it holds no SQL and it reads no clock. check_file_marks checks the
marks part of a version 2 notes file; notes_schema.check_file calls it (inside the function, since
this module imports notes_schema at its top).

Booleans are strict, as in notes_schema: `pinned`, `settled` and `ifUnsettled` are JSON booleans,
never 1, 0 or "true"; a stored column holds the integer 0 or 1 and is read back with the same care.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Callable, Mapping
from typing import Any

from notes_guard import refuses_text
from notes_schema import (
    NoteRefused,
    _at,
    _check_seq,
    _fail,
    _idx,
    _shape,
    category_exists,
    check_category_name,
    check_link,
    check_scenario,
    file_error,
    parse_json,
)

DISPOSITIONS = ("none", "pass", "fail", "wait")
MARK_LIMITS = {
    "nodes_per_scenario": 1000,
    "paths_per_scenario": 20,
    "stops_min": 2,
    "stops_max": 50,
    "name_chars": 24,
    "fail_categories": 100,
}

_NODE_FIELD_KEYS = ("pinned", "disposition", "category")
_NODE_KEYS = ("scenario", "record", *_NODE_FIELD_KEYS, "settled")
_PATH_FIELD_KEYS = ("name", "stops")

# re.fullmatch with explicit ASCII classes: `$` would accept a trailing line feed.
_PATH_ID = re.compile(r"path-[0-9a-f]{32}")


def canonical_kind(kind: str) -> str:
    """`fraud` and `auth` are one record: a node is stored, and compared, as `auth`."""
    return "auth" if kind == "fraud" else kind


def check_record(raw: Any, path: str = "record") -> dict[str, str]:
    """A record is a link that is not None: exactly a kind and an id, the kind made canonical."""
    link = check_link(raw, path)
    if link is None:
        _fail("bad_request", path)
    return {"kind": canonical_kind(link["kind"]), "id": link["id"]}


def _check_flag(raw: Any, path: str) -> bool:
    """A JSON boolean. `type(x) is bool` refuses 1, 0, "true" and None."""
    if type(raw) is not bool:
        _fail("bad_request", path)
    return raw


def _read_node_fields(o: dict[str, Any], path: str) -> dict[str, Any]:
    pinned = _check_flag(o["pinned"], _at(path, "pinned"))
    disposition = o["disposition"]
    if not isinstance(disposition, str) or disposition not in DISPOSITIONS:
        _fail("bad_request", _at(path, "disposition"))
    category = o["category"]
    if category is not None:
        category = check_category_name(category, _at(path, "category"))
        if disposition != "fail":
            _fail("bad_request", _at(path, "category"))
    return {"pinned": pinned, "disposition": disposition, "category": category}


def check_node_fields(raw: Any, path: str = "") -> dict[str, Any]:
    """The three fields the investigator sets: pinned, disposition, category."""
    o = _shape(raw, _NODE_FIELD_KEYS)
    if o is None:
        _fail("bad_request", path)
    return _read_node_fields(o, path)


def check_node(raw: Any, path: str = "") -> dict[str, Any]:
    """A node: scenario, record, the three fields and settled, in the wire order."""
    o = _shape(raw, _NODE_KEYS)
    if o is None:
        _fail("bad_request", path)
    scenario = check_scenario(o["scenario"], _at(path, "scenario"))
    record = check_record(o["record"], _at(path, "record"))
    fields = _read_node_fields(o, path)
    settled = _check_flag(o["settled"], _at(path, "settled"))
    return {"scenario": scenario, "record": record, **fields, "settled": settled}


def check_node_put(raw: Any) -> tuple[dict[str, Any], bool]:
    """The body of a node write: a node plus `ifUnsettled`. Returns (node, if_unsettled).
    An older key such as `ifAbsent` is an unknown key and refuses the body."""
    o = _shape(raw, (*_NODE_KEYS, "ifUnsettled"))
    if o is None:
        _fail("bad_request", "")
    node = check_node({k: o[k] for k in _NODE_KEYS})
    return node, _check_flag(o["ifUnsettled"], "ifUnsettled")


def _column_flag(raw: Any, path: str) -> bool:
    """A stored 0 or 1. A Python bool, a string or any other number is not a stored flag."""
    if type(raw) is not int or raw not in (0, 1):
        _fail("bad_request", path)
    return raw == 1


def node_from_row(row: Mapping[str, Any]) -> dict[str, Any]:
    """A database row (sqlite3.Row or a mapping), checked as a node. Every column is judged again,
    the guard included."""
    return check_node(
        {
            "scenario": row["scenario"],
            "record": {"kind": row["rec_kind"], "id": row["rec_id"]},
            "pinned": _column_flag(row["pinned"], "pinned"),
            "disposition": row["disposition"],
            "category": row["category"],
            "settled": _column_flag(row["settled"], "settled"),
        }
    )


# ---------------------------------------------------------------------------- custom paths


def is_path_id(s: Any) -> bool:
    return isinstance(s, str) and _PATH_ID.fullmatch(s) is not None


def check_path_name(raw: Any, where: str = "name") -> str:
    """A path's name takes the rules of a note category: NFC, trimmed, 1 to 24 code points, no
    control or format character, the card number guard."""
    return check_category_name(raw, where)


def _check_stops(raw: Any, path: str) -> list[dict[str, str]]:
    """Two to fifty records, each canonical, no record twice. Whether a stop has a time is the
    caller's rule (a place has none); this store checks shape, count and repeats."""
    if (
        not isinstance(raw, list)
        or not MARK_LIMITS["stops_min"] <= len(raw) <= MARK_LIMITS["stops_max"]
    ):
        _fail("bad_request", path)
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for i, stop in enumerate(raw):
        where = _idx(path, i)
        record = check_record(stop, where)
        key = (record["kind"], record["id"])
        if key in seen:
            _fail("bad_request", where)
        seen.add(key)
        out.append(record)
    return out


def _read_path_fields(o: dict[str, Any], path: str) -> dict[str, Any]:
    name = check_path_name(o["name"], _at(path, "name"))
    stops = _check_stops(o["stops"], _at(path, "stops"))
    return {"name": name, "stops": stops}


def check_path_fields(raw: Any, path: str = "") -> dict[str, Any]:
    """The two fields the investigator sets: name and stops."""
    o = _shape(raw, _PATH_FIELD_KEYS)
    if o is None:
        _fail("bad_request", path)
    return _read_path_fields(o, path)


def check_path_draft(raw: Any) -> dict[str, Any]:
    """The body of a new path: scenario, name and stops. The id and the seq are the store's."""
    o = _shape(raw, ("scenario", *_PATH_FIELD_KEYS))
    if o is None:
        _fail("bad_request", "")
    scenario = check_scenario(o["scenario"], "scenario")
    return {"scenario": scenario, **_read_path_fields(o, "")}


def check_path(raw: Any, path: str = "") -> dict[str, Any]:
    """A stored path: id, scenario, seq, name, stops, in the wire order."""
    o = _shape(raw, ("id", "scenario", "seq", *_PATH_FIELD_KEYS))
    if o is None:
        _fail("bad_request", path)
    where = _at(path, "id")
    if not is_path_id(o["id"]):
        _fail("bad_request", where)
    if refuses_text(o["id"]):
        _fail("card_number", where)
    scenario = check_scenario(o["scenario"], _at(path, "scenario"))
    seq = _check_seq(o["seq"], _at(path, "seq"))
    return {"id": o["id"], "scenario": scenario, "seq": seq, **_read_path_fields(o, path)}


def make_path_id(uuid_source: Callable[[], uuid.UUID] = uuid.uuid4, max_draws: int = 16) -> str:
    """`path-` plus 32 lowercase hex from a uuid. About 1 id in 450 holds a run the guard refuses,
    so this draws again until the guard passes the id. The error names no id."""
    for _ in range(max_draws):
        path_id = "path-" + uuid_source().hex
        if is_path_id(path_id) and not refuses_text(path_id):
            return path_id
    raise RuntimeError("path id: no usable draw")


def stops_to_json(stops: list[dict[str, str]]) -> str:
    """The compact JSON text of checked stops: what the table stores."""
    return json.dumps(stops, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------- the file's marks

_FILE_NODE_KEYS = ("record", *_NODE_FIELD_KEYS, "settled")
_FILE_PATH_KEYS = ("id", "seq", *_PATH_FIELD_KEYS)


def _file_list(o: dict[str, Any], name: str, limit: int) -> list[Any]:
    """A part of the file: a list at most `limit` long (too_large), checked before any entry."""
    part = o[name]
    if not isinstance(part, list):
        _fail("bad_file", name)
    if len(part) > limit:
        _fail("too_large", name)
    return part


def check_file_marks(o: dict[str, Any], scenario: str) -> dict[str, Any]:
    """The marks part of a version 2 notes file: `nodes`, `paths` and `failCategories`.

    `o` is the file's dict, already shaped to its eight keys; `scenario` is the file's checked
    scenario (an entry holds none of its own). Every entry is closed and judged like a stored one.
    A refusal speaks in the file's codes: card_number, too_large, bad_scenario, or bad_file with a
    path. Two nodes for one record, two paths with one id and two Fail categories equal ignoring
    case are refused. Returns rebuilt lists in the wire order of the file."""
    raw_nodes = _file_list(o, "nodes", MARK_LIMITS["nodes_per_scenario"])
    raw_paths = _file_list(o, "paths", MARK_LIMITS["paths_per_scenario"])
    raw_names = _file_list(o, "failCategories", MARK_LIMITS["fail_categories"])

    nodes: list[dict[str, Any]] = []
    seen_records: set[tuple[str, str]] = set()
    for i, entry in enumerate(raw_nodes):
        where = _idx("nodes", i)
        fields = _shape(entry, _FILE_NODE_KEYS)
        if fields is None:
            _fail("bad_file", where)
        try:
            node = check_node({**fields, "scenario": scenario}, where)
        except NoteRefused as e:
            raise file_error(e) from None
        key = (node["record"]["kind"], node["record"]["id"])
        if key in seen_records:
            _fail("bad_file", _at(where, "record"))
        seen_records.add(key)
        nodes.append({k: node[k] for k in _FILE_NODE_KEYS})

    paths: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for i, entry in enumerate(raw_paths):
        where = _idx("paths", i)
        fields = _shape(entry, _FILE_PATH_KEYS)
        if fields is None:
            _fail("bad_file", where)
        try:
            path = check_path({**fields, "scenario": scenario}, where)
        except NoteRefused as e:
            raise file_error(e) from None
        if path["id"] in seen_ids:
            _fail("bad_file", _at(where, "id"))
        seen_ids.add(path["id"])
        paths.append({k: path[k] for k in _FILE_PATH_KEYS})

    names: list[str] = []
    for i, raw_name in enumerate(raw_names):
        where = _idx("failCategories", i)
        try:
            name = check_category_name(raw_name, where)
        except NoteRefused as e:
            raise file_error(e) from None
        if category_exists(names, name):
            _fail("bad_file", where)
        names.append(name)
    return {"nodes": nodes, "paths": paths, "failCategories": names}


def path_from_row(row: Mapping[str, Any]) -> dict[str, Any]:
    """A database row (sqlite3.Row or a mapping), checked as a path. Every column is judged
    again, the guard included; the stops column is parsed first."""
    try:
        stops = parse_json(row["stops"])
    except NoteRefused:
        _fail("bad_request", "stops")
    return check_path(
        {
            "id": row["id"],
            "scenario": row["scenario"],
            "seq": row["seq"],
            "name": row["name"],
            "stops": stops,
        }
    )
