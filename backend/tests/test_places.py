"""GAP 9 - places.py coverage (cache-hit / disabled / parse paths).

No real network: the cache-hit and disabled paths never reach httpx, and the
parse-shaping path is pure. The ambient backend/.env may set
GOOGLE_PLACES_API_KEY, so every test that depends on is_enabled() sets or
deletes the env var explicitly rather than trusting the loaded .env.
"""

from __future__ import annotations

import json

import httpx
import pytest

import places


def _mock_client_factory(response: httpx.Response | Exception):
    """Return a drop-in for httpx.Client whose .post yields `response` (or
    raises it if it's an Exception). No socket is ever opened."""

    class _MockClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def __enter__(self) -> _MockClient:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def post(self, *args: object, **kwargs: object) -> httpx.Response:
            if isinstance(response, Exception):
                raise response
            return response

    return _MockClient


def test_is_enabled_false_when_no_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_PLACES_API_KEY", raising=False)
    assert places.is_enabled() is False


def test_is_enabled_true_when_key_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "test-key")
    assert places.is_enabled() is True


def test_is_enabled_false_when_key_is_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "   ")
    assert places.is_enabled() is False


def test_search_nearby_returns_empty_for_online_only_category() -> None:
    # subscription has no physical merchant -> None mapping -> [], no network.
    assert places.search_nearby("subscription", 29.0, -95.0) == []


def test_search_nearby_cache_hit_does_not_call_api(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A matching cache file is read from disk; the API is never touched.

    We point CACHE_DIR at a temp dir, write a cache file at the exact key the
    function computes, and assert the parsed result comes back. Any attempt to
    hit httpx would be a bug - we also blow up if is_enabled() were consulted.
    """
    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)

    lat, lng, radius = 29.777, -95.546, 8000
    cache_payload = {
        "places": [
            {
                "id": "place-abc",
                "displayName": {"text": "Test Grocery"},
                "location": {"latitude": 29.7, "longitude": -95.5},
            }
        ]
    }
    cache_file = tmp_path / f"groceries_{lat:.3f}_{lng:.3f}_{radius}.json"
    cache_file.write_text(json.dumps(cache_payload), encoding="utf-8")

    # If the cache path is taken, neither is_enabled() nor httpx is reached.
    def fail_enabled() -> bool:
        raise AssertionError("cache hit must not consult is_enabled()")

    monkeypatch.setattr(places, "is_enabled", fail_enabled)

    result = places.search_nearby("groceries", lat, lng, radius_m=radius)
    assert len(result) == 1
    assert result[0].place_id == "place-abc"
    assert result[0].name == "Test Grocery"
    assert result[0].lat == 29.7
    assert result[0].lng == -95.5


def test_search_nearby_corrupt_cache_is_dropped_then_disabled_returns_empty(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A corrupt cache file is unlinked; with no key, the call returns [] and
    never hits the network."""
    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_PLACES_API_KEY", raising=False)

    lat, lng, radius = 29.777, -95.546, 8000
    cache_file = tmp_path / f"groceries_{lat:.3f}_{lng:.3f}_{radius}.json"
    cache_file.write_text("{not valid json", encoding="utf-8")

    result = places.search_nearby("groceries", lat, lng, radius_m=radius)
    assert result == []
    assert not cache_file.exists()  # corrupt cache was dropped


def test_search_nearby_disabled_no_cache_returns_empty(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No cache + no API key -> [] without any network call."""
    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)
    monkeypatch.delenv("GOOGLE_PLACES_API_KEY", raising=False)
    assert places.search_nearby("gas", 29.0, -95.0) == []


def test_parse_places_shapes_valid_records() -> None:
    data = {
        "places": [
            {
                "id": "p1",
                "displayName": {"text": "Alpha Cafe"},
                "location": {"latitude": 1.0, "longitude": 2.0},
            },
            {
                "id": "p2",
                "displayName": {"text": "Beta Diner"},
                "location": {"latitude": 3.0, "longitude": 4.0},
            },
        ]
    }
    out = places._parse_places(data)
    assert [p.place_id for p in out] == ["p1", "p2"]
    assert out[0].name == "Alpha Cafe"
    assert out[1].lat == 3.0 and out[1].lng == 4.0


def test_parse_places_skips_records_missing_name_or_coords() -> None:
    data = {
        "places": [
            {"id": "no-name", "location": {"latitude": 1.0, "longitude": 2.0}},
            {"id": "no-lat", "displayName": {"text": "X"}, "location": {"longitude": 2.0}},
            {
                "id": "ok",
                "displayName": {"text": "Good"},
                "location": {"latitude": 5.0, "longitude": 6.0},
            },
        ]
    }
    out = places._parse_places(data)
    assert [p.place_id for p in out] == ["ok"]


def test_parse_places_empty_on_no_places_key() -> None:
    assert places._parse_places({}) == []


# --- API-call branches, httpx mocked (no real network) ---------------------


@pytest.fixture
def enabled_no_cache(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """A key is present and the cache dir is empty -> the API path is taken,
    but httpx is mocked so nothing leaves the process."""
    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "test-key")
    monkeypatch.setattr(places.time, "sleep", lambda *_a, **_k: None)
    return tmp_path


def test_search_nearby_200_parses_and_writes_cache(
    enabled_no_cache, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = {
        "places": [
            {
                "id": "live-1",
                "displayName": {"text": "Live Grocery"},
                "location": {"latitude": 10.0, "longitude": 20.0},
            }
        ]
    }
    resp = httpx.Response(200, json=payload, request=httpx.Request("POST", places.PLACES_ENDPOINT))
    monkeypatch.setattr(places.httpx, "Client", _mock_client_factory(resp))

    lat, lng, radius = 29.777, -95.546, 8000
    out = places.search_nearby("groceries", lat, lng, radius_m=radius)
    assert len(out) == 1 and out[0].place_id == "live-1"

    # cache-write side effect landed (second call would read disk, not network)
    cache_file = enabled_no_cache / f"groceries_{lat:.3f}_{lng:.3f}_{radius}.json"
    assert cache_file.exists()


@pytest.mark.parametrize("status", [401, 403, 429, 400])
def test_search_nearby_error_status_returns_empty_and_logs(
    enabled_no_cache,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    status: int,
) -> None:
    resp = httpx.Response(
        status, text="error body", request=httpx.Request("POST", places.PLACES_ENDPOINT)
    )
    monkeypatch.setattr(places.httpx, "Client", _mock_client_factory(resp))

    with caplog.at_level("WARNING", logger="places"):
        out = places.search_nearby("groceries", 29.777, -95.546, radius_m=8000)
    assert out == []
    # GAP 5 proof: the failure went to the log channel, not print.
    assert any("places:" in rec.message for rec in caplog.records)


def test_search_nearby_network_error_returns_empty_and_logs(
    enabled_no_cache,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    err = httpx.ConnectError("boom", request=httpx.Request("POST", places.PLACES_ENDPOINT))
    monkeypatch.setattr(places.httpx, "Client", _mock_client_factory(err))

    with caplog.at_level("ERROR", logger="places"):
        out = places.search_nearby("groceries", 29.777, -95.546, radius_m=8000)
    assert out == []
    assert any("network error" in rec.message for rec in caplog.records)


def _client_that_must_not_exist(*args: object, **kwargs: object) -> None:
    raise AssertionError("the running app must not call the Places service")


def test_search_nearby_without_fetch_never_calls_the_service(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """With a key and an empty cache, fetch=False returns nothing and opens no client."""
    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "test-value-not-a-key")
    monkeypatch.setattr(places.httpx, "Client", _client_that_must_not_exist)

    assert places.search_nearby("groceries", 29.777, -95.546, radius_m=8000, fetch=False) == []
    assert list(tmp_path.iterdir()) == []


def test_places_endpoint_reads_the_cache_and_never_calls_the_service(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """GET /api/places with a key and an empty cache answers [] without a network call,
    whatever coordinates the caller sends; with a cache file it answers from the file."""
    from fastapi.testclient import TestClient

    import main

    monkeypatch.setattr(places, "CACHE_DIR", tmp_path)
    monkeypatch.setenv("GOOGLE_PLACES_API_KEY", "test-value-not-a-key")
    monkeypatch.setattr(places.httpx, "Client", _client_that_must_not_exist)
    client = TestClient(main.app)

    resp = client.get("/api/places", params={"lat": 51.5, "lng": -0.12, "radius_m": 50000})
    assert resp.status_code == 200
    assert resp.json() == []
    assert list(tmp_path.iterdir()) == []

    lat, lng, radius = 29.777, -95.546, 8000
    payload = {
        "places": [
            {
                "id": "place-abc",
                "displayName": {"text": "Test Grocery"},
                "location": {"latitude": 29.7, "longitude": -95.5},
            }
        ]
    }
    (tmp_path / f"groceries_{lat:.3f}_{lng:.3f}_{radius}.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )
    cached = client.get("/api/places", params={"lat": lat, "lng": lng, "radius_m": radius})
    assert cached.status_code == 200
    assert [p["name"] for p in cached.json()] == ["Test Grocery"]
