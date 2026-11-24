"""The places and the fuller fields of `seat-failed-signins` (STORIES-DATA, group D2; the resets
follow in the stories-globe group 1): the rows of six kinds (org, signin, request_sample,
credential_event, reset and the decision) hold a numeric `lat` and `lng`; seat and usage_hour hold
none. A reset names no network of its own: it takes the one its seat last used (the carry rule),
and the one reset of a seat seen nowhere else takes the story's first network. Every expected value
is typed here from the cases
design, never imported from the generator, so the generator and this file are two readings of one
table: the education network at Seattle, the hosting network at Ashburn, the two organisations at
Seattle and Tacoma, and the decision at Seattle.

Each row is compared whole and in key order, so a new key must come after today's keys (the
golden copies under tests/golden/stories-rows-original/ give today's keys); a sign-in is compared
without its two hop figures, which end its keys and which test_story_hops.py pins. The decision
gains `lat` and `lng` and nothing else.

What this file does not hold: the declarations of the manifest
(test_seat_failed_signins_manifest.py), the counts, the stamps and the sums of the story
(test_seat_failed_signins_pack.py) and the rule that no existing row loses a value
(test_story_rows.py)."""

from __future__ import annotations

import ipaddress
import json
from typing import Any

import pytest

import seed_seat_failed_signins as sp
from db import PROJECT_ROOT

GOLDEN = (
    PROJECT_ROOT / "backend" / "tests" / "golden" / "stories-rows-original" / "seat-failed-signins"
)
PLACED = ("org", "signin", "request_sample", "credential_event", "reset", "decision")
UNPLACED = ("seat", "usage_hour")
HOP_KEYS = ("seconds_since_previous", "km_from_previous")  # the sign-in is this story's path kind
DOC_NETWORKS = tuple(
    ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)

SEATTLE = ("Seattle", "US", 47.6062, -122.3321)
TACOMA = ("Tacoma", "US", 47.2529, -122.4443)
ASHBURN = ("Ashburn", "US", 39.0438, -77.4874)
CAMPUS = "net-101 education"
HOSTING = "net-102 hosting"
CAMPUS_IP, HOSTING_IP = "192.0.2.17", "198.51.100.200"
WEB, REQUESTS = "console web", "python-requests 2.32"

# The seat ids the seed draws (fixed seed, ids only): the incident seat, the steady seat, the third.
INCIDENT, STEADY, EARLIER = "seat-69701", "seat-85951", "seat-31510"


def _place(city: tuple[str, str, float, float]) -> dict[str, Any]:
    name, country, lat, lng = city
    return {"city": name, "country": country, "lat": lat, "lng": lng}


def _read(name: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = json.loads((GOLDEN / f"{name}.json").read_text(encoding="utf-8"))
    return rows


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict[str, Any]]]:
    return sp.generate()


def test_the_two_organisations_hold_their_city_after_todays_keys(rows):
    assert rows["org"] == [
        {
            "id": "og-0001",
            "org_id": "org-24892",
            "org_name": "Belmaren Central",
            "timestamp": 0,
            **_place(SEATTLE),
        },
        {
            "id": "og-0002",
            "org_id": "org-69414",
            "org_name": "Belmaren Field Lab",
            "timestamp": 0,
            **_place(TACOMA),
        },
    ]
    assert [list(r) for r in rows["org"]] == [
        ["id", "org_id", "org_name", "timestamp", "city", "country", "lat", "lng"]
    ] * 2


def test_the_seats_gain_a_role_a_creation_day_and_a_client_and_no_place(rows):
    by_id = {r["seat_id"]: r for r in rows["seat"]}
    assert [r["id"] for r in rows["seat"]] == ["st-0001", "st-0002", "st-0003"]
    assert {k: (v["role"], v["created_on"], v["client"]) for k, v in by_id.items()} == {
        INCIDENT: ("member", "2026-11-02", WEB),
        STEADY: ("admin", "2026-09-10", WEB),
        EARLIER: ("member", "2026-10-14", WEB),
    }
    for row in rows["seat"]:
        assert row["timestamp"] == 0, "the filler stays on the row, the manifest omits it"
        assert list(row) == [
            "id",
            "seat_id",
            "seat_name",
            "signins_total",
            "addresses",
            "first_signin_on",
            "timestamp",
            "role",
            "created_on",
            "client",
        ]
    assert [r["id"] for r in rows["seat"] if r["seat_id"] == INCIDENT] == ["st-0001"]


def _signin(
    id_: str,
    seat: str,
    network: str,
    ip: str,
    client: str,
    city: tuple[str, str, float, float],
    outcome: str,
    attempts: int,
    window: int,
    at: str,
) -> dict[str, Any]:
    return {
        "id": id_,
        "seat_id": seat,
        "network_id": network,
        "outcome": outcome,
        "attempts": attempts,
        "window_min": window,
        "timestamp": at,
        "ip": ip,
        "method": "password",
        "client": client,
        **_place(city),
    }


def test_every_signin_holds_its_networks_address_client_and_place(rows):
    # The two hop figures a path kind ends with are pinned by test_story_hops.py, not here.
    assert [{k: v for k, v in r.items() if k not in HOP_KEYS} for r in rows["signin"]] == [
        _signin(
            "sg-0001",
            INCIDENT,
            CAMPUS,
            CAMPUS_IP,
            WEB,
            SEATTLE,
            "success",
            1,
            0,
            "2026-11-11T02:40:00+00:00",
        ),
        _signin(
            "sg-0002",
            INCIDENT,
            HOSTING,
            HOSTING_IP,
            REQUESTS,
            ASHBURN,
            "failure",
            14,
            15,
            "2026-11-11T10:31:08+00:00",
        ),
        _signin(
            "sg-0003",
            INCIDENT,
            HOSTING,
            HOSTING_IP,
            REQUESTS,
            ASHBURN,
            "success",
            1,
            0,
            "2026-11-11T10:47:22+00:00",
        ),
        _signin(
            "sg-0004",
            STEADY,
            CAMPUS,
            CAMPUS_IP,
            WEB,
            SEATTLE,
            "success",
            1,
            0,
            "2026-11-11T11:31:12+00:00",
        ),
    ]
    assert all(r["method"] == "password" for r in rows["signin"])
    for row in rows["signin"]:
        assert list(row) == [
            "id",
            "seat_id",
            "network_id",
            "outcome",
            "attempts",
            "window_min",
            "timestamp",
            "ip",
            "method",
            "client",
            "city",
            "country",
            "lat",
            "lng",
            *HOP_KEYS,
        ]


def test_the_request_sits_on_the_campus_network_and_the_grant_on_the_hosting_one(rows):
    assert rows["request_sample"] == [
        {
            "id": "rq-0001",
            "seat_id": INCIDENT,
            "network_id": CAMPUS,
            "timestamp": "2026-11-11T02:52:30+00:00",
            "ip": CAMPUS_IP,
            "endpoint": "/v1/messages",
            "response_code": 200,
            **_place(SEATTLE),
        }
    ]
    assert rows["credential_event"] == [
        {
            "id": "ce-0001",
            "seat_id": INCIDENT,
            "event": "grant_created",
            "lifetime_h": 720,
            "timestamp": "2026-11-11T10:49:40+00:00",
            "scope": "messages",
            "created_in": "console",
            "network_id": HOSTING,
            "ip": HOSTING_IP,
            **_place(ASHBURN),
        }
    ]
    assert list(rows["request_sample"][0]) == [
        "id",
        "seat_id",
        "network_id",
        "timestamp",
        "ip",
        "endpoint",
        "response_code",
        "city",
        "country",
        "lat",
        "lng",
    ]
    assert list(rows["credential_event"][0]) == [
        "id",
        "seat_id",
        "event",
        "lifetime_h",
        "timestamp",
        "scope",
        "created_in",
        "network_id",
        "ip",
        "city",
        "country",
        "lat",
        "lng",
    ]


def test_the_decision_is_the_row_of_today_with_a_place_at_seattle_and_nothing_else(rows):
    (golden,) = _read("decision")
    (decision,) = rows["decision"]
    assert decision == {**golden, "lat": 47.6062, "lng": -122.3321}
    assert list(decision) == [*golden, "lat", "lng"]
    assert "city" not in decision and "country" not in decision
    (org,) = (o for o in rows["org"] if o["org_name"] == "Belmaren Central")
    assert (decision["lat"], decision["lng"]) == (org["lat"], org["lng"])


def test_the_resets_sit_where_their_seat_last_was_and_the_unseen_seat_at_the_first_network(rows):
    got = [(r["id"], r["seat_id"], r["network_id"], r["city"]) for r in rows["reset"]]
    assert got == [
        ("rs-0001", EARLIER, CAMPUS, "Seattle"),
        ("rs-0002", INCIDENT, HOSTING, "Ashburn"),
        ("rs-0003", INCIDENT, HOSTING, "Ashburn"),
        ("rs-0004", INCIDENT, HOSTING, "Ashburn"),
    ]
    for row in rows["reset"]:
        place = SEATTLE if row["network_id"] == CAMPUS else ASHBURN
        assert {k: row[k] for k in ("city", "country", "lat", "lng")} == _place(place)
        assert list(row)[-5:] == ["network_id", "city", "country", "lat", "lng"], row["id"]
        assert "ip" not in row


def test_only_six_kinds_hold_a_place_and_every_one_holds_a_number_for_each_axis(rows):
    for kind in PLACED:
        for row in rows[kind]:
            for axis, bound in (("lat", 90), ("lng", 180)):
                value = row[axis]
                assert isinstance(value, float) and -bound <= value <= bound, (kind, row["id"])
    for kind in UNPLACED:
        for row in rows[kind]:
            assert not {"lat", "lng", "city", "country", "ip"} & set(row), (kind, row["id"])


def test_a_network_has_one_address_and_one_place_wherever_a_row_names_it(rows):
    seen: dict[str, set[tuple[Any, ...]]] = {}
    for kind in ("signin", "request_sample", "credential_event"):
        for row in rows[kind]:
            seen.setdefault(row["network_id"], set()).add(
                (row["ip"], row["city"], row["country"], row["lat"], row["lng"])
            )
    assert seen == {
        CAMPUS: {(CAMPUS_IP, *SEATTLE)},
        HOSTING: {(HOSTING_IP, *ASHBURN)},
    }
    for ip in (CAMPUS_IP, HOSTING_IP):
        assert any(ipaddress.ip_address(ip) in n for n in DOC_NETWORKS), ip


def test_the_grant_names_a_network_the_sign_ins_name(rows):
    named = {r["network_id"] for r in rows["signin"]}
    assert {r["network_id"] for r in rows["credential_event"]} <= named


def test_every_row_of_today_keeps_its_keys_first_and_in_order(rows):
    for kind in sp.KINDS:
        golden = _read(kind)
        for old, new in zip(golden, rows[kind], strict=True):
            assert list(new)[: len(old)] == list(old), (kind, old["id"])
