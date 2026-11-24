"""Volume-step scenario pack: ten days of request volume, a step, and three days of failed calls.

One organisation with four workspaces. For seven days the daily request count of one workspace
holds between 25,640 and 26,820. On the eighth day it reads 83,810, then 129,660, then 29,700
(the last is a partial day). Five periods carry how many requests a safeguard evaluated and how
many it acted on. One notice to the organisation, at a stated minute, bounced. On three days a
separate path of calls fails every time (142, 417 and 99 calls). One decision row, in words,
waits for review. Four sign-ins, made up for the fuller story, come from two networks.

Where the numbers come from. `S4` below is the fourth case file of the other project
(`src/data/case-4.js`), read once by hand: a count, a time, a duration or a category word is
typed here as a named constant with a comment that cites the line. Nothing else is carried. This
module opens no file of that project. Every id, name and key is coined here: ids come from one
`random.Random(SEED)` and are used for nothing else, names are written in the constants below,
and no count, time or order is random. Nothing reads a clock.

The organisation, each sign-in and the decision hold a place (`lat` and `lng`) made up for the
fuller story, and no other row has one. Every network has a city (`NETWORKS`), and each sign-in
sits at the city of the network it names. No rule or arrow is declared by the pack's manifest, and
no label states a conclusion: the rows hold counts and category words, never the content of a
request.

Times are UTC. The source's day column is US Pacific, UTC-8 in November (S4:296, 473), so a day
row sits at 08:00 UTC and a period row at its opening edge converted from Pacific. The first
failed-call day is a partial day in the source (from 10:00 Pacific, S4:685); its row still sits at
that day's start.

Usage: `python -m seed_volume_step` from backend/ writes data/volume-step/<kind>.json and the empty
pack database data/volume-step.db (the registry requires a database per pack; the rows live in the
files).
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from db import PROJECT_ROOT
from seed_packs import Place, iso, numbered, place_row, write_pack

Row = dict[str, Any]

DATA_DIR = PROJECT_ROOT / "data" / "volume-step"
DB_PATH = PROJECT_ROOT / "data" / "volume-step.db"
KINDS = (
    "org",
    "workspace",
    "usage_day",
    "period",
    "failed_call_day",
    "notice",
    "signin",
    "decision",
)
SEED = 2026111804  # V12: the date of the design (2026-11-18) and the story's number

# The source states every time in US Pacific, UTC-8 (S4:296, S4:473). The generator converts to
# UTC through `iso`; it never learns the display zone.
PACIFIC = timezone(timedelta(hours=-8), "PST")


def _pacific(day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=PACIFIC)


# One organisation (coined name). Its enrolment date is a date as the source states it, a field
# of the org row and not a stamped row (S4:89: approved 18 Aug 2026). It lies outside the span.
ORG_NAME = "Larkmoor Group"
ENROLLED_SINCE = "2026-08-18"

# Four workspaces (S4:618-621), coined names. The first is the one that holds the enrolment and
# the volume (S4:155: the daily totals are that workspace's); it is the only one with an exemption
# on file (S4:618 lists one, S4:619-621 list none). The category words are coined.
WORKSPACES = (
    ("Quillon Ops", "zero_retention_with_exemption"),
    ("Tarnmere Desk", "zero_retention"),
    ("Wexhall Review", "zero_retention"),
    ("Brindle Works", "zero_retention"),
)

# Requests per day of that workspace, day of November (Pacific day): S4:225-234, the series at
# S4:237. Seven days between 25,640 and 26,820, then the step. 11 Nov is a partial day, to 05:30
# (S4:155).
DAY_REQUESTS = (
    (2, 26_480),
    (3, 26_610),
    (4, 26_300),
    (5, 26_820),
    (6, 26_150),
    (7, 25_640),
    (8, 25_910),
    (9, 83_810),
    (10, 129_660),
    (11, 29_700),
)

# Five periods: opening edge in Pacific (S4:173 for the first, S4:428-431 for the others; the
# same edges in S4:483), requests evaluated by the safeguard and requests it acted on (S4:495-499).
PERIODS = (
    (_pacific(2), 183_910, 1_214),
    (_pacific(9), 11_370, 80),
    (_pacific(9, 10, 20), 43_060, 13_180),
    (_pacific(10), 76_950, 24_010),
    (_pacific(11), 17_600, 5_540),
)
# The stamp the third period opens at, stated as 9 Nov 10:20 Pacific (S4:296). The source calls
# it the first fallback there and the launch elsewhere (S4:120, 262); the field keeps the design's
# name.
LAUNCH_AT = _pacific(9, 10, 20)

# The one notice: 9 Nov 10:05 Pacific, delivery bounced (S4:95, S4:618). It went to the
# organisation; the pack ties it to the workspace the volume belongs to.
NOTICE_AT = _pacific(9, 10, 5)
NOTICE_DELIVERY = "bounced"

# Failed calls of a separate path, per day (S4:685-687); the source's day column is Pacific
# (S4:683). Every call failed. The path is separate from the workspace (S4:707), so these rows
# carry no workspace. The cause is a coined category word for the one setting the source names.
FAILED_CALLS = ((9, 142), (10, 417), (11, 99))
FAILED_CAUSE = "retention_conflict"

# The end of the source's window, 11 Nov 05:30 Pacific (S4:155, S4:175). The decision is one hour
# after it (V5): the last day's count and the last failed-call day are complete by then.
WINDOW_END = _pacific(11, 5, 30)
DECISION_LAG = timedelta(hours=1)

ACTOR = "investigator"

# Made up for the fuller story. A place is (city, country, lat, lng). The organisation's city; the
# two networks the sign-ins come from (label, address in a documentation range, place); and the
# four sign-ins as (workspace index into WORKSPACES, network index, method, stamp in UTC).
ORG_PLACE = ("Salt Lake City", "US", 40.7608, -111.891)
NETWORK_FACTS = (
    ("net-101 corporate", "198.51.100.70", ORG_PLACE),
    ("net-102 corporate", "203.0.113.90", ("Provo", "US", 40.2338, -111.6585)),
)
# Every network's city, one table, read from NETWORK_FACTS so no place is typed twice.
NETWORKS: dict[str, Place] = {label: place for label, _ip, place in NETWORK_FACTS}
SIGNINS = (
    (0, 0, "single sign-on", datetime(2026, 11, 3, 17, 0, tzinfo=UTC)),
    (0, 0, "single sign-on", datetime(2026, 11, 9, 17, 55, tzinfo=UTC)),
    (1, 1, "password", datetime(2026, 11, 10, 18, 40, tzinfo=UTC)),
    (0, 0, "single sign-on", datetime(2026, 11, 10, 16, 30, tzinfo=UTC)),
)
SIGNIN_OUTCOME, SIGNIN_CLIENT = "success", "console web"

log = logging.getLogger("seed_volume_step")


def _token(rng: random.Random, taken: set[str]) -> str:
    """Five hex digits, never twice in one run."""
    while True:
        value = f"{rng.randrange(16**5):05x}"
        if value not in taken:
            taken.add(value)
            return value


def _place(place: tuple[str, str, float, float]) -> Row:
    city, country, lat, lng = place
    return {"city": city, "country": country, "lat": lat, "lng": lng}


def _clock(at: datetime) -> str:
    """'9 Nov 18:05 UTC': a stamp the way the decision note writes it."""
    utc = at.astimezone(UTC)
    return f"{utc.day} {utc:%b %H:%M} UTC"


def _note(rows: dict[str, list[Row]]) -> str:
    """Counts the rows show, and nothing else: no cause, no verdict."""
    days = [r["requests"] for r in rows["usage_day"]]
    flat, step = days[:7], days[7:]
    failed = [r["failed_calls"] for r in rows["failed_call_day"]]
    notice = rows["notice"][0]
    exempt = sum(w["retention_setting"].endswith("exemption") for w in rows["workspace"])
    return (
        f"Daily requests held between {min(flat):,} and {max(flat):,} for {len(flat)} days, "
        f"then read {step[0]:,}, {step[1]:,} and {step[2]:,}. "
        f"Failed calls on {len(failed)} days: {failed[0]}, {failed[1]} and {failed[2]}, "
        f"{sum(failed)} in all. "
        f"One notice at {_clock(datetime.fromisoformat(notice['timestamp']))}, "
        f"delivery {notice['delivery']}. "
        f"{len(rows['workspace'])} workspaces, {exempt} with an exemption on file. "
        "Times are UTC."
    )


def generate() -> dict[str, list[Row]]:
    """The whole pack as rows, in KINDS order. A pure function of this module."""
    rng = random.Random(SEED)  # ids only
    taken: set[str] = set()
    org_id = f"org-{_token(rng, taken)}"
    workspaces = [
        {
            "id": (wid := f"ws-{_token(rng, taken)}"),
            "workspace_id": wid,
            "workspace_name": name,
            "retention_setting": setting,
        }
        for name, setting in WORKSPACES
    ]
    volume_ws = workspaces[0]["workspace_id"]

    rows: dict[str, list[Row]] = {
        "org": [
            {
                "id": org_id,
                "org_id": org_id,
                "org_name": ORG_NAME,
                "enrolled_since": ENROLLED_SINCE,
                **_place(ORG_PLACE),
            }
        ],
        "workspace": workspaces,
        "usage_day": numbered(
            "ud",
            [
                {
                    "workspace_id": volume_ws,
                    "timestamp": iso(_pacific(day)),
                    "requests": requests,
                }
                for day, requests in DAY_REQUESTS
            ],
            width=2,
        ),
        "period": numbered(
            "pd",
            [
                {
                    "workspace_id": volume_ws,
                    "timestamp": iso(start),
                    "evaluated": evaluated,
                    "events": events,
                    "launch_at": iso(LAUNCH_AT) if start == LAUNCH_AT else None,
                }
                for start, evaluated, events in PERIODS
            ],
            width=2,
        ),
        "failed_call_day": numbered(
            "fc",
            [
                {"timestamp": iso(_pacific(day)), "failed_calls": calls, "cause": FAILED_CAUSE}
                for day, calls in FAILED_CALLS
            ],
            width=2,
        ),
        "notice": numbered(
            "nt",
            [
                {
                    "workspace_id": volume_ws,
                    "timestamp": iso(NOTICE_AT),
                    "delivery": NOTICE_DELIVERY,
                }
            ],
            width=2,
        ),
        "signin": numbered(
            "si",
            [
                {
                    "timestamp": iso(at),
                    "workspace_id": workspaces[ws]["workspace_id"],
                    "outcome": SIGNIN_OUTCOME,
                    "method": method,
                    "client": SIGNIN_CLIENT,
                    "network_id": NETWORK_FACTS[net][0],
                    "ip": NETWORK_FACTS[net][1],
                    **_place(NETWORK_FACTS[net][2]),
                }
                for ws, net, method, at in SIGNINS
            ],
            width=2,
            ties=("workspace_id",),
        ),
    }
    # Each sign-in names its network, so it draws at that network's city: the typed place and the
    # table are checked against each other here, and neither can drift.
    for row in rows["signin"]:
        place_row(row, NETWORKS)
    # The rows the note counts: the launch period, the notice and the three failed-call days.
    launch_period = next(r for r in rows["period"] if r["launch_at"] is not None)
    event_ids = [launch_period["id"], rows["notice"][0]["id"]]
    event_ids += [r["id"] for r in rows["failed_call_day"]]
    rows["decision"] = numbered(
        "dec",
        [
            {
                "org_id": org_id,
                "event_ids": event_ids,
                "target_label": ORG_NAME,
                "status": "WAITING",
                "outcome": "FOR REVIEW",
                "note": _note(rows),
                "decided_by": ACTOR,
                "decided_at": iso(WINDOW_END + DECISION_LAG),
            }
        ],
        ts="decided_at",
        width=2,
    )
    # The decision sits at its organisation's city: two keys after the ones it has today.
    rows["decision"] = [{**d, "lat": ORG_PLACE[2], "lng": ORG_PLACE[3]} for d in rows["decision"]]
    return rows


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack database. Rerunning replaces them."""
    return write_pack(generate(), data_dir, db_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
