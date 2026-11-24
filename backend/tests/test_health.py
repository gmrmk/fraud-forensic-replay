"""Health endpoint: restart detection.

boot_id is process-stable but changes across restarts, so a client that
cached an older value knows its world (active scenario, data) was reset.

Readiness: /api/health pings the DB (SELECT 1);
a DB failure returns 503 so a load balancer / cold-start probe sees the
backend as not-ready rather than falsely-live.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_reports_stable_boot_id() -> None:
    first = client.get("/api/health").json()
    second = client.get("/api/health").json()
    assert first["boot_id"] == second["boot_id"]
    assert len(first["boot_id"]) == 32  # uuid4().hex


def test_health_names_the_active_scenario() -> None:
    body = client.get("/api/health").json()
    assert body["scenario"], "health must report the active scenario id"


def test_health_returns_503_when_db_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    """GAP 7 - readiness ping. If the DB connect fails, the endpoint must
    report not-ready (503), not falsely report ok."""

    def boom(*_args: object, **_kwargs: object) -> sqlite3.Connection:
        raise sqlite3.OperationalError("unable to open database file")

    monkeypatch.setattr(main, "connect", boom)
    response = client.get("/api/health")
    assert response.status_code == 503
