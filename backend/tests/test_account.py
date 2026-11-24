"""/api/account returns joined card+identity summary."""

from __future__ import annotations

from fastapi.testclient import TestClient

import main
import seed
from db import init_db


def test_account_returns_marcus_card_and_identity(seeded_db):
    client = TestClient(main.app)
    body = client.get("/api/account").json()
    assert body["customer"]["name"] == "Marcus Chen"
    assert body["card"]["last_four"]  # non-empty
    assert body["card"]["network"].lower() == "visa"
    assert body["account"]["type"] == "credit_card"
    assert body["credit_limit"] == 15000  # PROFILES fixture
    assert "card_id" in body  # for /api/transactions?card_id


def test_account_resolves_marcus_in_the_population_db(tmp_path, monkeypatch):
    """The one-bank demo DB holds 301 customers whose cards were opened before
    Marcus's; /api/account must resolve him through the case focal, not by
    opened_at order."""
    db = tmp_path / "pop.db"
    init_db(db)
    seed.main(db_path=db, with_population=True)
    real_connect = main.connect
    monkeypatch.setattr(main, "connect", lambda: real_connect(db))

    body = TestClient(main.app).get("/api/account").json()
    assert body["customer"]["name"] == "Marcus Chen"
    assert body["card_id"] == "card-marcus-visa-001"


def test_account_is_404_when_the_active_pack_has_no_such_account(tmp_path, monkeypatch):
    """A pack without Marcus's credit_card account (an empty one-bank schema stands in for
    priya-ato, platform-access and concordia) is a 404 with a plain message. A 200 with an
    error body reads as an account to the customer app, which then fails in render."""
    db = tmp_path / "no-marcus.db"
    init_db(db)
    real_connect = main.connect
    monkeypatch.setattr(main, "connect", lambda: real_connect(db))

    resp = TestClient(main.app).get("/api/account")

    assert resp.status_code == 404
    assert resp.json() == {"detail": "no credit_card account seeded"}
