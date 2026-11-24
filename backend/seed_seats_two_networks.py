"""The seats-two-networks pack: five seats, two of which move between two networks, over a week.

A water utility on a team plan and two people on individual plans share one report: five seats
send 1,122 requests in seven days, 14 times a seat is seen on a second network, two seats redeem
a limit reset on one afternoon, a safeguard counts 32 events in six hours, and one application
for a higher tier has been queued since the 9th while five tier cells hold no record.

The pack takes counts, times and category words from the third case file of another project
(cited as `S3:<line>`), typed below as named constants. It opens no file of that project. Every
identifier, name and network label is coined by the seeded generator from word lists in this
module. Rows hold counts and category words, never content. The places and the seven sign-ins are
made up for the fuller story: an organisation, a sign-in, the network change and the decision hold
a `lat` and `lng`. Every network has a city (`NETWORKS`); a limit reset names no network, so it
takes the one its seat last used and draws there. The sign-ins are a path for each seat: each holds
the seconds and the km of the hop that ends at it (`hop_figures`, worked out from the stamps and
places, never typed). No other row has a place. No rule and no arrow
is declared: the pack replays a recorded week and detects nothing.

Times are UTC. The source states Pacific stamps (UTC-8 from 1 Nov, S3:198), so each stamp below
is written on the Pacific clock and converted by `iso`. A day row sits at the source's Pacific
day start and an hour row on the source's hour start. A row with no time is untimed and holds
`timestamp` 0.

Usage: `python -m seed_seats_two_networks` from backend/ writes
data/seats-two-networks/<kind>.json and the empty pack DB data/seats-two-networks.db.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

from db import PROJECT_ROOT
from seed_packs import Place, Row, carry_network, hop_figures, iso, numbered, place_row, write_pack

DATA_DIR = PROJECT_ROOT / "data" / "seats-two-networks"
DB_PATH = PROJECT_ROOT / "data" / "seats-two-networks.db"
KINDS = (
    "org",
    "seat",
    "switch_sample",
    "reset",
    "safeguard_hour",
    "usage_day",
    "enrolment",
    "signin",
    "decision",
)
SEED = 2026111803  # V12: the design's date, then the story's number; used for ids and names only

# The source's clock: Pacific, UTC-8 on every day of the week (S3:198, 285).
PACIFIC = timezone(timedelta(hours=-8), "PT")

# One organisation on a team plan and two on individual plans (S3:17-23). The suffix is a
# category word; the stem is coined.
ORG_SUFFIXES = ("Water Utility", "Individual", "Individual")
ORG_STEMS = (
    ("Bren", "Cal", "Dor", "Fen", "Hal", "Jor", "Kel", "Lor"),
    ("dale", "mere", "wick", "ford", "haven", "stead", "brook", "thorn"),
)
SEAT_WORDS = ("Amber", "Birch", "Cinder", "Dune", "Ember", "Fjord", "Gale", "Heath")

# The five seats in the source's order, as (network changes, networks seen) (S3:302-306): two
# seats of the team organisation move between two networks, the other three stay on one.
SEATS = ((8, 2), (6, 2), (0, 1), (0, 1), (0, 1))
# The organisation each seat belongs to, by index: three team seats, then one seat for each
# individual plan (S3:17-23, 302-306).
SEAT_ORG = (0, 0, 0, 1, 2)
# The four networks, as type words (S3:302-306): two corporate, two residential. Labels are
# `net-NNN <type>`, numbered from 101 (V6); no network number of the source is carried.
NETWORK_TYPES = ("corporate", "corporate", "residential", "residential")
NETWORK_FIRST = 101

# The one stamped network change (S3:314): seat 0 moves from network 0 to network 1.
SWITCH_AT = datetime(2026, 11, 10, 8, 2, 15, tzinfo=PACIFIC)
SWITCH_SEAT, SWITCH_FROM, SWITCH_TO = 0, 0, 1

# Two limit resets on one Pacific day, 2 h 48 min apart (S3:421-422), on the first two seats.
RESET_AT = (
    datetime(2026, 11, 10, 16, 36, tzinfo=PACIFIC),
    datetime(2026, 11, 10, 19, 24, tzinfo=PACIFIC),
)
RESET_SEATS = (0, 1)

# Safeguard events by hour, 14:00 to 19:00 Pacific on the 10th (S3:538-543, 546): their sum is 32.
HOUR_FIRST = datetime(2026, 11, 10, 14, tzinfo=PACIFIC)
SAFEGUARD_EVENTS = (1, 5, 8, 7, 6, 5)

# Requests and output tokens in thousands by day, 4 to 10 Nov (S3:158, 212-218, 221): the
# requests sum to 1,122.
DAY_FIRST = datetime(2026, 11, 4, tzinfo=PACIFIC)
DAY_REQUESTS = (142, 168, 155, 31, 18, 236, 372)
DAY_OUTPUT_TOKENS_K = (618, 735, 684, 118, 66, 1052, 1634)

# The one dated enrolment row, 13:48 on the 9th (S3:643), and the five of the six cells with no
# record (S3:639-650). The tier word is coined: the source's tiers are program names.
ENROLMENT_AT = datetime(2026, 11, 9, 13, 48, tzinfo=PACIFIC)
ENROLMENT_TIER = "tier-b"
TIERS_WITHOUT_ENROLMENT = 5

# Made up for the fuller story. A place is (city, country, lat, lng). The three organisations'
# cities, in the order of the organisations above; and, by index into NETWORK_TYPES, each
# network's address (in a documentation range) and place.
ORG_PLACES = (
    ("Sacramento", "US", 38.5816, -121.4944),
    ("Boise", "US", 43.615, -116.2023),
    ("Reno", "US", 39.5296, -119.8138),
)
NETWORK_FACTS = (
    ("198.51.100.20", ("Sacramento", "US", 38.5816, -121.4944)),
    ("198.51.100.40", ("Roseville", "US", 38.7521, -121.288)),
    ("203.0.113.30", ("Boise", "US", 43.615, -116.2023)),
    ("203.0.113.60", ("Reno", "US", 39.5296, -119.8138)),
)
# The seven sign-ins: seat index, network index, method, stamp in UTC. The last follows the second
# reset and precedes the decision, which is dated from the other kinds and does not move.
SIGNINS = (
    (0, 0, "single sign-on", datetime(2026, 11, 9, 16, 10, tzinfo=UTC)),
    (0, 1, "single sign-on", datetime(2026, 11, 10, 16, 2, 30, tzinfo=UTC)),
    (1, 0, "single sign-on", datetime(2026, 11, 10, 21, 15, tzinfo=UTC)),
    (1, 1, "single sign-on", datetime(2026, 11, 11, 0, 20, tzinfo=UTC)),
    (3, 2, "password", datetime(2026, 11, 6, 17, 30, tzinfo=UTC)),
    (4, 3, "password", datetime(2026, 11, 7, 18, 45, tzinfo=UTC)),
    (1, 1, "single sign-on", datetime(2026, 11, 11, 3, 50, tzinfo=UTC)),
)
SIGNIN_OUTCOME, SIGNIN_CLIENT = "success", "console web"

# V5: the decision waits for review, one hour after the last event, and states counts only.
DECISION_LAG = timedelta(hours=1)
DECISION_STATUS = "WAITING"
DECISION_OUTCOME = "FOR REVIEW"
DECISION_ACTOR = "investigator"

log = logging.getLogger("seed_seats_two_networks")


def _coin_orgs(rng: random.Random) -> list[Row]:
    """Three organisations: ids and name stems coined from the seeded generator."""
    ids = rng.sample(range(10000, 100000), len(ORG_SUFFIXES))
    stems: list[str] = []
    while len(stems) < len(ORG_SUFFIXES):
        stem = rng.choice(ORG_STEMS[0]) + rng.choice(ORG_STEMS[1])
        if stem not in stems:
            stems.append(stem)
    return [
        {
            "timestamp": 0,
            "org_id": f"org-{n}",
            "org_name": f"{stem} {suffix}",
            **_place(place),
        }
        for n, stem, suffix, place in zip(ids, stems, ORG_SUFFIXES, ORG_PLACES, strict=True)
    ]


def _place(place: tuple[str, str, float, float]) -> Row:
    city, country, lat, lng = place
    return {"city": city, "country": country, "lat": lat, "lng": lng}


def _coin_seats(rng: random.Random, orgs: list[Row]) -> list[Row]:
    """Five seats: ids and names coined, counts typed from the source."""
    ids = rng.sample(range(100, 1000), len(SEATS))
    words = rng.sample(SEAT_WORDS, len(SEATS))
    return [
        {
            "timestamp": 0,
            "seat_id": f"seat-{n}",
            "seat_name": f"{word} seat",
            "org_id": orgs[SEAT_ORG[i]]["org_id"],
            "switches": switches,
            "networks": networks,
        }
        for i, (n, word, (switches, networks)) in enumerate(zip(ids, words, SEATS, strict=True))
    ]


def _network(index: int) -> str:
    return f"net-{NETWORK_FIRST + index} {NETWORK_TYPES[index]}"


# Every network's city, one table, read from NETWORK_FACTS so no place is typed twice.
NETWORKS: dict[str, Place] = {_network(i): place for i, (_ip, place) in enumerate(NETWORK_FACTS)}


def _decision(rows: dict[str, list[Row]]) -> Row:
    """The one decision: waiting for review, with a note of counts the rows show."""
    seats, events, days = rows["seat"], rows["safeguard_hour"], rows["usage_day"]
    timed = [
        datetime.fromisoformat(r["timestamp"])
        for kind in ("switch_sample", "reset", "safeguard_hour", "usage_day", "enrolment")
        for r in rows[kind]
    ]
    applicant = rows["org"][0]
    note = (
        f"{len(seats)} seats in {len(rows['org'])} organisations. "
        f"{sum(s['switches'] for s in seats)} network changes counted on "
        f"{sum(1 for s in seats if s['switches'])} seats. "
        f"{len(rows['reset'])} resets on one day. "
        f"{sum(h['events'] for h in events)} safeguard events in {len(events)} hours. "
        f"{sum(d['requests'] for d in days):,} requests in {len(days)} days. "
        f"{TIERS_WITHOUT_ENROLMENT} of {TIERS_WITHOUT_ENROLMENT + len(rows['enrolment'])} "
        "tier cells hold no enrolment record."
    )
    return {
        "org_id": applicant["org_id"],
        "event_ids": [r["id"] for kind in ("switch_sample", "reset") for r in rows[kind]],
        "target_label": applicant["org_name"],
        "status": DECISION_STATUS,
        "outcome": DECISION_OUTCOME,
        "note": note,
        "decided_by": DECISION_ACTOR,
        "decided_at": iso(max(timed) + DECISION_LAG),
    }


def generate() -> dict[str, list[Row]]:
    """The pack's rows by kind, a pure function of this module."""
    rng = random.Random(SEED)
    orgs = _coin_orgs(rng)
    seats = _coin_seats(rng, orgs)

    rows: dict[str, list[Row]] = {
        "org": numbered("org", orgs, width=2),
        "seat": numbered("seat", seats, width=2),
        "switch_sample": numbered(
            "sw",
            [
                {
                    "timestamp": iso(SWITCH_AT),
                    "seat_id": seats[SWITCH_SEAT]["seat_id"],
                    "network_id": _network(SWITCH_TO),
                    "previous_network": _network(SWITCH_FROM),
                }
            ],
            width=2,
        ),
        "reset": numbered(
            "rs",
            [
                {"timestamp": iso(at), "seat_id": seats[i]["seat_id"]}
                for at, i in zip(RESET_AT, RESET_SEATS, strict=True)
            ],
            width=2,
        ),
        "safeguard_hour": numbered(
            "sg",
            [
                {"timestamp": iso(HOUR_FIRST + timedelta(hours=h)), "events": events}
                for h, events in enumerate(SAFEGUARD_EVENTS)
            ],
            width=2,
        ),
        "usage_day": numbered(
            "ud",
            [
                {
                    "timestamp": iso(DAY_FIRST + timedelta(days=d)),
                    "requests": requests,
                    "output_tokens_k": DAY_OUTPUT_TOKENS_K[d],
                }
                for d, requests in enumerate(DAY_REQUESTS)
            ],
            width=2,
        ),
        "enrolment": numbered(
            "en",
            [
                {
                    "timestamp": iso(ENROLMENT_AT),
                    "tier": ENROLMENT_TIER,
                    "tiers_without_enrolment": TIERS_WITHOUT_ENROLMENT,
                }
            ],
            width=2,
        ),
        "signin": numbered(
            "si",
            [
                {
                    "timestamp": iso(at),
                    "seat_id": seats[seat]["seat_id"],
                    "org_id": seats[seat]["org_id"],
                    "outcome": SIGNIN_OUTCOME,
                    "method": method,
                    "client": SIGNIN_CLIENT,
                    "network_id": _network(net),
                    "ip": NETWORK_FACTS[net][0],
                    **_place(NETWORK_FACTS[net][1]),
                }
                for seat, net, method, at in SIGNINS
            ],
            width=2,
            ties=("seat_id",),
        ),
    }
    # The network change names its network. A reset names none, so it takes the network its seat
    # last used: the nearest earlier sign-in or network change of the same seat (by time alone).
    sources = [*rows["signin"], *rows["switch_sample"]]
    for reset in rows["reset"]:
        reset["network_id"] = carry_network(reset, sources, by="seat_id")
    for kind in ("switch_sample", "reset", "signin"):
        for row in rows[kind]:
            place_row(row, NETWORKS)
    # Each seat's path is its sign-ins: every one holds the seconds and km of the hop that ends
    # at it (a seat's first sign-in holds neither).
    hop_figures(rows["signin"], "seat_id", NETWORKS)
    decision = numbered("dc", [_decision(rows)], width=2, ts="decided_at")
    # The decision sits at the applicant organisation's city: two keys after the ones it has.
    applicant = rows["org"][0]
    rows["decision"] = [{**d, "lat": applicant["lat"], "lng": applicant["lng"]} for d in decision]
    return rows


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack DB. Rerunning replaces them."""
    return write_pack(generate(), data_dir, db_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
