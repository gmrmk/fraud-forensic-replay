"""The fuller records of `key-many-networks` (STORIES-DATA, group D1 steps D1.1 and D1.2): the
extra fields of the five existing kinds and the case rows of three new kinds, Sign-in, Key event
and Request. Every expected value is typed here from DATA section 1 and 2 of the cases design
(`mockups/cases/DATA.md`), never imported from the generator, so the generator and this file are
two readings of the table.

What this file does not hold: the places (`lat`, `lng`), the crowd of ordinary sign-ins, the key's
path and the Layers filters. The files test_key_many_networks_places.py and
test_key_many_networks_crowd.py and the manifest test carry them. New rows are compared by
content, not by id: the ids come from `numbered` in time order, so they differ from DATA's
(PLAN-stories C4)."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta

import pytest

import seed_key_many_networks as km
from db import PROJECT_ROOT

GOLDEN = (
    PROJECT_ROOT / "backend" / "tests" / "golden" / "stories-rows-original" / "key-many-networks"
)
APPLICANT = "org-66335"
KEY_ID = "key-A26S3T9M"

ORG_KEYS = (
    "billing_city",
    "billing_country",
    "created_on",
    "seats_total",
    "seats_active_7d",
    "single_sign_on",
    "keys_active",
    "networks_30d",
    "spend_limit_usd",
    "spend_30d_usd",
)
# DATA section 1, org table: id -> the ten values above, in the table's own order.
DATA_ORGS = {
    "org-86682": ("Austin", "US", "2024-11-03", 6, 5, True, 2, 4, 1500, 812.4),
    "org-66335": ("Portland", "US", "2026-10-20", 5, 5, False, 1, 74, 6000, 5412.8),
    "org-63987": ("Chicago", "US", "2025-02-17", 8, 6, True, 1, 3, 2000, 1033.15),
    "org-78401": ("Boston", "US", "2023-09-28", 9, 7, True, 3, 5, 3000, 2210),
    "org-94329": ("Toronto", "CA", "2025-07-08", 4, 3, False, 0, 2, 500, 188.75),
    "org-77075": ("Pittsburgh", "US", "2024-04-15", 12, 9, True, 2, 6, 2500, 1490.6),
    "org-81717": ("Dublin", "IE", "2025-11-30", 6, 4, False, 1, 3, 1000, 402.1),
    "org-89273": ("London", "GB", "2024-06-21", 7, 6, True, 2, 4, 2000, 1288.35),
    "org-58628": ("New York", "US", "2023-12-04", 10, 8, True, 1, 5, 3000, 1975.5),
    "org-62879": ("Atlanta", "US", "2025-05-19", 3, 3, False, 0, 2, 500, 233.9),
    "org-38687": ("Berlin", "DE", "2024-09-09", 5, 5, True, 1, 3, 1500, 760.25),
    "org-89479": ("Denver", "US", "2025-01-27", 4, 4, False, 1, 2, 1000, 515),
    "org-36231": ("Vancouver", "CA", "2026-10-02", 14, 6, False, 2, 66, 4000, 3604.45),
}
# DATA section 1, reset table: each organisation's office network and address, in the table's
# order; the applicant's own resets come from the proxy network instead.
OFFICES = (
    ("net-202", "198.51.100.32"),
    ("net-201", "198.51.100.21"),
    ("net-203", "192.0.2.40"),
    ("net-204", "198.51.100.48"),
    ("net-205", "198.51.100.57"),
    ("net-206", "192.0.2.66"),
    ("net-207", "198.51.100.73"),
    ("net-208", "198.51.100.81"),
    ("net-209", "198.51.100.96"),
    ("net-210", "198.51.100.105"),
    ("net-211", "198.51.100.117"),
    ("net-212", "198.51.100.124"),
    None,
)
USED_BEFORE_PERCENT = [
    97, 99, 94, 100, 96, 98, 95, 100, 93, 99, 97, 98, 100,
    96, 94, 99, 97, 95, 100, 98, 96, 99, 93, 97, 100, 98,
]  # fmt: skip
# DATA section 1, principal table, in the table's order: the key, then seats 2, 4, 1, 3, 5.
PRINCIPAL_KEYS = (
    "org_id",
    "created_on",
    "created_in",
    "scopes",
    "rotations",
    "last_used_at",
    "last_network_id",
    "networks_7d",
    "requests_7d",
    "client",
)
DATA_PRINCIPALS = (
    ("2026-10-22", "console", ["messages", "files"], 0, "2026-11-11T07:55:00+00:00", "net-105", 41,
        38040, "python-httpx 0.27"),
    ("2026-10-20", "console", ["console"], 0, "2026-11-10T21:05:00+00:00", "net-201", 28, 8450,
        "console web"),
    ("2026-10-20", "console", ["console"], 0, "2026-11-10T17:40:45+00:00", "net-101", 27, 7720,
        "console web"),
    ("2026-10-20", "console", ["console"], 0, "2026-11-10T22:15:00+00:00", "net-201", 26, 8110,
        "console web"),
    ("2026-10-21", "console", ["console"], 0, "2026-11-10T19:20:00+00:00", "net-201", 25, 7860,
        "console web"),
    ("2026-10-21", "console", ["console"], 0, "2026-11-10T18:50:00+00:00", "net-201", 24, 7620,
        "console web"),
)  # fmt: skip
NETWORK_KEYS = (
    "ip",
    "host_name",
    "city",
    "country",
    "seconds_since_previous",
    "requests_on_network",
    "others_on_network",
    "first_seen_at",
    "client",
)
DATA_NETWORKS = (
    ("203.0.113.42", "cpe-42.res.example.net", "Frankfurt", "DE", 7, 2, 2,
        "2026-11-07T02:14:00+00:00", "python-httpx 0.27"),
    ("203.0.113.88", "cpe-88.res.example.net", "Warsaw", "PL", 3, 3, 1, "2026-11-08T11:30:00+00:00",
        "python-httpx 0.27"),
    ("203.0.113.131", "cpe-131.res.example.net", "Singapore", "SG", 4, 2, 1,
        "2026-11-09T22:47:00+00:00", "python-httpx 0.27"),
    ("203.0.113.204", "cpe-204.res.example.net", "Sao Paulo", "BR", 3, 5, 2,
        "2026-11-10T06:05:00+00:00", "python-httpx 0.27"),
)  # fmt: skip
DAY_KEYS = (
    "requests_by_key",
    "requests_by_seats",
    "networks",
    "input_tokens_m",
    "error_responses",
    "peak_hour_utc",
)
DATA_DAYS = (
    (1220, 4900, 6, 143.7, 31, "17:00"),
    (1490, 5990, 7, 176, 40, "18:00"),
    (1600, 6410, 7, 189.1, 38, "17:00"),
    (630, 2520, 4, 73.6, 12, "19:00"),
    (590, 2350, 4, 68.5, 9, "18:00"),
    (12880, 8580, 19, 516.5, 211, "18:00"),
    (14930, 9960, 22, 601.3, 260, "17:00"),
    (5920, 3950, 9, 236.8, 77, "16:00"),
)

# DATA section 2, case rows. A seat is written by the source's seat number (1 to 5); the test
# resolves it to the id the generator made. Columns of a sign-in: stamp, seat, outcome, method,
# client, network id, network type, address, city, country.
PROXY = ("net-101", "residential proxy", "203.0.113.17", "Amsterdam", "NL")
OFFICE = ("net-201", "corporate", "198.51.100.21", "Portland", "US")
DATA_SIGNINS = (
    ("2026-11-04T16:12:00+00:00", 1, "success", OFFICE),
    ("2026-11-05T16:40:00+00:00", 2, "success", OFFICE),
    ("2026-11-06T17:05:00+00:00", 3, "success", OFFICE),
    ("2026-11-09T17:58:10+00:00", 3, "success", PROXY),
    ("2026-11-09T17:58:40+00:00", 1, "success", PROXY),
    ("2026-11-09T17:59:05+00:00", 5, "success", PROXY),
    ("2026-11-09T17:59:30+00:00", 2, "success", PROXY),
    ("2026-11-10T17:40:30+00:00", 4, "failure", PROXY),
    ("2026-11-10T17:40:45+00:00", 4, "success", PROXY),
    ("2026-11-10T22:15:00+00:00", 1, "success", OFFICE),
)
# Columns of a key event: stamp, seat, event, change, network id, address, city, country.
DATA_KEY_EVENTS = (
    ("2026-11-05T17:20:00+00:00", 1, "scope added", "files", "net-201", "198.51.100.21", "Portland",
        "US"),
    ("2026-11-08T23:05:00+00:00", 1, "spend limit changed", "2000 to 6000 USD", "net-201",
        "198.51.100.21", "Portland", "US"),
    ("2026-11-10T17:40:55+00:00", 4, "key viewed", None, "net-101", "203.0.113.17", "Amsterdam",
        "NL"),
)  # fmt: skip
# Columns of a request: stamp, endpoint, response code, milliseconds, output tokens, network id,
# address, city, country (the network type is the proxy's on every row).
DATA_REQUESTS = (
    ("2026-11-10T17:41:03+00:00", "/v1/messages", 200, 1840, 612, "net-102", "203.0.113.42",
        "Frankfurt", "DE"),
    ("2026-11-10T17:41:06+00:00", "/v1/messages", 200, 1720, 588, "net-103", "203.0.113.88",
        "Warsaw", "PL"),
    ("2026-11-10T17:41:10+00:00", "/v1/messages", 200, 2310, 640, "net-104", "203.0.113.131",
        "Singapore", "SG"),
    ("2026-11-10T17:41:13+00:00", "/v1/messages", 200, 2050, 597, "net-105", "203.0.113.204",
        "Sao Paulo", "BR"),
    ("2026-11-09T18:00:20+00:00", "/v1/messages", 200, 1610, 702, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-09T18:01:05+00:00", "/v1/messages", 200, 1580, 655, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-09T18:02:40+00:00", "/v1/messages", 429, 95, 0, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-09T18:03:50+00:00", "/v1/messages", 200, 1690, 671, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-04T20:00:00+00:00", "/v1/messages", 200, 1450, 534, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-06T19:30:00+00:00", "/v1/files", 200, 380, 0, "net-101", "203.0.113.17", "Amsterdam",
        "NL"),
    ("2026-11-07T21:00:00+00:00", "/v1/messages", 200, 1520, 566, "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-11T07:55:00+00:00", "/v1/messages", 200, 1980, 603, "net-105", "203.0.113.204",
        "Sao Paulo", "BR"),
)  # fmt: skip


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return km.generate()


def _golden(kind: str) -> list[dict]:
    return json.loads((GOLDEN / f"{kind}.json").read_text("utf-8"))


def _seat(rows: dict[str, list[dict]], number: int) -> str:
    """The id of seat `number` (the source's seat number): its principal's name is `Seat N`."""
    (found,) = [
        p["principal_id"] for p in rows["principal"] if p["principal_name"] == f"Seat {number}"
    ]
    return found


def _without_id(row: dict) -> dict:
    """The row's case columns: no id (it comes from `numbered`), no place (the places are tested
    in test_key_many_networks_places.py) and no hop figure (test_story_hops.py pins them)."""
    left_out = ("id", "lat", "lng", "seconds_since_previous", "km_from_previous")
    return {k: v for k, v in row.items() if k not in left_out}


# ---- D1.1: the fuller fields of the five existing kinds --------------------------------------


def test_the_org_rows_hold_the_account_controls_and_spend_values_of_the_table(rows):
    assert [o["org_id"] for o in rows["org"]] == list(DATA_ORGS)
    for org in rows["org"]:
        assert tuple(org[k] for k in ORG_KEYS) == DATA_ORGS[org["org_id"]], org["id"]
        assert type(org["single_sign_on"]) is bool
        for key in ("spend_limit_usd", "spend_30d_usd"):
            assert type(org[key]) in (int, float), (org["id"], key)


def test_the_admin_seat_is_the_seat_of_the_organisations_earliest_reset(rows):
    by_id = {o["org_id"]: o for o in rows["org"]}
    # The applicant's admin is the seat the source calls Seat 1; the one organisation with no
    # reset has no admin seat on file (PLAN-stories C5): the value is None, not a coined id.
    assert by_id[APPLICANT]["admin_seat_id"] == _seat(rows, 1) == "seat-27310"
    assert rows["org"][-1]["org_id"] == "org-36231" and rows["org"][-1]["admin_seat_id"] is None
    others = [o for o in rows["org"] if o["org_id"] not in (APPLICANT, "org-36231")]
    assert len(others) == 11
    for org in others:
        earliest = min(
            (r for r in rows["reset"] if r["org_id"] == org["org_id"]), key=lambda r: r["timestamp"]
        )
        assert org["admin_seat_id"] == earliest["seat_id"], org["id"]
    assert all("admin_seat_id" in o for o in rows["org"])


def test_the_principal_rows_hold_the_setup_and_use_values_of_the_table(rows):
    assert len(rows["principal"]) == len(DATA_PRINCIPALS)
    for principal, expected in zip(rows["principal"], DATA_PRINCIPALS, strict=True):
        assert principal["org_id"] == APPLICANT
        assert tuple(principal[k] for k in PRINCIPAL_KEYS[1:]) == expected, principal["id"]
    assert rows["principal"][0]["id"] == KEY_ID


def test_the_four_network_rows_hold_their_address_and_activity(rows):
    for net, expected in zip(rows["network_seen"], DATA_NETWORKS, strict=True):
        assert tuple(net[k] for k in NETWORK_KEYS) == expected, net["id"]
    assert rows["network_seen"][3]["id"] == "nw-0004"


def test_every_reset_holds_its_request_and_limit_values(rows):
    resets = rows["reset"]
    assert [r["used_before_percent"] for r in resets] == USED_BEFORE_PERCENT
    org_ids = [o["org_id"] for o in rows["org"]]
    for reset, percent in zip(resets, USED_BEFORE_PERCENT, strict=True):
        assert reset["channel"] == "console"
        assert reset["limit_name"] == "weekly limit"
        assert reset["offer_code"] == "offer-1109"
        assert reset["requests_before"] == 40 * percent
        if reset["org_id"] == APPLICANT:
            assert (reset["network_id"], reset["ip"]) == ("net-101", "203.0.113.17"), reset["id"]
        else:
            office = OFFICES[org_ids.index(reset["org_id"])]
            assert office is not None
            assert (reset["network_id"], reset["ip"]) == office, reset["id"]
    assert sum(1 for r in resets if r["network_id"] == "net-101") == 4


def test_the_day_rows_hold_the_split_and_load_values(rows):
    assert len(rows["usage_day"]) == len(DATA_DAYS)
    for day, expected in zip(rows["usage_day"], DATA_DAYS, strict=True):
        assert tuple(day[k] for k in DAY_KEYS) == expected, day["id"]
    assert rows["usage_day"][5]["id"] == "ud-0006"


@pytest.mark.parametrize("kind", ["org", "principal", "network_seen", "reset", "usage_day"])
def test_a_fuller_row_keeps_todays_keys_first_and_in_order(rows, kind):
    old = _golden(kind)
    assert [r["id"] for r in rows[kind]] == [r["id"] for r in old]
    for new_row, old_row in zip(rows[kind], old, strict=True):
        assert list(new_row)[: len(old_row)] == list(old_row), new_row["id"]
        assert len(new_row) > len(old_row), new_row["id"]


def test_the_decision_row_is_todays_row_with_no_other_change(rows):
    # The decision is not changed by the fuller records: same id, status, outcome, note, event
    # ids and time. It gains only its place (tested in test_key_many_networks_places.py).
    assert [{k: v for k, v in d.items() if k not in ("lat", "lng")} for d in rows["decision"]] == (
        _golden("decision")
    )


def test_a_fuller_value_is_a_typed_constant_and_the_ids_are_the_same_as_before(rows):
    assert [o["id"] for o in rows["org"]] == [o["id"] for o in _golden("org")]
    assert [p["id"] for p in rows["principal"]] == [p["id"] for p in _golden("principal")]
    assert [r["seat_id"] for r in rows["reset"]] == [r["seat_id"] for r in _golden("reset")]


# ---- D1.2: three new kinds ---------------------------------------------------------------


def _expected_signins(rows: dict[str, list[dict]]) -> list[dict]:
    out = []
    for stamp, seat, outcome, (net, kind, ip, city, country) in DATA_SIGNINS:
        out.append(
            {
                "timestamp": stamp,
                "seat_id": _seat(rows, seat),
                "org_id": APPLICANT,
                "outcome": outcome,
                "method": "password",
                "client": "console web",
                "network_id": net,
                "network_type": kind,
                "ip": ip,
                "city": city,
                "country": country,
            }
        )
    return out


def test_the_signin_rows_hold_the_ten_case_rows_of_the_table_and_the_crowd(rows):
    # The ten case rows are the applicant's; the other 44 are the crowd, tested in
    # test_key_many_networks_crowd.py.
    got = [_without_id(r) for r in rows["signin"] if r["org_id"] == APPLICANT]
    assert sorted(got, key=lambda r: r["timestamp"]) == sorted(
        _expected_signins(rows), key=lambda r: r["timestamp"]
    )
    assert len(rows["signin"]) == 54
    # Keys: the stamp first, then the sign-in and address columns.
    assert list(rows["signin"][0])[:12] == [
        "id",
        "timestamp",
        "seat_id",
        "org_id",
        "outcome",
        "method",
        "client",
        "network_id",
        "network_type",
        "ip",
        "city",
        "country",
    ]
    assert {r["outcome"] for r in rows["signin"]} == {"success", "failure"}
    # One failure among the case rows and two among the crowd's ordinary mornings.
    assert sum(1 for r in rows["signin"] if r["outcome"] == "failure") == 3


def test_the_key_event_rows_are_the_three_case_rows_of_the_table(rows):
    expected = [
        {
            "timestamp": stamp,
            "principal_id": KEY_ID,
            "event": event,
            "change": change,
            "seat_id": _seat(rows, seat),
            "channel": "console",
            "network_id": net,
            "ip": ip,
            "city": city,
            "country": country,
        }
        for stamp, seat, event, change, net, ip, city, country in DATA_KEY_EVENTS
    ]
    assert [_without_id(r) for r in rows["key_event"]] == sorted(
        expected, key=lambda r: (r["timestamp"], r["principal_id"])
    )
    assert list(rows["key_event"][0])[:11] == [
        "id",
        "timestamp",
        "principal_id",
        "event",
        "change",
        "seat_id",
        "channel",
        "network_id",
        "ip",
        "city",
        "country",
    ]
    # A key event with no change holds the key with a null value, as the table prints it.
    assert [r["change"] for r in rows["key_event"]].count(None) == 1


def test_the_request_rows_are_the_twelve_case_rows_of_the_table(rows):
    expected = [
        {
            "timestamp": stamp,
            "principal_id": KEY_ID,
            "endpoint": endpoint,
            "response_code": code,
            "milliseconds": millis,
            "output_tokens": tokens,
            "network_id": net,
            "network_type": "residential proxy",
            "ip": ip,
            "city": city,
            "country": country,
        }
        for stamp, endpoint, code, millis, tokens, net, ip, city, country in DATA_REQUESTS
    ]
    got = [_without_id(r) for r in rows["request_sample"]]
    assert sorted(got, key=lambda r: r["timestamp"]) == sorted(
        expected, key=lambda r: str(r["timestamp"])
    )
    assert list(rows["request_sample"][0])[:12] == [
        "id",
        "timestamp",
        "principal_id",
        "endpoint",
        "response_code",
        "milliseconds",
        "output_tokens",
        "network_id",
        "network_type",
        "ip",
        "city",
        "country",
    ]


@pytest.mark.parametrize(
    ("kind", "prefix"), [("signin", "si"), ("key_event", "ke"), ("request_sample", "rq")]
)
def test_new_ids_are_numbered_in_time_order_with_their_own_prefix(rows, kind, prefix):
    ids = [r["id"] for r in rows[kind]]
    assert ids == [f"{prefix}-{i:04d}" for i in range(1, len(ids) + 1)]
    stamps = [r["timestamp"] for r in rows[kind]]
    assert stamps == sorted(stamps)
    taken = {r["id"] for k in km.KINDS if k not in (kind,) for r in rows[k]}
    assert not taken & set(ids)


def test_a_new_kind_holds_no_row_of_the_old_kinds_and_every_stamp_is_utc_in_the_span(rows):
    low = datetime(2026, 11, 4, 8, 0, 0, tzinfo=UTC)
    high = datetime.fromisoformat(rows["decision"][0]["decided_at"])
    assert high == datetime(2026, 11, 11, 9, 0, 0, tzinfo=UTC)
    for kind in ("signin", "key_event", "request_sample"):
        for row in rows[kind]:
            at = datetime.fromisoformat(row["timestamp"])
            assert at.utcoffset() == timedelta(0), row["id"]
            assert low <= at <= high, row["id"]
    # The existing kinds keep their counts: no row is added to or taken from one.
    for kind in ("org", "principal", "network_seen", "reset", "usage_day", "decision"):
        assert len(rows[kind]) == len(_golden(kind)), kind


def test_the_new_rows_use_documentation_addresses_and_say_nothing_of_a_verdict(rows):
    ranges = ("192.0.2.", "198.51.100.", "203.0.113.")
    for kind in ("signin", "key_event", "request_sample"):
        for row in rows[kind]:
            assert row["ip"].startswith(ranges), row["id"]
            assert not [k for k in row if re.search(r"fraud|label|truth|verdict|^is_", k, re.I)]
