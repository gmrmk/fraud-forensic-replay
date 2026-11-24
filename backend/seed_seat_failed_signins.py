"""The seat-failed-signins pack: failed sign-ins on one seat, then a sign-in, a credential grant,
limit resets and a burst of requests, with a steady seat of the same organisation beside it.

The pack holds counts, stamps, category words and the places of the fuller story, and nothing else.
It carries no rule and no arrow, and its one decision row states only counts the rows show. Every
stamp is a UTC stamp with its offset written.

The fuller story (STORIES-DATA, group D2) gives the two organisations, the sign-ins, the request,
the credential grant and the one decision a place (`lat`, `lng`), the sign-in, the request and the
grant an address, and the seats a role, a creation day and a client. Those values are made up for
the fuller story and no file backs them. Each is a typed constant keyed by the organisation or the
network label; none is drawn from the seeded generator, so every id is the id it had before. An
existing row keeps every key and value and gains its new keys after them; the decision gains `lat`
and `lng` and nothing else. Every network has a city (`NETWORKS`), and the limit resets, which name
no network, take the one their seat last used and so draw there (the one seat seen nowhere else
takes the first network). The sign-ins are a path for each seat, and each holds the seconds and the
km of the hop that ends at it (`hop_figures`, worked out from the stamps and places, never typed).

Every count and stamp below is typed from the other project's fifth case file and cited by line
as `S5:<line>` (the places, addresses and extra fields of the fuller story are not from it). The
pack opens no file of that project, and carries none of its names or ids: every id, seat, network
label, organisation and workspace name is coined here, from one fixed seed used for ids only.
Nothing is random: the counts, the times and the order are constants, so the pack is a pure
function of this module.

The source states its times at UTC-8 (S5:409); each stamp is that time plus eight hours. A row
with no time of its own is untimed and holds `timestamp` 0. A stated date outside the pack's
span (V7: 9 to 11 Nov 2026) is a field of an untimed row.

Usage: `python -m seed_seat_failed_signins` from backend/ writes
data/seat-failed-signins/<kind>.json and the empty pack DB data/seat-failed-signins.db (the
registry requires a DB per pack; the rows live in the files).
"""

from __future__ import annotations

import logging
import random
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path

from db import PROJECT_ROOT
from seed_packs import Place, Row, carry_network, hop_figures, iso, numbered, place_row, write_pack

DATA_DIR = PROJECT_ROOT / "data" / "seat-failed-signins"
DB_PATH = PROJECT_ROOT / "data" / "seat-failed-signins.db"
KINDS = (
    "org",
    "seat",
    "signin",
    "request_sample",
    "credential_event",
    "reset",
    "usage_hour",
    "decision",
)
SEED = 2026111805  # V12: the date of the design (2026-11-18) and the story's number

# The source's clock: US Pacific, UTC-8 on these days (S5:409).
SOURCE_ZONE = timezone(timedelta(hours=-8), "PT")


def _pt(day: int, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """A stamp of November 2026 on the source's clock."""
    return datetime(2026, 11, day, hour, minute, second, tzinfo=SOURCE_ZONE)


# Two organisations, coined (S5:17-24, 109-111 state two). Written here, not read from the source.
ORG_NAMES = ("Belmaren Field Lab", "Belmaren Central")

# Network labels: net-NNN plus a type word, numbered from 101 (V6). The type words are the
# source's category words for the two networks of the incident seat (S5:611-612).
FIRST_NETWORK = 101
CAMPUS_TYPE, HOSTING_TYPE = "education", "hosting"

# The incident seat's sign-ins and grant (S5:608-634, sample rows S5:623-625).
CAMPUS_SIGNIN_AT = _pt(10, 18, 40)  # S5:611: stated to the minute
CAMPUS_REQUEST_AT = _pt(10, 18, 52, 30)  # S5:365: one request, before the failures
FAILURES = 14  # S5:612: 14 failed sign-ins
FAILURE_FIRST_AT = _pt(11, 2, 31, 8)  # S5:623: the first failure, to the second
# S5:612 states the window as two minutes, 02:31 and 02:46; the 15 is their difference.
FAILURE_WINDOW = (_pt(11, 2, 31), _pt(11, 2, 46))
SUCCESS_AT = _pt(11, 2, 47, 22)  # S5:624
GRANT_AT = _pt(11, 2, 49, 40)  # S5:625
GRANT_LIFETIME_H = 720  # S5:614, 625

# Limit resets: three on the incident seat (S5:432-434) and one on a third seat (S5:435).
RESET_AT = (_pt(11, 2, 51, 9), _pt(11, 3, 27, 44), _pt(11, 3, 58, 20))
EARLIER_RESET_AT = _pt(9, 11, 20, 48)

# The steady seat: 187 sign-ins from 15 addresses since 12 Sep, the last at 03:31:12 (S5:615,
# 626). The year is the window's (S5:449).
STEADY_SIGNINS, STEADY_ADDRESSES = 187, 15
STEADY_FIRST_SIGNIN_ON = date(2026, 9, 12)
STEADY_LAST_SIGNIN_AT = _pt(11, 3, 31, 12)

# Requests per hour (the magnitude). Incident seat: three hours from 02:00, the counts of the two
# models of the source, summed (S5:201-203). Steady seat: eight hours from the evening before
# (S5:197-204; the last is a part hour, to the 05:30 shift start of S5:172).
INCIDENT_FIRST_HOUR = _pt(11, 2)
INCIDENT_HOUR_REQUESTS = ((38, 2), (1641, 81), (233, 13))
STEADY_FIRST_HOUR = _pt(10, 22)
STEADY_HOUR_REQUESTS = (142, 138, 145, 139, 141, 144, 143, 71)

# ---- The fuller records (made up for the fuller story; no file backs them) ---------------------

# Where each organisation is: (city, country, lat, lng), keyed by its name because the ids of the
# two organisation rows are numbered by org id and not by the order of ORG_NAMES.
ORG_PLACES = {
    "Belmaren Central": ("Seattle", "US", 47.6062, -122.3321),
    "Belmaren Field Lab": ("Tacoma", "US", 47.2529, -122.4443),
}
# The one decision sits at the city of this organisation.
DECISION_ORG = "Belmaren Central"

# The seats' role, creation day and client, in the order incident, steady, earlier.
SEAT_FACTS = (
    ("member", "2026-11-02", "console web"),
    ("admin", "2026-09-10", "console web"),
    ("member", "2026-10-14", "console web"),
)

# Each network: (ip, client, city, country, lat, lng), keyed by its label. The addresses are from
# the documentation ranges. The education network is at Seattle, the hosting network at Ashburn.
NETWORK_FACTS = {
    f"net-{FIRST_NETWORK} {CAMPUS_TYPE}": (
        "192.0.2.17",
        "console web",
        "Seattle",
        "US",
        47.6062,
        -122.3321,
    ),
    f"net-{FIRST_NETWORK + 1} {HOSTING_TYPE}": (
        "198.51.100.200",
        "python-requests 2.32",
        "Ashburn",
        "US",
        39.0438,
        -77.4874,
    ),
}
# Every network's city, one table, read from NETWORK_FACTS so no place is typed twice.
NETWORKS: dict[str, Place] = {
    label: (city, country, lat, lng)
    for label, (_ip, _client, city, country, lat, lng) in NETWORK_FACTS.items()
}
SIGNIN_METHOD = "password"
REQUEST_ENDPOINT, REQUEST_RESPONSE_CODE = "/v1/messages", 200
GRANT_SCOPE, GRANT_CREATED_IN = "messages", "console"

ACTOR = "investigator"  # V5
SYLLABLES = ("bra", "cel", "dor", "fen", "gar", "hol", "kes", "lun", "mar", "nor", "pel", "tav")

log = logging.getLogger("seed_seat_failed_signins")


class _Ids:
    """The coined ids of one generation run, from the one fixed seed."""

    def __init__(self) -> None:
        self.rng = random.Random(SEED)
        self.taken: set[str] = set()

    def org_id(self) -> str:
        return self._draw(lambda: f"org-{self.rng.randint(10000, 99999)}")

    def seat_id(self) -> str:
        return self._draw(lambda: f"seat-{self.rng.randint(10000, 99999)}")

    def seat_name(self) -> str:
        return self._draw(lambda: f"{self.rng.choice(SYLLABLES)}-{self.rng.choice(SYLLABLES)}")

    def _draw(self, make: Callable[[], str]) -> str:
        while True:
            value = make()
            if value not in self.taken:
                self.taken.add(value)
                return value


def _network(index: int, kind: str) -> str:
    return f"net-{FIRST_NETWORK + index} {kind}"


def _org_place(name: str) -> Row:
    """The city, country and place of an organisation."""
    city, country, lat, lng = ORG_PLACES[name]
    return {"city": city, "country": country, "lat": lat, "lng": lng}


def _where(network: str) -> Row:
    """The city, country and place of a network."""
    _ip, _client, city, country, lat, lng = NETWORK_FACTS[network]
    return {"city": city, "country": country, "lat": lat, "lng": lng}


def generate() -> dict[str, list[Row]]:
    """The pack's rows by kind, a pure function of this module."""
    ids = _Ids()
    campus, hosting = _network(0, CAMPUS_TYPE), _network(1, HOSTING_TYPE)

    orgs = [
        {"org_id": ids.org_id(), "org_name": name, "timestamp": 0, **_org_place(name)}
        for name in ORG_NAMES
    ]
    incident, steady, earlier = ids.seat_id(), ids.seat_id(), ids.seat_id()
    names = {incident: ids.seat_name(), steady: ids.seat_name(), earlier: ids.seat_name()}
    # A total the source does not state is carried as null, never a placeholder.
    seats: list[Row] = [
        {
            "seat_id": incident,
            "seat_name": names[incident],
            "signins_total": None,
            "addresses": None,
            "first_signin_on": None,
            "timestamp": 0,
        },
        {
            "seat_id": steady,
            "seat_name": names[steady],
            "signins_total": STEADY_SIGNINS,
            "addresses": STEADY_ADDRESSES,
            "first_signin_on": STEADY_FIRST_SIGNIN_ON.isoformat(),
            "timestamp": 0,
        },
        {
            "seat_id": earlier,
            "seat_name": names[earlier],
            "signins_total": None,
            "addresses": None,
            "first_signin_on": None,
            "timestamp": 0,
        },
    ]
    seats = [
        {**seat, "role": role, "created_on": created_on, "client": client}
        for seat, (role, created_on, client) in zip(seats, SEAT_FACTS, strict=True)
    ]

    window_min = int((FAILURE_WINDOW[1] - FAILURE_WINDOW[0]).total_seconds() // 60)
    signin_rows = [
        (incident, campus, "success", 1, 0, CAMPUS_SIGNIN_AT),
        (incident, hosting, "failure", FAILURES, window_min, FAILURE_FIRST_AT),
        (incident, hosting, "success", 1, 0, SUCCESS_AT),
        (steady, campus, "success", 1, 0, STEADY_LAST_SIGNIN_AT),
    ]
    signins = [
        {
            "seat_id": seat,
            "network_id": network,
            "outcome": outcome,
            "attempts": attempts,
            "window_min": window,
            "timestamp": iso(at),
            "ip": NETWORK_FACTS[network][0],
            "method": SIGNIN_METHOD,
            "client": NETWORK_FACTS[network][1],
            **_where(network),
        }
        for seat, network, outcome, attempts, window, at in signin_rows
    ]

    requests = [
        {
            "seat_id": incident,
            "network_id": campus,
            "timestamp": iso(CAMPUS_REQUEST_AT),
            "ip": NETWORK_FACTS[campus][0],
            "endpoint": REQUEST_ENDPOINT,
            "response_code": REQUEST_RESPONSE_CODE,
            **_where(campus),
        }
    ]
    credentials = [
        {
            "seat_id": incident,
            "event": "grant_created",
            "lifetime_h": GRANT_LIFETIME_H,
            "timestamp": iso(GRANT_AT),
            "scope": GRANT_SCOPE,
            "created_in": GRANT_CREATED_IN,
            "network_id": hosting,
            "ip": NETWORK_FACTS[hosting][0],
            **_where(hosting),
        }
    ]
    resets = [{"seat_id": earlier, "timestamp": iso(EARLIER_RESET_AT)}] + [
        {"seat_id": incident, "timestamp": iso(at)} for at in RESET_AT
    ]
    hours = [
        {
            "seat_id": incident,
            "requests": sum(per_model),
            "timestamp": iso(INCIDENT_FIRST_HOUR + timedelta(hours=i)),
        }
        for i, per_model in enumerate(INCIDENT_HOUR_REQUESTS)
    ] + [
        {
            "seat_id": steady,
            "requests": count,
            "timestamp": iso(STEADY_FIRST_HOUR + timedelta(hours=i)),
        }
        for i, count in enumerate(STEADY_HOUR_REQUESTS)
    ]

    rows: dict[str, list[Row]] = {
        "org": numbered("og", orgs, ties=("org_id",)),
        "seat": numbered("st", seats),
        "signin": numbered("sg", signins, ties=("seat_id",)),
        "request_sample": numbered("rq", requests, ties=("seat_id",)),
        "credential_event": numbered("ce", credentials, ties=("seat_id",)),
        "reset": numbered("rs", resets, ties=("seat_id",)),
        "usage_hour": numbered("uh", hours, ties=("seat_id",)),
    }
    # A reset names no network of its own, so it takes the network its seat last used: the nearest
    # earlier sign-in, request or credential event of the same seat (by time alone). The one reset
    # whose seat appears nowhere else in the story has no such row; its network follows no row of
    # the story, and it is given the story's first network so every reset has a place.
    sources = [*rows["signin"], *rows["request_sample"], *rows["credential_event"]]
    for reset in rows["reset"]:
        reset["network_id"] = carry_network(reset, sources, by="seat_id") or campus
    for kind in ("signin", "request_sample", "credential_event", "reset"):
        for row in rows[kind]:
            place_row(row, NETWORKS)
    # Each seat's path is its sign-ins: every one holds the seconds and km of the hop that ends
    # at it (a seat's first sign-in holds neither).
    hop_figures(rows["signin"], "seat_id", NETWORKS)
    decision = _decision(rows, incident, steady, names[incident], names[steady])
    _city, _country, lat, lng = ORG_PLACES[DECISION_ORG]
    rows["decision"] = [{**decision, "lat": lat, "lng": lng}]
    return {kind: rows[kind] for kind in KINDS}


def _decision(rows: dict[str, list[Row]], incident: str, steady: str, name: str, other: str) -> Row:
    """The one decision, in words: WAITING, FOR REVIEW, with a note of counts the rows show. It
    works the failed sign-ins and the credential grant, and sits one hour after the last event."""
    failure = next(r for r in rows["signin"] if r["outcome"] == "failure")
    (grant,) = rows["credential_event"]
    seat_resets = sorted(r["timestamp"] for r in rows["reset"] if r["seat_id"] == incident)
    span = (
        datetime.fromisoformat(seat_resets[-1]) - datetime.fromisoformat(seat_resets[0])
    ).total_seconds() // 60
    busiest = max((r for r in rows["usage_hour"] if r["seat_id"] == incident), key=_requests)
    beside = next(
        r
        for r in rows["usage_hour"]
        if r["seat_id"] == steady and r["timestamp"] == busiest["timestamp"]
    )
    note = (
        f"{failure['attempts']} failed sign-ins on the {HOSTING_TYPE} network inside "
        f"{failure['window_min']} minutes, then 1 sign-in and 1 credential grant with a lifetime "
        f"of {grant['lifetime_h']} hours. {len(seat_resets)} limit resets in {int(span)} minutes. "
        f"{busiest['requests']:,} requests in the busiest hour, against {beside['requests']:,} "
        f"on {other} in the same hour."
    )
    last = max(
        datetime.fromisoformat(r["timestamp"])
        for kind in ("signin", "request_sample", "credential_event", "reset", "usage_hour")
        for r in rows[kind]
    )
    decision = {
        "seat_id": incident,
        "event_ids": [failure["id"], grant["id"]],
        "target_label": name,
        "status": "WAITING",
        "outcome": "FOR REVIEW",
        "note": note,
        "decided_by": ACTOR,
        "decided_at": iso((last + timedelta(hours=1)).astimezone(UTC)),
    }
    return numbered("dc", [decision], ts="decided_at")[0]


def _requests(row: Row) -> int:
    value: int = row["requests"]
    return value


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack DB. Rerunning replaces them."""
    return write_pack(generate(), data_dir, db_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
