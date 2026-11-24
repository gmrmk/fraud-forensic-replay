"""The seat-failed-signins pack: a pure function of seed_seat_failed_signins, with the counts,
stamps and sums of Story 5 of the other-cases design, and none of the fences broken.

Expected stamps are written here in UTC, literally, so a change to the generator's zone handling
turns a test red. Story facts about which seat did what are read off the rows, not off a second
copy of the generator's constants."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

import seed_seat_failed_signins as sp
from db import PROJECT_ROOT
from tests._left_out import require_files

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
COUNTS = dict(zip(KINDS, (2, 3, 4, 1, 1, 4, 11, 1), strict=True))
# The span of the pack's stamped rows (V7): 9 to 11 Nov 2026, as a UTC reading.
SPAN = (datetime(2026, 11, 9, tzinfo=UTC), datetime(2026, 11, 12, tzinfo=UTC))
TIMED = ("signin", "request_sample", "credential_event", "reset", "usage_hour")

# Stamps in UTC. The source states them at UTC-8, so each is the stated time plus 8 hours.
SIGNINS = [
    # (stamp, which seat, network, outcome, attempts, window_min)
    ("2026-11-11T02:40:00+00:00", "incident", "campus", "success", 1, 0),
    ("2026-11-11T10:31:08+00:00", "incident", "hosting", "failure", 14, 15),
    ("2026-11-11T10:47:22+00:00", "incident", "hosting", "success", 1, 0),
    ("2026-11-11T11:31:12+00:00", "steady", "campus", "success", 1, 0),
]
REQUEST_AT = "2026-11-11T02:52:30+00:00"
CREDENTIAL_AT = "2026-11-11T10:49:40+00:00"
RESETS = [
    ("2026-11-09T19:20:48+00:00", "earlier"),
    ("2026-11-11T10:51:09+00:00", "incident"),
    ("2026-11-11T11:27:44+00:00", "incident"),
    ("2026-11-11T11:58:20+00:00", "incident"),
]
INCIDENT_HOURS = {  # both models summed
    "2026-11-11T10:00:00+00:00": 40,
    "2026-11-11T11:00:00+00:00": 1722,
    "2026-11-11T12:00:00+00:00": 246,
}
STEADY_HOURS = dict(
    zip(
        (f"2026-11-11T{h:02d}:00:00+00:00" for h in range(6, 14)),
        (142, 138, 145, 139, 141, 144, 143, 71),
        strict=True,
    )
)
DECIDED_AT = "2026-11-11T14:00:00+00:00"


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return sp.generate()


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)


@pytest.fixture(scope="module")
def seats(rows) -> dict[str, dict]:
    """The three seats by their part in the story, read off the rows."""
    (failure,) = [s for s in rows["signin"] if s["outcome"] == "failure"]
    steady = [s for s in rows["seat"] if s["signins_total"] == 187]
    assert len(steady) == 1
    by_id = {s["seat_id"]: s for s in rows["seat"]}
    rest = [
        s for s in rows["seat"] if s["seat_id"] not in (failure["seat_id"], steady[0]["seat_id"])
    ]
    assert len(rest) == 1
    return {"incident": by_id[failure["seat_id"]], "steady": steady[0], "earlier": rest[0]}


# ---- The pack as a whole ---------------------------------------------------------------------


def test_the_pack_is_a_pure_function_of_the_module():
    assert sp.generate() == sp.generate()
    assert sp.SEED == 2026111805, "V12: the date of the design and the story's number"


def test_every_kind_is_present_with_the_tables_row_count_and_unique_ids(rows):
    assert tuple(rows) == sp.KINDS == KINDS
    assert {k: len(v) for k, v in rows.items()} == COUNTS
    assert sum(len(v) for v in rows.values()) == 27
    every_id = [r["id"] for items in rows.values() for r in items]
    assert len(every_id) == len(set(every_id)) == 27
    assert all(next(iter(r)) == "id" for items in rows.values() for r in items)


def test_only_six_kinds_have_a_place_and_every_stamp_has_an_offset(rows):
    placed = ("org", "signin", "request_sample", "credential_event", "reset", "decision")
    for kind, items in rows.items():
        for row in items:
            if kind in placed:
                assert all(isinstance(row[a], int | float) for a in ("lat", "lng")), (kind, row)
            else:
                assert not {"lat", "lng", "latitude", "longitude", "coords"} & set(row), (kind, row)
            for key in ("timestamp", "decided_at"):
                value = row.get(key)
                if isinstance(value, str):
                    assert _at(value).utcoffset() == timedelta(0), (kind, row["id"], value)


# ---- Stamps ----------------------------------------------------------------------------------


def test_untimed_rows_carry_timestamp_zero_and_timed_rows_a_utc_stamp(rows):
    for kind in ("org", "seat"):
        assert all(r["timestamp"] == 0 for r in rows[kind]), kind
    for kind in TIMED:
        assert all(isinstance(r["timestamp"], str) for r in rows[kind]), kind


def test_the_sign_ins_are_the_four_stamps_of_the_table(rows, seats):
    role = {seats[k]["seat_id"]: k for k in seats}
    got = [
        (
            s["timestamp"],
            role[s["seat_id"]],
            "campus" if s["network_id"].endswith("education") else "hosting",
            s["outcome"],
            s["attempts"],
            s["window_min"],
        )
        for s in rows["signin"]
    ]
    assert got == SIGNINS
    assert len({s["network_id"] for s in rows["signin"]}) == 2


def test_the_request_the_credential_event_and_the_resets_are_the_stamps_of_the_table(rows, seats):
    role = {seats[k]["seat_id"]: k for k in seats}
    (request,) = rows["request_sample"]
    assert request["timestamp"] == REQUEST_AT and role[request["seat_id"]] == "incident"
    # The request is on the network of the first sign-in, before the failures.
    assert request["network_id"] == rows["signin"][0]["network_id"]
    (grant,) = rows["credential_event"]
    assert grant["timestamp"] == CREDENTIAL_AT and role[grant["seat_id"]] == "incident"
    assert grant["lifetime_h"] == 720 and grant["event"]
    assert [(r["timestamp"], role[r["seat_id"]]) for r in rows["reset"]] == RESETS


def test_the_failures_sit_on_the_network_of_the_success_and_not_on_the_campus_one(rows):
    campus, fail, win, steady = rows["signin"]
    assert fail["network_id"] == win["network_id"] != campus["network_id"]
    assert steady["network_id"] == campus["network_id"]


def test_the_incident_runs_inside_the_span_and_in_order(rows):
    stamps = [r["timestamp"] for k in TIMED for r in rows[k]]
    assert all(SPAN[0] <= _at(s) < SPAN[1] for s in stamps)
    fail, win, grant = _at(SIGNINS[1][0]), _at(SIGNINS[2][0]), _at(CREDENTIAL_AT)
    assert fail < win < grant < _at(RESETS[1][0])
    assert grant - win == timedelta(minutes=2, seconds=18)


# ---- Hours and sums --------------------------------------------------------------------------


def test_an_hour_row_lies_on_the_hour_and_the_magnitude_kind_holds_no_other_instant(rows):
    for r in rows["usage_hour"]:
        at = _at(r["timestamp"])
        assert (at.minute, at.second, at.microsecond) == (0, 0, 0), r
    assert _at(REQUEST_AT).minute != 0, "the off-hour request is a kind of its own"
    assert REQUEST_AT not in {r["timestamp"] for r in rows["usage_hour"]}


def test_the_hourly_requests_read_as_the_table_gives_them(rows, seats):
    by_seat: dict[str, dict[str, int]] = {}
    for r in rows["usage_hour"]:
        by_seat.setdefault(r["seat_id"], {})[r["timestamp"]] = r["requests"]
    assert by_seat[seats["incident"]["seat_id"]] == INCIDENT_HOURS
    assert by_seat[seats["steady"]["seat_id"]] == STEADY_HOURS
    assert seats["earlier"]["seat_id"] not in by_seat
    assert list(by_seat[seats["incident"]["seat_id"]].values()) == [40, 1722, 246]
    assert sum(INCIDENT_HOURS.values()) == 2008 and sum(STEADY_HOURS.values()) == 1063
    assert len(rows["usage_hour"]) == 11


def test_the_lane_sums_every_row_at_one_instant(rows):
    total: dict[str, int] = {}
    for r in rows["usage_hour"]:
        total[r["timestamp"]] = total.get(r["timestamp"], 0) + r["requests"]
    assert total["2026-11-11T10:00:00+00:00"] == 40 + 141
    assert total["2026-11-11T11:00:00+00:00"] == 1722 + 144
    assert total["2026-11-11T12:00:00+00:00"] == 246 + 143
    assert total["2026-11-11T13:00:00+00:00"] == 71
    assert len(total) == 8


# ---- Untimed rows ----------------------------------------------------------------------------


def test_the_seats_carry_the_stated_totals_and_the_dates_as_fields(rows, seats):
    assert seats["steady"]["signins_total"] == 187 and seats["steady"]["addresses"] == 15
    assert seats["steady"]["first_signin_on"] == "2026-09-12"
    for key in ("incident", "earlier"):
        seat = seats[key]
        # Not stated in the source: the column is there and holds nothing, never a placeholder.
        assert (seat["signins_total"], seat["addresses"], seat["first_signin_on"]) == (None,) * 3
    assert len({s["seat_id"] for s in rows["seat"]}) == 3
    assert len({s["seat_name"] for s in rows["seat"]}) == 3
    assert len({o["org_id"] for o in rows["org"]}) == 2
    assert len({o["org_name"] for o in rows["org"]}) == 2


def test_every_row_names_a_seat_or_network_that_exists(rows):
    seat_ids = {s["seat_id"] for s in rows["seat"]}
    networks = {s["network_id"] for s in rows["signin"]}
    for kind in ("signin", "request_sample", "credential_event", "reset", "usage_hour"):
        assert all(r["seat_id"] in seat_ids for r in rows[kind]), kind
    assert all(r["network_id"] in networks for r in rows["request_sample"])
    assert all(r["network_id"] in networks for r in rows["credential_event"])
    assert all(r["network_id"] in networks for r in rows["reset"]), "a sign-in's network"
    labels = sorted(int(n.split()[0].removeprefix("net-")) for n in networks)
    assert labels == [101, 102], "V6: net-NNN numbered from 101, one table for the pack"
    assert {n.split()[1] for n in networks} == {"education", "hosting"}


# ---- The decision ----------------------------------------------------------------------------


def test_the_decision_row_is_one_row_in_words_one_hour_after_the_last_event(rows, seats):
    (d,) = rows["decision"]
    assert (d["status"], d["outcome"], d["decided_by"]) == ("WAITING", "FOR REVIEW", "investigator")
    assert d["decided_at"] == DECIDED_AT
    last = max(_at(r["timestamp"]) for k in TIMED for r in rows[k])
    assert _at(d["decided_at"]) == last + timedelta(hours=1)
    assert d["seat_id"] == seats["incident"]["seat_id"]
    assert d["target_label"] == seats["incident"]["seat_name"]
    ids = {r["id"]: (k, r) for k in TIMED for r in rows[k]}
    assert d["event_ids"] and all(e in ids for e in d["event_ids"])
    assert {ids[e][0] for e in d["event_ids"]} == {"signin", "credential_event"}
    assert all(ids[e][1]["seat_id"] == d["seat_id"] for e in d["event_ids"])


def test_every_number_of_the_note_is_a_count_the_rows_show(rows, seats):
    (d,) = rows["decision"]
    fail = next(s for s in rows["signin"] if s["outcome"] == "failure")
    (grant,) = rows["credential_event"]
    resets = [r for r in rows["reset"] if r["seat_id"] == d["seat_id"]]
    span = (_at(resets[-1]["timestamp"]) - _at(resets[0]["timestamp"])).total_seconds() // 60
    busiest = max(
        (r for r in rows["usage_hour"] if r["seat_id"] == d["seat_id"]), key=lambda r: r["requests"]
    )
    other = next(
        r
        for r in rows["usage_hour"]
        if r["seat_id"] == seats["steady"]["seat_id"] and r["timestamp"] == busiest["timestamp"]
    )
    expected = {
        str(fail["attempts"]),
        str(fail["window_min"]),
        str(grant["lifetime_h"]),
        str(len(resets)),
        str(int(span)),
        f"{busiest['requests']:,}",
        f"{other['requests']:,}",
        "1",
    }
    # Each number in the note, and nothing else numeric, is one of those counts.
    numbers = set(re.findall(r"\d[\d,]*", d["note"]))
    assert numbers == expected, (numbers, expected)
    assert seats["steady"]["seat_name"] in d["note"]
    assert busiest["requests"] == 1722 and other["requests"] == 144 and int(span) == 67
    assert not re.search(r"takeover|stolen|fraud|attack|compromis|guilty|verdict", d["note"], re.I)


# ---- The fences ------------------------------------------------------------------------------

BACKEND = PROJECT_ROOT / "backend"
PACK_FILES = [
    BACKEND / "seed_seat_failed_signins.py",
    BACKEND / "scenarios" / "seat-failed-signins.scenario.json",
    BACKEND / "tests" / "test_seat_failed_signins_pack.py",
    BACKEND / "tests" / "test_seat_failed_signins_manifest.py",
    BACKEND / "tests" / "test_seat_failed_signins_places.py",
    *(PROJECT_ROOT / "data" / "seat-failed-signins" / f"{k}.json" for k in KINDS),
]
# The shapes an id of the other project takes. The tail must hold a digit, so a column such as
# `org_id` or `seat_id` does not match; a system number and a ticket number are shapes too. The two
# case-sensitive shapes mark their left edge with a look-behind, which is the word edge without a
# backslash after the group's colon (a drive letter, a colon and a backslash read as a path).
OTHER_ID = re.compile(
    r"\b(?:org|cred|sess|seat|ws|key)_(?=[0-9a-z_]*\d)[0-9a-z_]+\b"
    r"|\b[a-z]{3}-\d{2}\b|(?-i:(?<!\w)[A-Z]{2,3}-\d{4}\b)|(?-i:(?<!\w)AS\d{3,}\b)"
    r"|autonomous\s+system",
    re.IGNORECASE,
)


def _profile_words() -> set[str]:
    """The two canonical profiles' first and last names, read from the profiles file at test
    time so that no new file spells them. Two full names are asserted found, so the fence below
    cannot pass on an empty set."""
    profiles = PROJECT_ROOT / "docs" / "decisions" / "PROFILES.md"
    require_files(profiles, why="the fence has no profile name to look for without it")
    text = profiles.read_text(encoding="utf-8")
    names = re.findall(r"^## Customer [AB] .{1,3} ([A-Z][a-z]+) ([A-Z][a-z]+),", text, re.M)
    assert len(names) == 2, names
    return {w.lower() for pair in names for w in pair}


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def _platform(name: str) -> list[dict]:
    return json.loads((PROJECT_ROOT / "data" / "platform-access" / name).read_text("utf-8"))


def test_the_profile_fence_reads_four_words_and_flags_each_one():
    words = _profile_words()
    assert len(words) == 4
    for w in words:
        assert _words(f"a seat of {w.upper()}.") & words == {w}
        assert not _words(f"a {w}ish seat") & words, "a word, not a substring"


def test_no_new_file_holds_a_profile_name_or_an_organisation_of_the_token_story():
    words = _profile_words()
    org_names = {o["org_name"] for o in _platform("org.json")}
    assert len(org_names) == 30
    for path in PACK_FILES:
        text = path.read_text(encoding="utf-8")
        assert not _words(text) & words, path.name
        assert not [n for n in org_names if n in text], path.name


def test_the_packs_names_and_ids_do_not_meet_the_token_stories(rows):
    platform_orgs = _platform("org.json")
    sign_ins = _platform("console_signin.json")
    assert not {o["org_name"] for o in rows["org"]} & {o["org_name"] for o in platform_orgs}
    assert not {o["org_id"] for o in rows["org"]} & {o["org_id"] for o in platform_orgs}
    assert not {s["seat_id"] for s in rows["seat"]} & {s["seat_id"] for s in sign_ins}
    assert not _words(json.dumps(rows)) & _profile_words()


def test_no_new_file_holds_an_id_in_the_form_the_other_project_uses():
    for path in PACK_FILES:
        text = path.read_text(encoding="utf-8")
        assert not OTHER_ID.findall(text), (path.name, OTHER_ID.findall(text)[:3])


def test_the_id_pattern_bites_on_strings_built_here_and_spares_this_packs_own_names():
    built = [
        "org" + "_" + "a1b2" + "c3d4",
        "cred" + "_xy_" + "7k2m9",
        "sess" + "_" + "9f8e7d",
        "ab" + "c-14",
        "Q" + "Z-1234",
        "A" + "S65123",
        "autonomous " + "system",
        "Autonomous" + "   SYSTEM",  # any case, any run of white space
        "see AS" + "64500 here",  # a word of its own, inside a line
        "(AB" + "C-1234)",  # three capitals, a hyphen, four digits
        "KEY_" + "a1",  # the prefix in capitals still counts
    ]
    for text in built:
        assert OTHER_ID.search(text), text
    for text in ("org_id", "seat_id", "org-12345", "seat-12345", "net-101 education", "sg-0001"):
        assert not OTHER_ID.search(text), text
    # The two capital-letter shapes are case sensitive and stand at a word edge.
    for text in ("qz-1234", "as65123", "BAS65123", "xAS65123", "ABCD-1234", "AB-123", "AB-12345"):
        assert not OTHER_ID.search(text), text
    assert not OTHER_ID.search("autonomoussystem")


# ---- Writing ---------------------------------------------------------------------------------


def test_write_puts_one_file_per_kind_and_an_empty_database_and_is_repeatable(tmp_path: Path):
    data_dir, db_path = tmp_path / "pack", tmp_path / "pack.db"
    first = sp.write(data_dir, db_path)
    assert [p.name for p in first] == [*(f"{k}.json" for k in KINDS), "pack.db"]
    before = {p.name: p.read_bytes() for p in first if p.suffix == ".json"}
    built = sp.generate()
    for kind in KINDS:
        assert json.loads(before[f"{kind}.json"].decode("utf-8")) == built[kind]
    sp.write(data_dir, db_path)
    assert all(p.read_bytes() == before[p.name] for p in first if p.suffix == ".json")
    conn = sqlite3.connect(db_path)
    try:
        tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        assert tables, "the schema is there"
        assert not any(
            conn.execute(f'SELECT 1 FROM "{t}" LIMIT 1').fetchone()
            for t in tables
            if not t.startswith("sqlite_")
        ), "and no row"
    finally:
        conn.close()
