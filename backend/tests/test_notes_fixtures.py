"""Shared fixtures and builders for the notes tests. It holds no test.

Every notes test module imports `_isolated_notes_db` (autouse), so no test can open the real
data/notes.sqlite3: the notes store reads FFR_NOTES_DB at every connect.

Every digit run in the notes tests is a published test number (VISA below, 4111111111111111) or
one taken from tests/note_vectors.json. No real card number is in any of these files.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parents[1]
VECTORS: dict[str, Any] = json.loads((TESTS / "note_vectors.json").read_text(encoding="utf-8"))
DIGIT_TABLE_FILE = TESTS / "note_digit_table.json"
DIGIT_TABLE: dict[str, Any] = json.loads(DIGIT_TABLE_FILE.read_text(encoding="utf-8"))

VISA = "4111111111111111"  # a published test number
VISA_GROUPED = "4111 1111 1111 1111"
VISA_ID = "note-4111111111111111abcdefabcdefabcd"  # a crafted id that holds the test number
GOOD_ID = "note-0123456789abcdef0123456789abcdef"
GOOD_PATH_ID = "path-0123456789abcdef0123456789abcdef"
VISA_PATH_ID = "path-" + VISA + "abcdefabcdefabcd"  # a crafted path id that holds the test number


# The notes routes refuse a Host that does not name this machine. This is the one place the notes
# tests' client is pointed at a loopback name; the test client's default name is refused.
NOTES_BASE_URL = "http://localhost"


def notes_client(app: Any) -> TestClient:
    return TestClient(app, base_url=NOTES_BASE_URL)


@pytest.fixture(autouse=True)
def _isolated_notes_db(tmp_path, monkeypatch):
    """Point the notes store at a file of the test's own."""
    monkeypatch.setenv("FFR_NOTES_DB", str(tmp_path / "notes-under-test.sqlite3"))
    yield


def text(s: str, *marks: str) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": s}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return node


def para(*inline: dict[str, Any]) -> dict[str, Any]:
    return {"type": "paragraph", "content": list(inline)} if inline else {"type": "paragraph"}


def bullets(*items: str, kind: str = "bullet_list") -> dict[str, Any]:
    return {
        "type": kind,
        "content": [{"type": "list_item", "content": [para(text(i))]} for i in items],
    }


def quote(*paragraphs: dict[str, Any]) -> dict[str, Any]:
    return {"type": "quote", "content": list(paragraphs)}


def doc(*blocks: dict[str, Any]) -> dict[str, Any]:
    return {"v": 1, "content": list(blocks)}


def hello(s: str = "hello") -> dict[str, Any]:
    return doc(para(text(s)))


def fields(**over: Any) -> dict[str, Any]:
    """The five fields a person sets, valid."""
    base: dict[str, Any] = {
        "link": None,
        "colour": "r1",
        "category": "Note",
        "decision": "none",
        "body": hello(),
    }
    base.update(over)
    return base


def draft(
    scenario: str = "card-fraud", time: int = 1_700_000_000_000, **over: Any
) -> dict[str, Any]:
    return {"scenario": scenario, "time": time, **fields(**over)}


# The wire fixtures of the investigator's node (BUILD-PLAN part 2 with AMEND-model part 1). The page
# suite asserts against the same texts, keys in this order. The path id is the one the uuid
# 01234567-89ab-cdef-0123-456789abcdef makes (a test patches notes_store._uuid_source with it).
PATH_UUID = "01234567-89ab-cdef-0123-456789abcdef"
NODE_WIRE: dict[str, Any] = {
    "scenario": "card-fraud",
    "record": {"kind": "auth", "id": "tx-0001"},
    "pinned": True,
    "disposition": "fail",
    "category": "Shared key",
    "settled": True,
}
PUT_BODY_WIRE: dict[str, Any] = {**NODE_WIRE, "ifUnsettled": False}
PATH_WIRE: dict[str, Any] = {
    "id": GOOD_PATH_ID,
    "scenario": "card-fraud",
    "seq": 1,
    "name": "Path 1",
    "stops": [{"kind": "auth", "id": "tx-0001"}, {"kind": "login", "id": "lg-0002"}],
}
LIST_WIRE: dict[str, Any] = {
    "nodes": [NODE_WIRE],
    "paths": [PATH_WIRE],
    "failCategories": ["Shared key"],
    "skipped": 0,
}
FILE_V2_WIRE: dict[str, Any] = {
    "format": "ffr-notes",
    "version": 2,
    "scenario": "card-fraud",
    "categories": [],
    "notes": [],
    "nodes": [
        {
            "record": {"kind": "auth", "id": "tx-0001"},
            "pinned": True,
            "disposition": "fail",
            "category": "Shared key",
            "settled": True,
        }
    ],
    "paths": [
        {
            "id": GOOD_PATH_ID,
            "seq": 1,
            "name": "Path 1",
            "stops": [{"kind": "auth", "id": "tx-0001"}, {"kind": "login", "id": "lg-0002"}],
        }
    ],
    "failCategories": ["Shared key"],
}


def wire_text(doc_: Any) -> str:
    """The compact JSON text a reply carries: keys in the order of the dict."""
    return json.dumps(doc_, separators=(",", ":"))


def node_doc(**over: Any) -> dict[str, Any]:
    """A valid node of card-fraud as a PUT body's node part: unsettled, a record with no mark."""
    base: dict[str, Any] = {
        "scenario": "card-fraud",
        "record": {"kind": "auth", "id": "tx-0001"},
        "pinned": False,
        "disposition": "none",
        "category": None,
        "settled": False,
    }
    base.update(over)
    return base


def path_draft(**over: Any) -> dict[str, Any]:
    """A valid new path of card-fraud: two stops."""
    base: dict[str, Any] = {
        "scenario": "card-fraud",
        "name": "Path 1",
        "stops": [{"kind": "auth", "id": "tx-0001"}, {"kind": "login", "id": "lg-0002"}],
    }
    base.update(over)
    return base


def rich_body() -> dict[str, Any]:
    return doc(
        para(text("bold", "bold", "italic"), {"type": "hard_break"}, text("plain")),
        bullets("one", "two"),
        bullets("first", "second", kind="ordered_list"),
        quote(para(text("quoted", "underline", "strike")), para()),
    )
