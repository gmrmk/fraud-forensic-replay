"""The marks routes under /api/notes/marks, the export and import at version 2, and the two
reworded sentences (notes_routes.py).

Every route is wrapped by `_guarded` (host, client header, content type, size, no echo); the host
and no-echo tests drive these routes too (test_notes_host.py, test_notes_no_echo.py). Path ids come
from a fixed source (the uuid of PATH_UUID, or uuid.UUID(int=i) from 1), never a live draw.

What this file does not test: the checks and the store behind the routes (test_marks_schema.py,
test_marks_file.py, test_marks_store.py), the host rule on every route (test_notes_host.py) and the
no-echo rule on every place a card number can sit (test_notes_no_echo.py).
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import main
import notes_routes
import notes_store as ns
import scenario_registry as sr
from notes_schema import check_file
from tests.test_notes_fixtures import (  # noqa: F401  (the autouse fixture must be in scope)
    FILE_V2_WIRE,
    GOOD_PATH_ID,
    LIST_WIRE,
    NODE_WIRE,
    PATH_UUID,
    PATH_WIRE,
    PUT_BODY_WIRE,
    VISA,
    VISA_PATH_ID,
    _isolated_notes_db,
    draft,
    node_doc,
    notes_client,
    path_draft,
    wire_text,
)

SCENARIOS = [s["id"] for s in sr.list_scenarios()]
A = "card-fraud"
B = next(s for s in SCENARIOS if s != A)
H = {"X-FFR-Client": "notes", "Content-Type": "application/json"}
MARKS = "/api/notes/marks"
NODE = MARKS + "/node"
FAILS = MARKS + "/fail-categories"
PATHS = MARKS + "/paths"
STOPS = [{"kind": "auth", "id": "tx-0001"}, {"kind": "login", "id": "lg-0002"}]


@pytest.fixture
def client() -> TestClient:
    return notes_client(main.app)


@pytest.fixture
def ids(monkeypatch):
    """Path ids from a fixed source: uuid.UUID(int=1), then 2, ... (never a live draw)."""
    counter = iter(range(1, 200))
    monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(int=next(counter)))


def send(client: TestClient, method: str, url: str, payload: Any = None, headers=None):
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


def put_node(client: TestClient, node: dict[str, Any] | None = None, flag: bool = False):
    return send(client, "PUT", NODE, {**(node or node_doc()), "ifUnsettled": flag})


class TestWiring:
    def test_the_five_paths_are_on_the_app_and_come_before_the_note_id_path(self) -> None:
        paths = [getattr(r, "path", None) for r in main.app.routes]
        marks = ["/api/notes/marks", NODE, FAILS, PATHS, PATHS + "/{path_id}"]
        for p in marks:
            assert p in paths
        first_id_route = paths.index("/api/notes/{note_id}")
        assert all(paths.index(p) < first_id_route for p in marks)

    def test_the_methods_are_the_six_of_the_contract(self) -> None:
        seen = {
            (m, getattr(r, "path", None))
            for r in main.app.routes
            for m in (getattr(r, "methods", None) or ())
            if str(getattr(r, "path", "")).startswith(MARKS)
        }
        assert seen == {
            ("GET", MARKS),
            ("PUT", NODE),
            ("POST", FAILS),
            ("POST", PATHS),
            ("PUT", PATHS + "/{path_id}"),
            ("DELETE", PATHS + "/{path_id}"),
        }

    def test_the_notes_source_has_no_route_that_deletes_a_node_or_a_fail_category(self) -> None:
        src = Path(notes_routes.__file__).read_text(encoding="utf-8").lower()
        assert "delete_node" not in src and "delete_fail" not in src


class TestList:
    def test_an_empty_story(self, client: TestClient) -> None:
        r = client.get(MARKS, params={"scenario": A})
        assert r.status_code == 200
        assert r.json() == {"nodes": [], "paths": [], "failCategories": [], "skipped": 0}

    @pytest.mark.parametrize(
        "query", ["", "?scenario=nope", "?scenario=a%20b", f"?scenario={VISA}"]
    )
    def test_a_missing_unknown_or_refused_scenario_is_400(
        self, client: TestClient, query: str
    ) -> None:
        err(client.get(MARKS + query), 400, "bad_scenario", "scenario")

    def test_the_list_after_the_three_writes_is_the_wire_text(
        self, client: TestClient, monkeypatch
    ) -> None:
        monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(PATH_UUID))
        r = send(client, "PUT", NODE, PUT_BODY_WIRE)
        assert r.status_code == 200 and r.text == wire_text(NODE_WIRE)
        r = send(client, "POST", FAILS, {"name": "Shared key"})
        assert r.status_code == 201 and r.json() == {"name": "Shared key"}
        r = send(client, "POST", PATHS, path_draft())
        assert r.status_code == 201 and r.text == wire_text(PATH_WIRE)
        r = client.get(MARKS, params={"scenario": A})
        assert r.status_code == 200 and r.text == wire_text(LIST_WIRE)

    def test_another_story_is_not_listed(self, client: TestClient) -> None:
        put_node(client)
        assert client.get(MARKS, params={"scenario": B}).json()["nodes"] == []


class TestPutNode:
    def test_a_good_put_answers_the_stored_node(self, client: TestClient) -> None:
        r = put_node(client, node_doc(pinned=True, disposition="pass", settled=True))
        assert r.status_code == 200
        assert r.json() == node_doc(pinned=True, disposition="pass", settled=True)

    def test_a_fraud_record_is_answered_as_auth(self, client: TestClient) -> None:
        r = put_node(client, node_doc(record={"kind": "fraud", "id": "tx-9"}))
        assert r.json()["record"] == {"kind": "auth", "id": "tx-9"}

    def test_settled_never_goes_back_to_false(self, client: TestClient) -> None:
        put_node(client, node_doc(disposition="pass", settled=True))
        r = put_node(client, node_doc(pinned=True, settled=False))
        assert r.json()["settled"] is True and r.json()["disposition"] == "none"

    def test_if_unsettled_leaves_a_settled_row_and_fills_an_unsettled_one(
        self, client: TestClient
    ) -> None:
        put_node(client, node_doc(pinned=True))  # pinned only, unsettled
        r = put_node(client, node_doc(disposition="fail", category="Triage", settled=True), True)
        assert r.json() == node_doc(
            pinned=True, disposition="fail", category="Triage", settled=True
        )
        r = put_node(client, node_doc(disposition="pass", settled=True), True)
        assert r.json() == node_doc(
            pinned=True, disposition="fail", category="Triage", settled=True
        )

    def test_the_older_if_absent_key_is_refused(self, client: TestClient) -> None:
        body = {**node_doc(), "ifAbsent": False}
        err(send(client, "PUT", NODE, body), 422, "bad_request", "")
        no_flag = node_doc()
        err(send(client, "PUT", NODE, no_flag), 422, "bad_request", "")
        err(send(client, "PUT", NODE, {**node_doc(), "ifUnsettled": 0}), 422, "bad_request")

    def test_the_headers_and_the_size_and_the_json(self, client: TestClient) -> None:
        body = {**node_doc(), "ifUnsettled": False}
        err(
            send(client, "PUT", NODE, body, {"Content-Type": "application/json"}),
            403,
            "bad_request",
        )
        err(
            send(
                client, "PUT", NODE, body, {"X-FFR-Client": "notes", "Content-Type": "text/plain"}
            ),
            415,
            "bad_request",
        )
        big = {**node_doc(), "ifUnsettled": False, "category": "c" * 5000}
        err(send(client, "PUT", NODE, big), 413, "too_large")
        err(send(client, "PUT", NODE, b"{not json"), 400, "bad_json")

    def test_a_story_the_registry_lacks_is_422(self, client: TestClient) -> None:
        err(put_node(client, node_doc(scenario="not-a-scenario")), 422, "bad_scenario", "scenario")

    @pytest.mark.parametrize(
        ("over", "code", "where"),
        [
            ({"disposition": "pass", "category": "x"}, "bad_request", "category"),
            ({"disposition": "maybe"}, "bad_request", "disposition"),
            ({"pinned": 1}, "bad_request", "pinned"),
            ({"settled": "true"}, "bad_request", "settled"),
            ({"record": {"kind": "auth", "id": "tx-" + VISA}}, "card_number", "record.id"),
            ({"disposition": "fail", "category": "c" * 25}, "too_long", "category"),
            ({"record": None}, "bad_request", "record"),
        ],
    )
    def test_a_bad_node_is_422_with_its_path(
        self, client: TestClient, over: dict[str, Any], code: str, where: str
    ) -> None:
        err(put_node(client, node_doc(**over)), 422, code, where)

    def test_the_limit_is_409_and_a_held_record_still_updates(self, client: TestClient) -> None:
        c = ns.connect()
        try:
            c.execute("BEGIN")
            for i in range(1000):
                c.execute(
                    "INSERT INTO record_nodes(scenario, rec_kind, rec_id, pinned, disposition,"
                    " category, settled) VALUES (?, 'auth', ?, 0, 'none', NULL, 0)",
                    (A, f"tx-{i:04d}"),
                )
            c.execute("COMMIT")
        finally:
            c.close()
        err(put_node(client, node_doc(record={"kind": "auth", "id": "new"})), 409, "limit_reached")
        held = node_doc(record={"kind": "auth", "id": "tx-0007"}, pinned=True)
        assert put_node(client, held).json()["pinned"] is True

    def test_a_store_failure_is_the_fixed_500(self, client: TestClient, monkeypatch) -> None:
        def boom(*a: Any, **k: Any) -> Any:
            raise RuntimeError("SECRET-MARKER-9 " + VISA)

        monkeypatch.setattr(ns, "put_node", boom)
        r = put_node(client)
        err(r, 500, "backing_failed", "")
        assert "SECRET-MARKER-9" not in r.text and VISA not in r.text


class TestFailCategories:
    def test_a_good_post_is_201_with_the_name(self, client: TestClient) -> None:
        r = send(client, "POST", FAILS, {"name": "Triage"})
        assert r.status_code == 201 and r.json() == {"name": "Triage"}

    def test_the_same_name_ignoring_case_is_409_over_the_whole_list(
        self, client: TestClient
    ) -> None:
        send(client, "POST", FAILS, {"name": "Triage"})
        err(send(client, "POST", FAILS, {"name": "triage"}), 409, "category_exists")

    def test_the_hundred_and_first_is_409(self, client: TestClient) -> None:
        for i in range(100):
            assert send(client, "POST", FAILS, {"name": f"Name {i}"}).status_code == 201
        err(send(client, "POST", FAILS, {"name": "One more"}), 409, "limit_reached")

    def test_a_category_added_through_the_route_is_in_the_list_of_two_stories(
        self, client: TestClient
    ) -> None:
        assert send(client, "POST", FAILS, {"name": "Triage"}).status_code == 201
        for scenario in (A, B):
            listed = client.get(MARKS, params={"scenario": scenario}).json()
            assert listed["failCategories"] == ["Triage"]

    def test_an_export_of_either_story_carries_the_shared_list(self, client: TestClient) -> None:
        send(client, "POST", FAILS, {"name": "Triage"})
        for scenario in (A, B):
            exported = client.get("/api/notes/export", params={"scenario": scenario}).json()
            assert exported["failCategories"] == ["Triage"]

    def test_a_body_that_names_a_scenario_is_422_bad_request(self, client: TestClient) -> None:
        err(send(client, "POST", FAILS, {"scenario": A, "name": "Triage"}), 422, "bad_request", "")
        err(
            send(client, "POST", FAILS, {"scenario": "not-a-scenario", "name": "x"}),
            422,
            "bad_request",
        )
        assert client.get(MARKS, params={"scenario": A}).json()["failCategories"] == []

    @pytest.mark.parametrize(
        ("payload", "code", "where"),
        [
            ({"name": "x", "extra": 1}, "bad_request", ""),
            ({"scenario": A}, "bad_request", ""),
            ({}, "bad_request", ""),
            ([], "bad_request", ""),
            ({"name": ""}, "bad_request", "name"),
            ({"name": VISA}, "card_number", "name"),
            ({"name": "c" * 25}, "too_long", "name"),
        ],
    )
    def test_422(self, client: TestClient, payload: Any, code: str, where: str) -> None:
        err(send(client, "POST", FAILS, payload), 422, code, where)

    def test_the_size_cap_and_the_headers(self, client: TestClient) -> None:
        err(send(client, "POST", FAILS, {"name": "c" * 5000}), 413, "too_large")
        err(
            send(client, "POST", FAILS, {"name": "x"}, {"Content-Type": "application/json"}),
            403,
            "bad_request",
        )


class TestPaths:
    def test_a_good_post_is_201_with_an_id_and_seq_one_then_two(
        self, client: TestClient, ids
    ) -> None:
        first = send(client, "POST", PATHS, path_draft())
        second = send(client, "POST", PATHS, path_draft(name="Two"))
        assert first.status_code == 201 and second.status_code == 201
        assert [first.json()["seq"], second.json()["seq"]] == [1, 2]
        assert first.json()["id"].startswith("path-") and first.json()["id"] != second.json()["id"]
        assert list(first.json()) == ["id", "scenario", "seq", "name", "stops"]

    def test_the_twenty_first_is_409(self, client: TestClient, ids) -> None:
        for i in range(20):
            assert send(client, "POST", PATHS, path_draft(name=f"P {i}")).status_code == 201
        err(send(client, "POST", PATHS, path_draft()), 409, "limit_reached")

    @pytest.mark.parametrize(
        ("over", "code", "where"),
        [
            ({"stops": [STOPS[0]]}, "bad_request", "stops"),
            ({"stops": [STOPS[0], STOPS[0]]}, "bad_request", "stops[1]"),
            ({"stops": [STOPS[0], {"kind": "fraud", "id": "tx-0001"}]}, "bad_request", "stops[1]"),
            ({"name": VISA}, "card_number", "name"),
            ({"name": ""}, "bad_request", "name"),
            ({"scenario": "not-a-scenario"}, "bad_scenario", "scenario"),
        ],
    )
    def test_a_bad_draft_is_422(
        self, client: TestClient, ids, over: dict[str, Any], code: str, where: str
    ) -> None:
        err(send(client, "POST", PATHS, path_draft(**over)), 422, code, where)

    def test_the_size_caps(self, client: TestClient, ids) -> None:
        stops = [{"kind": "auth", "id": f"tx-{i:04d}"} for i in range(50)]
        assert send(client, "POST", PATHS, path_draft(stops=stops)).status_code == 201
        err(send(client, "POST", PATHS, path_draft(name="c" * 17000)), 413, "too_large")

    def test_a_put_keeps_id_scenario_and_seq(self, client: TestClient, ids) -> None:
        send(client, "POST", PATHS, path_draft())
        made = send(client, "POST", PATHS, path_draft(name="Two")).json()
        fields = {"name": "Renamed", "stops": [STOPS[1], {"kind": "auth", "id": "tx-0003"}]}
        r = send(client, "PUT", f"{PATHS}/{made['id']}", fields)
        assert r.status_code == 200 and r.json() == {**made, **fields}

    def test_a_put_of_an_unknown_or_malformed_id_is_404(self, client: TestClient) -> None:
        fields = {"name": "x", "stops": STOPS}
        err(send(client, "PUT", f"{PATHS}/{GOOD_PATH_ID}", fields), 404, "not_found")
        err(send(client, "PUT", f"{PATHS}/nope", fields), 404, "not_found")

    def test_a_put_checks_the_fields_before_the_id(self, client: TestClient) -> None:
        err(send(client, "PUT", f"{PATHS}/{GOOD_PATH_ID}", {"name": "x"}), 422, "bad_request")

    def test_a_put_to_a_refused_id_is_422_because_the_log_guard_rewrites_the_path(
        self, client: TestClient
    ) -> None:
        # The guard replaces the refused path with /api/notes/redacted, so the note update route
        # answers, and it checks the body first: a path body is not a note body.
        err(
            send(client, "PUT", f"{PATHS}/{VISA_PATH_ID}", {"name": "x", "stops": STOPS}),
            422,
            "bad_request",
        )

    def test_a_delete_is_204_then_404_and_needs_the_client_header(
        self, client: TestClient, ids
    ) -> None:
        made = send(client, "POST", PATHS, path_draft()).json()
        err(client.delete(f"{PATHS}/{made['id']}"), 403, "bad_request")
        r = client.delete(f"{PATHS}/{made['id']}", headers=H)
        assert r.status_code == 204 and r.content == b""
        err(client.delete(f"{PATHS}/{made['id']}", headers=H), 404, "not_found")
        assert client.get(MARKS, params={"scenario": A}).json()["paths"] == []

    def test_a_delete_of_a_malformed_or_refused_id_is_404(self, client: TestClient) -> None:
        for bad in ("nope", VISA_PATH_ID, GOOD_PATH_ID):
            err(client.delete(f"{PATHS}/{bad}", headers=H), 404, "not_found")


class TestExportImportAtVersionTwo:
    def test_an_export_is_the_wire_file_and_checks(self, client: TestClient, monkeypatch) -> None:
        monkeypatch.setattr(ns, "_uuid_source", lambda: uuid.UUID(PATH_UUID))
        send(client, "PUT", NODE, PUT_BODY_WIRE)
        send(client, "POST", FAILS, {"name": "Shared key"})
        send(client, "POST", PATHS, path_draft())
        r = client.get("/api/notes/export", params={"scenario": A})
        assert r.status_code == 200 and r.text == wire_text(FILE_V2_WIRE)
        assert check_file(r.json(), SCENARIOS) == FILE_V2_WIRE

    def test_a_version_two_import_answers_six_counts_then_replaces(
        self, client: TestClient
    ) -> None:
        r = send(client, "POST", "/api/notes/import", FILE_V2_WIRE)
        assert r.status_code == 200
        assert r.json() == {
            "added": 0,
            "replaced": 0,
            "nodesAdded": 1,
            "nodesReplaced": 0,
            "pathsAdded": 1,
            "pathsReplaced": 0,
        }
        r = send(client, "POST", "/api/notes/import", FILE_V2_WIRE)
        assert (r.json()["nodesAdded"], r.json()["nodesReplaced"]) == (0, 1)
        assert (r.json()["pathsAdded"], r.json()["pathsReplaced"]) == (0, 1)
        assert client.get(MARKS, params={"scenario": A}).text == wire_text(LIST_WIRE)

    def test_a_version_one_import_answers_six_counts_too(self, client: TestClient) -> None:
        f = {"format": "ffr-notes", "version": 1, "scenario": A, "categories": [], "notes": []}
        r = send(client, "POST", "/api/notes/import", f)
        assert r.status_code == 200 and r.json() == {
            "added": 0,
            "replaced": 0,
            "nodesAdded": 0,
            "nodesReplaced": 0,
            "pathsAdded": 0,
            "pathsReplaced": 0,
        }

    def test_a_node_with_a_card_number_loads_nothing(self, client: TestClient) -> None:
        bad = {**FILE_V2_WIRE["nodes"][0], "record": {"kind": "auth", "id": "tx-" + VISA}}
        f = {**FILE_V2_WIRE, "nodes": [bad]}
        err(send(client, "POST", "/api/notes/import", f), 422, "card_number", "nodes[0].record.id")
        assert client.get(MARKS, params={"scenario": A}).json()["paths"] == []

    def test_too_many_nodes_is_413_and_a_path_held_elsewhere_is_422(
        self, client: TestClient
    ) -> None:
        f = {**FILE_V2_WIRE, "nodes": [FILE_V2_WIRE["nodes"][0]] * 1001}
        err(send(client, "POST", "/api/notes/import", f), 413, "too_large", "nodes")
        send(client, "POST", "/api/notes/import", {**FILE_V2_WIRE, "scenario": B})
        err(send(client, "POST", "/api/notes/import", FILE_V2_WIRE), 422, "bad_file", "paths[0].id")

    def test_a_version_two_file_with_five_keys_is_still_refused(self, client: TestClient) -> None:
        five = {
            k: v
            for k, v in FILE_V2_WIRE.items()
            if k in ("format", "version", "scenario", "categories", "notes")
        }
        err(send(client, "POST", "/api/notes/import", five), 422, "bad_file", "")


class TestSentences:
    def test_the_two_reworded_sentences_hold_for_marks_and_name_no_note(self) -> None:
        assert notes_routes.MESSAGES["limit_reached"] == "The limit is reached."
        assert notes_routes.MESSAGES["not_found"] == "The item does not exist."
        for code in ("limit_reached", "not_found"):
            assert "note" not in notes_routes.MESSAGES[code].lower()

    def test_the_statuses_do_not_change(self) -> None:
        assert notes_routes._STATUS == {
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

    def test_the_note_routes_test_still_compares_against_the_messages_table(self) -> None:
        # test_notes_routes.err() reads the sentence from MESSAGES[code], so the reworded
        # sentences are followed by it and nothing there holds a copy of the old text.
        src = (Path(__file__).parent / "test_notes_routes.py").read_text(encoding="utf-8")
        assert 'body["detail"]["message"] == notes_routes.MESSAGES[code]' in src
        assert "holds 1,000 notes" not in src and "The note does not exist" not in src

    def test_a_refusal_carries_the_sentence_of_its_code(self, client: TestClient, ids) -> None:
        # err() compares every reply body with MESSAGES[code], so this holds for both new sentences.
        r = client.delete(f"{PATHS}/{GOOD_PATH_ID}", headers=H)
        assert r.json()["detail"]["message"] == "The item does not exist."
        c = ns.connect()
        try:
            c.execute("BEGIN")
            for i in range(1000):
                c.execute(
                    "INSERT INTO notes(id, scenario, seq, time_ms, colour, category, decision,"
                    " body) VALUES (?, ?, ?, 1, 'r1', 'Note', 'none', '{}')",
                    (f"note-{i:04x}" + "cdef" * 7, A, i + 1),
                )
            c.execute("COMMIT")
        finally:
            c.close()
        r = send(client, "POST", "/api/notes", draft())
        assert r.status_code == 409
        assert r.json()["detail"]["message"] == "The limit is reached."
