"""Routes that were removed stay removed: no route is registered for them and a request is a 404.

Covers the six /api/manager/* routes (removed with the Manager console and backend/manager.py),
the population heat route /api/entities/heat and the card and transaction count route
/api/portfolio/summary that the removed queue view read.
It needs no database: an unregistered path is answered 404 before any handler runs.

What this file does not test: the routes that stayed (their own test files do).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main

REMOVED = [
    "/api/manager/segments",
    "/api/manager/rings",
    "/api/manager/members?dim=merchant_name&value=x",
    "/api/manager/score_bands",
    "/api/manager/cohorts",
    "/api/manager/cohort_members?bucket=week&value=x",
    "/api/entities/heat?kind=auth",
    "/api/portfolio/summary",
]


@pytest.mark.parametrize("url", REMOVED)
def test_removed_route_is_not_registered(url: str) -> None:
    path = url.split("?", 1)[0]
    registered = {getattr(r, "path", None) for r in main.app.routes}
    assert path not in registered


@pytest.mark.parametrize("url", REMOVED)
def test_removed_route_answers_404(url: str) -> None:
    assert TestClient(main.app).get(url).status_code == 404
