"""The place rules of the five newer stories (key-many-networks, seat-failed-signins,
agent-runs-shared-key, seats-two-networks, volume-step): every network has a city, and every row
that names a network, or is given one by the carry rule, draws at that city.

Each seed module holds one `NETWORKS` table, network id to (city, country, lat, lng). A kind is in
one class: placed by its own network (the row names one), given a network by the carry rule (the
row names none, so it takes the nearest earlier row that does), left without a place (an account,
a setting, a total or a notice: a place on it would be a made-up claim), or kept (the
organisation and the decision, whose places the stories data set and the guard in
test_story_rows.py holds). The tables below are typed here a second time on purpose: the test
checks the seed against them, so a city that drifts in the seed fails here.

What this file does not do: it reads no clock and no random source, it never writes a file, and
it says nothing about paths or hop figures (those are test_story_hops.py's).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import seed_agent_runs_shared_key as ar
import seed_key_many_networks as km
import seed_seat_failed_signins as sf
import seed_seats_two_networks as st
import seed_volume_step as vs
from db import PROJECT_ROOT

Row = dict[str, Any]

STORIES = (
    "key-many-networks",
    "seat-failed-signins",
    "agent-runs-shared-key",
    "seats-two-networks",
    "volume-step",
)
SEEDS = {
    "key-many-networks": km,
    "seat-failed-signins": sf,
    "agent-runs-shared-key": ar,
    "seats-two-networks": st,
    "volume-step": vs,
}
GOLDEN = Path(__file__).resolve().parent / "golden" / "stories-rows-original"
SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
COORDS = {"lat": "lat", "lng": "lng"}
PLACE_KEYS = ("city", "country", "lat", "lng")

# Every network of every story, as (city, country, lat, lng).
EXPECTED_NETWORKS: dict[str, dict[str, tuple[str, str, float, float]]] = {
    "key-many-networks": {
        "net-101": ("Amsterdam", "NL", 52.3676, 4.9041),
        "net-102": ("Frankfurt", "DE", 50.1109, 8.6821),
        "net-103": ("Warsaw", "PL", 52.2297, 21.0122),
        "net-104": ("Singapore", "SG", 1.3521, 103.8198),
        "net-105": ("Sao Paulo", "BR", -23.5505, -46.6333),
        "net-201": ("Portland", "US", 45.5152, -122.6784),
        "net-202": ("Austin", "US", 30.2672, -97.7431),
        "net-203": ("Chicago", "US", 41.8781, -87.6298),
        "net-204": ("Boston", "US", 42.3601, -71.0589),
        "net-205": ("Toronto", "CA", 43.6532, -79.3832),
        "net-206": ("Pittsburgh", "US", 40.4406, -79.9959),
        "net-207": ("Dublin", "IE", 53.3498, -6.2603),
        "net-208": ("London", "GB", 51.5072, -0.1276),
        "net-209": ("New York", "US", 40.7128, -74.006),
        "net-210": ("Atlanta", "US", 33.749, -84.388),
        "net-211": ("Berlin", "DE", 52.52, 13.405),
        "net-212": ("Denver", "US", 39.7392, -104.9903),
    },
    "seat-failed-signins": {
        "net-101 education": ("Seattle", "US", 47.6062, -122.3321),
        "net-102 hosting": ("Ashburn", "US", 39.0438, -77.4874),
    },
    "agent-runs-shared-key": {
        "net-101 corporate": ("Minneapolis", "US", 44.9778, -93.265),
        "net-102 corporate": ("Chicago", "US", 41.8781, -87.6298),
    },
    "seats-two-networks": {
        "net-101 corporate": ("Sacramento", "US", 38.5816, -121.4944),
        "net-102 corporate": ("Roseville", "US", 38.7521, -121.288),
        "net-103 residential": ("Boise", "US", 43.615, -116.2023),
        "net-104 residential": ("Reno", "US", 39.5296, -119.8138),
    },
    "volume-step": {
        "net-101 corporate": ("Salt Lake City", "US", 40.7608, -111.891),
        "net-102 corporate": ("Provo", "US", 40.2338, -111.6585),
    },
}

# The classes of every kind: "by_network" (the row names its network), "given" (kind -> the link
# field of the carry rule, None when the rule reads every source), "left" (no place, with the
# reason in the module docstring) and "kept" (the organisation and the decision).
CLASSES: dict[str, dict[str, Any]] = {
    "key-many-networks": {
        "by_network": ["network_seen", "reset", "signin", "key_event", "request_sample"],
        "given": {},
        "left": ["principal", "usage_day"],
        "kept": ["org", "decision"],
    },
    "seat-failed-signins": {
        "by_network": ["signin", "request_sample", "credential_event"],
        "given": {"reset": "seat_id"},
        "left": ["seat", "usage_hour"],
        "kept": ["org", "decision"],
    },
    "agent-runs-shared-key": {
        "by_network": ["signin"],
        "given": {"run_start": None, "run_end": None, "key_reach": "workspace_id"},
        "left": ["workspace"],
        "kept": ["org", "decision"],
    },
    "seats-two-networks": {
        "by_network": ["switch_sample", "signin"],
        "given": {"reset": "seat_id"},
        "left": ["seat", "safeguard_hour", "usage_day", "enrolment"],
        "kept": ["org", "decision"],
    },
    "volume-step": {
        "by_network": ["signin"],
        "given": {},
        "left": ["workspace", "usage_day", "period", "failed_call_day", "notice"],
        "kept": ["org", "decision"],
    },
}

# The network the carry rule gives each row of a given kind, by row id. seat-failed-signins rs-0001
# is the one row the rule cannot place (its seat is seen nowhere else in the story): it takes the
# story's first network, so every reset of the story has a place.
GIVEN: dict[str, dict[str, dict[str, str]]] = {
    "seat-failed-signins": {
        "reset": {
            "rs-0001": "net-101 education",
            "rs-0002": "net-102 hosting",
            "rs-0003": "net-102 hosting",
            "rs-0004": "net-102 hosting",
        }
    },
    "agent-runs-shared-key": {
        "run_start": {
            "rs-0001": "net-101 corporate",
            "rs-0002": "net-101 corporate",
            "rs-0003": "net-101 corporate",
            "rs-0004": "net-102 corporate",
            "rs-0005": "net-102 corporate",
        },
        "run_end": {
            "re-0001": "net-101 corporate",
            "re-0002": "net-101 corporate",
            "re-0003": "net-101 corporate",
            "re-0004": "net-102 corporate",
            "re-0005": "net-102 corporate",
        },
        "key_reach": {
            "kr-0001": "net-101 corporate",
            "kr-0002": "net-102 corporate",
            "kr-0003": "net-102 corporate",
            "kr-0004": "net-101 corporate",
            "kr-0005": "net-102 corporate",
        },
    },
    "seats-two-networks": {
        "reset": {"rs-01": "net-102 corporate", "rs-02": "net-102 corporate"},
    },
}

ADDRESS = {"id": "address", "label": "Address", "fields": ["network_id", "city", "country"]}


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _manifest(story: str) -> dict[str, Any]:
    return _read(SCENARIOS / f"{story}.scenario.json")


def _node(manifest: dict[str, Any], kind: str) -> dict[str, Any]:
    (node,) = [n for n in manifest["nodes"] if n["kind"] == kind]
    return node


@pytest.fixture(scope="module", params=STORIES)
def story(request: pytest.FixtureRequest) -> dict[str, Any]:
    name: str = request.param
    module = SEEDS[name]
    return {
        "name": name,
        "module": module,
        "rows": module.generate(),
        "networks": module.NETWORKS,
        "manifest": _manifest(name),
        "classes": CLASSES[name],
    }


def test_the_classes_hold_every_kind_of_the_module_exactly_once(story):
    classes = story["classes"]
    listed = [*classes["by_network"], *classes["given"], *classes["left"], *classes["kept"]]
    assert sorted(listed) == sorted(story["module"].KINDS)
    assert len(set(listed)) == len(listed)


def test_every_network_has_a_city_and_the_table_is_the_stories(story):
    networks = story["networks"]
    assert dict(networks) == EXPECTED_NETWORKS[story["name"]]
    for network_id, (city, country, lat, lng) in networks.items():
        assert isinstance(network_id, str) and network_id
        assert isinstance(city, str) and 1 <= len(city) <= 40
        assert isinstance(country, str) and len(country) == 2
        assert country.isascii() and country.isupper() and country.isalpha()
        assert isinstance(lat, float) and -90 <= lat <= 90
        assert isinstance(lng, float) and -180 <= lng <= 180


def test_every_network_a_row_names_is_in_the_table(story):
    networks = story["networks"]
    named = {
        row[key]
        for rows in story["rows"].values()
        for row in rows
        for key in ("network_id", "previous_network", "last_network_id")
        if row.get(key) is not None
    }
    assert named
    assert named <= set(networks), sorted(named - set(networks))


def test_every_row_of_a_placed_kind_holds_the_place_of_its_network(story):
    networks, classes = story["networks"], story["classes"]
    for kind in [*classes["by_network"], *classes["given"]]:
        for row in story["rows"][kind]:
            network = row["network_id"]
            assert network is not None, f"{kind} {row['id']} names no network"
            city, country, lat, lng = networks[network]
            assert (row["city"], row["country"], row["lat"], row["lng"]) == (
                city,
                country,
                lat,
                lng,
            ), f"{kind} {row['id']}"


def test_the_node_of_every_placed_kind_declares_coords_and_no_left_kind_does(story):
    manifest, classes = story["manifest"], story["classes"]
    for kind in [*classes["by_network"], *classes["given"], *classes["kept"]]:
        assert _node(manifest, kind).get("coords") == COORDS, kind
    for kind in classes["left"]:
        assert "coords" not in _node(manifest, kind), kind


def test_no_left_row_holds_a_place_or_a_network_it_did_not_hold_before(story):
    golden = {p.stem: _read(p) for p in (GOLDEN / story["name"]).glob("*.json")}
    for kind in story["classes"]["left"]:
        by_id = {r["id"]: r for r in golden[kind]}
        for row in story["rows"][kind]:
            for key in ("lat", "lng", "network_id", *PLACE_KEYS):
                if key in row:
                    assert key in by_id[row["id"]], f"{kind} {row['id']} gained {key!r}"


def test_each_given_row_names_the_network_the_carry_rule_gives(story):
    given = GIVEN.get(story["name"], {})
    assert sorted(given) == sorted(story["classes"]["given"])
    for kind, expected in given.items():
        rows = story["rows"][kind]
        assert {r["id"]: r["network_id"] for r in rows} == expected, kind


def test_a_given_kind_shows_its_place_in_an_address_section_and_does_not_pivot_on_it(story):
    manifest = story["manifest"]
    for kind in story["classes"]["given"]:
        node = _node(manifest, kind)
        assert "network_id" not in node.get("pivotable", []), kind
        sections = [s for s in node.get("sections", []) if s["id"] == "address"]
        assert sections == [ADDRESS], kind


def test_the_two_named_sections_of_key_many_networks_and_seats_two_networks():
    reset = _node(_manifest("key-many-networks"), "reset")
    request = [s for s in reset["sections"] if s["id"] == "request"]
    assert request == [
        {
            "id": "request",
            "label": "Request",
            "fields": ["channel", "network_id", "ip", "city", "country"],
        }
    ]
    switch = _node(_manifest("seats-two-networks"), "switch_sample")
    assert [s for s in switch["sections"] if s["id"] == "address"] == [
        {"id": "address", "label": "Address", "fields": ["city", "country"]}
    ]


def test_a_seat_failed_signins_reset_names_a_network_a_signin_names():
    rows = sf.generate()
    named = {r["network_id"] for r in rows["signin"]}
    assert {r["network_id"] for r in rows["reset"]} <= named


def test_the_tracked_files_are_what_the_seed_generates(story):
    for kind, rows in story["rows"].items():
        path = PROJECT_ROOT / "data" / story["name"] / f"{kind}.json"
        assert _read(path) == json.loads(json.dumps(rows)), f"{story['name']} {kind}: regenerate"


def test_the_seed_refuses_a_row_whose_typed_place_differs_from_its_network():
    import seed_packs

    row = {"id": "x-1", "network_id": "net-102 hosting", "city": "Seattle"}
    with pytest.raises(ValueError, match="x-1"):
        seed_packs.place_row(row, sf.NETWORKS)
