"""Agent-runs pack: five runs of an agent swarm and one API key that reached two workspaces.

One organisation has three workspaces. A swarm of workers ran five times in a week and shared
API keys; one key reached two workspaces, one of which holds health data. The pack holds the
runs (a start row and an end row each, with the counts the end carries), the five key and
workspace pairs with each pair's request count and last request, four sign-ins, and one decision
row in words. Row timestamps are UTC; the source states Pacific time, which is UTC-8 in
November, so each stamp is the stated one plus eight hours.

Everything is SYNTHETIC. Counts, spans, times and category words are typed below from another
project's records, each constant with its file and line; every id, key, organisation and
workspace name is coined here (one fixed-seed RNG, used for ids only). The places and the four
sign-ins are made up for the fuller story: the organisation, each sign-in and the decision hold a
`lat` and `lng`. Every network has a city (`NETWORKS`), and a run start, a run end and a key reach,
which name no network, take the network of a sign-in by time alone and so draw there; the
workspaces hold no place. The key reaches are a path for each key: each holds the seconds and the km
of the hop that ends at it (`hop_figures`, worked out from the stamps and places, never typed). A
row holds counts and category words, never the content of a request.
No rule and no arrow is declared.

Usage: `python -m seed_agent_runs_shared_key` from backend/ writes
data/agent-runs-shared-key/<kind>.json and the empty pack DB data/agent-runs-shared-key.db.
"""

from __future__ import annotations

import logging
import random
import string
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from db import PROJECT_ROOT
from seed_packs import Place, carry_network, hop_figures, iso, numbered, place_row, write_pack

Row = dict[str, Any]

DATA_DIR = PROJECT_ROOT / "data" / "agent-runs-shared-key"
DB_PATH = PROJECT_ROOT / "data" / "agent-runs-shared-key.db"
KINDS = ("org", "workspace", "run_start", "run_end", "key_reach", "signin", "decision")
SEED = 2026111802  # V12: the design's date and the story's number

# The source states every time in Pacific time, which is UTC-8 on these dates (case-2.js:218).
PT = timezone(timedelta(hours=-8), "PST")
# The story's span, in UTC days: 4 to 11 Nov 2026 (case-2.js:155, spec sheet cases.md:169-176).
SPAN_FIRST, SPAN_LAST = datetime(2026, 11, 4, tzinfo=UTC), datetime(2026, 11, 11, tzinfo=UTC)

ACTOR = "investigator"
ID_CHARS = string.ascii_uppercase + string.digits

# Made-up names (the source's are not carried).
ORG_NAME = "Ashenby Works"
# (workspace name, data class). One class word each: the source states that one of its three
# workspaces holds protected health information and that the other two do not (case-2.js:95).
WORKSPACES = (
    ("Corvane Wards", "health"),
    ("Ilmarrow Bench", "non-health"),
    ("Sedgefield Base", "non-health"),
)


def _pt(day: int, hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, second, tzinfo=PT)


# The five runs in start order: (start, end, minutes stated, tool calls, safeguard events,
# intervened, fell back). Start, end and minutes: spec sheet cases.md:169-176. Tool calls:
# case-2.js:239-243. Safeguard events, intervened and fell back: case-2.js:509-513.
RUNS = (
    (_pt(4, 8, 10), _pt(5, 15, 22), 1872, 41280, 0, 0, 0),
    (_pt(9, 11, 5), _pt(9, 14, 47), 222, 9620, 71, 49, 22),
    (_pt(9, 19, 30), _pt(10, 3, 18), 468, 21060, 88, 61, 27),
    (_pt(10, 9, 12), _pt(10, 16, 40), 448, 19400, 68, 47, 21),
    (_pt(10, 20, 5), _pt(11, 2, 31), 386, 2840, 9, 6, 3),
)
# The totals the source states, which the rows above must sum to: 94,200 tool calls
# (case-2.js:260), and 236 safeguard events, 163 intervened and 73 fell back (case-2.js:530).
TOTAL_TOOL_CALLS, TOTAL_EVENTS, TOTAL_INTERVENED, TOTAL_FELL_BACK = 94200, 236, 163, 73

KEYS = 4  # four keys in the source's table (case-2.js:605-609)
# The five key and workspace pairs: (key index, workspace index into WORKSPACES, requests, last
# request), in the order of the source's table (case-2.js:605-609). Key 0 is the shared one. The
# last request is stated to the second where the source's sample rows give it (case-2.js:617,
# 619, 620); the other two are stated to the minute only (case-2.js:607, 609), so their second
# is 00 and none is authored.
KEY_REACH = (
    (0, 0, 26, _pt(5, 14, 58, 41)),
    (0, 1, 78410, _pt(11, 2, 31, 9)),
    (1, 0, 1134, _pt(11, 5, 2)),
    (2, 1, 42170, _pt(11, 2, 29, 36)),
    (3, 2, 2310, _pt(11, 5, 12)),
)

# Made up for the fuller story: the organisation's city, the two networks the sign-ins come from
# (label, address in a documentation range, place) and the four sign-ins in time order (workspace
# index into WORKSPACES, method, network index, stamp in UTC). A place is (city, country, lat,
# lng). The sign-ins are not named by the decision, and none moves its time.
ORG_PLACE = ("Minneapolis", "US", 44.9778, -93.265)
NETWORK_FACTS = (
    ("net-101 corporate", "198.51.100.10", ORG_PLACE),
    ("net-102 corporate", "203.0.113.50", ("Chicago", "US", 41.8781, -87.6298)),
)
# Every network's city, one table, read from NETWORK_FACTS so no place is typed twice.
NETWORKS: dict[str, Place] = {label: place for label, _ip, place in NETWORK_FACTS}
SIGNINS = (
    (0, "password", 0, datetime(2026, 11, 4, 16, 20, tzinfo=UTC)),
    (1, "single sign-on", 0, datetime(2026, 11, 9, 19, 0, tzinfo=UTC)),
    (1, "single sign-on", 1, datetime(2026, 11, 10, 17, 5, tzinfo=UTC)),
    (2, "password", 1, datetime(2026, 11, 11, 4, 0, tzinfo=UTC)),
)
SIGNIN_OUTCOME, SIGNIN_CLIENT = "success", "console web"

DECISION_LAG = timedelta(hours=1)  # V5: one hour after the last event

log = logging.getLogger("seed_agent_runs_shared_key")


def _check_constants() -> None:
    """The typed constants must agree with each other and with the story's span."""
    for start, end, minutes, _calls, events, intervened, fell_back in RUNS:
        if (end - start) != timedelta(minutes=minutes):
            raise ValueError(f"run starting {start} does not last {minutes} minutes")
        if intervened + fell_back != events:
            raise ValueError(f"run starting {start}: {intervened} + {fell_back} != {events}")
    sums = [
        sum(run[3] for run in RUNS),
        sum(run[4] for run in RUNS),
        sum(run[5] for run in RUNS),
        sum(run[6] for run in RUNS),
    ]
    if sums != [TOTAL_TOOL_CALLS, TOTAL_EVENTS, TOTAL_INTERVENED, TOTAL_FELL_BACK]:
        raise ValueError(f"the runs sum to {sums}, not the stated totals")
    stamps = [t for start, end, *_ in RUNS for t in (start, end)]
    stamps += [last for *_, last in KEY_REACH]
    stamps += [at for *_, at in SIGNINS]
    if not all(SPAN_FIRST <= t.astimezone(UTC) < SPAN_LAST + timedelta(days=1) for t in stamps):
        raise ValueError("a stamp lies outside the story's span")


def _coin(rng: random.Random, prefix: str, taken: set[str]) -> str:
    """A made-up id `<prefix>-XXXXXX`, unique in the pack."""
    while True:
        value = f"{prefix}-" + "".join(rng.choice(ID_CHARS) for _ in range(6))
        if value not in taken:
            taken.add(value)
            return value


def _place(place: tuple[str, str, float, float]) -> Row:
    city, country, lat, lng = place
    return {"city": city, "country": country, "lat": lat, "lng": lng}


def generate() -> dict[str, list[Row]]:
    """The pack's rows by kind: a pure function of this module."""
    _check_constants()
    rng, taken = random.Random(SEED), set[str]()
    org_id = _coin(rng, "org", taken)
    workspace_ids = [_coin(rng, "wsp", taken) for _ in WORKSPACES]
    run_ids = [_coin(rng, "run", taken) for _ in RUNS]
    key_ids = [_coin(rng, "key", taken) for _ in range(KEYS)]

    org = numbered(
        "og", [{"timestamp": 0, "org_id": org_id, "org_name": ORG_NAME, **_place(ORG_PLACE)}]
    )
    workspace = numbered(
        "wk",
        [
            {"timestamp": 0, "workspace_id": wid, "workspace_name": name, "data_class": klass}
            for wid, (name, klass) in zip(workspace_ids, WORKSPACES, strict=True)
        ],
    )
    run_start = numbered(
        "rs",
        [{"timestamp": iso(run[0]), "run_id": rid} for rid, run in zip(run_ids, RUNS, strict=True)],
    )
    run_end = numbered(
        "re",
        [
            {
                "timestamp": iso(end),
                "run_id": rid,
                "duration_h": round(minutes / 60, 1),
                "tool_calls": calls,
                "safeguard_events": events,
                "intervened": intervened,
                "fell_back": fell_back,
            }
            for rid, (_start, end, minutes, calls, events, intervened, fell_back) in zip(
                run_ids, RUNS, strict=True
            )
        ],
    )
    key_reach = numbered(
        "kr",
        [
            {
                "timestamp": iso(last),
                "credential_id": key_ids[key],
                "workspace_id": workspace_ids[ws],
                "requests": requests,
            }
            for key, ws, requests, last in KEY_REACH
        ],
        ties=("credential_id",),
    )
    signin = numbered(
        "si",
        [
            {
                "timestamp": iso(at),
                "workspace_id": workspace_ids[ws],
                "outcome": SIGNIN_OUTCOME,
                "method": method,
                "client": SIGNIN_CLIENT,
                "network_id": NETWORK_FACTS[net][0],
                "ip": NETWORK_FACTS[net][1],
                **_place(NETWORK_FACTS[net][2]),
            }
            for ws, method, net, at in SIGNINS
        ],
        ties=("workspace_id",),
    )

    # A run start, a run end and a key reach name no network, so each takes the network of a
    # sign-in, by time alone (the nearest earlier one, else the earliest): a run row carries only
    # `run_id`, so it reads every sign-in; a key reach reads the sign-ins of its own workspace. The
    # sign-ins are built above, so the ids of the other kinds are what `numbered` gave them.
    for row in (*run_start, *run_end):
        row["network_id"] = carry_network(row, signin, by=None)
    for row in key_reach:
        row["network_id"] = carry_network(row, signin, by="workspace_id")
    for row in (*run_start, *run_end, *key_reach, *signin):
        place_row(row, NETWORKS)
    # A key's path is its reaches: each holds the seconds and km of the hop that ends at it (a
    # key's first reach holds neither).
    hop_figures(key_reach, "credential_id", NETWORKS)

    shared = [r for r in key_reach if r["credential_id"] == key_ids[0]]
    big, small = max(shared, key=lambda r: r["requests"]), min(shared, key=lambda r: r["requests"])
    note = (
        f"{len(RUNS)} runs made {TOTAL_TOOL_CALLS:,} tool calls and met {TOTAL_EVENTS} safeguard "
        f"events: {TOTAL_INTERVENED} intervened and {TOTAL_FELL_BACK} fell back. One of {KEYS} "
        f"keys reached {len(shared)} workspaces, with {big['requests']:,} requests in a "
        f"{_class_of(big, workspace_ids)} workspace and {small['requests']:,} in a "
        f"{_class_of(small, workspace_ids)} workspace."
    )
    last_event = max(datetime.fromisoformat(r["timestamp"]) for r in [*run_end, *key_reach])
    decision = numbered(
        "dc",
        [
            {
                "org_id": org_id,
                "event_ids": [r["id"] for r in shared],
                "target_label": ORG_NAME,
                "status": "WAITING",
                "outcome": "FOR REVIEW",
                "note": note,
                "decided_by": ACTOR,
                "decided_at": iso(last_event + DECISION_LAG),
            }
        ],
        ts="decided_at",
    )
    # The decision sits at its organisation's city: two keys after the ones it has today.
    decision = [{**row, "lat": ORG_PLACE[2], "lng": ORG_PLACE[3]} for row in decision]
    return {
        "org": org,
        "workspace": workspace,
        "run_start": run_start,
        "run_end": run_end,
        "key_reach": key_reach,
        "signin": signin,
        "decision": decision,
    }


def _class_of(reach: Row, workspace_ids: list[str]) -> str:
    return WORKSPACES[workspace_ids.index(reach["workspace_id"])][1]


def write(data_dir: Path = DATA_DIR, db_path: Path = DB_PATH) -> list[Path]:
    """Write one JSON file per kind and the empty pack DB. Rerunning replaces them."""
    return write_pack(generate(), data_dir, db_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    for path in write():
        log.info("wrote %s", path)


if __name__ == "__main__":
    main()
