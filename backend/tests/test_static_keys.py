"""The URL to file-path contract shared by the static exporter and both static frontends.

The TypeScript twin lives in frontend/investigator/src/lib/static-api.ts and is checked
against the same vectors file (static_key_vectors.json)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from static_keys import fnv1a32, static_path

VECTORS = Path(__file__).parent / "static_key_vectors.json"


def test_fnv1a32_matches_the_published_anchors():
    assert fnv1a32(b"") == "811c9dc5"
    assert fnv1a32(b"a") == "e40c292c"
    assert fnv1a32(b"foobar") == "bf9cf968"


def test_a_request_without_a_query_maps_to_the_underscore_file():
    assert static_path("/api/transactions") == "transactions/_.json"
    assert static_path("/api/scenario") == "scenario/_.json"


def test_nested_routes_flatten_with_a_double_underscore():
    path = static_path("/api/entities/heat?kind=auth")
    assert path.startswith("entities__heat/kind=auth-")
    assert path.endswith(".json")


def test_parameter_order_and_space_encoding_do_not_change_the_path():
    a = static_path("/api/manager/members?dim=merchant_name&value=Alderlowe%20Fuel")
    b = static_path("/api/manager/members?value=Alderlowe+Fuel&dim=merchant_name")
    assert a == b


def test_different_queries_map_to_different_paths():
    assert static_path("/api/transactions?terminal_id=A") != static_path(
        "/api/transactions?terminal_id=B"
    )
    # Both values sanitize to the same slug; the hash of the canonical text separates them.
    assert static_path("/api/x?v=a%2Fb") != static_path("/api/x?v=a%3Ab")


def test_a_long_value_keeps_the_slug_at_48_characters():
    path = static_path("/api/transactions?terminal_id=" + "T" * 200)
    slug = path.split("/")[1].rsplit("-", 1)[0]
    assert len(slug) == 48


def test_a_url_outside_the_api_is_rejected():
    with pytest.raises(ValueError):
        static_path("/data/timezones.geojson")
    with pytest.raises(ValueError):
        static_path("/api/")


def test_the_shared_vectors_hold():
    vectors = json.loads(VECTORS.read_text(encoding="utf-8"))
    assert len(vectors) >= 8
    for vector in vectors:
        assert static_path(vector["url"]) == vector["path"], vector["url"]
