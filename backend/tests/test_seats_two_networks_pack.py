"""The seats-two-networks pack: a pure function of seed_seats_two_networks, synthetic by
construction, and carrying exactly the counts, times and sums the design of Story 3 states.

The UTC stamps below are typed here by hand from the source's Pacific stamps (UTC-8 from the 1st
of November), not read back from the generator, so a wrong conversion in the generator fails here.
Source cites are `S3:<line>` of the third case file the design names."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

import seed_seats_two_networks as sp
from db import PROJECT_ROOT
from tests._left_out import require_files

PROFILES = PROJECT_ROOT / "docs" / "decisions" / "PROFILES.md"
PLATFORM_ORGS = PROJECT_ROOT / "data" / "platform-access" / "org.json"
MANIFEST = PROJECT_ROOT / "backend" / "scenarios" / "seats-two-networks.scenario.json"
GENERATOR = PROJECT_ROOT / "backend" / "seed_seats_two_networks.py"
DATA_DIR = PROJECT_ROOT / "data" / "seats-two-networks"
DASHES = (chr(0x2013), chr(0x2014))  # no en or em dash in any file the pack writes

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
COUNTS = {
    "org": 3,
    "seat": 5,
    "switch_sample": 1,
    "reset": 2,
    "safeguard_hour": 6,
    "usage_day": 7,
    "enrolment": 1,
    "signin": 7,
    "decision": 1,
}
# The decision is dated from these kinds and not from the sign-ins, so the sign-in that follows
# the last reset leaves the decision where it was.
TIMED = ("switch_sample", "reset", "safeguard_hour", "usage_day", "enrolment")
# The kinds whose rows hold a numeric lat and lng. The network change names its network; a reset
# names none and takes the network its seat last used (the nearest earlier sign-in or change).
PLACED = ("org", "switch_sample", "reset", "signin", "decision")
HOP_KEYS = ("seconds_since_previous", "km_from_previous")  # the sign-in is this story's path kind
ORG_PLACES = (
    ("Sacramento", "US", 38.5816, -121.4944),
    ("Boise", "US", 43.615, -116.2023),
    ("Reno", "US", 39.5296, -119.8138),
)
# The four networks as (label, address, city, country, lat, lng), by index into the pack's types.
NETWORKS = (
    ("net-101 corporate", "198.51.100.20", "Sacramento", "US", 38.5816, -121.4944),
    ("net-102 corporate", "198.51.100.40", "Roseville", "US", 38.7521, -121.288),
    ("net-103 residential", "203.0.113.30", "Boise", "US", 43.615, -116.2023),
    ("net-104 residential", "203.0.113.60", "Reno", "US", 39.5296, -119.8138),
)
# The seven sign-ins in time order: seat index, network index, method, stamp. Typed here from the
# design. The last one follows the second reset (03:24) and precedes the decision (04:24).
SIGNINS = (
    (3, 2, "password", "2026-11-06T17:30:00+00:00"),
    (4, 3, "password", "2026-11-07T18:45:00+00:00"),
    (0, 0, "single sign-on", "2026-11-09T16:10:00+00:00"),
    (0, 1, "single sign-on", "2026-11-10T16:02:30+00:00"),
    (1, 0, "single sign-on", "2026-11-10T21:15:00+00:00"),
    (1, 1, "single sign-on", "2026-11-11T00:20:00+00:00"),
    (1, 1, "single sign-on", "2026-11-11T03:50:00+00:00"),
)

# The span of V7: 4 to 11 Nov (S3:148, 331, 448), the whole of 11 Nov included.
SPAN = (datetime(2026, 11, 4, tzinfo=UTC), datetime(2026, 11, 12, tzinfo=UTC))
SWITCH = datetime(2026, 11, 10, 16, 2, 15, tzinfo=UTC)  # 08:02:15 Pacific (S3:314)
RESETS = (
    datetime(2026, 11, 11, 0, 36, tzinfo=UTC),  # 16:36 Pacific on the 10th (S3:421)
    datetime(2026, 11, 11, 3, 24, tzinfo=UTC),  # 19:24 Pacific on the 10th (S3:422)
)
HOURS = [
    datetime(2026, 11, 10, 22, tzinfo=UTC),
    datetime(2026, 11, 10, 23, tzinfo=UTC),
    datetime(2026, 11, 11, 0, tzinfo=UTC),
    datetime(2026, 11, 11, 1, tzinfo=UTC),
    datetime(2026, 11, 11, 2, tzinfo=UTC),
    datetime(2026, 11, 11, 3, tzinfo=UTC),
]  # 14:00 to 19:00 Pacific on the 10th (S3:538-543)
DAYS = [datetime(2026, 11, d, 8, tzinfo=UTC) for d in range(4, 11)]  # Pacific day starts (S3:158)
ENROLMENT = datetime(2026, 11, 9, 21, 48, tzinfo=UTC)  # 13:48 Pacific on the 9th (S3:643)

EVENTS = [1, 5, 8, 7, 6, 5]  # S3:546
REQUESTS = [142, 168, 155, 31, 18, 236, 372]  # S3:221
OUTPUT_TOKENS_K = [618, 735, 684, 118, 66, 1052, 1634]  # S3:212-218

# Shapes an identifier of the other project takes, as patterns and never as a list of its values.
SOURCE_ID_SHAPES = [
    r"\bseat_[a-z]{2}_\d{2}\b",
    r"\borg_[0-9a-f]{8}\b",
    r"\bAS\d{4,6}\b",
    r"\bGK-\d{3,5}\b",
    r"\b[a-z]+(?:-[a-z]+)+-\d+-\d+\b",
    r"autonomous system",
]


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return sp.generate()


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _stamps(rows: dict[str, list[dict]], kind: str) -> list[datetime]:
    return [_at(r["timestamp"]) for r in rows[kind]]


def test_the_pack_is_a_pure_function_of_the_module():
    assert sp.generate() == sp.generate()


def test_the_seed_is_the_one_the_design_names():
    assert sp.SEED == 2026111803


def test_every_kind_is_present_with_the_designs_row_count(rows):
    assert tuple(rows) == sp.KINDS == KINDS
    assert {k: len(v) for k, v in rows.items()} == COUNTS
    assert sum(len(v) for v in rows.values()) == 33


def test_ids_are_unique_and_first_in_each_row(rows):
    seen: set[str] = set()
    for kind, items in rows.items():
        assert all(next(iter(r)) == "id" for r in items), kind
        ids = [r["id"] for r in items]
        assert len(ids) == len(set(ids)), kind
        assert not seen & set(ids), kind
        seen |= set(ids)
    for kind, column in (("org", "org_id"), ("seat", "seat_id")):
        values = [r[column] for r in rows[kind]]
        assert len(values) == len(set(values)), column


def test_every_timed_row_has_an_offset_lies_in_the_span_and_is_the_stated_stamp(rows):
    for kind in TIMED:
        for r in rows[kind]:
            at = _at(r["timestamp"])
            assert at.utcoffset() == timedelta(0), (kind, r["id"])
            assert SPAN[0] <= at < SPAN[1], (kind, r["id"])
    assert _stamps(rows, "switch_sample") == [SWITCH]
    assert _stamps(rows, "reset") == list(RESETS)
    assert _stamps(rows, "safeguard_hour") == HOURS
    assert _stamps(rows, "usage_day") == DAYS
    assert _stamps(rows, "enrolment") == [ENROLMENT]


def test_an_untimed_row_has_timestamp_zero(rows):
    for kind in ("org", "seat"):
        assert all(r["timestamp"] == 0 for r in rows[kind]), kind


def test_the_two_resets_fall_on_one_pacific_day_two_hours_48_apart(rows):
    a, b = _stamps(rows, "reset")
    assert b - a == timedelta(hours=2, minutes=48)
    pacific = timedelta(hours=-8)
    assert (a + pacific).date() == (b + pacific).date() == datetime(2026, 11, 10).date()


def test_hour_rows_lie_on_the_hour_and_day_rows_on_the_day_start(rows):
    for kind in ("safeguard_hour", "usage_day"):
        assert all(at.minute == at.second == at.microsecond == 0 for at in _stamps(rows, kind))
    assert all(at.hour == 8 for at in _stamps(rows, "usage_day"))


def test_a_magnitude_kind_holds_no_instant_off_its_grid(rows):
    """The lane's step is the smallest gap between two instants, so one stray instant would
    shrink every bar: each magnitude kind keeps one step, the hour or the day."""
    for kind, step in (("safeguard_hour", timedelta(hours=1)), ("usage_day", timedelta(days=1))):
        stamps = sorted(_stamps(rows, kind))
        assert {b - a for a, b in zip(stamps, stamps[1:], strict=False)} == {step}, kind


def test_the_sums_hold(rows):
    assert [r["events"] for r in rows["safeguard_hour"]] == EVENTS and sum(EVENTS) == 32
    assert [r["requests"] for r in rows["usage_day"]] == REQUESTS and sum(REQUESTS) == 1122
    assert [r["output_tokens_k"] for r in rows["usage_day"]] == OUTPUT_TOKENS_K
    assert [r["switches"] for r in rows["seat"]] == [8, 6, 0, 0, 0]
    assert sum(r["switches"] for r in rows["seat"]) == 14
    assert [r["networks"] for r in rows["seat"]] == [2, 2, 1, 1, 1]
    (enrolment,) = rows["enrolment"]
    assert enrolment["tiers_without_enrolment"] == 5


def test_seats_belong_to_organisations_the_pack_holds(rows):
    org_ids = {o["org_id"] for o in rows["org"]}
    assert {s["org_id"] for s in rows["seat"]} <= org_ids
    seat_ids = {s["seat_id"] for s in rows["seat"]}
    assert {r["seat_id"] for r in rows["reset"]} <= seat_ids
    assert rows["switch_sample"][0]["seat_id"] in seat_ids


def test_the_switch_sample_is_on_a_seat_that_switches_between_two_networks(rows):
    (sample,) = rows["switch_sample"]
    seat = next(s for s in rows["seat"] if s["seat_id"] == sample["seat_id"])
    assert seat["switches"] > 0 and seat["networks"] == 2
    assert sample["network_id"] != sample["previous_network"]
    for label in (sample["network_id"], sample["previous_network"]):
        assert re.fullmatch(r"net-1\d\d (corporate|hosting|residential|education)", label), label


def test_the_decision_row_is_waiting_for_review_one_hour_after_the_last_event(rows):
    (decision,) = rows["decision"]
    assert (decision["status"], decision["outcome"], decision["decided_by"]) == (
        "WAITING",
        "FOR REVIEW",
        "investigator",
    )
    latest = max(at for kind in TIMED for at in _stamps(rows, kind))
    assert latest == RESETS[1]
    assert _at(decision["decided_at"]) == latest + timedelta(hours=1)
    ids = {r["id"] for kind in rows for r in rows[kind]}
    assert decision["event_ids"] and set(decision["event_ids"]) <= ids
    assert decision["org_id"] in {o["org_id"] for o in rows["org"]}
    assert decision["target_label"].strip()


def test_the_decision_note_states_only_counts_the_rows_show(rows):
    (decision,) = rows["decision"]
    note = decision["note"]
    for shown in ("5 seats", "14 network changes", "2 resets", "32 safeguard events", "1,122"):
        assert shown in note, shown
    assert not re.search(r"fraud|takeover|abuse|suspicious|guilty|verdict|likely", note, re.I)
    assert not any(d in note for d in DASHES)


def test_organisations_hold_their_city_after_todays_keys_and_the_decision_the_applicants(rows):
    for org, (city, country, lat, lng) in zip(rows["org"], ORG_PLACES, strict=True):
        assert list(org) == [
            "id",
            "timestamp",
            "org_id",
            "org_name",
            "city",
            "country",
            "lat",
            "lng",
        ]
        assert (org["city"], org["country"], org["lat"], org["lng"]) == (city, country, lat, lng)
        assert org["timestamp"] == 0, "the filler stays on the row, the manifest omits it"
    (decision,) = rows["decision"]
    assert list(decision)[-2:] == ["lat", "lng"] and "city" not in decision
    applicant = next(o for o in rows["org"] if o["org_id"] == decision["org_id"])
    assert (decision["lat"], decision["lng"]) == (applicant["lat"], applicant["lng"])
    assert (decision["lat"], decision["lng"]) == ORG_PLACES[0][2:]


def test_the_seven_signins_are_the_typed_rows_with_ids_from_the_clock(rows):
    seats = rows["seat"]
    expected = [
        {
            "id": f"si-{n:02d}",
            "timestamp": stamp,
            "seat_id": seats[seat]["seat_id"],
            "org_id": seats[seat]["org_id"],
            "outcome": "success",
            "method": method,
            "client": "console web",
            "network_id": NETWORKS[net][0],
            "ip": NETWORKS[net][1],
            "city": NETWORKS[net][2],
            "country": NETWORKS[net][3],
            "lat": NETWORKS[net][4],
            "lng": NETWORKS[net][5],
        }
        for n, (seat, net, method, stamp) in enumerate(SIGNINS, start=1)
    ]
    # The two hop figures a path kind ends with are pinned by test_story_hops.py, not here.
    assert [{k: v for k, v in r.items() if k not in HOP_KEYS} for r in rows["signin"]] == expected
    assert [list(r) for r in rows["signin"]] == [[*expected[0], *HOP_KEYS]] * 7, "keys in one order"


def test_every_signin_lies_in_the_span_and_the_last_falls_between_the_reset_and_the_decision(rows):
    stamps = _stamps(rows, "signin")
    assert all(at.utcoffset() == timedelta(0) and SPAN[0] <= at < SPAN[1] for at in stamps)
    (decision,) = rows["decision"]
    assert RESETS[1] < max(stamps) < _at(decision["decided_at"])


def test_the_network_change_and_the_resets_sit_at_roseville(rows):
    (change,) = rows["switch_sample"]
    assert (change["id"], change["network_id"]) == ("sw-01", NETWORKS[1][0])
    where = {"city": "Roseville", "country": "US", "lat": 38.7521, "lng": -121.288}
    assert {k: change[k] for k in where} == where
    assert list(change)[-4:] == ["city", "country", "lat", "lng"]
    assert [(r["id"], r["network_id"]) for r in rows["reset"]] == [
        ("rs-01", NETWORKS[1][0]),
        ("rs-02", NETWORKS[1][0]),
    ]
    for r in rows["reset"]:
        assert {k: r[k] for k in where} == where, r["id"]
        assert list(r)[-5:] == ["network_id", "city", "country", "lat", "lng"], r["id"]
        assert "ip" not in r


def test_only_the_placed_kinds_have_a_place_and_none_an_unspecified_zone(rows):
    for kind, items in rows.items():
        for r in items:
            assert not {"latitude", "longitude", "coords"} & set(r), (kind, r["id"])
            if kind in PLACED:
                assert type(r["lat"]) in (int, float) and type(r["lng"]) in (int, float), r["id"]
            else:
                assert not {"lat", "lng"} & set(r), (kind, r["id"])
            for key, value in r.items():
                if key in ("timestamp", "decided_at") and value != 0:
                    assert _at(value).tzinfo is not None, (kind, r["id"], key)


def test_no_event_row_says_what_it_is(rows):
    label_key = re.compile(r"fraud|label|truth|verdict|^is_", re.IGNORECASE)
    for kind, items in rows.items():
        if kind == "decision":
            continue
        for r in items:
            assert not [k for k in r if label_key.search(k)], (kind, r["id"])


def test_write_twice_writes_the_same_bytes_and_an_empty_database(tmp_path):
    first, second = tmp_path / "a", tmp_path / "b"
    sp.write(first / "pack", first / "pack.db")
    sp.write(second / "pack", second / "pack.db")
    sp.write(second / "pack", second / "pack.db")
    for kind in KINDS:
        name = f"{kind}.json"
        assert (first / "pack" / name).read_bytes() == (second / "pack" / name).read_bytes()
    assert sorted(p.name for p in (first / "pack").iterdir()) == sorted(f"{k}.json" for k in KINDS)
    assert (first / "pack.db").read_bytes() == (second / "pack.db").read_bytes()
    built = sp.generate()
    for kind in KINDS:
        assert json.loads((first / "pack" / f"{kind}.json").read_text("utf-8")) == built[kind]


# ---- The fences ------------------------------------------------------------------------------


def _profile_names() -> list[str]:
    """Both canonical profiles' full names, read from their file at test time so that no new file
    has to write them."""
    require_files(PROFILES, why="the fence has no profile name to look for without it")
    found = re.findall(
        r"^## Customer [AB]\W+([A-Z][a-z]+ [A-Z][a-z]+)", PROFILES.read_text("utf-8"), re.M
    )
    assert len(found) == 2, found
    return found


def _new_files() -> list[Path]:
    """Every file this pack writes or is written for, the tests of the pack included."""
    here = Path(__file__).resolve().parent
    return [
        GENERATOR,
        MANIFEST,
        *sorted(DATA_DIR.glob("*.json")),
        here / "test_seats_two_networks_pack.py",
        here / "test_seats_two_networks_manifest.py",
    ]


def test_no_new_file_holds_either_profiles_name_or_first_name():
    names = _profile_names()
    words = [w for name in names for w in (name, name.split()[0])]
    for path in _new_files():
        text = path.read_text("utf-8")
        for word in words:
            assert not re.search(rf"\b{re.escape(word)}\b", text, re.I), (path.name, "a profile")


def test_no_organisation_name_is_one_of_the_token_packs_or_shares_a_word_with_one(rows):
    platform = json.loads(PLATFORM_ORGS.read_text("utf-8"))
    taken = {o["org_name"].casefold() for o in platform}
    words = {w.casefold() for o in platform for w in re.findall(r"\w+", o["org_name"])}
    for o in rows["org"]:
        assert o["org_name"].casefold() not in taken, o["org_name"]
        assert not words & {w.casefold() for w in re.findall(r"\w+", o["org_name"])}, o["org_name"]
    assert not {o["org_id"] for o in platform} & {o["org_id"] for o in rows["org"]}


def test_no_string_has_the_form_of_an_id_of_the_other_project():
    for path in (GENERATOR, MANIFEST, *sorted(DATA_DIR.glob("*.json"))):
        text = path.read_text("utf-8")
        for shape in SOURCE_ID_SHAPES:
            assert not re.search(shape, text, re.I if "autonomous" in shape else 0), (
                path.name,
                shape,
            )


def test_the_generator_reads_no_file_and_no_clock_and_has_no_dash():
    text = GENERATOR.read_text("utf-8")
    for forbidden in (
        "open(",
        "read_text",
        "datetime.now",
        "date.today",
        "time.time(",
        "utcnow",
        "Date.now",
    ):
        assert forbidden not in text, forbidden
    for path in _new_files():
        assert not any(d in path.read_text("utf-8") for d in DASHES), path.name
