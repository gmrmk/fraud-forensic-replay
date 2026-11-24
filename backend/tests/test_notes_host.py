"""The notes routes answer only a request that names this machine (DNS rebinding).

A page served under another name and then re-pointed at 127.0.0.1 is same-origin with the backend
under that name, so it can set the custom client header. The routes therefore also ask for a Host
header whose host part is localhost, 127.0.0.1 or [::1] (or a name in FFR_NOTES_HOSTS), and, when an
Origin header is present, an origin whose host part is in the same set. A refusal is the same fixed
403 as a missing client header. Every case below is driven through every notes route and method.

Only the refusal cases fail on the code without the rule: a request that passes is also accepted by
code that never looked at the host. The pass cases pin what the rule must not break.
"""

from __future__ import annotations

import itertools
import json
import logging
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

import main
import notes_routes
import notes_store as ns
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    GOOD_ID,
    GOOD_PATH_ID,
    _isolated_notes_db,
    draft,
    fields,
    node_doc,
    notes_client,
    path_draft,
)

A = "card-fraud"
JSON = {"Content-Type": "application/json"}
IMPORT_FILE = {"format": "ffr-notes", "version": 1, "scenario": A, "categories": [], "notes": []}

# (name, method, url, payload): every notes route and method, each with a request that is valid
# whatever the host rule says, so that a 403 can only come from the host rule or the client header.
ROUTES: list[tuple[str, str, str, Any]] = [
    ("list", "GET", f"/api/notes?scenario={A}", None),
    ("create", "POST", "/api/notes", draft(A)),
    ("add category", "POST", "/api/notes/categories", {"name": "Host check"}),
    ("export", "GET", f"/api/notes/export?scenario={A}", None),
    ("import", "POST", "/api/notes/import", IMPORT_FILE),
    ("update", "PUT", f"/api/notes/{GOOD_ID}", fields()),
    ("delete", "DELETE", f"/api/notes/{GOOD_ID}", None),
    # The marks routes, appended after the last row: ROUTES[1] must stay the create row.
    ("marks list", "GET", f"/api/notes/marks?scenario={A}", None),
    ("marks put node", "PUT", "/api/notes/marks/node", {**node_doc(), "ifUnsettled": False}),
    ("marks add fail category", "POST", "/api/notes/marks/fail-categories", {"name": "Host check"}),
    ("marks create path", "POST", "/api/notes/marks/paths", path_draft()),
    # A good host answers 404 here (no such path), never 403.
    (
        "marks update path",
        "PUT",
        f"/api/notes/marks/paths/{GOOD_PATH_ID}",
        {"name": "Host check", "stops": path_draft()["stops"]},
    ),
    ("marks delete path", "DELETE", f"/api/notes/marks/paths/{GOOD_PATH_ID}", None),
]
ROUTE_IDS = [r[0] for r in ROUTES]

BAD_HOSTS = [
    "evil.example",
    "evil.example:8000",
    "localhost.evil.example",
    "127.0.0.1.evil.example",
    "evil.example.localhost.attacker.test",
    "",
    "testserver",
    "127.0.0.2",
    "127.000.000.001",
    "0.0.0.0",
    "[::2]",
    "[127.0.0.1]",
    "::1",
    "[::1",
    "[::1]x",
    "[::1]:abc",
    "[::1]:",
    "localhost:",
    "localhost:abc",
    "localhost:8000:9",
    "localhost:80@evil.example",
    "localhost..",
    "localhost evil",
    "localhost,evil.example",
]
GOOD_HOSTS = [
    "localhost",
    "localhost:8000",
    "LOCALHOST:5173",
    "localhost.",
    "localhost.:8000",
    "127.0.0.1",
    "127.0.0.1:8000",
    "[::1]",
    "[::1]:8000",
]
BAD_ORIGINS = [
    "http://evil.example",
    "https://evil.example:5173",
    "null",
    "",
    "http://localhost.evil.example",
    "http://127.0.0.1.evil.example:5173",
    "http://localhost@evil.example",
    "http://evil.example@localhost",
    "http://localhost/",
    "http://localhost:5173/path",
    "ftp://localhost",
    "localhost:5173",
    "//localhost",
    "http://",
    "http://localhost:abc",
    "http://[::1",
]
GOOD_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
    "https://localhost",
    "http://LOCALHOST:5173",
    "http://localhost.:5173",
]


@pytest.fixture(autouse=True)
def _fixed_ids(monkeypatch):
    """The create rows mint a note id or a path id on every good call: feed them uuid.UUID(int=i)
    from 1 (a fresh count for each test), never a live random draw."""
    counter = itertools.count(1)
    monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(int=next(counter)))


@pytest.fixture
def client() -> TestClient:
    return notes_client(main.app)


def call(
    client: TestClient,
    route: tuple[str, str, str, Any],
    host: str | None = None,
    origin: str | None = None,
    extra: dict[str, str] | None = None,
):
    """One request with the client header and a valid body; Host and Origin only if given."""
    _, method, url, payload = route
    headers = {"X-FFR-Client": "notes", **JSON}
    if host is not None:
        headers["Host"] = host
    if origin is not None:
        headers["Origin"] = origin
    headers.update(extra or {})
    content = None if payload is None else json.dumps(payload).encode("utf-8")
    return client.request(method, url, content=content, headers=headers)


@pytest.fixture
def refusal(client: TestClient) -> bytes:
    """The body of the missing client header's refusal, from a loopback host."""
    r = client.post("/api/notes", content=json.dumps(draft(A)).encode("utf-8"), headers=JSON)
    assert r.status_code == 403
    assert r.json() == {
        "detail": {
            "code": "bad_request",
            "where": "",
            "message": notes_routes.MESSAGES["bad_request"],
        }
    }
    return r.content


def assert_refused(r, refusal: bytes) -> None:
    assert r.status_code == 403, r.status_code
    assert r.content == refusal


class Spy:
    """An ASGI wrapper that keeps the Host header values the app was given."""

    def __init__(self, app: Any) -> None:
        self.app = app
        self.hosts: list[bytes] = []

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] == "http":
            self.hosts += [v for k, v in scope["headers"] if k == b"host"]
        await self.app(scope, receive, send)


@pytest.mark.parametrize("route", ROUTES, ids=ROUTE_IDS)
class TestHost:
    @pytest.mark.parametrize("host", BAD_HOSTS)
    def test_a_host_that_does_not_name_this_machine_is_refused(
        self, client: TestClient, refusal: bytes, route: Any, host: str
    ) -> None:
        assert_refused(call(client, route, host=host), refusal)

    @pytest.mark.parametrize("host", GOOD_HOSTS)
    def test_a_host_that_names_this_machine_passes(
        self, client: TestClient, route: Any, host: str
    ) -> None:
        assert call(client, route, host=host).status_code != 403

    @pytest.mark.parametrize("origin", BAD_ORIGINS)
    def test_a_foreign_origin_is_refused_whatever_the_host(
        self, client: TestClient, refusal: bytes, route: Any, origin: str
    ) -> None:
        assert_refused(call(client, route, host="localhost:8000", origin=origin), refusal)

    @pytest.mark.parametrize("origin", GOOD_ORIGINS)
    def test_a_loopback_origin_passes(self, client: TestClient, route: Any, origin: str) -> None:
        assert call(client, route, host="127.0.0.1:8000", origin=origin).status_code != 403

    # The dev server's proxy forwards the page's own Host, so these reach the backend as sent.
    @pytest.mark.parametrize("own", ["localhost:5173", "127.0.0.1:5173", "[::1]:5173"])
    def test_the_dev_servers_own_host_and_origin_pass(
        self, client: TestClient, route: Any, own: str
    ) -> None:
        assert call(client, route, host=own, origin=f"http://{own}").status_code != 403
        assert call(client, route, host=own).status_code != 403

    def test_no_origin_passes(self, client: TestClient, route: Any) -> None:
        assert call(client, route, host="localhost").status_code != 403

    def test_a_good_origin_does_not_save_a_bad_host(
        self, client: TestClient, refusal: bytes, route: Any
    ) -> None:
        r = call(client, route, host="evil.example", origin="http://localhost:5173")
        assert_refused(r, refusal)

    def test_forwarded_host_headers_are_never_read(
        self, client: TestClient, refusal: bytes, route: Any
    ) -> None:
        for extra in ({"X-Forwarded-Host": "localhost"}, {"Forwarded": "host=localhost"}):
            r = call(client, route, host="evil.example", origin="http://localhost", extra=extra)
            assert_refused(r, refusal)
            r = call(client, route, host="evil.example", extra=extra)
            assert_refused(r, refusal)
        for extra in ({"X-Forwarded-Host": "evil.example"}, {"Forwarded": "host=evil.example"}):
            assert call(client, route, host="localhost", extra=extra).status_code != 403


@pytest.mark.parametrize("route", ROUTES, ids=ROUTE_IDS)
class TestAllowList:
    """FFR_NOTES_HOSTS: comma separated host names, read at every call, empty by default."""

    def test_a_listed_name_passes_as_host_and_as_origin(
        self, client: TestClient, monkeypatch, route: Any
    ) -> None:
        monkeypatch.setenv("FFR_NOTES_HOSTS", "notes.example")
        for host in ("notes.example", "notes.example:8000", "NOTES.example."):
            assert call(client, route, host=host).status_code != 403
        r = call(client, route, host="localhost", origin="http://notes.example:5173")
        assert r.status_code != 403
        r = call(client, route, host="notes.example", origin="https://notes.example")
        assert r.status_code != 403

    def test_it_lets_through_that_name_and_nothing_else_new(
        self, client: TestClient, refusal: bytes, monkeypatch, route: Any
    ) -> None:
        monkeypatch.setenv("FFR_NOTES_HOSTS", "notes.example")
        for host in ("evil.example", "notes.example.evil.example", "evil.notes.example", "notes"):
            assert_refused(call(client, route, host=host), refusal)
        assert_refused(call(client, route, host="localhost", origin="http://evil.example"), refusal)
        assert_refused(
            call(client, route, host="notes.example", origin="http://evil.example"), refusal
        )
        assert call(client, route, host="localhost").status_code != 403

    def test_the_list_is_read_at_every_call(
        self, client: TestClient, refusal: bytes, monkeypatch, route: Any
    ) -> None:
        assert_refused(call(client, route, host="notes.example"), refusal)
        monkeypatch.setenv("FFR_NOTES_HOSTS", "notes.example")
        assert call(client, route, host="notes.example").status_code != 403
        monkeypatch.delenv("FFR_NOTES_HOSTS")
        assert_refused(call(client, route, host="notes.example"), refusal)

    @pytest.mark.parametrize("value", ["", ",", ", ,", "notes.example,", ",notes.example, ,"])
    def test_an_empty_entry_never_lets_an_empty_host_through(
        self, client: TestClient, refusal: bytes, monkeypatch, route: Any, value: str
    ) -> None:
        monkeypatch.setenv("FFR_NOTES_HOSTS", value)
        assert_refused(call(client, route, host=""), refusal)
        assert_refused(call(client, route, host="localhost", origin=""), refusal)

    def test_a_list_of_several_names_with_spaces_and_case(
        self, client: TestClient, monkeypatch, route: Any
    ) -> None:
        monkeypatch.setenv("FFR_NOTES_HOSTS", " Notes.Example. , other.test ,, [fd00::1]")
        for host in ("notes.example", "other.test:81", "[fd00::1]:5173"):
            assert call(client, route, host=host).status_code != 403


class TestTheRuleItself:
    def test_the_test_clients_default_name_is_refused(self, refusal: bytes) -> None:
        plain = TestClient(main.app)  # the default base URL names "testserver"
        r = plain.get(f"/api/notes?scenario={A}")
        assert_refused(r, refusal)

    def test_the_odd_spellings_reach_the_app_as_sent(self, refusal: bytes) -> None:
        spy = Spy(main.app)
        c = notes_client(spy)
        sent = ["LOCALHOST:5173", "localhost.", "", "[::1]:8000", "evil.example"]
        for host in sent:
            c.get(f"/api/notes?scenario={A}", headers={"Host": host})
        assert spy.hosts == [h.encode("ascii") for h in sent]

    def test_the_notes_tests_client_names_localhost(self) -> None:
        spy = Spy(main.app)
        notes_client(spy).get(f"/api/notes?scenario={A}")
        assert spy.hosts == [b"localhost"]

    def test_a_refusal_holds_no_host_or_origin_value(
        self, client: TestClient, caplog, route: Any = ROUTES[1]
    ) -> None:
        caplog.set_level(logging.DEBUG)
        r = call(client, route, host="marker-host.example", origin="http://marker-origin.example")
        assert r.status_code == 403
        seen = r.text + json.dumps(dict(r.headers)) + caplog.text
        assert "marker-host" not in seen and "marker-origin" not in seen

    def test_the_other_routes_of_the_app_are_not_touched(self) -> None:
        plain = TestClient(main.app)
        assert plain.get("/api/health").status_code == 200

    def test_no_host_header_and_two_host_headers_are_refused(self) -> None:
        def req(*pairs: tuple[str, str]) -> Request:
            scope = {
                "type": "http",
                "method": "GET",
                "path": "/api/notes",
                "query_string": b"",
                "headers": [(k.encode("ascii"), v.encode("ascii")) for k, v in pairs],
            }
            return Request(scope)

        notes_routes._require_local(req(("host", "localhost")))
        for pairs in (
            (),
            (("host", "localhost"), ("host", "localhost")),
            (("host", "localhost"), ("host", "evil.example")),
            (("host", "localhost"), ("origin", "http://localhost"), ("origin", "http://localhost")),
        ):
            with pytest.raises(notes_routes.HttpRefusal) as caught:
                notes_routes._require_local(req(*pairs))
            assert (caught.value.code, caught.value.where, caught.value.status) == (
                "bad_request",
                "",
                403,
            )
