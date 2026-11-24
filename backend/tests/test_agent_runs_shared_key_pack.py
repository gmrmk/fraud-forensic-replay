"""The `agent-runs-shared-key` pack: five agent runs, one key that reached two workspaces.

This file pins the generator (`seed_agent_runs_shared_key.py`): the rows and counts of the
story's table, every stamp as a literal in UTC, the sums, and the fences of the design (a place
on three kinds only, no profile name, no id of another project's form). The manifest seam is in
test_agent_runs_shared_key_manifest.py. The expected stamps below are typed by hand from the
design's source (Pacific time, UTC-8 in November, so each is the source stamp plus 8 hours), not
derived from the generator's constants."""

from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime, timedelta

import pytest

import seed_agent_runs_shared_key as sk
from db import PROJECT_ROOT
from tests._left_out import require_files

PLATFORM_ORGS = PROJECT_ROOT / "data" / "platform-access" / "org.json"
PROFILES = PROJECT_ROOT / "docs" / "decisions" / "PROFILES.md"
GENERATOR = PROJECT_ROOT / "backend" / "seed_agent_runs_shared_key.py"
MANIFEST = PROJECT_ROOT / "backend" / "scenarios" / "agent-runs-shared-key.scenario.json"
SPAN = (date(2026, 11, 4), date(2026, 11, 11))  # V7: the story's days, 4 to 11 Nov

COUNTS = {
    "org": 1,
    "workspace": 3,
    "run_start": 5,
    "run_end": 5,
    "key_reach": 5,
    "signin": 4,
    "decision": 1,
}
# The kinds whose rows hold a numeric lat and lng. A run start, a run end and a key reach name no
# network of their own: each takes the network of the sign-in nearest before it (by time alone).
PLACED = ("org", "run_start", "run_end", "key_reach", "signin", "decision")
MINNEAPOLIS = ("Minneapolis", "US", 44.9778, -93.265)
CHICAGO = ("Chicago", "US", 41.8781, -87.6298)
# The four sign-ins in time order: workspace index, method, stamp, network, address, place. Typed
# here from the design, not read from the generator; a workspace is named by its row's position.
SIGNINS = [
    (0, "password", "2026-11-04T16:20:00+00:00", "net-101 corporate", "198.51.100.10", MINNEAPOLIS),
    (
        1,
        "single sign-on",
        "2026-11-09T19:00:00+00:00",
        "net-101 corporate",
        "198.51.100.10",
        MINNEAPOLIS,
    ),
    (
        1,
        "single sign-on",
        "2026-11-10T17:05:00+00:00",
        "net-102 corporate",
        "203.0.113.50",
        CHICAGO,
    ),
    (2, "password", "2026-11-11T04:00:00+00:00", "net-102 corporate", "203.0.113.50", CHICAGO),
]

# One tuple per run in start order: start, end, minutes stated, tool calls, safeguard events,
# intervened, fell back (all as stated; the stamps are the stated Pacific times plus 8 hours).
RUNS = [
    ("2026-11-04T16:10:00+00:00", "2026-11-05T23:22:00+00:00", 1872, 41280, 0, 0, 0),
    ("2026-11-09T19:05:00+00:00", "2026-11-09T22:47:00+00:00", 222, 9620, 71, 49, 22),
    ("2026-11-10T03:30:00+00:00", "2026-11-10T11:18:00+00:00", 468, 21060, 88, 61, 27),
    ("2026-11-10T17:12:00+00:00", "2026-11-11T00:40:00+00:00", 448, 19400, 68, 47, 21),
    ("2026-11-11T04:05:00+00:00", "2026-11-11T10:31:00+00:00", 386, 2840, 9, 6, 3),
]
# Requests and last-request stamp of the five key and workspace pairs, in time order. The last
# request of two pairs is stated to the minute only, so its seconds are 00.
REACH = [
    (26, "2026-11-05T22:58:41+00:00"),
    (42170, "2026-11-11T10:29:36+00:00"),
    (78410, "2026-11-11T10:31:09+00:00"),
    (1134, "2026-11-11T13:02:00+00:00"),
    (2310, "2026-11-11T13:12:00+00:00"),
]
DECIDED_AT = "2026-11-11T14:12:00+00:00"  # one hour after the latest stamp of any row


@pytest.fixture(scope="module")
def rows() -> dict[str, list[dict]]:
    return sk.generate()


def _at(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def _all_strings(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _all_strings(v)]
    if isinstance(value, list):
        return [s for v in value for s in _all_strings(v)]
    return []


def _pack_text() -> str:
    paths = [*sorted(sk.DATA_DIR.glob("*.json")), GENERATOR, MANIFEST]
    return "\n".join(p.read_text(encoding="utf-8") for p in paths)


def test_the_pack_is_a_pure_function_of_the_module():
    assert sk.generate() == sk.generate()
    assert sk.SEED == 2026111802


def test_every_kind_of_the_table_is_present_with_its_row_count(rows):
    assert tuple(rows) == sk.KINDS == tuple(COUNTS)
    assert {k: len(v) for k, v in rows.items()} == COUNTS
    assert sum(COUNTS.values()) == 24


def test_ids_are_unique_across_the_pack_and_first_in_each_row(rows):
    ids = [r["id"] for items in rows.values() for r in items]
    assert len(ids) == len(set(ids)) == 24
    assert all(next(iter(r)) == "id" for items in rows.values() for r in items)
    assert len({r["run_id"] for r in rows["run_start"]}) == 5
    assert len({r["credential_id"] for r in rows["key_reach"]}) == 4


def test_the_run_stamps_are_the_stated_pacific_times_in_utc(rows):
    starts = {r["run_id"]: r for r in rows["run_start"]}
    ends = {r["run_id"]: r for r in rows["run_end"]}
    assert set(starts) == set(ends)
    ordered = sorted(starts, key=lambda run: starts[run]["timestamp"])
    got = [(starts[r]["timestamp"], ends[r]["timestamp"]) for r in ordered]
    assert got == [(s, e) for s, e, *_ in RUNS]


def test_each_run_lasts_the_stated_minutes_and_duration_h_reads_them(rows):
    starts = {r["run_id"]: _at(r["timestamp"]) for r in rows["run_start"]}
    for end in rows["run_end"]:
        minutes = (_at(end["timestamp"]) - starts[end["run_id"]]) / timedelta(minutes=1)
        stated = next(m for _s, e, m, *_ in RUNS if e == end["timestamp"])
        assert minutes == stated
        assert end["duration_h"] == round(stated / 60, 1)
        assert 3 <= end["duration_h"] <= 32


def test_the_run_end_counts_are_the_stated_ones_and_the_sums_hold(rows):
    ends = sorted(rows["run_end"], key=lambda r: r["timestamp"])
    got = [(r["tool_calls"], r["safeguard_events"], r["intervened"], r["fell_back"]) for r in ends]
    assert got == [(c, e, i, f) for _s, _e, _m, c, e, i, f in RUNS]
    assert [r["safeguard_events"] for r in ends] == [0, 71, 88, 68, 9]
    assert [r["intervened"] for r in ends] == [0, 49, 61, 47, 6]
    assert [r["fell_back"] for r in ends] == [0, 22, 27, 21, 3]
    for r in ends:
        assert r["intervened"] + r["fell_back"] == r["safeguard_events"], r["run_id"]
    assert sum(r["tool_calls"] for r in ends) == 94200
    assert sum(r["intervened"] for r in ends) == 163
    assert sum(r["fell_back"] for r in ends) == 73
    assert sum(r["safeguard_events"] for r in ends) == 236 == 163 + 73


def test_a_run_row_names_no_credential(rows):
    """No record states which key a run used, so no run row carries a credential."""
    for kind in ("run_start", "run_end"):
        for r in rows[kind]:
            assert "credential_id" not in r and "workspace_id" not in r, (kind, r["id"])
    keys = {"id", "timestamp", "run_id", "network_id", "city", "country", "lat", "lng"}
    assert set(rows["run_start"][0]) == keys


def test_four_keys_and_one_of_them_reached_two_workspaces(rows):
    reach = rows["key_reach"]
    assert sorted((r["requests"], r["timestamp"]) for r in reach) == sorted(REACH)
    reached: dict[str, set[str]] = {}
    for r in reach:
        reached.setdefault(r["credential_id"], set()).add(r["workspace_id"])
    assert sorted(len(v) for v in reached.values()) == [1, 1, 1, 2]
    (shared,) = [k for k, v in reached.items() if len(v) == 2]
    mine = sorted(r["requests"] for r in reach if r["credential_id"] == shared)
    assert mine == [26, 78410]
    assert {r["workspace_id"] for r in reach} == {w["workspace_id"] for w in rows["workspace"]}


def test_the_workspace_the_shared_key_reached_with_26_requests_holds_health_data(rows):
    classes = {w["workspace_id"]: w["data_class"] for w in rows["workspace"]}
    assert sorted(classes.values()) == ["health", "non-health", "non-health"]
    small = next(r for r in rows["key_reach"] if r["requests"] == 26)
    assert classes[small["workspace_id"]] == "health"
    assert all(w["timestamp"] == 0 for w in rows["workspace"] + rows["org"])


def test_the_decision_is_one_row_in_words_one_hour_after_the_last_event(rows):
    (d,) = rows["decision"]
    assert d["decided_at"] == DECIDED_AT
    stamps = [r["timestamp"] for k in ("run_start", "run_end", "key_reach") for r in rows[k]]
    assert _at(d["decided_at"]) - max(map(_at, stamps)) == timedelta(hours=1)
    assert (d["status"], d["outcome"], d["decided_by"]) == ("WAITING", "FOR REVIEW", "investigator")
    (org,) = rows["org"]
    assert (d["org_id"], d["target_label"]) == (org["org_id"], org["org_name"])
    assert (d["lat"], d["lng"]) == (org["lat"], org["lng"]) == MINNEAPOLIS[2:]
    assert "city" not in d and "country" not in d, "the decision gains lat and lng only"
    ids = {r["id"]: r for k in ("run_end", "key_reach") for r in rows[k]}
    assert len(d["event_ids"]) == 2 and all(e in ids for e in d["event_ids"])
    keys = {ids[e]["credential_id"] for e in d["event_ids"]}
    assert len(keys) == 1, "the decision works the shared key's two reach rows"
    shared = [r for r in rows["key_reach"] if r["credential_id"] in keys]
    assert sorted(r["id"] for r in shared) == sorted(d["event_ids"])


def test_the_decision_note_lists_only_counts_the_rows_show(rows):
    (d,) = rows["decision"]
    shown = {94200, 236, 163, 73, 5, 4, 2, 78410, 26}
    for token in re.findall(r"\d[\d,]*", d["note"]):
        assert int(token.replace(",", "")) in shown, token
    assert "94,200" in d["note"] and "236" in d["note"]
    # no verdict and no instruction
    assert not re.search(r"fraud|breach|violat|misuse|should|must|revoke", d["note"], re.I)


def test_the_organisation_and_the_decision_hold_the_organisations_city_after_todays_keys(rows):
    (org,) = rows["org"]
    assert list(org) == ["id", "timestamp", "org_id", "org_name", "city", "country", "lat", "lng"]
    assert org["timestamp"] == 0, "the filler stays on the row, the manifest omits it"
    assert (org["city"], org["country"], org["lat"], org["lng"]) == MINNEAPOLIS
    (d,) = rows["decision"]
    assert list(d) == [
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
    ]


def test_the_four_signins_are_the_typed_rows_in_time_order_with_ids_from_the_clock(rows):
    workspaces = [w["workspace_id"] for w in rows["workspace"]]
    expected = [
        {
            "id": f"si-{n:04d}",
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
    assert rows["signin"][0]["workspace_id"] == next(
        w["workspace_id"] for w in rows["workspace"] if w["data_class"] == "health"
    )


def test_a_network_has_one_address_and_one_place_wherever_it_is_named(rows):
    seen: dict[str, tuple] = {}
    for r in rows["signin"]:
        where = (r["ip"], r["city"], r["country"], r["lat"], r["lng"])
        assert seen.setdefault(r["network_id"], where) == where, r["id"]
    assert sorted(seen) == ["net-101 corporate", "net-102 corporate"]


def test_every_timed_stamp_has_an_offset_and_lies_in_the_story_span(rows):
    timed = {
        "run_start": "timestamp",
        "run_end": "timestamp",
        "key_reach": "timestamp",
        "signin": "timestamp",
        "decision": "decided_at",
    }
    for kind, column in timed.items():
        for r in rows[kind]:
            at = _at(r[column])
            assert at.utcoffset() == timedelta(0), (kind, r["id"])
            assert SPAN[0] <= at.astimezone(UTC).date() <= SPAN[1], (kind, r["id"])


def test_only_the_placed_kinds_have_a_place_and_none_a_naive_time(rows):
    for kind, items in rows.items():
        for r in items:
            assert not {"latitude", "longitude", "coords"} & set(r), (kind, r["id"])
            if kind in PLACED:
                for key in ("lat", "lng"):
                    assert type(r[key]) in (int, float), (kind, r["id"], key)
            else:
                assert not {"lat", "lng"} & set(r), (kind, r["id"])
            for s in _all_strings(r):
                assert not re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:.]+", s), f"no offset: {s} ({kind})"


def test_no_event_row_carries_a_label_a_verdict_or_a_flag(rows):
    """The decision row is the business's own record, so its columns are exempt."""
    for kind, items in rows.items():
        if kind == "decision":
            continue
        for r in items:
            bad = [k for k in r if re.search(r"fraud|label|truth|verdict|^is_", k, re.I)]
            assert not bad, (kind, r["id"], bad)


def test_the_files_on_disk_are_the_generators_output(rows, tmp_path):
    """The checked-in files hold the generator's content (compared by parsing, so a checkout that
    writes CRLF still passes); the generator's own bytes are pinned from a fresh write."""
    for kind in sk.KINDS:
        path = sk.DATA_DIR / f"{kind}.json"
        assert json.loads(path.read_text("utf-8")) == rows[kind], kind
    data_dir = tmp_path / "pack"
    sk.write(data_dir, tmp_path / "pack.db")
    for kind in sk.KINDS:
        written = (data_dir / f"{kind}.json").read_bytes()
        assert b"\r" not in written, kind


# ---- The fences ---------------------------------------------------------------------------


def _profile_words() -> list[str]:
    require_files(PROFILES, why="the fence has no profile name to look for without it")
    text = PROFILES.read_text(encoding="utf-8")
    found = re.findall(r"^## Customer [AB]\D+?([A-Z][a-z]+) ([A-Z][a-z]+),", text, re.M)
    words = [w for pair in found for w in pair]
    assert len(words) == 4, "the profile headings were not read"
    return words


def test_no_file_of_the_pack_holds_a_profile_name_as_a_word():
    text = _pack_text()
    for word in _profile_words():
        assert not re.search(rf"\b{word}\b", text, re.I), "a profile name is in the pack"


def test_no_organisation_or_workspace_name_is_one_of_the_token_stories(rows):
    taken = {o["org_name"] for o in json.loads(PLATFORM_ORGS.read_text("utf-8"))}
    assert len(taken) >= 30
    mine = [rows["org"][0]["org_name"], *[w["workspace_name"] for w in rows["workspace"]]]
    assert not set(mine) & taken
    for name in mine:
        assert not any(name.split()[0] == t.split()[0] for t in taken), name


def test_no_string_has_the_form_an_id_of_another_project_takes(rows):
    """An id of the source is lower-case words joined by two underscores or more, or starts with
    run_ or cred_; this pack coins its ids with hyphens."""
    shape = re.compile(r"\b[a-z]+(?:_[a-z0-9]+){2,}\b|\b(?:run|cred)_\w+")
    for kind, items in rows.items():
        for r in items:
            for s in _all_strings(r):
                assert not shape.search(s), (kind, r["id"], s)
            for column in ("org_id", "workspace_id", "run_id", "credential_id"):
                if column in r:
                    assert re.fullmatch(r"[a-z]{3}-[A-Z0-9]{4,8}", r[column]), r[column]


def test_no_autonomous_system_number_and_no_file_of_another_project_is_opened():
    text = _pack_text()
    assert not re.search(r"autonomous system|\bAS\d{3,}\b", text, re.I)
    source = GENERATOR.read_text("utf-8")
    assert not re.search(r"[A-Za-z]:[\\/]", source), "no absolute path"
    assert not re.search(
        r"\bopen\(|read_text\(|read_bytes\(", source
    ), "the generator reads no file"


def test_rows_hold_counts_and_category_words_only(rows):
    """No row but the decision carries free text: no string of a row is long."""
    for kind, items in rows.items():
        if kind == "decision":
            continue
        for r in items:
            long = [s for s in _all_strings(r) if len(s) > 40]
            assert not long, (kind, r["id"], long)


def test_the_generator_has_a_cite_beside_the_constants():
    source = GENERATOR.read_text("utf-8")
    assert len(re.findall(r"case-2\.js:\d+", source)) >= 4
    assert re.search(r"cases\.md:\d+", source)
