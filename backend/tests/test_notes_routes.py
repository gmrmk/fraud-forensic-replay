"""The notes routes: every route and every error code, the size caps, the headers, the checked
reads, and the wiring into main.py.

The no-echo tests live in test_notes_no_echo.py.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from typing import Any

import pytest
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from starlette.requests import Request

import main
import notes_routes
import notes_store as ns
import scenario_registry as sr
from notes_schema import NoteRefused, check_file
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
    notes_client,
    rich_body,
)

SCENARIOS = [s["id"] for s in sr.list_scenarios()]
A = "card-fraud"
B = next(s for s in SCENARIOS if s != A)
H = {"X-FFR-Client": "notes", "Content-Type": "application/json"}

# The real notes file as it stood when this module was collected. A person who has used notes in the
# dev stack has one, so the suite's promise is that it leaves the file as it found it, not that the
# file does not exist.
_REAL_NOTES = ROOT / "data" / "notes.sqlite3"


def _real_notes_state() -> tuple[int, int] | None:
    if not _REAL_NOTES.exists():
        return None
    stat = _REAL_NOTES.stat()
    return (stat.st_size, stat.st_mtime_ns)


_REAL_NOTES_AT_COLLECTION = _real_notes_state()
NOTE_KEYS = {"id", "scenario", "time", "seq", "link", "colour", "category", "decision", "body"}
# The import answer holds six counts; a file with no marks adds and replaces none.
NO_MARKS = {"nodesAdded": 0, "nodesReplaced": 0, "pathsAdded": 0, "pathsReplaced": 0}


@pytest.fixture
def client() -> TestClient:
    return notes_client(main.app)


def send(
    client: TestClient, method: str, url: str, payload: Any = None, headers: dict | None = None
):
    content = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
    return client.request(
        method,
        url,
        content=None if payload is None else content,
        headers=H if headers is None else headers,
    )


def err(r, status: int, code: str, where: str | None = None) -> None:
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"detail"}
    assert set(body["detail"]) == {"code", "where", "message"}
    assert body["detail"]["code"] == code
    assert body["detail"]["message"] == notes_routes.MESSAGES[code]
    if where is not None:
        assert body["detail"]["where"] == where


def make(client: TestClient, scenario: str = A, **over: Any) -> dict[str, Any]:
    r = send(client, "POST", "/api/notes", draft(scenario, **over))
    assert r.status_code == 201, r.text
    return r.json()


class TestWiring:
    def test_the_routes_are_on_the_app(self) -> None:
        paths = {getattr(r, "path", None) for r in main.app.routes}
        for p in (
            "/api/notes",
            "/api/notes/{note_id}",
            "/api/notes/categories",
            "/api/notes/export",
            "/api/notes/import",
        ):
            assert p in paths

    def test_main_has_the_one_edit(self) -> None:
        src = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
        assert src.count("notes_routes") == 2  # the import and the register call

    def test_the_security_headers_reach_a_notes_reply(self, client: TestClient) -> None:
        r = client.get("/api/notes", params={"scenario": A})
        assert r.headers["x-content-type-options"] == "nosniff"

    def test_gitignore_knows_the_notes_file(self) -> None:
        # In every tree the root .gitignore names the notes file: in the repository it is the
        # repository's own list, in the public copy it is the exhibit's list exported under that
        # name (the next test keeps the two in step). Only the git call needs a git checkout.
        lines = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        assert "data/notes.sqlite3" in lines
        if not (ROOT / ".git").exists():
            pytest.skip(
                "the notes file is named in .gitignore here; the tree is not a git checkout, "
                "so git check-ignore is not asked"
            )
        done = subprocess.run(
            ["git", "check-ignore", "-q", "data/notes.sqlite3"], cwd=ROOT, check=False
        )
        assert done.returncode == 0

    def test_the_exhibit_gitignore_names_every_notes_line_of_the_repository(self) -> None:
        # scripts/export-public.mjs exports exhibit/gitignore as the public copy's .gitignore, so
        # a line the repository ignores for the notes file must be a line of the exhibit's list too.
        exhibit = ROOT / "exhibit" / "gitignore"
        if not exhibit.exists():
            pytest.skip("this tree is the public copy: it has no exhibit folder")
        repo_lines = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        notes_lines = [ln for ln in repo_lines if ln.startswith("data/notes.sqlite3")]
        assert notes_lines  # the repository names the file and its companions
        exhibit_lines = exhibit.read_text(encoding="utf-8").splitlines()
        for line in notes_lines:
            assert line in exhibit_lines

    def test_the_static_export_never_reads_the_notes(self) -> None:
        src = (ROOT / "backend" / "export_static.py").read_text(encoding="utf-8").lower()
        assert "notes" not in src

    def test_the_suite_leaves_the_notes_file_in_data_as_it_found_it(self) -> None:
        assert _real_notes_state() == _REAL_NOTES_AT_COLLECTION

    def test_the_notes_never_change_the_active_scenario(self, client: TestClient) -> None:
        before = sr.get_active().id
        make(client, B)
        client.get("/api/notes", params={"scenario": B})
        assert sr.get_active().id == before

    def test_another_route_keeps_the_default_validation_reply(self, client: TestClient) -> None:
        r = client.post("/api/clock", json={"t": "not a number"})
        assert r.status_code == 422
        assert isinstance(r.json()["detail"], list)  # the framework's own shape, not ours


class TestHandlers:
    def request(self, path: str) -> Request:
        return Request(
            {"type": "http", "method": "POST", "path": path, "headers": [], "query_string": b""}
        )

    def test_the_validation_handler_on_a_notes_path_holds_no_input(self) -> None:
        exc = RequestValidationError(
            [{"type": "x", "loc": ("body",), "msg": "bad", "input": "SECRET-1"}]
        )
        r = asyncio.run(notes_routes.validation_handler(self.request("/api/notes/x"), exc))
        assert r.status_code == 422
        assert "SECRET-1" not in bytes(r.body).decode()
        assert json.loads(bytes(r.body)) == {
            "detail": {
                "code": "bad_request",
                "where": "",
                "message": notes_routes.MESSAGES["bad_request"],
            }
        }

    def test_the_validation_handler_hands_every_other_path_to_the_framework(self) -> None:
        exc = RequestValidationError(
            [{"type": "x", "loc": ("body",), "msg": "bad", "input": "SECRET-1"}]
        )
        r = asyncio.run(notes_routes.validation_handler(self.request("/api/clock"), exc))
        assert r.status_code == 422 and "SECRET-1" in bytes(r.body).decode()

    def test_a_path_that_only_starts_like_the_notes_prefix_is_not_ours(self) -> None:
        exc = RequestValidationError(
            [{"type": "x", "loc": ("body",), "msg": "bad", "input": "SECRET-1"}]
        )
        r = asyncio.run(notes_routes.validation_handler(self.request("/api/notesx"), exc))
        assert "SECRET-1" in bytes(r.body).decode()


class TestList:
    @pytest.mark.parametrize(
        "query",
        [
            "",
            "?scenario=",
            "?scenario=nope",
            "?scenario=a%20b",
            "?scenario=card-fraud%0A",
            "?other=x",
        ],
    )
    def test_a_bad_scenario_is_400(self, client: TestClient, query: str) -> None:
        err(client.get("/api/notes" + query), 400, "bad_scenario")

    def test_an_empty_scenario(self, client: TestClient) -> None:
        r = client.get("/api/notes", params={"scenario": A})
        assert r.status_code == 200
        assert r.json() == {"notes": [], "categories": [], "skipped": 0}

    def test_notes_come_in_time_then_seq_order_and_per_scenario(self, client: TestClient) -> None:
        make(client, A, time=30)
        make(client, A, time=10)
        make(client, A, time=10)
        make(client, B, time=1)
        body = client.get("/api/notes", params={"scenario": A}).json()
        assert [(n["time"], n["seq"]) for n in body["notes"]] == [(10, 2), (10, 3), (30, 1)]
        assert all(set(n) == NOTE_KEYS for n in body["notes"])
        assert len(client.get("/api/notes", params={"scenario": B}).json()["notes"]) == 1

    def test_a_bad_row_written_by_hand_is_skipped_and_counted(self, client: TestClient) -> None:
        good = make(client)
        c = ns.connect()
        try:
            c.execute(
                "INSERT INTO notes(id, scenario, seq, time_ms, colour, category, decision, body)"
                " VALUES ('note-" + "c" * 32 + "', 'card-fraud', 9, 1, 'r1', 'Note', 'none',"
                ' \'{"v":1,"content":[{"type":"script"}]}\')'
            )
            c.execute("INSERT INTO note_categories(name) VALUES (?)", ("c" * 200,))
        finally:
            c.close()
        body = client.get("/api/notes", params={"scenario": A}).json()
        assert [n["id"] for n in body["notes"]] == [good["id"]]
        assert body["categories"] == [] and body["skipped"] == 2
        exported = client.get("/api/notes/export", params={"scenario": A}).json()
        assert [n["id"] for n in exported["notes"]] == [good["id"]]
        assert exported["categories"] == []


class TestCreate:
    def test_a_note_is_201_with_exactly_the_nine_keys(self, client: TestClient) -> None:
        r = send(
            client,
            "POST",
            "/api/notes",
            draft(body=rich_body(), link={"kind": "auth", "id": "tx-1"}),
        )
        assert r.status_code == 201
        n = r.json()
        assert set(n) == NOTE_KEYS and n["seq"] == 1 and n["id"].startswith("note-")
        assert n["body"] == rich_body() and n["scenario"] == A

    def test_two_inserts_give_two_sequence_numbers(self, client: TestClient) -> None:
        assert [make(client)["seq"], make(client)["seq"]] == [1, 2]

    def test_the_client_cannot_choose_an_id_or_a_seq(self, client: TestClient) -> None:
        err(send(client, "POST", "/api/notes", {**draft(), "id": GOOD_ID}), 422, "bad_request", "")
        err(send(client, "POST", "/api/notes", {**draft(), "seq": 9}), 422, "bad_request", "")

    @pytest.mark.parametrize(
        "payload,code,where",
        [
            (draft(body=hello(VISA)), "card_number", "body"),
            (draft(category=VISA), "card_number", "category"),
            (draft(link={"kind": "a", "id": "tx-" + VISA}), "card_number", "link.id"),
            (draft(link={"kind": "k" + VISA, "id": "x"}), "card_number", "link.kind"),
            (draft(A.replace("card-fraud", "4111-1111-1111-1111")), "card_number", "scenario"),
            (
                draft(body={"v": 1, "content": [{"type": "script"}]}),
                "body_schema",
                "body.content[0]",
            ),
            (draft(body=hello("a" * 4001)), "too_long", "body.content[0].content[0].text"),
            (draft(colour="alarm"), "bad_request", "colour"),
            (draft(decision="PASS"), "bad_request", "decision"),
            (draft(time=-1), "bad_request", "time"),
            ({k: v for k, v in draft().items() if k != "body"}, "bad_request", ""),
            ({**draft(), "x": 1}, "bad_request", ""),
            ([], "bad_request", ""),
            (draft("not-a-scenario"), "bad_scenario", "scenario"),
        ],
    )
    def test_422(self, client: TestClient, payload: Any, code: str, where: str) -> None:
        err(send(client, "POST", "/api/notes", payload), 422, code, where)
        assert client.get("/api/notes", params={"scenario": A}).json()["notes"] == []

    def test_the_limit_is_409(self, client: TestClient) -> None:
        c = ns.connect()
        try:
            c.execute("BEGIN")
            for i in range(1000):
                c.execute(
                    "INSERT INTO notes(id, scenario, seq, time_ms, colour, category,"
                    " decision, body) VALUES (?, ?, ?, 1, 'r1', 'Note', 'none', ?)",
                    (f"note-{i:032x}", A, i + 1, json.dumps(hello())),
                )
            c.execute("COMMIT")
        finally:
            c.close()
        err(send(client, "POST", "/api/notes", draft()), 409, "limit_reached")

    def test_a_write_needs_the_client_header(self, client: TestClient) -> None:
        r = send(client, "POST", "/api/notes", draft(), {"Content-Type": "application/json"})
        err(r, 403, "bad_request", "")
        r = send(client, "POST", "/api/notes", draft(), {**H, "X-FFR-Client": "other"})
        err(r, 403, "bad_request")

    @pytest.mark.parametrize(
        "ctype", ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]
    )
    def test_a_write_needs_the_json_content_type(self, client: TestClient, ctype: str) -> None:
        err(
            send(client, "POST", "/api/notes", draft(), {**H, "Content-Type": ctype}),
            415,
            "bad_request",
        )

    def test_the_content_type_may_carry_a_charset(self, client: TestClient) -> None:
        r = send(
            client,
            "POST",
            "/api/notes",
            draft(),
            {**H, "Content-Type": "application/json; charset=utf-8"},
        )
        assert r.status_code == 201

    @pytest.mark.parametrize(
        "raw",
        [
            b"{not json",
            b"",
            b'{"scenario": NaN}',
            b'{"time": Infinity}',
            b"[" * 5000,
            b"\xff\xfe\x00",
            b'{"a": "\\ud800"',
        ],
    )
    def test_bad_json_is_400(self, client: TestClient, raw: bytes) -> None:
        err(send(client, "POST", "/api/notes", raw), 400, "bad_json", "")

    def test_a_lone_surrogate_escape_is_refused_not_a_500(self, client: TestClient) -> None:
        raw = json.dumps(draft()).replace('"hello"', '"a\\ud800"').encode("ascii")
        err(send(client, "POST", "/api/notes", raw), 422, "body_schema")

    def test_get_needs_no_header(self, client: TestClient) -> None:
        assert client.get("/api/notes", params={"scenario": A}, headers={}).status_code == 200


class TestSizeCaps:
    def test_a_declared_length_over_the_cap_is_413(self, client: TestClient) -> None:
        err(
            send(client, "POST", "/api/notes", b"x" * (notes_routes.NOTE_CAP + 1)),
            413,
            "too_large",
            "",
        )

    def test_a_chunked_body_over_the_cap_is_413(self, client: TestClient) -> None:
        def chunks():
            for _ in range(notes_routes.NOTE_CAP // 1024 + 8):
                yield b"x" * 1024

        r = client.post("/api/notes", content=chunks(), headers=H)
        err(r, 413, "too_large", "")

    def test_the_cap_holds_for_the_other_writes_too(self, client: TestClient) -> None:
        n = make(client)
        big = b"x" * (notes_routes.NOTE_CAP + 1)
        err(send(client, "PUT", f"/api/notes/{n['id']}", big), 413, "too_large")
        err(
            send(client, "POST", "/api/notes/categories", b"x" * (notes_routes.CATEGORY_CAP + 1)),
            413,
            "too_large",
        )
        err(
            send(client, "POST", "/api/notes/import", b"x" * (notes_routes.IMPORT_CAP + 1)),
            413,
            "too_large",
        )

    def test_the_read_stops_at_the_cap_and_does_not_read_on(self) -> None:
        calls = {"n": 0}

        async def receive() -> dict[str, Any]:
            calls["n"] += 1
            return {"type": "http.request", "body": b"x" * 1024, "more_body": True}

        req = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)
        with pytest.raises(NoteRefused) as info:
            asyncio.run(notes_routes.read_body(req, 4096))
        assert info.value.code == "too_large"
        assert calls["n"] <= 6

    def test_a_note_at_the_largest_size_the_schema_allows_fits_the_cap(
        self, client: TestClient
    ) -> None:
        marks = ("bold", "italic", "underline", "strike")
        from tests.test_notes_fixtures import para, text

        # 560 marked nodes: 63 KB of compact JSON in the body, just under the schema's 64 KB.
        body = doc(para(*[text("a" * 4, *marks) for _ in range(560)]))
        raw = json.dumps(draft(body=body), separators=(",", ":")).encode("utf-8")
        assert 63_000 < len(raw) < notes_routes.NOTE_CAP
        assert send(client, "POST", "/api/notes", raw).status_code == 201


class TestUpdateDelete:
    def test_put_replaces_the_five_fields(self, client: TestClient) -> None:
        n = make(client, time=42)
        r = send(
            client,
            "PUT",
            f"/api/notes/{n['id']}",
            fields(colour="r4", decision="pass", body=hello("new")),
        )
        assert r.status_code == 200
        out = r.json()
        assert set(out) == NOTE_KEYS
        assert (out["id"], out["seq"], out["time"], out["scenario"]) == (n["id"], 1, 42, A)
        assert (out["colour"], out["decision"], out["body"]) == ("r4", "pass", hello("new"))
        assert client.get("/api/notes", params={"scenario": A}).json()["notes"] == [out]

    def test_put_takes_exactly_the_five_keys(self, client: TestClient) -> None:
        n = make(client)
        url = f"/api/notes/{n['id']}"
        err(send(client, "PUT", url, {**fields(), "time": 5}), 422, "bad_request", "")
        err(send(client, "PUT", url, {**fields(), "scenario": B}), 422, "bad_request", "")
        err(send(client, "PUT", url, draft()), 422, "bad_request")

    def test_put_refusals(self, client: TestClient) -> None:
        n = make(client)
        url = f"/api/notes/{n['id']}"
        err(send(client, "PUT", url, fields(body=hello(VISA))), 422, "card_number", "body")
        err(send(client, "PUT", url, fields(category=VISA)), 422, "card_number", "category")
        assert (
            client.get("/api/notes", params={"scenario": A}).json()["notes"][0]["category"]
            == "Note"
        )

    @pytest.mark.parametrize(
        "note_id", [GOOD_ID, "nope", "note-" + "A" * 32, VISA_ID, "note-" + "a" * 31]
    )
    def test_unknown_or_malformed_ids_are_404(self, client: TestClient, note_id: str) -> None:
        err(send(client, "PUT", f"/api/notes/{note_id}", fields()), 404, "not_found", "")
        err(send(client, "DELETE", f"/api/notes/{note_id}", None), 404, "not_found", "")

    def test_delete_is_204_with_no_body_then_404(self, client: TestClient) -> None:
        n = make(client)
        r = send(client, "DELETE", f"/api/notes/{n['id']}")
        assert r.status_code == 204 and r.content == b""
        err(send(client, "DELETE", f"/api/notes/{n['id']}"), 404, "not_found")
        assert client.get("/api/notes", params={"scenario": A}).json()["notes"] == []

    def test_delete_needs_the_client_header(self, client: TestClient) -> None:
        n = make(client)
        err(client.delete(f"/api/notes/{n['id']}"), 403, "bad_request")
        assert len(client.get("/api/notes", params={"scenario": A}).json()["notes"]) == 1

    def test_the_words_categories_export_and_import_are_not_ids(self, client: TestClient) -> None:
        err(send(client, "PUT", "/api/notes/categories", fields()), 404, "not_found")
        err(send(client, "DELETE", "/api/notes/export"), 404, "not_found")


class TestCategories:
    def test_add_is_201_and_shows_in_the_list(self, client: TestClient) -> None:
        r = send(client, "POST", "/api/notes/categories", {"name": "Triage"})
        assert r.status_code == 201 and r.json() == {"name": "Triage"}
        assert client.get("/api/notes", params={"scenario": A}).json()["categories"] == ["Triage"]
        assert client.get("/api/notes", params={"scenario": B}).json()["categories"] == ["Triage"]

    @pytest.mark.parametrize("name", ["Note", "FOLLOW UP", "context"])
    def test_a_starter_name_is_409(self, client: TestClient, name: str) -> None:
        err(send(client, "POST", "/api/notes/categories", {"name": name}), 409, "category_exists")

    def test_a_repeat_ignoring_case_is_409(self, client: TestClient) -> None:
        send(client, "POST", "/api/notes/categories", {"name": "Triage"})
        err(
            send(client, "POST", "/api/notes/categories", {"name": "tRIAGE"}),
            409,
            "category_exists",
        )

    @pytest.mark.parametrize(
        "payload,code,where",
        [
            ({"name": VISA}, "card_number", "name"),
            ({"name": ""}, "bad_request", "name"),
            ({"name": " x"}, "bad_request", "name"),
            ({"name": "x" * 25}, "too_long", "name"),
            ({"name": 5}, "bad_request", "name"),
            ({}, "bad_request", ""),
            ({"name": "x", "extra": 1}, "bad_request", ""),
            ([], "bad_request", ""),
        ],
    )
    def test_422(self, client: TestClient, payload: Any, code: str, where: str) -> None:
        err(send(client, "POST", "/api/notes/categories", payload), 422, code, where)


class TestExportImport:
    def test_an_export_of_a_scenario_with_no_notes(self, client: TestClient) -> None:
        r = client.get("/api/notes/export", params={"scenario": A})
        assert r.status_code == 200
        assert r.json() == {
            "format": "ffr-notes",
            "version": 2,
            "scenario": A,
            "categories": [],
            "notes": [],
            "nodes": [],
            "paths": [],
            "failCategories": [],
        }

    def test_an_export_checks_as_a_file_and_has_no_skipped_key(self, client: TestClient) -> None:
        send(client, "POST", "/api/notes/categories", {"name": "Triage"})
        make(client, category="Triage", body=rich_body())
        out = client.get("/api/notes/export", params={"scenario": A}).json()
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
        assert check_file(out, SCENARIOS) == out

    @pytest.mark.parametrize("query", ["", "?scenario=nope", "?scenario=a%20b"])
    def test_bad_scenario_is_400(self, client: TestClient, query: str) -> None:
        err(client.get("/api/notes/export" + query), 400, "bad_scenario")

    def test_a_round_trip_into_an_empty_store(
        self, client: TestClient, tmp_path, monkeypatch
    ) -> None:
        send(client, "POST", "/api/notes/categories", {"name": "Triage"})
        a = make(client, time=5, category="Triage", body=rich_body())
        b = make(client, time=3, decision="fail")
        exported = client.get("/api/notes/export", params={"scenario": A}).json()
        monkeypatch.setenv("FFR_NOTES_DB", str(tmp_path / "second.sqlite3"))
        r = send(client, "POST", "/api/notes/import", exported)
        assert r.status_code == 200 and r.json() == {**NO_MARKS, "added": 2, "replaced": 0}
        listed = client.get("/api/notes", params={"scenario": A}).json()
        assert [n["id"] for n in listed["notes"]] == [b["id"], a["id"]]
        assert listed["categories"] == ["Triage"]
        r = send(client, "POST", "/api/notes/import", exported)
        assert r.json() == {**NO_MARKS, "added": 0, "replaced": 2}

    def test_an_import_for_another_scenario_the_registry_lacks_is_422(
        self, client: TestClient
    ) -> None:
        f = client.get("/api/notes/export", params={"scenario": A}).json()
        err(
            send(client, "POST", "/api/notes/import", {**f, "scenario": "not-a-scenario"}),
            422,
            "bad_scenario",
            "scenario",
        )

    def test_an_import_with_a_card_number_loads_nothing(self, client: TestClient) -> None:
        good = make(client)
        f = client.get("/api/notes/export", params={"scenario": A}).json()
        extra = {**f["notes"][0], "id": "note-" + "b" * 32, "body": hello(VISA)}
        f["notes"].append(extra)
        err(send(client, "POST", "/api/notes/import", f), 422, "card_number", "notes[1].body")
        assert [
            n["id"] for n in client.get("/api/notes", params={"scenario": A}).json()["notes"]
        ] == [good["id"]]

    def test_an_import_with_a_bad_note_names_its_path(self, client: TestClient) -> None:
        make(client)
        f = client.get("/api/notes/export", params={"scenario": A}).json()
        f["notes"][0]["colour"] = "alarm"
        err(send(client, "POST", "/api/notes/import", f), 422, "bad_file", "notes[0].colour")
        err(send(client, "POST", "/api/notes/import", {"format": "x"}), 422, "bad_file")
        err(send(client, "POST", "/api/notes/import", []), 422, "bad_file")

    def test_more_than_500_notes_is_413(self, client: TestClient) -> None:
        make(client)
        f = client.get("/api/notes/export", params={"scenario": A}).json()
        f["notes"] = f["notes"] * 501
        err(send(client, "POST", "/api/notes/import", f), 413, "too_large", "notes")

    def test_an_id_held_by_another_scenario_is_422(self, client: TestClient) -> None:
        other = make(client, B)
        f = client.get("/api/notes/export", params={"scenario": A}).json()
        f["notes"] = [{k: v for k, v in other.items() if k != "scenario"}]
        err(send(client, "POST", "/api/notes/import", f), 422, "bad_file", "notes[0].id")

    def test_an_import_over_the_limit_is_409_and_applies_nothing(self, client: TestClient) -> None:
        c = ns.connect()
        try:
            c.execute("BEGIN")
            for i in range(999):
                c.execute(
                    "INSERT INTO notes(id, scenario, seq, time_ms, colour, category,"
                    " decision, body) VALUES (?, ?, ?, 1, 'r1', 'Note', 'none', ?)",
                    # letters after the first 4 hex digits: an id of 32 zero and decimal digits
                    # holds a 20 digit group that the card guard (rule 5) refuses
                    (f"note-{i:04x}" + "cdef" * 7, A, i + 1, json.dumps(hello())),
                )
            c.execute("COMMIT")
        finally:
            c.close()
        f = {"format": "ffr-notes", "version": 1, "scenario": A, "categories": [], "notes": []}
        base = {
            "time": 1,
            "link": None,
            "colour": "r1",
            "category": "Note",
            "decision": "none",
            "body": hello(),
        }
        f["notes"] = [
            {**base, "id": "note-" + "d" * 32, "seq": 1},
            {**base, "id": "note-" + "e" * 32, "seq": 2},
        ]
        err(send(client, "POST", "/api/notes/import", f), 409, "limit_reached")
        assert len(client.get("/api/notes", params={"scenario": A}).json()["notes"]) == 999


class TestUnexpectedErrors:
    def test_a_store_failure_is_a_fixed_500_without_the_exception_text(
        self, client: TestClient, monkeypatch
    ) -> None:
        def boom(*a: Any, **k: Any) -> Any:
            raise RuntimeError("SECRET-MARKER-9 " + VISA)

        monkeypatch.setattr(ns, "list_notes", boom)
        r = client.get("/api/notes", params={"scenario": A})
        err(r, 500, "backing_failed", "")
        assert "SECRET-MARKER-9" not in r.text and VISA not in r.text

    def test_a_database_error_is_the_same_fixed_500(self, client: TestClient, monkeypatch) -> None:
        import sqlite3

        def boom(*a: Any, **k: Any) -> Any:
            raise sqlite3.OperationalError("SECRET-MARKER-9 " + VISA)

        monkeypatch.setattr(ns, "insert_note", boom)
        r = send(client, "POST", "/api/notes", draft())
        err(r, 500, "backing_failed", "")
        assert "SECRET-MARKER-9" not in r.text
