"""The crowd of ordinary sign-ins of `key-many-networks` (STORIES-DATA, group D1 step D1.3): 44 of
the 54 rows of the Sign-in kind are the sign-ins of the twelve other organisations' seats, made by
a fixed rule over the limit resets (no random value). The expected rows are typed below from
DATA section 3 of the cases design (`mockups/cases/DATA.md`), never imported from the generator,
so the generator and this file are two readings of the table. New rows are compared by content,
not by id: the ids come from `numbered` in time order (PLAN-stories C4).

The rule, in words: each reset of an organisation other than the applicant's, taken in id order
(place p, 0 to 21), gives two sign-ins of the same seat on its organisation's office network. One
is an ordinary morning, on 4 to 8 Nov (day 4 + p mod 5, at 09:00 office time plus 11 p minutes
mod 60); the other is on 9 Nov, 95 plus (13 p mod 120) seconds before the reset's stamp. The 6th
and the 15th ordinary morning (p 5 and p 14) are failures. The method is single sign-on where the
organisation has it, else password. Every crowd row holds the client `console web`.

What this file does not hold: the places of the rows (test_key_many_networks_places.py), the
manifest's declarations (test_key_many_networks_manifest.py) and the fields of the older kinds
(test_key_many_networks_fuller.py)."""

from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest

import seed_key_many_networks as km
from db import PROJECT_ROOT

GOLDEN = (
    PROJECT_ROOT / "backend" / "tests" / "golden" / "stories-rows-original" / "key-many-networks"
)
APPLICANT = "org-66335"

# DATA section 3, in the table's own order: (stamp, seat, org, outcome, method, network, network
# type, address, city, country, lat, lng).
# fmt: off
CROWD = (
    ("2026-11-04T15:00:00+00:00", "seat-99471", "org-86682", "success", "single sign-on", "net-202",
        "corporate", "198.51.100.32", "Austin", "US", 30.2672, -97.7431),
    ("2026-11-09T17:59:03+00:00", "seat-99471", "org-86682", "success", "single sign-on", "net-202",
        "corporate", "198.51.100.32", "Austin", "US", 30.2672, -97.7431),
    ("2026-11-05T15:11:00+00:00", "seat-52183", "org-63987", "success", "single sign-on", "net-203",
        "education", "192.0.2.40", "Chicago", "US", 41.8781, -87.6298),
    ("2026-11-09T17:58:56+00:00", "seat-52183", "org-63987", "success", "single sign-on", "net-203",
        "education", "192.0.2.40", "Chicago", "US", 41.8781, -87.6298),
    ("2026-11-06T14:22:00+00:00", "seat-22978", "org-78401", "success", "single sign-on", "net-204",
        "corporate", "198.51.100.48", "Boston", "US", 42.3601, -71.0589),
    ("2026-11-09T17:58:46+00:00", "seat-22978", "org-78401", "success", "single sign-on", "net-204",
        "corporate", "198.51.100.48", "Boston", "US", 42.3601, -71.0589),
    ("2026-11-07T14:33:00+00:00", "seat-66423", "org-94329", "success", "password", "net-205",
        "corporate", "198.51.100.57", "Toronto", "CA", 43.6532, -79.3832),
    ("2026-11-09T17:58:38+00:00", "seat-66423", "org-94329", "success", "password", "net-205",
        "corporate", "198.51.100.57", "Toronto", "CA", 43.6532, -79.3832),
    ("2026-11-08T14:44:00+00:00", "seat-80366", "org-77075", "success", "single sign-on", "net-206",
        "education", "192.0.2.66", "Pittsburgh", "US", 40.4406, -79.9959),
    ("2026-11-09T17:58:28+00:00", "seat-80366", "org-77075", "success", "single sign-on", "net-206",
        "education", "192.0.2.66", "Pittsburgh", "US", 40.4406, -79.9959),
    ("2026-11-04T09:55:00+00:00", "seat-38171", "org-81717", "failure", "password", "net-207",
        "corporate", "198.51.100.73", "Dublin", "IE", 53.3498, -6.2603),
    ("2026-11-09T17:58:21+00:00", "seat-38171", "org-81717", "success", "password", "net-207",
        "corporate", "198.51.100.73", "Dublin", "IE", 53.3498, -6.2603),
    ("2026-11-05T09:06:00+00:00", "seat-54570", "org-89273", "success", "single sign-on", "net-208",
        "corporate", "198.51.100.81", "London", "GB", 51.5072, -0.1276),
    ("2026-11-09T17:58:10+00:00", "seat-54570", "org-89273", "success", "single sign-on", "net-208",
        "corporate", "198.51.100.81", "London", "GB", 51.5072, -0.1276),
    ("2026-11-06T14:17:00+00:00", "seat-79342", "org-58628", "success", "single sign-on", "net-209",
        "corporate", "198.51.100.96", "New York", "US", 40.7128, -74.006),
    ("2026-11-09T17:58:04+00:00", "seat-79342", "org-58628", "success", "single sign-on", "net-209",
        "corporate", "198.51.100.96", "New York", "US", 40.7128, -74.006),
    ("2026-11-07T14:28:00+00:00", "seat-39773", "org-62879", "success", "password", "net-210",
        "corporate", "198.51.100.105", "Atlanta", "US", 33.749, -84.388),
    ("2026-11-09T17:57:58+00:00", "seat-39773", "org-62879", "success", "password", "net-210",
        "corporate", "198.51.100.105", "Atlanta", "US", 33.749, -84.388),
    ("2026-11-08T08:39:00+00:00", "seat-20862", "org-38687", "success", "single sign-on", "net-211",
        "corporate", "198.51.100.117", "Berlin", "DE", 52.52, 13.405),
    ("2026-11-09T17:57:52+00:00", "seat-20862", "org-38687", "success", "single sign-on", "net-211",
        "corporate", "198.51.100.117", "Berlin", "DE", 52.52, 13.405),
    ("2026-11-04T16:50:00+00:00", "seat-40426", "org-89479", "success", "password", "net-212",
        "corporate", "198.51.100.124", "Denver", "US", 39.7392, -104.9903),
    ("2026-11-09T17:59:47+00:00", "seat-40426", "org-89479", "success", "password", "net-212",
        "corporate", "198.51.100.124", "Denver", "US", 39.7392, -104.9903),
    ("2026-11-05T14:01:00+00:00", "seat-64271", "org-94329", "success", "password", "net-205",
        "corporate", "198.51.100.57", "Toronto", "CA", 43.6532, -79.3832),
    ("2026-11-09T18:00:46+00:00", "seat-64271", "org-94329", "success", "password", "net-205",
        "corporate", "198.51.100.57", "Toronto", "CA", 43.6532, -79.3832),
    ("2026-11-06T14:12:00+00:00", "seat-52198", "org-62879", "success", "password", "net-210",
        "corporate", "198.51.100.105", "Atlanta", "US", 33.749, -84.388),
    ("2026-11-09T18:00:41+00:00", "seat-52198", "org-62879", "success", "password", "net-210",
        "corporate", "198.51.100.105", "Atlanta", "US", 33.749, -84.388),
    ("2026-11-07T15:23:00+00:00", "seat-73007", "org-63987", "success", "single sign-on", "net-203",
        "education", "192.0.2.40", "Chicago", "US", 41.8781, -87.6298),
    ("2026-11-09T18:00:45+00:00", "seat-73007", "org-63987", "success", "single sign-on", "net-203",
        "education", "192.0.2.40", "Chicago", "US", 41.8781, -87.6298),
    ("2026-11-08T09:34:00+00:00", "seat-29174", "org-81717", "failure", "password", "net-207",
        "corporate", "198.51.100.73", "Dublin", "IE", 53.3498, -6.2603),
    ("2026-11-09T18:00:39+00:00", "seat-29174", "org-81717", "success", "password", "net-207",
        "corporate", "198.51.100.73", "Dublin", "IE", 53.3498, -6.2603),
    ("2026-11-04T14:45:00+00:00", "seat-44512", "org-58628", "success", "single sign-on", "net-209",
        "corporate", "198.51.100.96", "New York", "US", 40.7128, -74.006),
    ("2026-11-09T18:00:31+00:00", "seat-44512", "org-58628", "success", "single sign-on", "net-209",
        "corporate", "198.51.100.96", "New York", "US", 40.7128, -74.006),
    ("2026-11-05T15:56:00+00:00", "seat-90740", "org-86682", "success", "single sign-on", "net-202",
        "corporate", "198.51.100.32", "Austin", "US", 30.2672, -97.7431),
    ("2026-11-09T18:00:24+00:00", "seat-90740", "org-86682", "success", "single sign-on", "net-202",
        "corporate", "198.51.100.32", "Austin", "US", 30.2672, -97.7431),
    ("2026-11-06T16:07:00+00:00", "seat-96137", "org-89479", "success", "password", "net-212",
        "corporate", "198.51.100.124", "Denver", "US", 39.7392, -104.9903),
    ("2026-11-09T18:00:22+00:00", "seat-96137", "org-89479", "success", "password", "net-212",
        "corporate", "198.51.100.124", "Denver", "US", 39.7392, -104.9903),
    ("2026-11-07T14:18:00+00:00", "seat-26427", "org-78401", "success", "single sign-on", "net-204",
        "corporate", "198.51.100.48", "Boston", "US", 42.3601, -71.0589),
    ("2026-11-09T18:00:12+00:00", "seat-26427", "org-78401", "success", "single sign-on", "net-204",
        "corporate", "198.51.100.48", "Boston", "US", 42.3601, -71.0589),
    ("2026-11-08T14:29:00+00:00", "seat-35329", "org-77075", "success", "single sign-on", "net-206",
        "education", "192.0.2.66", "Pittsburgh", "US", 40.4406, -79.9959),
    ("2026-11-09T18:02:06+00:00", "seat-35329", "org-77075", "success", "single sign-on", "net-206",
        "education", "192.0.2.66", "Pittsburgh", "US", 40.4406, -79.9959),
    ("2026-11-04T09:40:00+00:00", "seat-62800", "org-89273", "success", "single sign-on", "net-208",
        "corporate", "198.51.100.81", "London", "GB", 51.5072, -0.1276),
    ("2026-11-09T18:01:58+00:00", "seat-62800", "org-89273", "success", "single sign-on", "net-208",
        "corporate", "198.51.100.81", "London", "GB", 51.5072, -0.1276),
    ("2026-11-05T08:51:00+00:00", "seat-85678", "org-38687", "success", "single sign-on", "net-211",
        "corporate", "198.51.100.117", "Berlin", "DE", 52.52, 13.405),
    ("2026-11-09T18:01:48+00:00", "seat-85678", "org-38687", "success", "single sign-on", "net-211",
        "corporate", "198.51.100.117", "Berlin", "DE", 52.52, 13.405),
)
# fmt: on


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return km.generate()


def _golden(kind: str) -> list[dict]:
    return json.loads((GOLDEN / f"{kind}.json").read_text("utf-8"))


def _crowd_rows(rows: dict[str, list[dict]]) -> list[dict]:
    """The sign-ins of every organisation but the applicant's: the crowd."""
    return [r for r in rows["signin"] if r["org_id"] != APPLICANT]


def _content(row: dict) -> tuple:
    """The ten columns a sign-in is compared by (no id, no place)."""
    return (
        row["timestamp"],
        row["seat_id"],
        row["org_id"],
        row["outcome"],
        row["method"],
        row["network_id"],
        row["network_type"],
        row["ip"],
        row["city"],
        row["country"],
    )


def test_the_signin_kind_holds_54_rows_and_44_are_the_crowd(rows):
    assert len(rows["signin"]) == 54
    assert len(_crowd_rows(rows)) == 44 == len(CROWD)
    # The ten case rows are the applicant's, as before the crowd.
    assert sum(1 for r in rows["signin"] if r["org_id"] == APPLICANT) == 10


def test_the_crowd_is_the_44_rows_of_the_table_by_content(rows):
    got = sorted(_content(r) for r in _crowd_rows(rows))
    want = sorted(row[:10] for row in CROWD)
    assert got == want
    # Every crowd row holds the one client.
    assert {r["client"] for r in _crowd_rows(rows)} == {"console web"}


def test_each_reset_of_another_organisation_has_two_signins_of_its_seat(rows):
    """One on 4 to 8 Nov, one on 9 Nov strictly before the reset's own stamp."""
    others = [r for r in rows["reset"] if r["org_id"] != APPLICANT]
    assert len(others) == 22
    crowd = _crowd_rows(rows)
    for reset in others:
        mine = [r for r in crowd if r["seat_id"] == reset["seat_id"]]
        assert len(mine) == 2, reset["id"]
        early, late = sorted(mine, key=lambda r: r["timestamp"])
        assert reset["org_id"] == early["org_id"] == late["org_id"]
        assert 4 <= datetime.fromisoformat(early["timestamp"]).day <= 8, reset["id"]
        assert datetime.fromisoformat(late["timestamp"]).date().isoformat() == "2026-11-09"
        assert datetime.fromisoformat(late["timestamp"]) < datetime.fromisoformat(
            reset["timestamp"]
        )
        # 95 to 214 seconds before the stamp (95 plus 13 p mod 120).
        gap = datetime.fromisoformat(reset["timestamp"]) - datetime.fromisoformat(late["timestamp"])
        assert timedelta(seconds=95) <= gap <= timedelta(seconds=214), reset["id"]


def test_the_network_types_over_all_54_are_corporate_40_education_8_and_proxy_6(rows):
    kinds = Counter(r["network_type"] for r in rows["signin"])
    assert kinds == {"corporate": 40, "education": 8, "residential proxy": 6}


def test_three_rows_by_content(rows):
    by = {(r["seat_id"], r["timestamp"]): r for r in rows["signin"]}
    first = by[("seat-99471", "2026-11-04T15:00:00+00:00")]
    second = by[("seat-99471", "2026-11-09T17:59:03+00:00")]
    for row in (first, second):
        assert (row["method"], row["network_id"], row["ip"], row["city"]) == (
            "single sign-on",
            "net-202",
            "198.51.100.32",
            "Austin",
        )
        assert row["outcome"] == "success"
    dublin = by[("seat-38171", "2026-11-04T09:55:00+00:00")]
    assert (dublin["outcome"], dublin["method"], dublin["network_id"], dublin["city"]) == (
        "failure",
        "password",
        "net-207",
        "Dublin",
    )
    assert by[("seat-29174", "2026-11-08T09:34:00+00:00")]["outcome"] == "failure"


def test_two_ordinary_mornings_fail_and_so_does_the_one_case_row(rows):
    failures = [r for r in rows["signin"] if r["outcome"] == "failure"]
    assert len(failures) == 3
    assert sorted(r["seat_id"] for r in failures if r["org_id"] != APPLICANT) == [
        "seat-29174",
        "seat-38171",
    ]


def test_no_signin_is_in_the_decisions_event_list_and_the_decision_is_as_before(rows):
    listed = set(rows["decision"][0]["event_ids"])
    assert not {r["id"] for r in rows["signin"]} & listed
    old = _golden("decision")[0]
    new = rows["decision"][0]
    for key, value in old.items():
        assert new[key] == value, key


def test_the_sign_in_ids_run_in_time_order_with_the_crowd_among_them(rows):
    ids = [r["id"] for r in rows["signin"]]
    assert ids == [f"si-{i:04d}" for i in range(1, 55)]
    stamps = [r["timestamp"] for r in rows["signin"]]
    assert stamps == sorted(stamps)
    low = datetime(2026, 11, 4, 8, 0, 0, tzinfo=UTC)
    high = datetime.fromisoformat(rows["decision"][0]["decided_at"])
    for r in rows["signin"]:
        at = datetime.fromisoformat(r["timestamp"])
        assert at.utcoffset() == timedelta(0) and low <= at <= high, r["id"]
