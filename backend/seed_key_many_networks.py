"""The `key-many-networks` pack: one static key and five seats that change network again and
again, twelve organisations whose seats redeem a limit reset within four minutes of an offer
opening, and a daily request count that steps up more than sevenfold (story 1 of
DESIGN-CASES.md, item K1).

The pack takes counts, times, durations and category words from the other project's case 1 data
file, typed below as named constants with the file and line they come from (`S1:<line>` is
`src/data/case-1.js`). Nothing else is carried over: every id, seat, key, network label and
organisation name is coined here, and the generator opens no file of that project. The key and
the seats are labelled "Key" and "Seat N" (N is the source's seat number); the networks are
`net-NNN` from 101 (V6); the organisation names are written below and are made up. The source
states a plan for the applicant's two organisations only (S1:21), so `plan` is empty on the
other eleven and is never filled with a guess. No row has a rule or an arrow (V8); the places of
the fuller story are described below.

Times in the source are Pacific, UTC-8 (S1:349); the rows are UTC (V4). An untimed row (an
organisation, a key or a seat) has `timestamp` 0. The decision row waits for review and lists
every timed row its note counts; the note holds counts the rows show and no conclusion.

The fuller story (STORIES-DATA, group D1) adds fields to the five kinds and three kinds of case
rows, Sign-in, Key event and Request, then a crowd of 44 ordinary sign-ins made by a rule over the
resets, then a place (`lat`, `lng`) on the organisations, the four network rows, the three new
kinds and the one decision (placed at its organisation's billing city). Those values are made up
for the fuller story and no file backs them. Every one is a typed constant or a rule over existing
rows; none is drawn from `rng`, so every id of the story is the id it had before, and the three
new kinds are numbered by time. An existing row keeps every key and value and gains its new keys
after them.

Every network has a city (`NETWORKS`, built from the constants below), and every row that names a
network draws there: the limit resets, which name their organisation's office network or the
applicant's proxy exit, take its place like the sign-ins, key events and requests do.

Two kinds are paths, the key's network rows and each seat's sign-ins, and each of their rows holds
the seconds and the km of the hop that ends at it (`hop_figures`, worked out from the stamps and
the places, never typed).

Usage: `python -m seed_key_many_networks` from backend/ writes data/key-many-networks/<kind>.json
and the empty pack DB data/key-many-networks.db. The pack is a pure function of this module: one
`random.Random(SEED)` makes the ids and nothing else (no count, time or order is random).
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from db import PROJECT_ROOT
from seed_packs import Place, hop_figures, iso, numbered, place_row, write_pack

Row = dict[str, Any]

DATA_DIR = PROJECT_ROOT / "data" / "key-many-networks"
DB_PATH = PROJECT_ROOT / "data" / "key-many-networks.db"
KINDS = (
    "org",
    "principal",
    "network_seen",
    "reset",
    "usage_day",
    "signin",
    "key_event",
    "request_sample",
    "decision",
)
SEED = 2026111801  # V12: the design's date and the story's number

PACIFIC = timezone(timedelta(hours=-8), "PT")  # S1:349: "US Pacific ... (UTC-8)"

# S1:355: the offer opened on 9 Nov at 10:00:00 at UTC-8 (18:00:00 UTC); each reset stamp is
# that plus its seconds after the offer opened (S1:380-385).
OFFER_OPEN = datetime(2026, 11, 9, 10, 0, 0, tzinfo=PACIFIC)

# S1:363-374, in the source's order: (seats redeemed, first redemption, last redemption), the
# seconds after the offer opened. The applicant is the second row (S1:364, flagged at S1:376).
RESET_ORGS = (
    (5, 38, 207),
    (5, 41, 213),
    (4, 44, 189),
    (5, 47, 221),
    (3, 52, 164),
    (5, 55, 228),
    (4, 61, 196),
    (5, 63, 233),
    (4, 70, 201),
    (3, 77, 172),
    (5, 84, 236),
    (4, 92, 218),
)
APPLICANT_AT = 1  # S1:364

# S1:382-385: the applicant's four stamped redemptions, as (seconds after open, seat number).
APPLICANT_RESETS = ((41, 3), (86, 1), (158, 5), (213, 2))

# S1:283-288, in the source's order: (seat number or None for the key, networks seen in 18 days,
# requests in 18 days). The key is the static credential; the seats are the five people.
PRINCIPALS = (
    (None, 44, 42950),
    (2, 31, 15210),
    (4, 30, 14420),
    (1, 29, 14880),
    (3, 27, 13960),
    (5, 26, 13790),
)
NETWORKS_BOTH_ORGS = 61  # S1:283-288, the last column of every row: both organisations' networks

# S1:296-299: four sample rows of the key on 10 Nov at 09:41 Pacific, seconds :02, :05, :09,
# :12 (gaps 3, 4, 3 s). The first row also states the network it came from; the five networks
# of the chain are numbered here in order from 101. All four are residential-proxy exits.
NETWORK_SECONDS = (2, 5, 9, 12)
NETWORK_DAY_START = datetime(2026, 11, 10, 9, 41, 0, tzinfo=PACIFIC)
NETWORK_TYPE = "residential proxy"
FIRST_NETWORK = 101

# S1:199-207 and S1:210: eight Pacific days from Wed 4 Nov to Wed 11 Nov (the last partial):
# (requests, output tokens in millions). A Pacific day starts at 08:00 UTC in November (V4).
FIRST_DAY = datetime(2026, 11, 4, 0, 0, 0, tzinfo=PACIFIC)
DAYS = (
    (6120, 44.9),
    (7480, 55.0),
    (8010, 59.1),
    (3150, 23.0),
    (2940, 21.4),
    (21460, 161.4),
    (24890, 187.9),
    (9870, 74.0),
)

# S1:21: the applicant holds a Team plan and a second, Console organisation. S1 states no plan
# for the eleven others, so theirs is empty.
APPLICANT_PLAN, CONSOLE_PLAN = "team", "console"

# The thirteen organisation names are made up: the twelve of the limit-reset table in its order,
# then the applicant's second organisation.
ORG_NAMES = (
    "Halvern Labs",
    "Oskerby Holdings",
    "Larkhaven Interactive",
    "Marrowgate Digital",
    "Pennick Analytics",
    "Dunsley Robotics",
    "Veldmark Studio",
    "Fairlock Software",
    "Corbel Partners",
    "Ashgrove Dynamics",
    "Tessaly Data",
    "Brindle Ventures",
    "Wexcombe Logistics",
)

# ---- The fuller records (made up for the fuller story; no source names them) ---------------------

# Per organisation, in ORG_NAMES order: (billing city, billing country, created on, seats total,
# seats active in 7 days, single sign-on, keys active, networks in 30 days, spend limit in USD,
# spend in the last 30 days in USD). The admin seat is derived from the resets in `generate`.
# fmt: off
ORG_FACTS = (
    ("Austin", "US", "2024-11-03", 6, 5, True, 2, 4, 1500, 812.4),
    ("Portland", "US", "2026-10-20", 5, 5, False, 1, 74, 6000, 5412.8),
    ("Chicago", "US", "2025-02-17", 8, 6, True, 1, 3, 2000, 1033.15),
    ("Boston", "US", "2023-09-28", 9, 7, True, 3, 5, 3000, 2210),
    ("Toronto", "CA", "2025-07-08", 4, 3, False, 0, 2, 500, 188.75),
    ("Pittsburgh", "US", "2024-04-15", 12, 9, True, 2, 6, 2500, 1490.6),
    ("Dublin", "IE", "2025-11-30", 6, 4, False, 1, 3, 1000, 402.1),
    ("London", "GB", "2024-06-21", 7, 6, True, 2, 4, 2000, 1288.35),
    ("New York", "US", "2023-12-04", 10, 8, True, 1, 5, 3000, 1975.5),
    ("Atlanta", "US", "2025-05-19", 3, 3, False, 0, 2, 500, 233.9),
    ("Berlin", "DE", "2024-09-09", 5, 5, True, 1, 3, 1500, 760.25),
    ("Denver", "US", "2025-01-27", 4, 4, False, 1, 2, 1000, 515),
    ("Vancouver", "CA", "2026-10-02", 14, 6, False, 2, 66, 4000, 3604.45),
)
# fmt: on

# Per organisation, in ORG_NAMES order: its office network as (network id, network type, address,
# hours from UTC at the office in November) or None for the one organisation with no reset. The
# applicant's own resets come from the proxy network below, not from its office.
OFFICES = (
    ("net-202", "corporate", "198.51.100.32", -6),
    ("net-201", "corporate", "198.51.100.21", -8),
    ("net-203", "education", "192.0.2.40", -6),
    ("net-204", "corporate", "198.51.100.48", -5),
    ("net-205", "corporate", "198.51.100.57", -5),
    ("net-206", "education", "192.0.2.66", -5),
    ("net-207", "corporate", "198.51.100.73", 0),
    ("net-208", "corporate", "198.51.100.81", 0),
    ("net-209", "corporate", "198.51.100.96", -5),
    ("net-210", "corporate", "198.51.100.105", -5),
    ("net-211", "corporate", "198.51.100.117", 1),
    ("net-212", "corporate", "198.51.100.124", -7),
    None,
)
# The network of the applicant's resets: (id, type, address, city, country). Its place is
# PROXY_PLACE below, so the city is typed here once and the coordinates there once.
PROXY = ("net-101", NETWORK_TYPE, "203.0.113.17", "Amsterdam", "NL")

# In PRINCIPALS order: (created on, created in, scopes, rotations, last used at, last network,
# networks in 7 days, requests in 7 days, client).
# fmt: off
PRINCIPAL_FACTS = (
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
)

# In row order of the four network rows: (address, host name, city, country, requests on the
# network, other principals on it, first seen at, client). The seconds since the previous network
# are not typed here: `hop_figures` works them out (7, 3, 4 and 3), with the km, from the stamps.
NETWORK_FACTS = (
    ("203.0.113.42", "cpe-42.res.example.net", "Frankfurt", "DE", 2, 2,
        "2026-11-07T02:14:00+00:00", "python-httpx 0.27"),
    ("203.0.113.88", "cpe-88.res.example.net", "Warsaw", "PL", 3, 1, "2026-11-08T11:30:00+00:00",
        "python-httpx 0.27"),
    ("203.0.113.131", "cpe-131.res.example.net", "Singapore", "SG", 2, 1,
        "2026-11-09T22:47:00+00:00", "python-httpx 0.27"),
    ("203.0.113.204", "cpe-204.res.example.net", "Sao Paulo", "BR", 5, 2,
        "2026-11-10T06:05:00+00:00", "python-httpx 0.27"),
)
# fmt: on

# The share of the weekly limit used before each reset, in reset id order (26 rows); the requests
# before are `REQUESTS_PER_PERCENT` times it.
USED_BEFORE_PERCENT = (
    97, 99, 94, 100, 96, 98, 95, 100, 93, 99, 97, 98, 100,
    96, 94, 99, 97, 95, 100, 98, 96, 99, 93, 97, 100, 98,
)  # fmt: skip
REQUESTS_PER_PERCENT = 40
RESET_CHANNEL, LIMIT_NAME, OFFER_CODE = "console", "weekly limit", "offer-1109"

# In DAYS order: (requests by the key, requests by seats, networks, input tokens in millions,
# error responses, peak hour in UTC).
DAY_FACTS = (
    (1220, 4900, 6, 143.7, 31, "17:00"),
    (1490, 5990, 7, 176, 40, "18:00"),
    (1600, 6410, 7, 189.1, 38, "17:00"),
    (630, 2520, 4, 73.6, 12, "19:00"),
    (590, 2350, 4, 68.5, 9, "18:00"),
    (12880, 8580, 19, 516.5, 211, "18:00"),
    (14930, 9960, 22, 601.3, 260, "17:00"),
    (5920, 3950, 9, 236.8, 77, "16:00"),
)

# The case rows of the three new kinds. A seat is its number in the source (1 to 5); `generate`
# resolves it to the seat's id. Stamps are UTC and lie inside the story's span. The addresses are
# documentation ranges. The ten sign-ins are the applicant's: (stamp, seat number, outcome,
# method, client, network id, network type, address, city, country).
# fmt: off
CASE_SIGNINS = (
    ("2026-11-04T16:12:00+00:00", 1, "success", "password", "console web", "net-201", "corporate",
        "198.51.100.21", "Portland", "US"),
    ("2026-11-05T16:40:00+00:00", 2, "success", "password", "console web", "net-201", "corporate",
        "198.51.100.21", "Portland", "US"),
    ("2026-11-06T17:05:00+00:00", 3, "success", "password", "console web", "net-201", "corporate",
        "198.51.100.21", "Portland", "US"),
    ("2026-11-09T17:58:10+00:00", 3, "success", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T17:58:40+00:00", 1, "success", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T17:59:05+00:00", 5, "success", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T17:59:30+00:00", 2, "success", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-10T17:40:30+00:00", 4, "failure", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-10T17:40:45+00:00", 4, "success", "password", "console web", "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-10T22:15:00+00:00", 1, "success", "password", "console web", "net-201", "corporate",
        "198.51.100.21", "Portland", "US"),
)

# The crowd of ordinary sign-ins (see `_crowd`): the places, among the 22 resets of the twelve
# other organisations, whose ordinary morning is a failed sign-in, and the client of every one.
CROWD_FAILURES = (5, 14)
CROWD_CLIENT = "console web"

# The three key events, all of the key: (stamp, event, change or None, seat number, channel,
# network id, address, city, country).
KEY_EVENTS = (
    ("2026-11-05T17:20:00+00:00", "scope added", "files", 1, "console", "net-201", "198.51.100.21",
        "Portland", "US"),
    ("2026-11-08T23:05:00+00:00", "spend limit changed", "2000 to 6000 USD", 1, "console",
        "net-201", "198.51.100.21", "Portland", "US"),
    ("2026-11-10T17:40:55+00:00", "key viewed", None, 4, "console", "net-101", "203.0.113.17",
        "Amsterdam", "NL"),
)

# The twelve sampled requests of the key: (stamp, endpoint, response code, milliseconds, output
# tokens, network id, network type, address, city, country).
REQUEST_SAMPLES = (
    ("2026-11-10T17:41:03+00:00", "/v1/messages", 200, 1840, 612, "net-102", NETWORK_TYPE,
        "203.0.113.42", "Frankfurt", "DE"),
    ("2026-11-10T17:41:06+00:00", "/v1/messages", 200, 1720, 588, "net-103", NETWORK_TYPE,
        "203.0.113.88", "Warsaw", "PL"),
    ("2026-11-10T17:41:10+00:00", "/v1/messages", 200, 2310, 640, "net-104", NETWORK_TYPE,
        "203.0.113.131", "Singapore", "SG"),
    ("2026-11-10T17:41:13+00:00", "/v1/messages", 200, 2050, 597, "net-105", NETWORK_TYPE,
        "203.0.113.204", "Sao Paulo", "BR"),
    ("2026-11-09T18:00:20+00:00", "/v1/messages", 200, 1610, 702, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T18:01:05+00:00", "/v1/messages", 200, 1580, 655, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T18:02:40+00:00", "/v1/messages", 429, 95, 0, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-09T18:03:50+00:00", "/v1/messages", 200, 1690, 671, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-04T20:00:00+00:00", "/v1/messages", 200, 1450, 534, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-06T19:30:00+00:00", "/v1/files", 200, 380, 0, "net-101", NETWORK_TYPE, "203.0.113.17",
        "Amsterdam", "NL"),
    ("2026-11-07T21:00:00+00:00", "/v1/messages", 200, 1520, 566, "net-101", NETWORK_TYPE,
        "203.0.113.17", "Amsterdam", "NL"),
    ("2026-11-11T07:55:00+00:00", "/v1/messages", 200, 1980, 603, "net-105", NETWORK_TYPE,
        "203.0.113.204", "Sao Paulo", "BR"),
)
# fmt: on

# The places of the story: real cities' coordinates in decimal degrees, four places. ORG_PLACES
# is in ORG_NAMES order (the organisation's billing city), NETWORK_PLACES in the order of the four
# network rows, PROXY_PLACE the exit of the applicant's own network (Amsterdam).
ORG_PLACES = (
    (30.2672, -97.7431),
    (45.5152, -122.6784),
    (41.8781, -87.6298),
    (42.3601, -71.0589),
    (43.6532, -79.3832),
    (40.4406, -79.9959),
    (53.3498, -6.2603),
    (51.5072, -0.1276),
    (40.7128, -74.006),
    (33.749, -84.388),
    (52.52, 13.405),
    (39.7392, -104.9903),
    (49.2827, -123.1207),
)
NETWORK_PLACES = ((50.1109, 8.6821), (52.2297, 21.0122), (1.3521, 103.8198), (-23.5505, -46.6333))
PROXY_PLACE = (52.3676, 4.9041)

# Each city a sign-in, key event or request names, with its place: the billing cities, the four
# network cities and the proxy's exit. A city outside this table is a KeyError, never a guess.
CITY_PLACES = {
    **{facts[0]: place for facts, place in zip(ORG_FACTS, ORG_PLACES, strict=True)},
    **{facts[2]: place for facts, place in zip(NETWORK_FACTS, NETWORK_PLACES, strict=True)},
    PROXY[3]: PROXY_PLACE,
}

# Made up for the fuller story: every network's city, one table, built from the constants above so
# no city, country or coordinate is typed twice. net-101 is the applicant's proxy exit, net-102 to
# net-105 are the four network rows in their order, and each organisation that has an office has
# its office network at its billing city.
NETWORKS: dict[str, Place] = {
    PROXY[0]: (PROXY[3], PROXY[4], *PROXY_PLACE),
    **{
        f"net-{FIRST_NETWORK + 1 + i}": (facts[2], facts[3], *place)
        for i, (facts, place) in enumerate(zip(NETWORK_FACTS, NETWORK_PLACES, strict=True))
    },
    **{
        office[0]: (facts[0], facts[1], *place)
        for office, facts, place in zip(OFFICES, ORG_FACTS, ORG_PLACES, strict=True)
        if office is not None
    },
}

ACTOR = "investigator"  # as the token story's decisions
DECISION_LAG = timedelta(hours=1)  # V5: one hour after the last event

log = logging.getLogger("seed_key_many_networks")

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _network_id(i: int) -> str:
    return f"net-{FIRST_NETWORK + i}"


def _orgs(rng: random.Random) -> list[Row]:
    ids = [f"org-{n}" for n in rng.sample(range(20000, 100000), len(ORG_NAMES))]
    rows = []
    for i, (org_id, name) in enumerate(zip(ids, ORG_NAMES, strict=True)):
        applicant = i == APPLICANT_AT
        console = i == len(ORG_NAMES) - 1
        city, country, created, seats, active, sso, keys, networks, limit, spend = ORG_FACTS[i]
        rows.append(
            {
                "id": org_id,
                "org_id": org_id,
                "org_name": name,
                "plan": APPLICANT_PLAN if applicant else CONSOLE_PLAN if console else None,
                "networks_both_orgs": NETWORKS_BOTH_ORGS if applicant or console else None,
                "timestamp": 0,
                # The fuller fields come after today's keys. `admin_seat_id` is set in
                # `generate`, once the resets that name each organisation's seats exist.
                "billing_city": city,
                "billing_country": country,
                "created_on": created,
                "seats_total": seats,
                "seats_active_7d": active,
                "single_sign_on": sso,
                "keys_active": keys,
                "networks_30d": networks,
                "admin_seat_id": None,
                "spend_limit_usd": limit,
                "spend_30d_usd": spend,
                "lat": ORG_PLACES[i][0],
                "lng": ORG_PLACES[i][1],
            }
        )
    return rows


def _principals(rng: random.Random, org_id: str) -> list[Row]:
    seat_ids = [f"seat-{n}" for n in rng.sample(range(20000, 100000), len(PRINCIPALS) - 1)]
    key_id = "key-" + "".join(rng.choice(_ALPHABET) for _ in range(8))
    rows = []
    for (number, networks, requests), facts in zip(PRINCIPALS, PRINCIPAL_FACTS, strict=True):
        created, created_in, scopes, rotations, last_used, last_net, nets_7d, reqs_7d, client = (
            facts
        )
        pid = key_id if number is None else seat_ids.pop(0)
        rows.append(
            {
                "id": pid,
                "principal_id": pid,
                "principal_name": "Key" if number is None else f"Seat {number}",
                "networks_seen": networks,
                "requests_18d": requests,
                "timestamp": 0,
                "org_id": org_id,
                "created_on": created,
                "created_in": created_in,
                "scopes": list(scopes),
                "rotations": rotations,
                "last_used_at": last_used,
                "last_network_id": last_net,
                "networks_7d": nets_7d,
                "requests_7d": reqs_7d,
                "client": client,
            }
        )
    return rows


def _network_seen(key_id: str) -> list[Row]:
    rows = []
    for i, second in enumerate(NETWORK_SECONDS):
        ip, host, city, country, requests, others, first_seen, client = NETWORK_FACTS[i]
        rows.append(
            {
                "timestamp": iso(NETWORK_DAY_START + timedelta(seconds=second)),
                "principal_id": key_id,
                "network_id": _network_id(i + 1),
                "network_type": NETWORK_TYPE,
                "previous_network": _network_id(i),
                "ip": ip,
                "host_name": host,
                "city": city,
                "country": country,
                "requests_on_network": requests,
                "others_on_network": others,
                "first_seen_at": first_seen,
                "client": client,
                "lat": NETWORK_PLACES[i][0],
                "lng": NETWORK_PLACES[i][1],
            }
        )
    return numbered("nw", rows, ties=("principal_id",))


def _reset(rng: random.Random, orgs: list[Row], principals: list[Row]) -> list[Row]:
    seat_of = {n: p["principal_id"] for (n, _, _), p in zip(PRINCIPALS, principals, strict=True)}
    other_ids = [f"seat-{n}" for n in rng.sample(range(20000, 100000), 2 * len(RESET_ORGS))]
    # A seat id made by the principals must not be made again for another organisation.
    taken = {p["principal_id"] for p in principals}
    other_ids = [s for s in other_ids if s not in taken][: 2 * (len(RESET_ORGS) - 1)]
    rows = []
    for i, (seats, first, last) in enumerate(RESET_ORGS):
        org_id = orgs[i]["org_id"]
        if i == APPLICANT_AT:
            stamped = [(s, seat_of[n]) for s, n in APPLICANT_RESETS]
        else:
            stamped = [(first, other_ids.pop(0)), (last, other_ids.pop(0))]
        assert stamped[0][0] == first and stamped[-1][0] == last
        for seconds, seat_id in stamped:
            rows.append(
                {
                    "timestamp": iso(OFFER_OPEN + timedelta(seconds=seconds)),
                    "org_id": org_id,
                    "seat_id": seat_id,
                    "after_offer_s": seconds,
                    # Seats redeemed minus stamped rows, on the organisation's last row only.
                    "other_seats": seats - len(stamped) if seconds == last else 0,
                }
            )
    numbered_rows = numbered("rs", rows, ties=("org_id", "seat_id"))
    # The request and limit fields are added after `numbered`, by the row's place in id order, so
    # the ids and their order are what they were before.
    org_ids = [o["org_id"] for o in orgs]
    for place, row in enumerate(numbered_rows):
        if row["org_id"] == orgs[APPLICANT_AT]["org_id"]:
            network_id, _, ip, *_ = PROXY
        else:
            office = OFFICES[org_ids.index(row["org_id"])]
            assert office is not None  # the one organisation with no office has no reset
            network_id, _, ip, _ = office
        percent = USED_BEFORE_PERCENT[place]
        row.update(
            {
                "channel": RESET_CHANNEL,
                "network_id": network_id,
                "ip": ip,
                "limit_name": LIMIT_NAME,
                "used_before_percent": percent,
                "requests_before": REQUESTS_PER_PERCENT * percent,
                "offer_code": OFFER_CODE,
            }
        )
    return numbered_rows


def _usage_day() -> list[Row]:
    rows = [
        {
            "timestamp": iso(FIRST_DAY + timedelta(days=i)),
            "requests": requests,
            "output_tokens_m": output_m,
            "requests_by_key": by_key,
            "requests_by_seats": by_seats,
            "networks": networks,
            "input_tokens_m": input_m,
            "error_responses": errors,
            "peak_hour_utc": peak,
        }
        for i, (
            (requests, output_m),
            (by_key, by_seats, networks, input_m, errors, peak),
        ) in enumerate(zip(DAYS, DAY_FACTS, strict=True))
    ]
    return numbered("ud", rows)


def _set_admin_seats(orgs: list[Row], principals: list[Row], resets: list[Row]) -> None:
    """Fill each organisation's `admin_seat_id`: the applicant's is the seat the source calls
    Seat 1; every other organisation's is the seat of its earliest reset (the rows are in time
    order); the one organisation with no reset keeps None, since no seat of it is on file."""
    earliest: dict[str, str] = {}
    for reset in resets:
        earliest.setdefault(reset["org_id"], reset["seat_id"])
    seat_of = _seat_ids(principals)
    for i, org in enumerate(orgs):
        org["admin_seat_id"] = seat_of[1] if i == APPLICANT_AT else earliest.get(org["org_id"])


def _seat_ids(principals: list[Row]) -> dict[int, str]:
    """The id of each seat by its number in the source (the key has no number)."""
    return {n: p["principal_id"] for (n, _, _), p in zip(PRINCIPALS, principals, strict=True) if n}


def _at_city(row: Row) -> Row:
    """The row with the place of its `city` added as its last two keys."""
    lat, lng = CITY_PLACES[row["city"]]
    return {**row, "lat": lat, "lng": lng}


def _crowd(orgs: list[Row], resets: list[Row]) -> list[Row]:
    """The ordinary sign-ins of the twelve other organisations' seats, by a fixed rule over their
    resets (no draw). Take the resets of every organisation but the applicant's in id order; the
    place p of a reset in that list (0 to 21) gives two sign-ins of its seat on its organisation's
    office network: an ordinary morning on day 4 + p mod 5 of November at 09:00 office time plus
    11 p minutes mod 60, and one on 9 Nov 95 plus (13 p mod 120) seconds before the reset's stamp.
    The two mornings at CROWD_FAILURES fail; every other sign-in succeeds. The method is single
    sign-on where the organisation has it, else password."""
    applicant = orgs[APPLICANT_AT]["org_id"]
    index = {o["org_id"]: i for i, o in enumerate(orgs)}
    rows = []
    for place, reset in enumerate(r for r in resets if r["org_id"] != applicant):
        i = index[reset["org_id"]]
        office = OFFICES[i]
        assert office is not None  # the one organisation with no office has no reset
        network_id, network_type, ip, hours = office
        facts = ORG_FACTS[i]  # city, country, ..., single sign-on at index 5
        city, country, single_sign_on = facts[0], facts[1], facts[5]
        zone = timezone(timedelta(hours=hours))
        morning = datetime(2026, 11, 4 + place % 5, 9, (11 * place) % 60, 0, tzinfo=zone)
        gap = timedelta(seconds=95 + (13 * place) % 120)
        before = datetime.fromisoformat(reset["timestamp"]) - gap
        for at, outcome in (
            (morning, "failure" if place in CROWD_FAILURES else "success"),
            (before, "success"),
        ):
            rows.append(
                {
                    "timestamp": iso(at),
                    "seat_id": reset["seat_id"],
                    "org_id": reset["org_id"],
                    "outcome": outcome,
                    "method": "single sign-on" if single_sign_on else "password",
                    "client": CROWD_CLIENT,
                    "network_id": network_id,
                    "network_type": network_type,
                    "ip": ip,
                    "city": city,
                    "country": country,
                }
            )
    return rows


def _signin(principals: list[Row], applicant_org: str, crowd: list[Row]) -> list[Row]:
    seat_of = _seat_ids(principals)
    rows = [
        {
            "timestamp": stamp,
            "seat_id": seat_of[seat],
            "org_id": applicant_org,
            "outcome": outcome,
            "method": method,
            "client": client,
            "network_id": network_id,
            "network_type": network_type,
            "ip": ip,
            "city": city,
            "country": country,
        }
        for (
            stamp,
            seat,
            outcome,
            method,
            client,
            network_id,
            network_type,
            ip,
            city,
            country,
        ) in CASE_SIGNINS
    ]
    return numbered("si", [_at_city(r) for r in (*rows, *crowd)], ties=("seat_id",))


def _key_event(principals: list[Row]) -> list[Row]:
    seat_of = _seat_ids(principals)
    rows = [
        {
            "timestamp": stamp,
            "principal_id": principals[0]["principal_id"],
            "event": event,
            "change": change,
            "seat_id": seat_of[seat],
            "channel": channel,
            "network_id": network_id,
            "ip": ip,
            "city": city,
            "country": country,
        }
        for (stamp, event, change, seat, channel, network_id, ip, city, country) in KEY_EVENTS
    ]
    return numbered("ke", [_at_city(r) for r in rows], ties=("principal_id",))


def _request_sample(principals: list[Row]) -> list[Row]:
    rows = [
        {
            "timestamp": stamp,
            "principal_id": principals[0]["principal_id"],
            "endpoint": endpoint,
            "response_code": code,
            "milliseconds": millis,
            "output_tokens": tokens,
            "network_id": network_id,
            "network_type": network_type,
            "ip": ip,
            "city": city,
            "country": country,
        }
        for (
            stamp,
            endpoint,
            code,
            millis,
            tokens,
            network_id,
            network_type,
            ip,
            city,
            country,
        ) in REQUEST_SAMPLES
    ]
    return numbered("rq", [_at_city(r) for r in rows], ties=("network_id",))


def _decision(rows: dict[str, list[Row]]) -> list[Row]:
    """One decision, waiting for review: it lists every timed row its note counts and is stamped
    an hour after the latest of them (the 11 Nov day row)."""
    timed = rows["network_seen"] + rows["reset"] + rows["usage_day"]
    last = max(datetime.fromisoformat(r["timestamp"]) for r in timed)
    nets, resets = rows["network_seen"], rows["reset"]
    stamps = [datetime.fromisoformat(r["timestamp"]) for r in nets]
    within = round((max(stamps) - min(stamps)).total_seconds())
    seats = len(resets) + sum(r["other_seats"] for r in resets)
    orgs = len({r["org_id"] for r in resets})
    days = rows["usage_day"]
    note = (
        f"{len(nets)} network changes by one key within {within} seconds on 10 Nov. "
        f"{len(resets)} stamped limit resets from {min(r['after_offer_s'] for r in resets)} to "
        f"{max(r['after_offer_s'] for r in resets)} seconds after the offer opened on 9 Nov; "
        f"{seats} seats redeemed in {orgs} organisations. "
        f"Daily requests {days[4]['requests']:,} on 8 Nov and {days[5]['requests']:,} on 9 Nov; "
        f"{sum(d['requests'] for d in days):,} in {len(days)} days."
    )
    applicant = next(o for o in rows["org"] if o["plan"] == APPLICANT_PLAN)
    return numbered(
        "dc",
        [
            {
                "org_id": applicant["org_id"],
                "event_ids": [r["id"] for r in sorted(timed, key=lambda r: r["timestamp"])],
                "target_label": applicant["org_name"],
                "status": "WAITING",
                "outcome": "FOR REVIEW",
                "note": note,
                "decided_by": ACTOR,
                "decided_at": iso((last + DECISION_LAG).astimezone(UTC)),
            }
        ],
        ts="decided_at",
    )


def generate() -> dict[str, list[Row]]:
    rng = random.Random(SEED)  # ids only; a fresh generator on every call
    orgs = _orgs(rng)
    applicant_org = orgs[APPLICANT_AT]["org_id"]
    principals = _principals(rng, applicant_org)
    rows: dict[str, list[Row]] = {
        "org": orgs,
        "principal": principals,
        "network_seen": _network_seen(principals[0]["principal_id"]),
        "reset": _reset(rng, orgs, principals),
        "usage_day": _usage_day(),
    }
    _set_admin_seats(orgs, principals, rows["reset"])
    rows["signin"] = _signin(principals, applicant_org, _crowd(orgs, rows["reset"]))
    rows["key_event"] = _key_event(principals)
    rows["request_sample"] = _request_sample(principals)
    # Every row that names a network draws at that network's city. The four placed kinds already
    # hold their place and pass the check unchanged; the resets, which name a network, gain it.
    for kind in ("network_seen", "reset", "signin", "key_event", "request_sample"):
        for row in rows[kind]:
            place_row(row, NETWORKS)
    # The key's path and each seat's path: every row of the two path kinds holds the seconds and
    # km of the hop that ends at it. A network row measures from the key's latest row on the
    # network it names as previous: the first one (nw-0001, after net-101) from a key event.
    hop_figures(
        rows["network_seen"],
        "principal_id",
        NETWORKS,
        story_rows=[*rows["network_seen"], *rows["key_event"], *rows["request_sample"]],
        previous="previous_network",
    )
    hop_figures(rows["signin"], "seat_id", NETWORKS)
    # The decision lists and dates only the network, reset and day rows, as it always did.
    rows["decision"] = _decision(rows)
    # Its one place travels with the first places: the billing city of the organisation it names.
    (decision,) = rows["decision"]
    (home,) = [o for o in orgs if o["org_id"] == decision["org_id"]]
    decision.update(lat=home["lat"], lng=home["lng"])
    return {kind: rows[kind] for kind in KINDS}


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack DB. Rerunning replaces them."""
    return write_pack(generate(), data_dir, db_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
