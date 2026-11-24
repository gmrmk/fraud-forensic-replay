"""/api/transactions?terminal_id= : every transaction at one terminal, across cards.

The case read is focal-card scoped, so the investigator's "open all matches for this
terminal" step needs a read that is NOT scoped to the focal card. It is still a bounded,
parameterized read: one terminal, a row cap, and no way to turn it into a portfolio dump.
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
import seed

CPP_TERMINAL = "ZEL-7731042"  # the 30-card skimmer ring the seed plants
MARCUS = "card-marcus-visa-001"


@pytest.fixture(scope="module")
def ring_db(tmp_path_factory) -> Path:
    db = tmp_path_factory.mktemp("terminal-rows") / "ring.db"
    seed.main(db_path=db, with_population=True)
    return db


@pytest.fixture
def client(ring_db, monkeypatch) -> TestClient:
    real_connect = main.connect
    monkeypatch.setattr(main, "connect", lambda: real_connect(ring_db))
    return TestClient(main.app)


def test_terminal_id_returns_every_card_that_used_the_terminal(client) -> None:
    rows = client.get("/api/transactions", params={"terminal_id": CPP_TERMINAL}).json()
    assert len(rows) == 30
    assert {r["terminal_id"] for r in rows} == {CPP_TERMINAL}
    assert len({r["card_id"] for r in rows}) == 30, "one visit per card across the ring"
    stamps = [r["timestamp"] for r in rows]
    assert stamps == sorted(stamps)


def test_terminal_rows_have_the_same_shape_as_the_case_read(client) -> None:
    case_row = client.get("/api/transactions", params={"card_id": MARCUS}).json()[0]
    ring_row = client.get("/api/transactions", params={"terminal_id": CPP_TERMINAL}).json()[0]
    assert set(ring_row) == set(case_row)


def test_default_read_is_still_focal_card_scoped(client, monkeypatch) -> None:
    # The active scenario is process-global; pin its focal so this holds in any test order.
    monkeypatch.setattr(main.sr, "get_active", lambda: SimpleNamespace(focal={"card_id": MARCUS}))
    rows = client.get("/api/transactions").json()
    assert {r["card_id"] for r in rows} == {MARCUS}


def test_unknown_terminal_is_an_empty_list_not_a_portfolio_dump(client) -> None:
    response = client.get("/api/transactions", params={"terminal_id": "NO-SUCH-TERMINAL"})
    assert response.status_code == 200
    assert response.json() == []


def test_empty_terminal_id_is_rejected(client) -> None:
    # '' must never match "every row without a terminal" (all card-not-present traffic).
    assert client.get("/api/transactions", params={"terminal_id": ""}).status_code == 422


def test_terminal_id_is_a_bound_value_never_sql(client) -> None:
    response = client.get("/api/transactions", params={"terminal_id": "x' OR '1'='1"})
    assert response.status_code == 200
    assert response.json() == []


def test_terminal_id_with_card_id_is_the_intersection(client) -> None:
    ring = client.get("/api/transactions", params={"terminal_id": CPP_TERMINAL}).json()
    one_card = ring[0]["card_id"]
    rows = client.get(
        "/api/transactions", params={"terminal_id": CPP_TERMINAL, "card_id": one_card}
    ).json()
    assert [r["id"] for r in rows] == [r["id"] for r in ring if r["card_id"] == one_card]
    other = next(r["card_id"] for r in ring if r["card_id"] != one_card)
    assert (
        client.get(
            "/api/transactions", params={"terminal_id": "NO-SUCH-TERMINAL", "card_id": other}
        ).json()
        == []
    )


def test_terminal_read_is_row_capped(client, monkeypatch) -> None:
    monkeypatch.setattr(main, "_TERMINAL_ROWS_CAP", 5)
    rows = client.get("/api/transactions", params={"terminal_id": CPP_TERMINAL}).json()
    assert len(rows) == 5
    stamps = [r["timestamp"] for r in rows]
    assert stamps == sorted(stamps)
