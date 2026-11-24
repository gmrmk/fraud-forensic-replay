"""The `key-many-networks` pack (story 1 of DESIGN-CASES.md, item K1): one key that changes
network four times in ten seconds, 26 stamped limit resets inside four minutes, and a daily
request count that steps up more than sevenfold.

Every expected value below is typed here from the other project's case 1 data file (cited as
`S1:<line>` of `src/data/case-1.js`), never imported from the generator, so the generator and
this file are two readings of the source and not one. Times in the source are Pacific (UTC-8);
the pack writes UTC (V4)."""

from __future__ import annotations

import codecs
import json
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

import seed_key_many_networks as km
from db import PROJECT_ROOT

SPAN_START = datetime(2026, 11, 4, tzinfo=UTC)  # V7: story 1 runs from 4 to 11 Nov (S1:149)
SPAN_END = datetime(2026, 11, 12, tzinfo=UTC)

# S1:355 and S1:331: the offer opened at 10:00:00 at UTC-8 on 9 Nov, which is 18:00:00 UTC.
OFFER_OPEN = datetime(2026, 11, 9, 18, 0, 0, tzinfo=UTC)
# S1:363-374, in the source's order: (seats redeemed, first redemption s, last redemption s).
# The applicant is the second row (S1:364, flagged at S1:376).
RESET_ORGS = [
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
]
APPLICANT_AT = 1  # index of the applicant in RESET_ORGS
# S1:382-385: the applicant's four stamped redemptions, with the seat label's number.
APPLICANT_SAMPLE = [(41, 3), (86, 1), (158, 5), (213, 2)]
# Seats redeemed minus stamped rows, per organisation in the source's order (the applicant has
# four stamped rows, every other organisation two): 1 for the applicant, then 3, 2, 3, 1, ...
OTHER_SEATS = [
    seats - (4 if i == APPLICANT_AT else 2) for i, (seats, _, _) in enumerate(RESET_ORGS)
]
# S1:283-288 (in the source's order: the key, then seats 2, 4, 1, 3, 5).
SEAT_NUMBERS = [None, 2, 4, 1, 3, 5]
NETWORKS_SEEN = [44, 31, 30, 29, 27, 26]
REQUESTS_18D = [42950, 15210, 14420, 14880, 13960, 13790]
# S1:296-299: four sample rows on 10 Nov at 09:41 Pacific, which is 17:41 UTC; gaps 3, 4, 3 s.
NETWORK_STAMPS = [datetime(2026, 11, 10, 17, 41, s, tzinfo=UTC) for s in (2, 5, 9, 12)]
# The kinds that name a time, the three new ones included.
TIMED_KINDS = ("network_seen", "reset", "usage_day", "signin", "key_event", "request_sample")
# S1:200-207 and S1:210: eight Pacific days from 4 Nov, whose start is 08:00 UTC (V4).
DAY_REQUESTS = [6120, 7480, 8010, 3150, 2940, 21460, 24890, 9870]
DAY_OUTPUT_M = [44.9, 55.0, 59.1, 23.0, 21.4, 161.4, 187.9, 74.0]

# Names the pack must not hold, built at run time so no file of the pack spells them.
PROFILE_WORDS = [codecs.decode(w, "rot13") for w in ("Znephf", "Pura", "Cevln", "Cngry")]


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return km.generate()


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _applicant_org(rows: dict[str, list[dict]]) -> str:
    """The organisation with four stamped redemptions."""
    counts: dict[str, int] = {}
    for r in rows["reset"]:
        counts[r["org_id"]] = counts.get(r["org_id"], 0) + 1
    (org_id,) = [o for o, n in counts.items() if n == 4]
    return org_id


def test_the_module_holds_its_seed_and_a_fixed_kind_order():
    assert km.SEED == 2026111801  # V12
    assert list(km.KINDS) == [
        "org",
        "principal",
        "network_seen",
        "reset",
        "usage_day",
        "signin",
        "key_event",
        "request_sample",
        "decision",
    ]


def test_generate_is_a_pure_function_of_the_module(rows):
    assert km.generate() == km.generate() == rows
    assert json.dumps(km.generate(), sort_keys=True) == json.dumps(rows, sort_keys=True)


def test_every_kind_has_the_tables_row_count_and_the_pack_has_127(rows):
    # 127 is the pack's 58 rows, the 25 case rows of the three new kinds and the crowd's 44.
    counts = {kind: len(items) for kind, items in rows.items()}
    assert counts == {
        "org": 13,
        "principal": 6,
        "network_seen": 4,
        "reset": 26,
        "usage_day": 8,
        "signin": 54,
        "key_event": 3,
        "request_sample": 12,
        "decision": 1,
    }
    assert sum(counts.values()) == 127


def test_ids_are_unique_within_a_kind_and_across_the_pack(rows):
    for kind, items in rows.items():
        ids = [r["id"] for r in items]
        assert len(set(ids)) == len(ids), kind
    every = [r["id"] for items in rows.values() for r in items]
    assert len(set(every)) == len(every)


def test_untimed_kinds_hold_timestamp_zero_and_timed_kinds_hold_a_stamp(rows):
    for kind in ("org", "principal"):
        assert all(r["timestamp"] == 0 for r in rows[kind]), kind
    for kind in TIMED_KINDS:
        assert all(isinstance(r["timestamp"], str) for r in rows[kind]), kind
    assert isinstance(rows["decision"][0]["decided_at"], str)


def test_every_stamp_has_an_offset_and_lies_inside_the_span(rows):
    stamps = [r["timestamp"] for k in TIMED_KINDS for r in rows[k]]
    stamps.append(rows["decision"][0]["decided_at"])
    for value in stamps:
        at = _at(value)
        assert at.utcoffset() == timedelta(0), value
        assert SPAN_START <= at < SPAN_END, value
    # No other string of any row reads as a time, so none can be naive.
    for items in rows.values():
        for r in items:
            for v in r.values():
                if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}[T ]\d", v):
                    assert re.search(r"\+00:00$", v), v


def test_only_the_rows_of_the_seven_placed_kinds_have_a_place(rows):
    placed = ("org", "network_seen", "reset", "signin", "key_event", "request_sample", "decision")
    for kind, items in rows.items():
        for r in items:
            if kind in placed:
                assert all(isinstance(r[k], int | float) for k in ("lat", "lng")), (kind, r["id"])
                assert not isinstance(r["lat"], bool) and not isinstance(r["lng"], bool)
            else:
                assert not {"lat", "lng", "latitude", "longitude", "coords"} & set(r), (
                    kind,
                    r["id"],
                )


def test_org_rows_carry_61_on_the_two_applicant_organisations_and_nothing_else(rows):
    orgs = rows["org"]
    both = [o for o in orgs if o["networks_both_orgs"] is not None]
    assert [o["networks_both_orgs"] for o in both] == [61, 61]
    assert sum(1 for o in orgs if o["networks_both_orgs"] is None) == 11
    # The two are the applicant (4 stamped resets) and the one organisation with none (S1:21).
    with_resets = {r["org_id"] for r in rows["reset"]}
    assert len(with_resets) == 12
    without = {o["org_id"] for o in orgs if o["org_id"] not in with_resets}
    assert len(without) == 1
    assert {o["org_id"] for o in both} == {_applicant_org(rows)} | without
    # S1:21: the plan is stated for the applicant's two organisations only.
    assert sorted(o["plan"] for o in both) == ["console", "team"]
    assert all(o["plan"] is None for o in orgs if o not in both)
    assert len({o["org_name"] for o in orgs}) == 13


def test_the_six_principals_read_as_the_source_gives_them(rows):
    principals = rows["principal"]
    assert [p["networks_seen"] for p in principals] == NETWORKS_SEEN
    assert [p["requests_18d"] for p in principals] == REQUESTS_18D
    assert sum(p["requests_18d"] for p in principals) == 115210
    names = [p["principal_name"] for p in principals]
    assert names == ["Key"] + [f"Seat {n}" for n in SEAT_NUMBERS[1:]]


def test_four_network_rows_one_key_inside_ten_seconds(rows):
    nets = rows["network_seen"]
    key = rows["principal"][0]["principal_id"]
    assert [_at(n["timestamp"]) for n in nets] == NETWORK_STAMPS
    gaps = [(b - a).seconds for a, b in zip(NETWORK_STAMPS, NETWORK_STAMPS[1:], strict=False)]
    assert gaps == [3, 4, 3]
    assert NETWORK_STAMPS[-1] - NETWORK_STAMPS[0] <= timedelta(seconds=10)  # 3 + 4 + 3
    assert {n["principal_id"] for n in nets} == {key}
    # S1:296-299: each row's previous network is the row before it; five networks in all.
    assert [n["previous_network"] for n in nets[1:]] == [n["network_id"] for n in nets[:-1]]
    labels = [nets[0]["previous_network"], *(n["network_id"] for n in nets)]
    assert len(set(labels)) == 5
    assert all(re.fullmatch(r"net-\d{3}", x) for x in labels)  # V6: net-NNN, numbered from 101
    assert all(int(x[4:]) >= 101 for x in labels)
    assert {n["network_type"] for n in nets} == {"residential proxy"}


def test_the_26_reset_stamps_are_the_offer_open_plus_the_stated_seconds(rows):
    resets = rows["reset"]
    expected = sorted([s for _, first, last in RESET_ORGS for s in (first, last)] + [86, 158])
    assert len(expected) == 26
    assert sorted(r["after_offer_s"] for r in resets) == expected
    for r in resets:
        assert _at(r["timestamp"]) == OFFER_OPEN + timedelta(seconds=r["after_offer_s"]), r["id"]
    stamps = [_at(r["timestamp"]) for r in resets]
    assert max(stamps) - min(stamps) < timedelta(minutes=4)
    assert min(stamps) == OFFER_OPEN + timedelta(seconds=38)
    assert max(stamps) == OFFER_OPEN + timedelta(seconds=236)


def test_each_organisations_rows_and_other_seats_make_its_seat_count(rows):
    by_org: dict[str, list[dict]] = {}
    for r in rows["reset"]:
        by_org.setdefault(r["org_id"], []).append(r)
    assert len(by_org) == 12
    ordered = sorted(by_org.values(), key=lambda rs: min(r["after_offer_s"] for r in rs))
    for i, ((seats, first, last), rs, other) in enumerate(
        zip(RESET_ORGS, ordered, OTHER_SEATS, strict=True)
    ):
        assert len(rs) == (4 if i == APPLICANT_AT else 2)
        assert min(r["after_offer_s"] for r in rs) == first
        assert max(r["after_offer_s"] for r in rs) == last
        # The count rides the last redemption row and is 0 on the others.
        carried = {r["after_offer_s"]: r["other_seats"] for r in rs}
        assert carried[last] == other
        assert sum(v for s, v in carried.items() if s != last) == 0
        assert len(rs) + other == seats
    assert OTHER_SEATS[APPLICANT_AT] == 1 and sum(OTHER_SEATS) == 26
    assert sum(r["other_seats"] for r in rows["reset"]) == 26 == len(rows["reset"])
    assert len(rows["reset"]) + sum(r["other_seats"] for r in rows["reset"]) == 52
    assert sum(1 for r in rows["reset"] if r["other_seats"] == 0) == 14
    assert sum(1 for r in rows["reset"] if r["other_seats"] != 0) == 12


def test_the_applicants_four_redemptions_are_on_its_own_five_seats(rows):
    applicant = [r for r in rows["reset"] if r["org_id"] == _applicant_org(rows)]
    principals = rows["principal"]
    seat_id_of = {n: principals[i]["principal_id"] for i, n in enumerate(SEAT_NUMBERS) if n}
    got = sorted((r["after_offer_s"], r["seat_id"]) for r in applicant)
    assert got == [(s, seat_id_of[n]) for s, n in APPLICANT_SAMPLE]
    # Every redemption names its own seat, one seat once.
    assert len({r["seat_id"] for r in rows["reset"]}) == 26


def test_eight_days_of_requests_sum_to_83920_and_step_up_more_than_sevenfold(rows):
    days = rows["usage_day"]
    assert [d["requests"] for d in days] == DAY_REQUESTS
    assert sum(d["requests"] for d in days) == 83920
    assert [d["output_tokens_m"] for d in days] == DAY_OUTPUT_M
    assert round(sum(d["output_tokens_m"] for d in days), 1) == 626.7
    # 8 Nov to 9 Nov is 2,940 to 21,460, a factor of 7.3.
    assert 7.2 < DAY_REQUESTS[5] / DAY_REQUESTS[4] < 7.4
    assert days[4]["requests"] == 2940 and days[5]["requests"] == 21460


def test_a_day_row_sits_at_the_source_day_start_and_a_magnitude_kind_has_no_off_hour(rows):
    # S1:199 "Day (PT)": a Pacific day starts at 08:00 UTC in November (V4).
    starts = [datetime(2026, 11, 4 + i, 8, 0, 0, tzinfo=UTC) for i in range(8)]
    assert [_at(d["timestamp"]) for d in rows["usage_day"]] == starts
    for d in rows["usage_day"]:
        at = _at(d["timestamp"])
        assert (at.minute, at.second, at.microsecond) == (0, 0, 0)


def test_the_decision_waits_for_review_and_follows_the_last_event_by_an_hour(rows):
    (decision,) = rows["decision"]
    assert (decision["status"], decision["outcome"]) == ("WAITING", "FOR REVIEW")
    assert decision["decided_by"] == "investigator"
    last = max(_at(r["timestamp"]) for k in ("network_seen", "reset", "usage_day") for r in rows[k])
    assert last == datetime(2026, 11, 11, 8, 0, 0, tzinfo=UTC)  # the 11 Nov day row
    assert _at(decision["decided_at"]) == last + timedelta(hours=1)
    assert decision["org_id"] == _applicant_org(rows)
    assert decision["event_ids"] and set(decision["event_ids"]) <= {
        r["id"] for r in rows["network_seen"] + rows["reset"] + rows["usage_day"]
    }


def test_the_decision_note_states_only_counts_the_rows_show(rows):
    note = rows["decision"][0]["note"]
    for figure in ("4 network changes", "10 seconds", "26", "52", "12 organisations", "83,920"):
        assert figure in note, figure
    # No conclusion: no verdict words in the note.
    assert not re.search(r"fraud|stolen|abuse|attack|suspicious|takeover|operator", note, re.I)


def test_no_other_row_carries_a_verdict_word(rows):
    for kind in km.KINDS:
        if kind == "decision":
            continue
        for r in rows[kind]:
            assert not [k for k in r if re.search(r"fraud|label|truth|verdict|^is_", k, re.I)]


# ---- The fences (DESIGN-CASES.md fences 1, 2, 3 and 6) ------------------------------------------


def _pack_text(rows: dict[str, list[dict]]) -> str:
    return json.dumps(rows)


def test_no_profile_name_or_first_name_is_in_the_pack(rows):
    text = _pack_text(rows)
    for word in PROFILE_WORDS:
        assert not re.search(rf"\b{word}\b", text, re.I), "a canonical profile name is in a row"
    data_dir = PROJECT_ROOT / "data" / "key-many-networks"
    for path in data_dir.glob("*.json"):
        body = path.read_text("utf-8")
        for word in PROFILE_WORDS:
            assert not re.search(rf"\b{word}\b", body, re.I), path.name


def test_no_organisation_name_of_the_token_story_is_reused(rows):
    token_orgs = json.loads(
        (PROJECT_ROOT / "data" / "platform-access" / "org.json").read_text("utf-8")
    )
    taken = {o["org_name"].lower() for o in token_orgs}
    domains = {o["domain"].lower() for o in token_orgs}
    assert taken and domains
    assert not taken & {o["org_name"].lower() for o in rows["org"]}
    assert not any(d in _pack_text(rows).lower() for d in domains)


def test_no_string_has_the_shape_of_an_id_of_the_other_project(rows):
    # The shapes only, never a list of its names: a prefix, an underscore and a short run; a
    # two-letter cluster code with four digits; an autonomous system number; its documentation
    # range.
    shapes = [
        r"\b[a-z]{2,6}_[0-9a-z]{2,}(?:_[0-9a-z]+)?\b",
        r"\b[A-Z]{2}-\d{4}\b",
        r"\bAS\s?\d{3,}\b",
        r"autonomous\s+system",
        r"\b64[4-5]\d\d\b",
    ]
    values: list[str] = []
    for items in rows.values():
        for r in items:
            for v in r.values():
                values += [str(x) for x in (v if isinstance(v, list) else [v])]
    text = "\n".join(values)  # the values only: a column name has an underscore by design
    for pattern in shapes:
        assert not re.search(pattern, text), pattern
    # An id is a lower-case prefix, a hyphen and digits or letters, never an underscore.
    for items in rows.values():
        for r in items:
            for key, value in r.items():
                if key.endswith("_id") or key == "id":
                    assert "_" not in str(value), (key, value)


def test_no_row_names_a_network_by_its_number(rows):
    columns = {k for items in rows.values() for r in items for k in r}
    assert not {c for c in columns if "asn" in c.lower()}


def test_the_generator_reads_no_file_and_draws_no_clock():
    source = Path(km.__file__).read_text("utf-8")
    for token in ("open(", "read_text", "read_bytes", "time.time", "datetime.now", "utcnow"):
        assert token not in source, token
    assert "random.Random(SEED)" in source and "import random" in source
    assert "random.random" not in source and "random.choice" not in source


# ---- write() -------------------------------------------------------------------------------------


def test_write_puts_one_file_per_kind_and_an_empty_database(tmp_path, rows):
    data_dir, db_path = tmp_path / "pack", tmp_path / "pack.db"
    paths = km.write(data_dir, db_path)
    assert sorted(p.name for p in data_dir.iterdir()) == sorted(f"{k}.json" for k in km.KINDS)
    assert db_path in paths and len(paths) == len(km.KINDS) + 1
    for kind in km.KINDS:
        assert json.loads((data_dir / f"{kind}.json").read_text("utf-8")) == rows[kind]
    conn = sqlite3.connect(db_path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        assert tables
        for name in tables:
            assert conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] == 0, name
    finally:
        conn.close()


def test_write_twice_writes_the_same_bytes(tmp_path):
    data_dir, db_path = tmp_path / "pack", tmp_path / "pack.db"
    km.write(data_dir, db_path)
    first = {p.name: p.read_bytes() for p in data_dir.iterdir()}
    km.write(data_dir, db_path)
    assert {p.name: p.read_bytes() for p in data_dir.iterdir()} == first
