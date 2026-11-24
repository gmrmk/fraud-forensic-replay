"""The custom notes routes (design section 6, with the safety review's changes).

Routes take the raw `Request`, never a Pydantic model and never a typed query parameter: the
framework's default 422 echoes the offending input, and a refused value must never come back.
Every refusal is `{"detail": {"code", "where", "message"}}`: a fixed code, a path of fixed names
and indices, and a fixed sentence. Nothing in a reply, a log record or the database file holds a
value that was refused.

 - A write needs the header `X-FFR-Client: notes` (403) and `Content-Type: application/json` (415).
   No cookie exists, so no CSRF token applies; the custom header makes a cross-site `fetch` fail
   its preflight (the backend sends no CORS headers).
 - EVERY notes request, read or write, must name this machine (403, the same fixed refusal): the
   Host header's host part is localhost, 127.0.0.1 or [::1] (or a name in FFR_NOTES_HOSTS), and an
   Origin header, if there is one, has a host part in the same set. The custom header does not stop
   DNS rebinding, where a page under another name is re-pointed at 127.0.0.1 and is then
   same-origin with this backend. X-Forwarded-Host and Forwarded are never read. The check runs in
   `_guarded`, which wraps every notes handler; no other route of the app has a host check.
 - The request size is capped (413): the declared length is checked first, and the stream read is
   capped whatever is declared, so a chunked body is cut at the cap too.
 - The investigator's marks have six routes under /api/notes/marks (the list, a node write, a typed
   Fail category, and a custom path's create, update and delete), registered before `/{note_id}`
   and wrapped by the same `_guarded`. There is no route that deletes a node or a Fail category.
 - The routes are `async` for the body read and push the SQLite work to the threadpool, as the
   other routes of main.py keep blocking work off the event loop.
 - The scenario is explicit and checked with the registry. The process-global active scenario is
   never read or changed.
 - `NotesLogGuard` is a pure ASGI layer. uvicorn writes its access line from the scope dict the
   app receives, so a card number in a path or a query string would reach `backend.log` before
   any route ran. The layer rewrites that dict in place when the guard refuses what it holds.
"""

from __future__ import annotations

import functools
import logging
import os
import urllib.parse
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect, Request

import notes_store as store
import scenario_registry as sr
from marks_schema import check_node_put, check_path_draft, check_path_fields
from notes_guard import refuses_text
from notes_schema import (
    LIMITS,
    NoteRefused,
    check_category_name,
    check_draft,
    check_note_fields,
    check_scenario,
    parse_json,
)

log = logging.getLogger("notes_routes")

PREFIX = "/api/notes"
CLIENT_HEADER = "x-ffr-client"
CLIENT_VALUE = "notes"
NOTE_CAP = 72 * 1024  # the schema's 64 KB body, plus the envelope and its escapes
CATEGORY_CAP = 4 * 1024
NODE_CAP = 4 * 1024  # a node plus its ifUnsettled flag is a few hundred bytes
PATH_CAP = 16 * 1024  # fifty stops at about 60 bytes each, plus the name and the envelope
IMPORT_CAP = LIMITS["file_bytes"]
REDACTED_PATH = PREFIX + "/redacted"
REDACTED_QUERY = "redacted=1"

# One fixed sentence per code. Nothing from a request is ever put into one.
MESSAGES = {
    "bad_request": "The request is not a valid notes request.",
    "body_schema": "The note text has a form that this app does not accept.",
    "too_long": "The note is too long.",
    "card_number": "The note has a number that looks like a card number.",
    "bad_json": "The request is not valid JSON.",
    "too_large": "The request is too large.",
    "bad_file": "The file is not a notes file.",
    "bad_scenario": "The scenario is not one that this app has.",
    "category_exists": "This category exists already.",
    "limit_reached": "The limit is reached.",
    "not_found": "The item does not exist.",
    "backing_failed": "The notes store did not answer.",
}

_STATUS = {
    "bad_request": 422,
    "body_schema": 422,
    "too_long": 422,
    "card_number": 422,
    "bad_json": 400,
    "too_large": 413,
    "bad_file": 422,
    "bad_scenario": 422,
    "category_exists": 409,
    "limit_reached": 409,
    "not_found": 404,
    "backing_failed": 500,
}


class HttpRefusal(NoteRefused):
    """A refusal that names its own HTTP status (403, 415, and 400 for a bad query scenario)."""

    def __init__(self, code: str, where: str, status: int) -> None:
        super().__init__(code, where)
        self.status = status


def _reply(e: NoteRefused) -> JSONResponse:
    status = e.status if isinstance(e, HttpRefusal) else _STATUS.get(e.code, 422)
    detail = {
        "code": e.code,
        "where": e.where,
        "message": MESSAGES.get(e.code, MESSAGES["bad_request"]),
    }
    return JSONResponse({"detail": detail}, status_code=status)


Handler = Callable[[Request], Awaitable[Response]]


def _guarded(fn: Handler) -> Handler:
    """Turn a refusal into its reply, and any other failure into a fixed 500. The exception text
    is never returned and never logged (a store error can quote a value); only its class is."""

    @functools.wraps(fn)
    async def inner(request: Request) -> Response:
        try:
            _require_local(request)
            return await fn(request)
        except NoteRefused as e:
            return _reply(e)
        except Exception as e:  # noqa: BLE001 - answered with a fixed reply below
            log.warning("notes request failed: %s", type(e).__name__)
            return _reply(NoteRefused("backing_failed", ""))

    return inner


# ---------------------------------------------------------------------------- request reading


LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})
HOSTS_ENV = "FFR_NOTES_HOSTS"


def _allowed_hosts() -> frozenset[str]:
    """The host parts that name this machine, plus the names in FFR_NOTES_HOSTS (comma separated,
    read at every call, empty by default). An entry is a host part only: no port. An empty entry is
    dropped, so an empty Host never matches."""
    listed = {h.strip().lower().removesuffix(".") for h in os.environ.get(HOSTS_ENV, "").split(",")}
    return LOCAL_HOSTS | {h for h in listed if h}


def _host_part(authority: str) -> str | None:
    """The host part of a Host header value or of an origin's authority: the port taken off (it
    must be all ASCII digits), letters folded to lower case, one trailing dot dropped, an IPv6
    literal kept in its brackets. None when the value has any other shape. Never a prefix, suffix
    or substring match: the caller compares the whole string with a set."""
    value = authority.lower()
    if value.startswith("["):
        end = value.find("]")
        if end < 0:
            return None
        host, rest = value[: end + 1], value[end + 1 :]
    else:
        host, sep, rest = value.partition(":")
        rest = sep + rest
    if rest and not (rest.startswith(":") and rest[1:].isascii() and rest[1:].isdigit()):
        return None
    return host.removesuffix(".") if not host.startswith("[") else host


def _origin_host(origin: str) -> str | None:
    """The host part of a bare http or https origin. `null`, a path, userinfo and any other scheme
    give None."""
    value = origin.lower()
    for scheme in ("http://", "https://"):
        if value.startswith(scheme):
            return _host_part(value[len(scheme) :])
    return None


def _require_local(request: Request) -> None:
    """Refuse a notes request that does not name this machine (DNS rebinding). Exactly one Host
    header is read; at most one Origin header. The reply is the same fixed 403 as a missing client
    header and holds no header value. X-Forwarded-Host and Forwarded are never read."""
    allowed = _allowed_hosts()
    hosts = request.headers.getlist("host")
    origins = request.headers.getlist("origin")
    ok = len(hosts) == 1 and len(origins) <= 1 and _host_part(hosts[0]) in allowed
    if ok and origins:
        ok = _origin_host(origins[0]) in allowed
    if not ok:
        raise HttpRefusal("bad_request", "", 403)


def _require_client(request: Request) -> None:
    if request.headers.get(CLIENT_HEADER) != CLIENT_VALUE:
        raise HttpRefusal("bad_request", "", 403)


async def read_body(request: Request, cap: int) -> bytes:
    """The body, at most `cap` bytes. The declared length is checked first; the read is capped
    whatever is declared, so a chunked body stops at the cap and the rest is never read."""
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            too_big = int(declared) > cap
        except ValueError:
            raise NoteRefused("bad_request", "") from None
        if too_big:
            raise NoteRefused("too_large", "")
    buf = bytearray()
    try:
        async for chunk in request.stream():
            buf.extend(chunk)
            if len(buf) > cap:
                raise NoteRefused("too_large", "")
    except ClientDisconnect:
        raise NoteRefused("bad_request", "") from None
    return bytes(buf)


async def _json_body(request: Request, cap: int) -> Any:
    """A write's JSON: header, content type, size, then the parse, in that order."""
    _require_client(request)
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype != "application/json":
        raise HttpRefusal("bad_request", "", 415)
    return parse_json(await read_body(request, cap))


def _scenario_ids() -> set[str]:
    return {s["id"] for s in sr.list_scenarios()}


def _query_scenario(request: Request) -> str:
    """The `scenario` query value, checked. Every failure is one 400 that names no value."""
    raw = request.query_params.get("scenario")
    try:
        scenario = check_scenario(raw)
    except NoteRefused:
        raise HttpRefusal("bad_scenario", "scenario", 400) from None
    if scenario not in _scenario_ids():
        raise HttpRefusal("bad_scenario", "scenario", 400)
    return scenario


def _with_conn(fn: Callable[..., Any], *args: Any) -> Any:
    conn = store.connect()
    try:
        return fn(conn, *args)
    finally:
        conn.close()


# ---------------------------------------------------------------------------- routes

router = APIRouter()


@_guarded
async def list_notes(request: Request) -> Response:
    scenario = _query_scenario(request)
    notes, categories, skipped = await run_in_threadpool(_with_conn, store.list_notes, scenario)
    return JSONResponse({"notes": notes, "categories": categories, "skipped": skipped})


@_guarded
async def create_note(request: Request) -> Response:
    draft = check_draft(await _json_body(request, NOTE_CAP))
    if draft["scenario"] not in _scenario_ids():
        raise NoteRefused("bad_scenario", "scenario")
    note = await run_in_threadpool(_with_conn, store.insert_note, draft)
    return JSONResponse(note, status_code=201)


@_guarded
async def add_category(request: Request) -> Response:
    raw = await _json_body(request, CATEGORY_CAP)
    if type(raw) is not dict or set(raw) != {"name"}:
        raise NoteRefused("bad_request", "")
    name = check_category_name(raw["name"], "name")
    added = await run_in_threadpool(_with_conn, store.add_category, name)
    return JSONResponse({"name": added}, status_code=201)


@_guarded
async def export_notes(request: Request) -> Response:
    scenario = _query_scenario(request)
    return JSONResponse(await run_in_threadpool(_with_conn, store.export_file, scenario))


@_guarded
async def import_notes(request: Request) -> Response:
    raw = await _json_body(request, IMPORT_CAP)
    result = await run_in_threadpool(_with_conn, store.import_file, raw, sorted(_scenario_ids()))
    return JSONResponse(result)


@_guarded
async def update_note(request: Request) -> Response:
    fields = check_note_fields(await _json_body(request, NOTE_CAP))
    note = await run_in_threadpool(
        _with_conn, store.update_note, request.path_params["note_id"], fields
    )
    return JSONResponse(note)


@_guarded
async def delete_note(request: Request) -> Response:
    _require_client(request)
    await run_in_threadpool(_with_conn, store.delete_note, request.path_params["note_id"])
    return Response(status_code=204)


def _registered(scenario: str) -> None:
    """A write names a scenario the registry has, checked before the store (as create_note does)."""
    if scenario not in _scenario_ids():
        raise NoteRefused("bad_scenario", "scenario")


@_guarded
async def list_marks(request: Request) -> Response:
    scenario = _query_scenario(request)
    return JSONResponse(await run_in_threadpool(_with_conn, store.list_marks, scenario))


@_guarded
async def put_node(request: Request) -> Response:
    node, if_unsettled = check_node_put(await _json_body(request, NODE_CAP))
    _registered(node["scenario"])
    stored = await run_in_threadpool(_with_conn, store.put_node, node, if_unsettled)
    return JSONResponse(stored)


@_guarded
async def add_fail_category(request: Request) -> Response:
    raw = await _json_body(request, CATEGORY_CAP)
    # The list is shared by every story: the body names no scenario, so there is no registry check.
    if type(raw) is not dict or set(raw) != {"name"}:
        raise NoteRefused("bad_request", "")
    name = check_category_name(raw["name"], "name")
    added = await run_in_threadpool(_with_conn, store.add_fail_category, name)
    return JSONResponse({"name": added}, status_code=201)


@_guarded
async def create_path(request: Request) -> Response:
    path_draft = check_path_draft(await _json_body(request, PATH_CAP))
    _registered(path_draft["scenario"])
    path = await run_in_threadpool(_with_conn, store.create_path, path_draft)
    return JSONResponse(path, status_code=201)


@_guarded
async def update_path(request: Request) -> Response:
    fields = check_path_fields(await _json_body(request, PATH_CAP))
    path = await run_in_threadpool(
        _with_conn, store.update_path, request.path_params["path_id"], fields
    )
    return JSONResponse(path)


@_guarded
async def delete_path(request: Request) -> Response:
    _require_client(request)
    await run_in_threadpool(_with_conn, store.delete_path, request.path_params["path_id"])
    return Response(status_code=204)


# The fixed paths come before the id path, so that `categories`, `export`, `import` and `marks`
# stay names.
router.add_api_route(PREFIX, list_notes, methods=["GET"])
router.add_api_route(PREFIX, create_note, methods=["POST"], status_code=201)
router.add_api_route(PREFIX + "/categories", add_category, methods=["POST"], status_code=201)
router.add_api_route(PREFIX + "/export", export_notes, methods=["GET"])
router.add_api_route(PREFIX + "/import", import_notes, methods=["POST"])
router.add_api_route(PREFIX + "/marks", list_marks, methods=["GET"])
router.add_api_route(PREFIX + "/marks/node", put_node, methods=["PUT"])
router.add_api_route(
    PREFIX + "/marks/fail-categories", add_fail_category, methods=["POST"], status_code=201
)
router.add_api_route(PREFIX + "/marks/paths", create_path, methods=["POST"], status_code=201)
router.add_api_route(PREFIX + "/marks/paths/{path_id}", update_path, methods=["PUT"])
router.add_api_route(
    PREFIX + "/marks/paths/{path_id}", delete_path, methods=["DELETE"], status_code=204
)
router.add_api_route(PREFIX + "/{note_id}", update_note, methods=["PUT"])
router.add_api_route(PREFIX + "/{note_id}", delete_note, methods=["DELETE"], status_code=204)


# ---------------------------------------------------------------------------- the second walls


def _is_notes_path(path: str) -> bool:
    return path == PREFIX or path.startswith(PREFIX + "/")


async def validation_handler(request: Request, exc: Exception) -> Response:
    """A second wall: no notes route takes a typed parameter, so none should raise this. If one
    ever does, the framework's reply would echo the input, so the notes paths answer a fixed
    reply. Every other path keeps the framework's own handler."""
    if _is_notes_path(request.scope["path"]):
        return _reply(NoteRefused("bad_request", ""))
    if not isinstance(exc, RequestValidationError):
        raise exc
    return await request_validation_exception_handler(request, exc)


class NotesLogGuard:
    """Pure ASGI. Rewrites `scope["path"]`, `scope["raw_path"]` and `scope["query_string"]` IN
    PLACE when the guard refuses what a notes request holds, so the access line uvicorn writes
    from the same dict never holds a card number. The request then meets a fixed placeholder: a
    refused id names no note (404), and a refused scenario is a missing one (400)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http" and _is_notes_path(scope.get("path", "")):
            if refuses_text(scope["path"]):
                scope["path"] = REDACTED_PATH
                scope["raw_path"] = REDACTED_PATH.encode("ascii")
            query = scope.get("query_string") or b""
            if query and refuses_text(urllib.parse.unquote_plus(query.decode("utf-8", "replace"))):
                scope["query_string"] = REDACTED_QUERY.encode("ascii")
        await self.app(scope, receive, send)


def register(app: FastAPI) -> None:
    """The one entry point main.py calls: the router, the handler, the log guard."""
    app.include_router(router)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_middleware(NotesLogGuard)
