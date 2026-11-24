"""A refused value is never stored, logged or echoed.

For every place a card number can sit, the test sends it and then reads: the reply, the log records
of the root, uvicorn, uvicorn.access and the application loggers, the notes database file, and the
access line uvicorn would write from the scope the app received.

NO REAL SERVER RAN. TestClient never produces a uvicorn.access record, so a capture of that logger
alone proves nothing. The access line is built here from the scope dict the way uvicorn 0.48's
h11 and httptools protocols build it (urllib.parse.quote of scope["path"], plus the raw query
string), from the same dict object the app was handed, and a line built from the same scope before
the app ran shows that the digits were there to be logged.
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.parse
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.types import ASGIApp, Receive, Scope, Send

import main
import notes_routes
import notes_store as ns
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    FILE_V2_WIRE,
    GOOD_ID,
    VISA,
    VISA_GROUPED,
    VISA_ID,
    VISA_PATH_ID,
    _isolated_notes_db,
    draft,
    fields,
    hello,
    node_doc,
    notes_client,
    path_draft,
)

A = "card-fraud"
H = {"X-FFR-Client": "notes", "Content-Type": "application/json"}
LOGGERS = (
    "",
    "uvicorn",
    "uvicorn.access",
    "uvicorn.error",
    "fastapi",
    "starlette",
    "asyncio",
    "main",
    "notes_routes",
    "notes_store",
    "notes_schema",
    "notes_guard",
)


def digits_only(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit())


def leaks(haystack: str) -> bool:
    haystack = urllib.parse.unquote(haystack)
    flat = digits_only(haystack)
    return VISA in flat or VISA_GROUPED.replace(" ", "-") in haystack or VISA_GROUPED in haystack


class Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.DEBUG)
        self.lines: list[str] = []
        # The test client's own logger writes the request line it sends: it is not the app.
        self.addFilter(lambda r: not r.name.startswith(("httpx", "httpcore")))

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(
            " ".join([record.name, record.getMessage(), repr(record.args), record.exc_text or ""])
        )


@pytest.fixture
def captured():
    cap = Capture()
    saved: list[tuple[logging.Logger, int]] = []
    for name in LOGGERS:
        lg = logging.getLogger(name)
        saved.append((lg, lg.level))
        lg.setLevel(logging.DEBUG)
        lg.addHandler(cap)
    yield cap
    for lg, level in saved:
        lg.removeHandler(cap)
        lg.setLevel(level)


class Hold:
    """Holds the scope dict the app is handed, as uvicorn's protocol object does."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.scopes: list[Scope] = []
        self.before: list[str] = []

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            self.scopes.append(scope)
            self.before.append(access_line(scope))
        await self.app(scope, receive, send)


def access_line(scope: Scope) -> str:
    line = urllib.parse.quote(scope["path"])
    if scope["query_string"]:
        line = "{}?{}".format(line, scope["query_string"].decode("ascii"))
    return f'{scope["method"]} {line}'


def db_bytes() -> bytes:
    path = ns.db_path()
    out = b""
    for suffix in ("", "-journal", "-wal", "-shm"):
        p = path.with_name(path.name + suffix)
        if p.exists():
            out += p.read_bytes()
    return out


def db_leaks() -> bool:
    raw = db_bytes()
    flat = bytes(b for b in raw if 48 <= b <= 57)
    return VISA.encode() in flat


def post(c: TestClient, url: str, payload: Any) -> Any:
    return c.post(url, content=json.dumps(payload), headers=H)


def imported(**note_over: Any) -> dict[str, Any]:
    note = {
        "id": "note-" + "a" * 32,
        "time": 1,
        "link": None,
        "colour": "r1",
        "category": "Note",
        "decision": "none",
        "seq": 1,
        "body": hello(),
    }
    note.update(note_over)
    return {"format": "ffr-notes", "version": 1, "scenario": A, "categories": [], "notes": [note]}


def imported_v2(**node_over: Any) -> dict[str, Any]:
    """A version 2 file whose one node takes `node_over`; its notes and other marks are empty."""
    node = {**FILE_V2_WIRE["nodes"][0], **node_over}
    return {**FILE_V2_WIRE, "nodes": [node], "paths": [], "failCategories": []}


def put(c: TestClient, url: str, payload: Any) -> Any:
    return c.put(url, content=json.dumps(payload), headers=H)


PLACES: dict[str, Callable[[TestClient], Any]] = {
    "body": lambda c: post(c, "/api/notes", draft(body=hello("pay " + VISA))),
    "body grouped": lambda c: post(c, "/api/notes", draft(body=hello(VISA_GROUPED))),
    "link id": lambda c: post(c, "/api/notes", draft(link={"kind": "tx", "id": "tx-" + VISA})),
    "link kind": lambda c: post(c, "/api/notes", draft(link={"kind": "k" + VISA, "id": "x"})),
    "category": lambda c: post(c, "/api/notes", draft(category=VISA_GROUPED)),
    "scenario": lambda c: post(c, "/api/notes", draft(scenario=VISA_GROUPED.replace(" ", "-"))),
    "new category": lambda c: post(c, "/api/notes/categories", {"name": VISA}),
    "put body": lambda c: c.put(
        f"/api/notes/{GOOD_ID}", content=json.dumps(fields(body=hello(VISA))), headers=H
    ),
    "put path id": lambda c: c.put(
        f"/api/notes/{VISA_ID}", content=json.dumps(fields()), headers=H
    ),
    "delete path id": lambda c: c.delete(f"/api/notes/{VISA_ID}", headers=H),
    "import body": lambda c: post(c, "/api/notes/import", imported(body=hello(VISA))),
    "import id": lambda c: post(c, "/api/notes/import", imported(id=VISA_ID)),
    "import category": lambda c: post(c, "/api/notes/import", imported(category=VISA)),
    "import link id": lambda c: post(
        c, "/api/notes/import", imported(link={"kind": "a", "id": "tx-" + VISA})
    ),
    "query scenario": lambda c: c.get("/api/notes", params={"scenario": VISA}),
    "query scenario encoded": lambda c: c.get("/api/notes?scenario=4111%201111%201111%201111"),
    "export scenario": lambda c: c.get("/api/notes/export", params={"scenario": VISA_GROUPED}),
    "node record id": lambda c: put(
        c,
        "/api/notes/marks/node",
        {**node_doc(record={"kind": "auth", "id": "tx-" + VISA}), "ifUnsettled": False},
    ),
    "node category": lambda c: put(
        c,
        "/api/notes/marks/node",
        {**node_doc(disposition="fail", category=VISA_GROUPED), "ifUnsettled": False},
    ),
    "fail category": lambda c: post(c, "/api/notes/marks/fail-categories", {"name": VISA}),
    "path name": lambda c: post(c, "/api/notes/marks/paths", path_draft(name=VISA)),
    "path stop id": lambda c: post(
        c,
        "/api/notes/marks/paths",
        path_draft(stops=[{"kind": "auth", "id": "tx-1"}, {"kind": "auth", "id": "tx-" + VISA}]),
    ),
    "put marks path id": lambda c: put(
        c, f"/api/notes/marks/paths/{VISA_PATH_ID}", {"name": "x", "stops": path_draft()["stops"]}
    ),
    "delete marks path id": lambda c: c.delete(f"/api/notes/marks/paths/{VISA_PATH_ID}", headers=H),
    "marks query scenario": lambda c: c.get("/api/notes/marks", params={"scenario": VISA}),
    "marks query scenario encoded": lambda c: c.get(
        "/api/notes/marks?scenario=" + urllib.parse.quote(VISA_GROUPED)
    ),
    "import v2 node": lambda c: post(
        c, "/api/notes/import", imported_v2(record={"kind": "auth", "id": "tx-" + VISA})
    ),
}


class TestNothingKeepsARefusedNumber:
    @pytest.mark.parametrize("place", sorted(PLACES))
    def test_reply_logs_file_and_access_line(self, captured: Capture, place: str) -> None:
        hold = Hold(main.app)
        client = notes_client(hold)
        r = PLACES[place](client)
        assert r.status_code in (400, 404, 422), (place, r.status_code)
        assert not leaks(r.text), "the reply"
        assert not leaks(json.dumps(dict(r.headers))), "the reply headers"
        assert not leaks("\n".join(captured.lines)), "a log record"
        assert not db_leaks(), "the database file"
        assert hold.scopes, "the app was reached"
        assert not leaks(access_line(hold.scopes[-1])), "the access line from the held scope"

    def test_the_test_is_not_vacuous_the_digits_were_in_the_access_line_before_the_app(
        self,
    ) -> None:
        hold = Hold(main.app)
        client = notes_client(hold)
        PLACES["put path id"](client)
        PLACES["query scenario"](client)
        assert leaks(hold.before[0]) and leaks(hold.before[1])
        assert not leaks(access_line(hold.scopes[0])) and not leaks(access_line(hold.scopes[1]))

    def test_the_reply_to_a_refusal_is_a_code_and_a_fixed_sentence(self) -> None:
        client = notes_client(main.app)
        d = PLACES["body"](client).json()["detail"]
        assert d == {
            "code": "card_number",
            "where": "body",
            "message": notes_routes.MESSAGES["card_number"],
        }
        d = PLACES["import body"](client).json()["detail"]
        assert (d["code"], d["where"]) == ("card_number", "notes[0].body")

    def test_a_refused_import_leaves_the_database_without_the_file_notes(self) -> None:
        client = notes_client(main.app)
        PLACES["import body"](client)
        PLACES["import id"](client)
        c = ns.connect()
        try:
            assert c.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0
        finally:
            c.close()

    def test_an_accepted_note_leaves_the_same_clean_state(self, captured: Capture) -> None:
        client = notes_client(main.app)
        r = post(client, "/api/notes", draft())
        assert r.status_code == 201
        assert not leaks("\n".join(captured.lines)) and not db_leaks()


class TestAccessLogScopeRedaction:
    """The middleware rewrites the held scope in place, so uvicorn's access line never holds it."""

    def run(self, path: str, query: bytes = b"") -> dict[str, Any]:
        seen: dict[str, Any] = {}

        async def app(scope: dict, receive: Any, send: Any) -> None:
            seen["path"], seen["raw_path"], seen["query_string"] = (
                scope["path"],
                scope.get("raw_path"),
                scope["query_string"],
            )

        wrapped = notes_routes.NotesLogGuard(app)
        scope = {
            "type": "http",
            "method": "GET",
            "path": path,
            "raw_path": urllib.parse.quote(path).encode("ascii"),
            "query_string": query,
            "headers": [],
        }
        asyncio.run(wrapped(scope, None, None))
        seen["scope"] = scope
        return seen

    def test_a_refused_path_is_rewritten_in_the_same_dict_and_raw_path_too(self) -> None:
        out = self.run("/api/notes/" + VISA_ID)
        assert out["scope"]["path"] == out["path"] == notes_routes.REDACTED_PATH
        assert out["raw_path"] == notes_routes.REDACTED_PATH.encode("ascii")
        assert not leaks(access_line(out["scope"]))

    def test_a_refused_query_is_rewritten_also_when_percent_encoded(self) -> None:
        for q in (
            b"scenario=" + VISA.encode(),
            b"scenario=4111%201111%201111%201111",
            b"scenario=4111-1111-1111-1111",
        ):
            out = self.run("/api/notes", q)
            assert out["query_string"] == notes_routes.REDACTED_QUERY.encode("ascii")
            assert out["path"] == "/api/notes"

    def test_a_clean_request_is_left_alone(self) -> None:
        out = self.run("/api/notes/" + GOOD_ID, b"scenario=card-fraud")
        assert out["path"] == "/api/notes/" + GOOD_ID
        assert out["query_string"] == b"scenario=card-fraud"

    def test_other_paths_and_other_scope_types_are_never_touched(self) -> None:
        out = self.run("/api/transactions/" + VISA, b"x=" + VISA.encode())
        assert (
            out["path"] == "/api/transactions/" + VISA
            and out["query_string"] == b"x=" + VISA.encode()
        )

    def test_a_scope_that_is_not_http_passes_through(self) -> None:
        seen: list[str] = []

        async def app(scope: dict, receive: Any, send: Any) -> None:
            seen.append(scope["type"])

        asyncio.run(notes_routes.NotesLogGuard(app)({"type": "lifespan"}, None, None))
        assert seen == ["lifespan"]

    def test_a_query_that_is_not_ascii_does_not_break_the_middleware(self) -> None:
        out = self.run("/api/notes", b"scenario=\xff\xfe")
        assert out["query_string"] == b"scenario=\xff\xfe"

    def test_the_database_holds_no_table_apart_from_the_notes_tables(self) -> None:
        c = ns.connect()
        try:
            names = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        finally:
            c.close()
        # Version 2 adds the investigator's node tables; no other table (no log table) may appear.
        assert names == {
            "notes",
            "note_categories",
            "record_nodes",
            "fail_categories",
            "custom_paths",
        }
