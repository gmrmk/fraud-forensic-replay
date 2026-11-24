"""The closed schema for a note and its body document: the backend twin of lib/notes/schema.ts.

Whatever comes from a request, an import or a database row is checked here before it is stored,
served or exported.

 - Each object has exactly the keys named: any other key at any depth is refused.
 - The checker builds a fresh object from the fields it accepts. It never copies its input.
 - A refusal is NoteRefused(code, where): a fixed code and a path of fixed names and indices. It
   never holds a value, and it never names a key the input supplied.
 - The card number guard runs on every string a note holds: id, scenario, category, link kind
   and id, and the body.
 - Characters are counted as code points (Python's len), as the page's charCount does.

Differences from the page's schema, each on purpose:
 - A lone surrogate in a string is refused (body_schema, or bad_request in a category): SQLite
   cannot store it, and the page's UTF-8 encoder would silently replace it.
 - Booleans are never integers here (Python's True is an int; the page's `true` is not a number).
"""

from __future__ import annotations

import json
import re
import unicodedata
import uuid
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any, NoReturn

from notes_guard import (
    is_bidi_override_cp,
    is_control_cp,
    is_format_cp,
    refuses_body,
    refuses_text,
)

LIMITS = {
    "text_chars": 4000,
    "blocks": 100,
    "list_items": 50,
    "quote_paragraphs": 20,
    "marks_per_text": 4,
    "body_bytes": 64 * 1024,
    "category_chars": 24,
    "max_time": 4102444800000,
    # seq is the highest seq of the scenario plus one and is never reused, so the bound sits far
    # above the note limit; 12 digits can never hold a run of 13 digits (safety review, 2026-11-19).
    "max_seq": 999_999_999_999,
    "notes_per_scenario": 1000,
    "file_notes": 500,
    "file_bytes": 2 * 1024 * 1024,
}
_MAX_SAFE = 2**53 - 1

COLOURS = ("r0", "r1", "r2", "r3", "r4", "muted")
DECISIONS = ("none", "pass", "fail")
MARK_TYPES = ("bold", "italic", "underline", "strike")
STARTER_CATEGORIES: tuple[str, ...] = ("Note", "Question", "Follow up", "Source", "Context")

# re.fullmatch with explicit ASCII classes: `$` would accept a trailing line feed.
_NOTE_ID = re.compile(r"note-[0-9a-f]{32}")
_SCENARIO = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
_LINK_KIND = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,63}")
_LINK_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")

_FIELD_KEYS = ("link", "colour", "category", "decision", "body")


class NoteRefused(Exception):
    """A refusal: a fixed code and a path of fixed names and indices. Never a value."""

    def __init__(self, code: str, where: str = "") -> None:
        super().__init__(code, where)
        self.code = code
        self.where = where

    def __str__(self) -> str:
        return f"{self.code} {self.where}".strip()


def _fail(code: str, where: str) -> NoReturn:
    raise NoteRefused(code, where)


def _at(path: str, name: str) -> str:
    return f"{path}.{name}" if path else name


def _idx(path: str, i: int) -> str:
    return f"{path}[{i}]"


def _shape(
    raw: Any, required: Sequence[str], optional: Sequence[str] = ()
) -> dict[str, Any] | None:
    """The dict when it is a plain dict with exactly these keys: all of `required`, any of
    `optional`, and no other."""
    if type(raw) is not dict:
        return None
    for k in raw:
        if not isinstance(k, str) or (k not in required and k not in optional):
            return None
    for k in required:
        if k not in raw:
            return None
    return raw


def _as_int(raw: Any) -> int | None:
    """A JSON number that is a safe integer, as the page's Number.isSafeInteger sees it."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw if abs(raw) <= _MAX_SAFE else None
    if isinstance(raw, float) and raw.is_integer() and abs(raw) <= _MAX_SAFE:
        return int(raw)
    return None


def _encodable(s: str) -> bool:
    try:
        s.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


# ---------------------------------------------------------------------------- JSON in


def _no_constant(_name: str) -> NoReturn:
    raise ValueError("not json")


def parse_json(data: bytes | str) -> Any:
    """json.loads that refuses NaN and Infinity, bad UTF-8 and nesting that is too deep."""
    try:
        return json.loads(data, parse_constant=_no_constant)
    except (ValueError, RecursionError, TypeError):
        _fail("bad_json", "")


def body_to_json(body: Mapping[str, Any]) -> str:
    """The compact JSON text of a checked body: what is stored, and what the byte limit counts."""
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------- body document


def _check_marks(raw: Any, path: str) -> list[dict[str, str]]:
    if not isinstance(raw, list) or len(raw) > LIMITS["marks_per_text"]:
        _fail("body_schema", path)
    out: list[dict[str, str]] = []
    for i, m in enumerate(raw):
        o = _shape(m, ("type",))
        t = o["type"] if o else None
        if not isinstance(t, str) or t not in MARK_TYPES:
            _fail("body_schema", _idx(path, i))
        if any(x["type"] == t for x in out):
            _fail("body_schema", _idx(path, i))
        out.append({"type": t})
    return out


def _check_inline(raw: Any, path: str, count: list[int]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        _fail("body_schema", path)
    t = raw.get("type")
    if t == "hard_break":
        if _shape(raw, ("type",)) is None:
            _fail("body_schema", path)
        return {"type": "hard_break"}
    o = _shape(raw, ("type", "text"), ("marks",))
    if o is None or t != "text" or not isinstance(o["text"], str):
        _fail("body_schema", path)
    s: str = o["text"]
    n = len(s)
    if n < 1:
        _fail("body_schema", _at(path, "text"))
    count[0] += n
    if n > LIMITS["text_chars"] or count[0] > LIMITS["text_chars"]:
        _fail("too_long", _at(path, "text"))
    if not _encodable(s) or s != unicodedata.normalize("NFC", s):
        _fail("body_schema", _at(path, "text"))
    for ch in s:
        cp = ord(ch)
        if is_control_cp(cp) or is_bidi_override_cp(cp):
            _fail("body_schema", _at(path, "text"))
    if "marks" in o:
        return {"type": "text", "text": s, "marks": _check_marks(o["marks"], _at(path, "marks"))}
    return {"type": "text", "text": s}


def _check_paragraph(raw: Any, path: str, count: list[int]) -> dict[str, Any]:
    o = _shape(raw, ("type",), ("content",))
    if o is None or o["type"] != "paragraph":
        _fail("body_schema", path)
    if "content" not in o:
        return {"type": "paragraph"}
    if not isinstance(o["content"], list):
        _fail("body_schema", _at(path, "content"))
    content = [
        _check_inline(n, _idx(_at(path, "content"), i), count) for i, n in enumerate(o["content"])
    ]
    return {"type": "paragraph", "content": content}


def _check_list_items(raw: Any, path: str, count: list[int]) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not 1 <= len(raw) <= LIMITS["list_items"]:
        _fail("body_schema", path)
    items: list[dict[str, Any]] = []
    for i, entry in enumerate(raw):
        p = _idx(path, i)
        item = _shape(entry, ("type", "content"))
        if (
            item is None
            or item["type"] != "list_item"
            or not isinstance(item["content"], list)
            or len(item["content"]) != 1
        ):
            _fail("body_schema", p)
        para = _check_paragraph(item["content"][0], _idx(_at(p, "content"), 0), count)
        items.append({"type": "list_item", "content": [para]})
    return items


def _check_block(raw: Any, path: str, count: list[int]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        _fail("body_schema", path)
    t = raw.get("type")
    if t == "paragraph":
        return _check_paragraph(raw, path, count)
    if t in ("bullet_list", "ordered_list"):
        o = _shape(raw, ("type", "content"))
        if o is None:
            _fail("body_schema", path)
        return {"type": t, "content": _check_list_items(o["content"], _at(path, "content"), count)}
    if t == "quote":
        o = _shape(raw, ("type", "content"))
        if (
            o is None
            or not isinstance(o["content"], list)
            or not 1 <= len(o["content"]) <= LIMITS["quote_paragraphs"]
        ):
            _fail("body_schema", path)
        paras = [
            _check_paragraph(p, _idx(_at(path, "content"), i), count)
            for i, p in enumerate(o["content"])
        ]
        return {"type": "quote", "content": paras}
    _fail("body_schema", path)


def check_body(raw: Any, path: str = "body") -> dict[str, Any]:
    """The closed body document, rebuilt. `path` names it in a refusal."""
    o = _shape(raw, ("v", "content"))
    if (
        o is None
        or _as_int(o["v"]) != 1
        or not isinstance(o["content"], list)
        or len(o["content"]) > LIMITS["blocks"]
    ):
        _fail("body_schema", path)
    count = [0]
    content = [
        _check_block(b, _idx(_at(path, "content"), i), count) for i, b in enumerate(o["content"])
    ]
    body: dict[str, Any] = {"v": 1, "content": content}
    if len(body_to_json(body).encode("utf-8")) > LIMITS["body_bytes"]:
        _fail("too_long", path)
    if refuses_body(body):
        _fail("card_number", path)
    return body


# ---------------------------------------------------------------------------- note fields


def is_note_id(s: Any) -> bool:
    return isinstance(s, str) and _NOTE_ID.fullmatch(s) is not None


def check_id(raw: Any, path: str = "id") -> str:
    if not is_note_id(raw):
        _fail("bad_request", path)
    if refuses_text(raw):
        _fail("card_number", path)
    return str(raw)


def check_scenario(raw: Any, path: str = "scenario") -> str:
    if not isinstance(raw, str) or _SCENARIO.fullmatch(raw) is None:
        _fail("bad_scenario", path)
    if refuses_text(raw):
        _fail("card_number", path)
    return raw


def _check_time(raw: Any, path: str) -> int:
    v = _as_int(raw)
    if v is None or v < 0 or v > LIMITS["max_time"]:
        _fail("bad_request", path)
    return v


def _check_seq(raw: Any, path: str) -> int:
    v = _as_int(raw)
    if v is None or v < 1 or v > LIMITS["max_seq"]:
        _fail("bad_request", path)
    return v


def check_link(raw: Any, path: str = "link") -> dict[str, str] | None:
    """A link is None, or exactly a kind and an id. Both strings take the guard."""
    if raw is None:
        return None
    o = _shape(raw, ("kind", "id"))
    if o is None or not isinstance(o["kind"], str) or not isinstance(o["id"], str):
        _fail("bad_request", path)
    if _LINK_KIND.fullmatch(o["kind"]) is None:
        _fail("bad_request", _at(path, "kind"))
    if _LINK_ID.fullmatch(o["id"]) is None:
        _fail("bad_request", _at(path, "id"))
    if refuses_text(o["kind"]):
        _fail("card_number", _at(path, "kind"))
    if refuses_text(o["id"]):
        _fail("card_number", _at(path, "id"))
    return {"kind": o["kind"], "id": o["id"]}


def _check_member(raw: Any, allowed: tuple[str, ...], path: str) -> str:
    if not isinstance(raw, str) or raw not in allowed:
        _fail("bad_request", path)
    return raw


def normalize_category_name(raw: str) -> str:
    """What a person typed, made ready for the check: NFC, then trimmed."""
    return unicodedata.normalize("NFC", raw).strip()


def check_category_name(raw: Any, where: str = "category") -> str:
    """Strict: the value must already be normalized. Never echoes the value in a refusal."""
    if not isinstance(raw, str) or raw == "":
        _fail("bad_request", where)
    if len(raw) > LIMITS["category_chars"]:
        _fail("too_long", where)
    if not _encodable(raw) or raw != unicodedata.normalize("NFC", raw) or raw != raw.strip():
        _fail("bad_request", where)
    for ch in raw:
        cp = ord(ch)
        if is_control_cp(cp) or is_format_cp(cp):
            _fail("bad_request", where)
    if refuses_text(raw):
        _fail("card_number", where)
    return raw


def same_category(a: str, b: str) -> bool:
    """Names are equal ignoring case: lower case and trim, so not ASCII only."""
    return a.strip().lower() == b.strip().lower()


def category_exists(names: Iterable[str], name: str) -> bool:
    return any(same_category(c, name) for c in names)


def _read_fields(o: dict[str, Any], path: str) -> dict[str, Any]:
    link = check_link(o["link"], _at(path, "link"))
    colour = _check_member(o["colour"], COLOURS, _at(path, "colour"))
    category = check_category_name(o["category"], _at(path, "category"))
    decision = _check_member(o["decision"], DECISIONS, _at(path, "decision"))
    body = check_body(o["body"], _at(path, "body"))
    return {
        "link": link,
        "colour": colour,
        "category": category,
        "decision": decision,
        "body": body,
    }


def check_note_fields(raw: Any, path: str = "") -> dict[str, Any]:
    """The five fields the person sets: link, colour, category, decision, body."""
    o = _shape(raw, _FIELD_KEYS)
    if o is None:
        _fail("bad_request", path)
    return _read_fields(o, path)


def check_draft(raw: Any, path: str = "") -> dict[str, Any]:
    o = _shape(raw, ("scenario", "time", *_FIELD_KEYS))
    if o is None:
        _fail("bad_request", path)
    scenario = check_scenario(o["scenario"], _at(path, "scenario"))
    time = _check_time(o["time"], _at(path, "time"))
    return {"scenario": scenario, "time": time, **_read_fields(o, path)}


def check_note(raw: Any, path: str = "") -> dict[str, Any]:
    o = _shape(raw, ("id", "scenario", "time", "seq", *_FIELD_KEYS))
    if o is None:
        _fail("bad_request", path)
    note_id = check_id(o["id"], _at(path, "id"))
    seq = _check_seq(o["seq"], _at(path, "seq"))
    d = check_draft({k: o[k] for k in ("scenario", "time", *_FIELD_KEYS)}, path)
    return {"id": note_id, "seq": seq, **d}


def check_file_note(raw: Any, scenario: str, path: str) -> dict[str, Any]:
    """A file's note: the same fields as a note, without the scenario (the file holds it)."""
    o = _shape(raw, ("id", "time", "seq", *_FIELD_KEYS))
    if o is None:
        _fail("bad_file", path)
    note = check_note({**o, "scenario": scenario}, path)
    del note["scenario"]
    return note


# ---------------------------------------------------------------------------- id maker


def make_note_id(uuid_source: Callable[[], uuid.UUID] = uuid.uuid4, max_draws: int = 16) -> str:
    """`note-` plus 32 lowercase hex from a uuid. About 1 id in 450 holds a run the guard refuses,
    so this draws again until the guard passes the id. The error names no id."""
    for _ in range(max_draws):
        note_id = "note-" + uuid_source().hex
        if is_note_id(note_id) and not refuses_text(note_id):
            return note_id
    raise RuntimeError("note id: no usable draw")


# ---------------------------------------------------------------------------- stored rows


def note_from_row(row: Any) -> dict[str, Any]:
    """A database row (sqlite3.Row or a mapping), checked as a note. Every column is judged
    again, the guard included."""
    try:
        body = parse_json(row["body"])
    except NoteRefused:
        _fail("body_schema", "body")
    link = None
    if row["link_kind"] is not None or row["link_id"] is not None:
        link = {"kind": row["link_kind"], "id": row["link_id"]}
    return check_note(
        {
            "id": row["id"],
            "scenario": row["scenario"],
            "time": row["time_ms"],
            "seq": row["seq"],
            "link": link,
            "colour": row["colour"],
            "category": row["category"],
            "decision": row["decision"],
            "body": body,
        }
    )


# ---------------------------------------------------------------------------- the notes file

_FILE_KEYS = ("format", "version", "scenario", "categories", "notes")
_FILE_KEYS_V2 = (*_FILE_KEYS, "nodes", "paths", "failCategories")


def file_error(e: NoteRefused) -> NoteRefused:
    """A file refusal speaks in the file's few codes: card number, size, scenario, or not a file."""
    keep = e.code in ("card_number", "too_large", "bad_scenario")
    return NoteRefused(e.code if keep else "bad_file", e.where)


def check_file(raw: Any, scenarios: Sequence[str] | None = None) -> dict[str, Any]:
    """The notes file, checked all or nothing. Returns a rebuilt file, always at version 2: a
    version 1 file (five keys) is lifted with empty marks; a version 2 file has exactly eight keys.
    """
    o2 = _shape(raw, _FILE_KEYS_V2)
    o1 = None if o2 is not None else _shape(raw, _FILE_KEYS)
    if o2 is not None and _as_int(o2["version"]) == 2:
        o, version = o2, 2
    elif o1 is not None and _as_int(o1["version"]) == 1:
        o, version = o1, 1
    else:
        _fail("bad_file", "")
    if o["format"] != "ffr-notes":
        _fail("bad_file", "")
    try:
        scenario = check_scenario(o["scenario"], "scenario")
    except NoteRefused as e:
        raise file_error(e) from None
    if scenarios is not None and scenario not in scenarios:
        _fail("bad_scenario", "scenario")
    if not isinstance(o["categories"], list):
        _fail("bad_file", "categories")
    if not isinstance(o["notes"], list):
        _fail("bad_file", "notes")
    if len(o["notes"]) > LIMITS["file_notes"]:
        _fail("too_large", "notes")

    categories: list[str] = []
    for i, c in enumerate(o["categories"]):
        where = _idx("categories", i)
        try:
            name = check_category_name(c, where)
        except NoteRefused as e:
            raise file_error(e) from None
        if category_exists(categories, name):
            _fail("bad_file", where)
        categories.append(name)

    notes: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, entry in enumerate(o["notes"]):
        where = _idx("notes", i)
        try:
            n = check_file_note(entry, scenario, where)
        except NoteRefused as e:
            raise file_error(e) from None
        if n["id"] in seen:
            _fail("bad_file", _at(where, "id"))
        seen.add(n["id"])
        notes.append(
            {
                k: n[k]
                for k in ("id", "time", "link", "colour", "category", "decision", "seq", "body")
            }
        )
    marks: dict[str, Any]
    if version == 2:
        # Imported here: marks_schema imports this module at its top, so a top-level import of it
        # would be a ring.
        from marks_schema import check_file_marks

        marks = check_file_marks(o, scenario)
    else:
        marks = {"nodes": [], "paths": [], "failCategories": []}
    return {
        "format": "ffr-notes",
        "version": 2,
        "scenario": scenario,
        "categories": categories,
        "notes": notes,
        **marks,
    }
