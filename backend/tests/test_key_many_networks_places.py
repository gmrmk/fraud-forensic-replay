"""The places of `key-many-networks` (STORIES-DATA, group D1 step D1.4, and the stories-globe
group 1): the rows of seven kinds (org, network_seen, reset, signin, key_event, request_sample and
the decision) hold a numeric `lat` and `lng` as their last two keys, except the two path kinds
(network_seen and signin), whose last two keys are their hop figures and whose `lat` and `lng`
come just before them; principal and usage_day hold none. A reset sits at the city of the network
it names. Every expected value is typed here from DATA section 2 of the cases design
(`mockups/cases/DATA.md`), never imported from the generator, so the generator and this file are
two readings of the table.

A place is a real city's coordinates in decimal degrees, four places, written as the table prints
them (`-74.006`, `52.52`). The decision sits at its organisation's billing city, Portland.

What this file does not hold: the manifest's declarations of `coords`, the key's path and the
filters (test_key_many_networks_manifest.py) and the rule that makes the crowd
(test_key_many_networks_crowd.py, which only gives its table to this file)."""

from __future__ import annotations

import json

import pytest

import seed_key_many_networks as km
from db import PROJECT_ROOT
from tests.test_key_many_networks_crowd import CROWD

GOLDEN = (
    PROJECT_ROOT / "backend" / "tests" / "golden" / "stories-rows-original" / "key-many-networks"
)
APPLICANT = "org-66335"
PLACED = ("org", "network_seen", "reset", "signin", "key_event", "request_sample", "decision")
UNPLACED = ("principal", "usage_day")
HOPPED = ("network_seen", "signin")  # the path kinds: the key's and the seats' (test_story_hops.py)

# DATA section 2, the billing city of each organisation: id -> (city, lat, lng).
ORG_PLACES = {
    "org-86682": ("Austin", 30.2672, -97.7431),
    "org-66335": ("Portland", 45.5152, -122.6784),
    "org-63987": ("Chicago", 41.8781, -87.6298),
    "org-78401": ("Boston", 42.3601, -71.0589),
    "org-94329": ("Toronto", 43.6532, -79.3832),
    "org-77075": ("Pittsburgh", 40.4406, -79.9959),
    "org-81717": ("Dublin", 53.3498, -6.2603),
    "org-89273": ("London", 51.5072, -0.1276),
    "org-58628": ("New York", 40.7128, -74.006),
    "org-62879": ("Atlanta", 33.749, -84.388),
    "org-38687": ("Berlin", 52.52, 13.405),
    "org-89479": ("Denver", 39.7392, -104.9903),
    "org-36231": ("Vancouver", 49.2827, -123.1207),
}
# DATA section 2: the city of each of the four network rows.
NETWORK_PLACES = {
    "nw-0001": ("Frankfurt", 50.1109, 8.6821),
    "nw-0002": ("Warsaw", 52.2297, 21.0122),
    "nw-0003": ("Singapore", 1.3521, 103.8198),
    "nw-0004": ("Sao Paulo", -23.5505, -46.6333),
}
# Every city a sign-in, key event or request names, with its place: the thirteen billing cities,
# the four network cities and the proxy's exit.
CITY_PLACES = {
    **{city: (lat, lng) for city, lat, lng in ORG_PLACES.values()},
    **{city: (lat, lng) for city, lat, lng in NETWORK_PLACES.values()},
    "Amsterdam": (52.3676, 4.9041),
}


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return km.generate()


def _golden(kind: str) -> list[dict]:
    return json.loads((GOLDEN / f"{kind}.json").read_text("utf-8"))


def _is_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def test_the_rows_of_seven_kinds_hold_a_numeric_place_as_their_last_two_keys(rows):
    # The two path kinds end with their two hop figures, which come after the place.
    for kind in PLACED:
        for row in rows[kind]:
            keys = list(row)[:-2] if kind in HOPPED else list(row)
            assert keys[-2:] == ["lat", "lng"], (kind, row["id"])
            assert _is_number(row["lat"]) and _is_number(row["lng"]), (kind, row["id"])
            assert -90 <= row["lat"] <= 90 and -180 <= row["lng"] <= 180, (kind, row["id"])


def test_principal_and_usage_day_hold_no_place(rows):
    for kind in UNPLACED:
        for row in rows[kind]:
            assert not {"lat", "lng", "latitude", "longitude", "coords"} & set(row), kind


def test_a_reset_sits_at_the_city_of_the_network_it_names(rows):
    # The applicant's four resets come from the proxy exit; every other reset from its
    # organisation's office network, at that organisation's billing city.
    applicant_city = {o["org_id"]: o["billing_city"] for o in rows["org"]}
    for row in rows["reset"]:
        want = "Amsterdam" if row["network_id"] == "net-101" else applicant_city[row["org_id"]]
        assert row["city"] == want, row["id"]
        assert (row["lat"], row["lng"]) == CITY_PLACES[want], row["id"]
        assert list(row)[-4:] == ["city", "country", "lat", "lng"], row["id"]
    assert sorted(r["id"] for r in rows["reset"] if r["network_id"] == "net-101") == [
        "rs-0002",
        "rs-0012",
        "rs-0014",
        "rs-0021",
    ]


def test_an_organisation_sits_at_its_billing_city(rows):
    assert {o["org_id"] for o in rows["org"]} == set(ORG_PLACES)
    for org in rows["org"]:
        city, lat, lng = ORG_PLACES[org["org_id"]]
        assert (org["billing_city"], org["lat"], org["lng"]) == (city, lat, lng), org["id"]


def test_the_four_network_rows_sit_at_the_city_of_their_address(rows):
    for row in rows["network_seen"]:
        city, lat, lng = NETWORK_PLACES[row["id"]]
        assert (row["city"], row["lat"], row["lng"]) == (city, lat, lng), row["id"]


@pytest.mark.parametrize("kind", ["signin", "key_event", "request_sample"])
def test_a_case_row_sits_at_the_place_of_its_city(rows, kind):
    for row in rows[kind]:
        assert (row["lat"], row["lng"]) == CITY_PLACES[row["city"]], row["id"]


def test_a_crowd_row_sits_at_its_organisations_billing_city_as_the_table_has_it(rows):
    got = sorted(
        (r["timestamp"], r["seat_id"], r["city"], r["lat"], r["lng"])
        for r in rows["signin"]
        if r["org_id"] != APPLICANT
    )
    want = sorted((row[0], row[1], row[8], row[10], row[11]) for row in CROWD)
    assert got == want


def test_the_decision_is_todays_row_with_its_organisations_place_added(rows):
    (old,) = _golden("decision")
    (new,) = rows["decision"]
    assert list(new) == [*old, "lat", "lng"]
    assert {k: new[k] for k in old} == old
    assert (new["lat"], new["lng"]) == (45.5152, -122.6784)
    (org,) = [o for o in rows["org"] if o["org_id"] == new["org_id"]]
    assert (new["lat"], new["lng"]) == (org["lat"], org["lng"])


def test_every_old_row_keeps_its_keys_and_values_and_gains_only_its_place(rows):
    for kind in ("org", "network_seen"):
        old = _golden(kind)
        for new_row, old_row in zip(rows[kind], old, strict=True):
            assert {k: new_row[k] for k in old_row} == old_row, new_row["id"]
