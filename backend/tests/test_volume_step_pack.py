"""The volume-step pack: a pure function of seed_volume_step, with a place on the
organisation, the sign-ins and the decision only, and telling the table of story 4 (daily volume
and failed calls).

Story facts are asserted from the rows. The expected stamps and counts below are typed here a
second time on purpose, from the design's table and the source cites in the generator, so a
change to the generator that drifts from the table turns a test red."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

import seed_volume_step as sv
from db import PROJECT_ROOT
from tests._left_out import require_files

SPAN = (date(2026, 11, 2), date(2026, 11, 11))  # V7: story 4 runs 2 to 11 Nov
KIND_ROWS = {
    "org": 1,
    "workspace": 4,
    "usage_day": 10,
    "period": 5,
    "failed_call_day": 3,
    "notice": 1,
    "signin": 4,
    "decision": 1,
}
TIMED = {"usage_day": "timestamp", "period": "timestamp", "failed_call_day": "timestamp"}
TIMED |= {"notice": "timestamp", "signin": "timestamp", "decision": "decided_at"}
PLACED = ("org", "signin", "decision")  # the kinds whose rows hold a numeric lat and lng
SALT_LAKE = ("Salt Lake City", "US", 40.7608, -111.891)
PROVO = ("Provo", "US", 40.2338, -111.6585)
# The four sign-ins in time order: workspace index, method, stamp, network, address, place. Typed
# here from the design, not read from the generator; a workspace is named by its row's position.
SIGNINS = [
    (
        0,
        "single sign-on",
        "2026-11-03T17:00:00+00:00",
        "net-101 corporate",
        "198.51.100.70",
        SALT_LAKE,
    ),
    (
        0,
        "single sign-on",
        "2026-11-09T17:55:00+00:00",
        "net-101 corporate",
        "198.51.100.70",
        SALT_LAKE,
    ),
    (
        0,
        "single sign-on",
        "2026-11-10T16:30:00+00:00",
        "net-101 corporate",
        "198.51.100.70",
        SALT_LAKE,
    ),
    (1, "password", "2026-11-10T18:40:00+00:00", "net-102 corporate", "203.0.113.90", PROVO),
]
PROFILES = PROJECT_ROOT / "docs" / "decisions" / "PROFILES.md"
PLATFORM_ORGS = PROJECT_ROOT / "data" / "platform-access" / "org.json"
SOURCE_FILE = Path(sv.__file__)

# The forms an id of the other project takes, as patterns and not as a list: a prefix, an
# underscore and hex digits; a prefix, a word and a two digit number; a case number; a cloud
# key id prefix; a model id with a version pair. None of them may appear in a pack value.
FOREIGN_ID = re.compile(
    r"\b[a-z]{2,6}_[0-9a-f]{6,}\b|\b[a-z]{2,6}_[a-z]{2,6}_\d{2}\b|\b[A-Z]{2}-\d{3,}\b"
    r"|\bAKIA\b|\b[a-z]+-\d-\d\b"
)
AS_NUMBER = re.compile(r"\bAS ?\d{3,}\b|(?i:autonomous system)")
STAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return sv.generate()


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _strings(value: object):
    """Every string in a row, keys excluded, lists walked."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)


def _profile_names() -> set[str]:
    """The two canonical names, read at test time from the profiles file so that this file
    never writes them."""
    require_files(PROFILES, why="the fence has no profile name to look for without it")
    text = PROFILES.read_text("utf-8")
    found = re.findall(r"^## Customer [AB] .{1,3} (\w+ \w+), \d+", text, re.M)
    assert len(found) == 2, "the profiles file names two customers in its headings"
    return {n.lower() for n in found}


def test_the_pack_is_a_pure_function_of_the_module():
    assert sv.generate() == sv.generate()


def test_the_seed_is_the_designs_for_story_four():
    assert sv.SEED == 2026111804


def test_every_kind_of_the_table_is_present_with_its_row_count(rows):
    assert tuple(rows) == sv.KINDS == tuple(KIND_ROWS)
    assert {k: len(v) for k, v in rows.items()} == KIND_ROWS
    assert sum(len(v) for v in rows.values()) == 29


def test_ids_are_unique_and_first_in_each_row(rows):
    every = [r["id"] for items in rows.values() for r in items]
    assert len(every) == len(set(every)) == 29
    assert all(next(iter(r)) == "id" for items in rows.values() for r in items)
    assert rows["org"][0]["id"] == rows["org"][0]["org_id"]
    for w in rows["workspace"]:
        assert w["id"] == w["workspace_id"]


def test_the_declared_fields_are_on_every_row_of_the_kind(rows):
    assert set(rows["org"][0]) == {
        "id",
        "org_id",
        "org_name",
        "enrolled_since",
        "city",
        "country",
        "lat",
        "lng",
    }
    for w in rows["workspace"]:
        assert set(w) == {"id", "workspace_id", "workspace_name", "retention_setting"}
    for r in rows["usage_day"]:
        assert set(r) == {"id", "workspace_id", "timestamp", "requests"}
    for r in rows["period"]:
        assert set(r) == {"id", "workspace_id", "timestamp", "evaluated", "events", "launch_at"}
    for r in rows["failed_call_day"]:
        assert set(r) == {"id", "timestamp", "failed_calls", "cause"}
    assert set(rows["notice"][0]) == {"id", "workspace_id", "timestamp", "delivery"}
    for r in rows["signin"]:
        assert list(r) == [
            "id",
            "timestamp",
            "workspace_id",
            "outcome",
            "method",
            "client",
            "network_id",
            "ip",
            "city",
            "country",
            "lat",
            "lng",
        ]
    assert set(rows["decision"][0]) == {
        "id",
        "org_id",
        "event_ids",
        "target_label",
        "status",
        "outcome",
        "note",
        "decided_by",
        "decided_at",
        "lat",
        "lng",
    }


def test_untimed_kinds_carry_no_stamp(rows):
    for kind in ("org", "workspace"):
        assert not [r for r in rows[kind] if "timestamp" in r], kind
    assert rows["org"][0]["enrolled_since"] == "2026-08-18", "a date as stated, a field"


def test_every_timed_stamp_has_an_offset_and_lies_in_the_span(rows):
    for kind, key in TIMED.items():
        for r in rows[kind]:
            at = _at(r[key])
            assert at.utcoffset() == timedelta(0), (kind, r["id"])
            assert SPAN[0] <= at.astimezone(UTC).date() <= SPAN[1], (kind, r["id"])
    for items in rows.values():
        for text in _strings(items):
            if STAMP.match(text):
                assert _at(text).tzinfo is not None, text


def test_a_day_row_sits_at_the_source_day_start_in_utc(rows):
    """The source's day is Pacific (UTC-8 in November): its day starts at 08:00 UTC."""
    days = [_at(r["timestamp"]) for r in rows["usage_day"]]
    assert days == [datetime(2026, 11, d, 8, tzinfo=UTC) for d in range(2, 12)]
    failed = [_at(r["timestamp"]) for r in rows["failed_call_day"]]
    assert failed == [datetime(2026, 11, d, 8, tzinfo=UTC) for d in (9, 10, 11)]


def test_a_magnitude_kind_holds_no_off_hour_instant_and_one_step(rows):
    for kind in ("usage_day", "failed_call_day"):
        at = [_at(r["timestamp"]) for r in rows[kind]]
        assert all(a.minute == a.second == a.microsecond == 0 for a in at), kind
        assert {(b - a) for a, b in zip(at, at[1:], strict=False)} == {timedelta(days=1)}, kind


def test_the_five_periods_sit_at_their_stated_edges(rows):
    edges = [
        datetime(2026, 11, 2, 8, tzinfo=UTC),
        datetime(2026, 11, 9, 8, tzinfo=UTC),
        datetime(2026, 11, 9, 18, 20, tzinfo=UTC),
        datetime(2026, 11, 10, 8, tzinfo=UTC),
        datetime(2026, 11, 11, 8, tzinfo=UTC),
    ]
    assert [_at(r["timestamp"]) for r in rows["period"]] == edges
    launch = [r for r in rows["period"] if r["launch_at"] is not None]
    assert len(launch) == 1, "the launch stamp is a field of the one period it opens"
    assert _at(launch[0]["launch_at"]) == edges[2] == _at(launch[0]["timestamp"])
    assert [r["launch_at"] for r in rows["period"]].count(None) == 4


def test_the_notice_sits_at_the_stated_minute_and_bounced(rows):
    (notice,) = rows["notice"]
    assert _at(notice["timestamp"]) == datetime(2026, 11, 9, 18, 5, tzinfo=UTC)
    assert notice["delivery"] == "bounced"
    assert notice["workspace_id"] in {w["workspace_id"] for w in rows["workspace"]}


def test_the_daily_volume_steps_up_after_seven_flat_days(rows):
    requests = [r["requests"] for r in rows["usage_day"]]
    flat, step = requests[:7], requests[7:]
    assert min(flat) == 25_640 and max(flat) == 26_820
    assert step == [83_810, 129_660, 29_700]
    assert sum(flat) == 183_910, "the first period's evaluated count is the seven days"


def test_the_failed_calls_are_three_days_that_sum_to_658(rows):
    assert [r["failed_calls"] for r in rows["failed_call_day"]] == [142, 417, 99]
    assert sum(r["failed_calls"] for r in rows["failed_call_day"]) == 658
    assert len({r["cause"] for r in rows["failed_call_day"]}) == 1
    assert all("workspace_id" not in r for r in rows["failed_call_day"]), "a separate path"


def test_the_period_counts_sum_as_the_source_states_them(rows):
    evaluated = [r["evaluated"] for r in rows["period"]]
    events = [r["events"] for r in rows["period"]]
    assert evaluated == [183_910, 11_370, 43_060, 76_950, 17_600]
    assert events == [1_214, 80, 13_180, 24_010, 5_540]
    assert sum(evaluated[:2]) == 195_280 and sum(events[:2]) == 1_294
    assert sum(evaluated[2:]) == 137_610 and sum(events[2:]) == 42_730


def test_four_workspaces_one_org_with_coined_words(rows):
    assert len(rows["workspace"]) == 4
    assert len({w["workspace_name"] for w in rows["workspace"]}) == 4
    assert {w["retention_setting"] for w in rows["workspace"]} == {
        "zero_retention",
        "zero_retention_with_exemption",
    }
    exempt = [w for w in rows["workspace"] if w["retention_setting"].endswith("exemption")]
    assert len(exempt) == 1, "one workspace carries the exemption"
    owners = {r["workspace_id"] for k in ("usage_day", "period") for r in rows[k]}
    assert owners == {exempt[0]["workspace_id"]}, "the volume is that workspace's"


def test_the_decision_row_is_in_words_and_resolves_its_events(rows):
    (d,) = rows["decision"]
    assert (d["status"], d["outcome"], d["decided_by"]) == ("WAITING", "FOR REVIEW", "investigator")
    assert d["org_id"] == rows["org"][0]["org_id"]
    known = {r["id"] for kind, items in rows.items() if kind != "decision" for r in items}
    assert d["event_ids"] and set(d["event_ids"]) <= known
    # One hour after the end of the source's window (11 Nov 05:30 Pacific, 13:30 UTC).
    assert _at(d["decided_at"]) == datetime(2026, 11, 11, 14, 30, tzinfo=UTC)
    numbers = {int(n.replace(",", "")) for n in re.findall(r"\d[\d,]{2,}", d["note"])}
    shown = {v for items in rows.values() for r in items for v in r.values() if type(v) is int}
    assert numbers - shown <= {658}, "a note lists counts the rows show (or the 3-day sum)"
    assert not re.search(r"fraud|attack|takeover|abuse|malicious", d["note"], re.IGNORECASE)


def test_the_organisation_and_the_decision_hold_the_organisations_city_after_todays_keys(rows):
    (org,) = rows["org"]
    assert list(org) == [
        "id",
        "org_id",
        "org_name",
        "enrolled_since",
        "city",
        "country",
        "lat",
        "lng",
    ]
    assert (org["city"], org["country"], org["lat"], org["lng"]) == SALT_LAKE
    (d,) = rows["decision"]
    assert list(d)[-3:] == ["decided_at", "lat", "lng"] and "city" not in d
    assert (d["lat"], d["lng"]) == (org["lat"], org["lng"])


def test_the_four_signins_are_the_typed_rows_in_time_order_with_ids_from_the_clock(rows):
    workspaces = [w["workspace_id"] for w in rows["workspace"]]
    expected = [
        {
            "id": f"si-{n:02d}",
            "timestamp": stamp,
            "workspace_id": workspaces[ws],
            "outcome": "success",
            "method": method,
            "client": "console web",
            "network_id": network,
            "ip": ip,
            "city": city,
            "country": country,
            "lat": lat,
            "lng": lng,
        }
        for n, (ws, method, stamp, network, ip, (city, country, lat, lng)) in enumerate(
            SIGNINS, start=1
        )
    ]
    assert rows["signin"] == expected
    assert [list(r) for r in rows["signin"]] == [list(expected[0])] * 4, "keys in one order"


def test_a_network_has_one_address_and_one_place_wherever_it_is_named(rows):
    seen: dict[str, tuple] = {}
    for r in rows["signin"]:
        where = (r["ip"], r["city"], r["country"], r["lat"], r["lng"])
        assert seen.setdefault(r["network_id"], where) == where, r["id"]
    assert sorted(seen) == ["net-101 corporate", "net-102 corporate"]


def test_only_org_signin_and_decision_rows_have_a_place_and_none_a_label_key(rows):
    for kind, items in rows.items():
        for r in items:
            assert not {"latitude", "longitude", "coords"} & set(r), (kind, r["id"])
            if kind in PLACED:
                assert type(r["lat"]) in (int, float) and type(r["lng"]) in (int, float), r["id"]
            else:
                assert not {"lat", "lng"} & set(r), (kind, r["id"])
            if kind != "decision":  # the decision mapping names `target_label`, as the platform's
                assert not [k for k in r if re.search(r"fraud|label|truth|verdict|^is_", k)], kind


def test_the_fences_hold_on_every_value(rows):
    names = _profile_names()
    platform_orgs = {o["org_name"] for o in json.loads(PLATFORM_ORGS.read_text("utf-8"))}
    firsts = {n.split()[0] for n in names}
    for items in rows.values():
        for text in _strings(items):
            low = text.lower()
            assert not any(n in low for n in names), text
            assert not any(re.search(rf"\b{f}\b", low) for f in firsts), text
            assert not FOREIGN_ID.search(text), text
            assert not AS_NUMBER.search(text), text
            assert not any(o.lower() in low for o in platform_orgs), text
    assert rows["org"][0]["org_name"] not in platform_orgs


def test_the_generator_source_cites_the_source_beside_its_constants_and_holds_no_names():
    text = SOURCE_FILE.read_text("utf-8")
    assert len(re.findall(r"S4:\d+", text)) >= 8
    low = text.lower()
    assert not any(n in low for n in _profile_names())
    assert not AS_NUMBER.search(text)
    assert "open(" not in text and "read_text" not in text, "a generator opens no file to read"


def test_write_makes_one_file_per_kind_and_an_empty_database(tmp_path, rows):
    data, db = tmp_path / "volume-step", tmp_path / "volume-step.db"
    paths = sv.write(data, db)
    assert sorted(p.name for p in data.iterdir()) == sorted(f"{k}.json" for k in sv.KINDS)
    assert len(paths) == len(sv.KINDS) + 1 and db.exists()
    for kind in sv.KINDS:
        assert json.loads((data / f"{kind}.json").read_text("utf-8")) == rows[kind]
    conn = sqlite3.connect(db)
    try:
        tables = [
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            if not r[0].startswith("sqlite_")
        ]
        assert tables, "the schema is there"
        assert not any(conn.execute(f'SELECT 1 FROM "{t}" LIMIT 1').fetchone() for t in tables)
    finally:
        conn.close()
    again = sv.write(data, db)
    assert again == paths, "a rerun replaces its own output"
