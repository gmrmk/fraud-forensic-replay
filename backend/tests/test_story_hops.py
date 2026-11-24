"""The paths and the hop figures of the five newer stories (key-many-networks, seat-failed-signins,
agent-runs-shared-key, seats-two-networks, volume-step).

A path kind is a kind whose rows name a key or a seat and a network: the globe draws one line for
each key or seat through its rows, in time order. Each row of a path kind also holds the two
figures of the hop that ends at it, `seconds_since_previous` and `km_from_previous` (the one
definition is `seed_packs.hop_figures`; the stories data piece's plan words it as B11). This file
checks four things: the manifest declares exactly the planned path kinds; every row of a path
kind holds both figures or neither; the figures equal this file's own walk over the rows, which
shares no code with the seed and measures the distance by vectors instead of haversine; and the
anchors the plan gives, by hand, hold.

What this file does not do: it reads no clock and no random source, never writes a file, and says
nothing about the places themselves (test_story_places.py holds them).
"""

from __future__ import annotations

import functools
import json
from datetime import datetime
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any

import pytest

import seed_agent_runs_shared_key as ar
import seed_key_many_networks as km
import seed_seat_failed_signins as sf
import seed_seats_two_networks as st
import seed_volume_step as vs
from db import PROJECT_ROOT

Row = dict[str, Any]

STORIES = (
    "key-many-networks",
    "seat-failed-signins",
    "agent-runs-shared-key",
    "seats-two-networks",
    "volume-step",
)
SEEDS = {
    "key-many-networks": km,
    "seat-failed-signins": sf,
    "agent-runs-shared-key": ar,
    "seats-two-networks": st,
    "volume-step": vs,
}
SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"
SECONDS, KM = "seconds_since_previous", "km_from_previous"

# The path kinds of each story: (kind, pathBy, the field that names the previous network or None).
# volume-step's rows name workspaces, no key or seat (owner question QA), so it has no path.
PATHS: dict[str, list[tuple[str, str, str | None]]] = {
    "key-many-networks": [
        ("network_seen", "principal_id", "previous_network"),
        ("signin", "seat_id", None),
    ],
    "seat-failed-signins": [("signin", "seat_id", None)],
    "agent-runs-shared-key": [("key_reach", "credential_id", None)],
    "seats-two-networks": [("signin", "seat_id", None)],
    "volume-step": [],
}

# The anchors, by hand: row id -> (seconds, km) or None for a key's first row. The km are hand
# values, so a row passes within 5 km; 0 is exact. key-many-networks' sign-ins are numbered by
# time over 54 rows, so they are found by (seat_id, timestamp) below.
ANCHORS: dict[tuple[str, str], dict[str, tuple[int, int] | None]] = {
    ("key-many-networks", "network_seen"): {
        "nw-0001": (7, 363),
        "nw-0002": (3, 890),
        "nw-0003": (4, 9399),
        "nw-0004": (3, 15987),
    },
    ("agent-runs-shared-key", "key_reach"): {
        "kr-0001": None,
        "kr-0002": None,
        "kr-0003": (473548, 571),
        "kr-0004": None,
        "kr-0005": None,
    },
    ("seat-failed-signins", "signin"): {
        "sg-0001": None,
        "sg-0002": (28268, 3695),
        "sg-0003": (974, 0),
        "sg-0004": None,
    },
    ("seats-two-networks", "signin"): {
        "si-01": None,
        "si-02": None,
        "si-03": None,
        "si-04": (85950, 26),
        "si-05": None,
        "si-06": (11100, 26),
        "si-07": (12600, 0),
    },
}
KEY_SIGNINS: dict[tuple[str, str], tuple[int, int] | None] = {
    ("seat-27310", "2026-11-04T16:12:00+00:00"): None,
    ("seat-27310", "2026-11-09T17:58:40+00:00"): (438400, 8039),  # Portland to Amsterdam
    ("seat-27310", "2026-11-10T22:15:00+00:00"): (101780, 8039),  # and back
    ("seat-54960", "2026-11-10T17:40:30+00:00"): None,
    ("seat-54960", "2026-11-10T17:40:45+00:00"): (15, 0),
}


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _manifest(story: str) -> dict[str, Any]:
    return _read(SCENARIOS / f"{story}.scenario.json")


def _node(manifest: dict[str, Any], kind: str) -> dict[str, Any]:
    (node,) = [n for n in manifest["nodes"] if n["kind"] == kind]
    return node


@functools.cache
def _build(name: str) -> dict[str, Any]:
    module = SEEDS[name]
    return {
        "name": name,
        "rows": module.generate(),
        "networks": module.NETWORKS,
        "manifest": _manifest(name),
        "paths": PATHS[name],
    }


@pytest.fixture(scope="module", params=STORIES)
def story(request: pytest.FixtureRequest) -> dict[str, Any]:
    return _build(request.param)


# --------------------------------------------------------------------- this file's own reckoning


def _epoch(stamp: str) -> float:
    return datetime.fromisoformat(stamp).timestamp()


def _vector(lat: float, lng: float) -> tuple[float, float, float]:
    p, q = radians(lat), radians(lng)
    return (cos(p) * cos(q), cos(p) * sin(q), sin(p))


def _km(a: tuple[float, float], b: tuple[float, float]) -> int:
    """The angle between two unit vectors, atan2(|a x b|, a . b), on a 6371.0 km sphere."""
    (x1, y1, z1), (x2, y2, z2) = _vector(*a), _vector(*b)
    cross = sqrt((y1 * z2 - z1 * y2) ** 2 + (z1 * x2 - x1 * z2) ** 2 + (x1 * y2 - y1 * x2) ** 2)
    return round(atan2(cross, x1 * x2 + y1 * y2 + z1 * z2) * 6371.0)


def _reckon(story: dict[str, Any], kind: str, by: str, previous: str | None) -> dict[str, Any]:
    """Each row's (seconds, km) by walking the path kind in time order, key by key."""
    rows, places = story["rows"], story["networks"]
    path = sorted(rows[kind], key=lambda r: (_epoch(r["timestamp"]), r["id"]))
    everything = [r for kind_rows in rows.values() for r in kind_rows]
    figures: dict[str, Any] = {}
    for i, r in enumerate(path):
        key = r[by]
        own = [p for p in path[:i] if p[by] == key]
        start: tuple[Row, str] | None = None
        if previous and r.get(previous):
            named = r[previous]
            seen = [p for p in own if p["network_id"] == named]
            if not seen:
                seen = [
                    p
                    for p in everything
                    if p.get(by) == key
                    and p.get("network_id") == named
                    and isinstance(p["timestamp"], str)
                    and _epoch(p["timestamp"]) < _epoch(r["timestamp"])
                ]
            if seen:
                start = (max(seen, key=lambda p: (_epoch(p["timestamp"]), p["id"])), named)
        elif own:
            start = (own[-1], own[-1]["network_id"])
        if start is None:
            figures[r["id"]] = (None, None)
            continue
        origin, origin_network = start
        _c, _n, lat0, lng0 = places[origin_network]
        _c, _n, lat1, lng1 = places[r["network_id"]]
        figures[r["id"]] = (
            round(_epoch(r["timestamp"]) - _epoch(origin["timestamp"])),
            _km((lat0, lng0), (lat1, lng1)),
        )
    return figures


# ---------------------------------------------------------------------------------------- the tests


def test_exactly_the_planned_kinds_declare_a_path_and_no_other_node_names_one(story):
    declared = {
        n["kind"]: n for n in story["manifest"]["nodes"] if {"path", "pathBy", "territory"} & set(n)
    }
    assert sorted(declared) == sorted(kind for kind, _by, _prev in story["paths"])
    for kind, by, _previous in story["paths"]:
        node = declared[kind]
        assert (node["path"], node["pathBy"], node["territory"]) == (True, by, False), kind


def test_every_row_of_a_path_kind_holds_both_figures_or_neither(story):
    path_kinds = {kind for kind, _by, _prev in story["paths"]}
    for kind, rows in story["rows"].items():
        for row in rows:
            if kind not in path_kinds:
                assert SECONDS not in row and KM not in row, (kind, row["id"])
                continue
            assert SECONDS in row and KM in row, (kind, row["id"])
            pair = (row[SECONDS], row[KM])
            for value in pair:
                assert value is None or (type(value) is int and value >= 0), (kind, row["id"])
            assert (pair[0] is None) == (pair[1] is None), (kind, row["id"], "both or neither")
            keys = list(row)
            assert keys[-2:] == [SECONDS, KM], (kind, row["id"], "after the row's own keys")


def test_the_figures_equal_this_files_own_walk_over_the_rows(story):
    for kind, by, previous in story["paths"]:
        expected = _reckon(story, kind, by, previous)
        assert len(expected) == len(story["rows"][kind])
        for row in story["rows"][kind]:
            assert (row[SECONDS], row[KM]) == expected[row["id"]], (story["name"], kind, row["id"])


def test_every_declared_path_draws_a_line_of_some_length(story):
    """Some key or seat has two placed rows more than 1.61 km apart (a mile, the least the
    app's path builder keeps, app/lib/paths.ts)."""
    for kind, by, _previous in story["paths"]:
        by_key: dict[str, list[Row]] = {}
        for row in story["rows"][kind]:
            if isinstance(row.get("lat"), int | float):
                by_key.setdefault(row[by], []).append(row)
        long = [
            key
            for key, placed in by_key.items()
            if any(
                _km((a["lat"], a["lng"]), (b["lat"], b["lng"])) > 1.61
                for a in placed
                for b in placed
            )
        ]
        assert long, (story["name"], kind)


def test_the_anchors_of_the_plan_hold(story):
    for (name, kind), anchors in ANCHORS.items():
        if name != story["name"]:
            continue
        by_id = {r["id"]: r for r in story["rows"][kind]}
        assert sorted(by_id) == sorted(anchors), (name, kind, "an anchor for every row")
        for row_id, expected in anchors.items():
            row = by_id[row_id]
            if expected is None:
                assert (row[SECONDS], row[KM]) == (None, None), (name, row_id)
                continue
            seconds, km_hand = expected
            assert row[SECONDS] == seconds, (name, row_id)
            if km_hand == 0:
                assert row[KM] == 0, (name, row_id)
            else:
                assert abs(row[KM] - km_hand) <= 5, (name, row_id, row[KM], km_hand)


def test_the_sign_ins_of_key_many_networks_hold_their_anchors_and_every_crowd_seat_stays_put():
    signins = _build("key-many-networks")["rows"]["signin"]
    found = {(r["seat_id"], r["timestamp"]): r for r in signins}
    for address, expected in KEY_SIGNINS.items():
        row = found[address]
        if expected is None:
            assert (row[SECONDS], row[KM]) == (None, None), address
            continue
        seconds, km_hand = expected
        assert row[SECONDS] == seconds, address
        assert abs(row[KM] - km_hand) <= 5 if km_hand else row[KM] == 0, address
    # A crowd seat signs in twice at one office: its second sign-in is 0 km from its first.
    seats: dict[str, list[Row]] = {}
    for row in sorted(signins, key=lambda r: (r["timestamp"], r["id"])):
        seats.setdefault(row["seat_id"], []).append(row)
    crowd = [
        rows
        for rows in seats.values()
        if len(rows) == 2 and rows[0]["network_id"] == rows[1]["network_id"]
    ]
    assert len(crowd) >= 22
    assert all(rows[1][KM] == 0 and rows[1][SECONDS] > 0 for rows in crowd)


def test_the_hop_figures_sit_side_by_side_in_one_section_of_each_path_kind(story):
    for kind, _by, _previous in story["paths"]:
        sections = _node(story["manifest"], kind)["sections"]
        holding = [s for s in sections if SECONDS in s["fields"] or KM in s["fields"]]
        assert len(holding) == 1, (story["name"], kind)
        fields = holding[0]["fields"]
        assert fields.index(KM) == fields.index(SECONDS) + 1, (story["name"], kind)


def test_volume_step_declares_no_path_and_its_rows_hold_no_hop_figure():
    story = _build("volume-step")
    assert story["paths"] == []
    assert not any(
        {"path", "pathBy", "territory"} & set(node) for node in story["manifest"]["nodes"]
    )
    assert not [r for rows in story["rows"].values() for r in rows if SECONDS in r or KM in r]
