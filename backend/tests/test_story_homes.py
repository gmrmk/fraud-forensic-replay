"""The opening view of each of the five newer stories keeps its placed rows in the clear area.

Each story's manifest names a `home` (centre and zoom). This file models the camera the app opens
on that home, from the sources named beside each constant below, and checks that every placed row
of the story lands in the clear part of a 1440 by 900 window: right of the left edge, left of the
Inspector, below the top panels and above the bottom stack.

What this file does not do: it checks the manifest's home against a model, not the app. The model
is pure arithmetic (no browser, no map, no clock, no random source); screenshots of the running app
are the proof of what it draws.

LIMITS, stated on purpose:
- pitch 0 and bearing 0, as the opening has them;
- the Inspector open at its width (a 1440 window: x 1108 to 1428), the bar at a bottom stack of 200
  and of 280 px (two frames read 263 and 272, so the two values bracket them);
- a window of 1440 by 900. At a width of 1024 the Inspector covers more of the globe (it covers
  Ashburn in seat-failed-signins) and nothing here says otherwise;
- the model leaves out the Inspector's own height, the labels and the dots' halos.
"""

from __future__ import annotations

import json
from math import acos, atan2, cos, pi, radians, sin, sqrt, tan
from typing import Any

import pytest

from db import PROJECT_ROOT

Row = dict[str, Any]

W, H = 1440, 900
FOV_DEG = 36.87  # maplibre-gl 5.24.1 dist/maplibre-gl.d.ts:8783
TILE = 512  # maplibre-gl tile size in px; the world size derives from it
INSPECTOR_LEFT = 1108  # app/components/Inspector.tsx:64 (right-3, w-80) in a 1440 window
TOP_CLEAR = 72  # the top panels end at y 64
MARGIN = 24
STACKS = (200, 280)  # the bottom stack's height in px
CITY_TILT_ZOOM = 13  # app/lib/globe/autoPitch.ts:14

STORIES = (
    "key-many-networks",
    "seat-failed-signins",
    "agent-runs-shared-key",
    "seats-two-networks",
    "volume-step",
)

# The homes the manifests hold.
HOMES: dict[str, dict[str, float]] = {
    "key-many-networks": {"lat": 30, "lng": -40, "zoom": 1.4},
    "seat-failed-signins": {"lat": 42, "lng": -100, "zoom": 2.6},
    "agent-runs-shared-key": {"lat": 42, "lng": -95, "zoom": 2.6},
    "seats-two-networks": {"lat": 41, "lng": -118, "zoom": 3},
    "volume-step": {"lat": 40.5, "lng": -111, "zoom": 3.5},
}
HIDDEN = {"key-many-networks": {"Singapore"}}  # by city: on the far side of the globe

# The records each story opens on (app/lib/boot-focus.test.ts:252-258): (kind, id). volume-step's
# pd-03 has no place, so it is not here.
LANDING: dict[str, tuple[str, str]] = {
    "key-many-networks": ("network_seen", "nw-0004"),
    "seat-failed-signins": ("credential_event", "ce-0001"),
    "agent-runs-shared-key": ("key_reach", "kr-0003"),
    "seats-two-networks": ("reset", "rs-02"),
}

DATA = PROJECT_ROOT / "data"
SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"


# ------------------------------------------------------------------------------ the camera model


def camera_distance() -> float:
    """The camera's focal length in px."""
    return 0.5 * H / tan(radians(FOV_DEG) / 2)


def radius_px(zoom: float, lat0: float) -> float:
    """The globe's radius in px at `zoom`, centred on latitude `lat0`."""
    return TILE * 2**zoom / (2 * pi) / cos(radians(lat0))


def disk(r: float, c: float) -> float:
    """The disk's diameter in px, seen from the camera (app/hooks/useBarPadding.ts:76-80)."""
    return 2 * c * r / sqrt((c + r) ** 2 - r**2)


def opening_zoom(home: dict[str, float], h: int) -> float:
    """The zoom the story opens on with a bottom stack of `h` px.

    The home's zoom, lowered to the zoom whose disk is `H - h` when the disk at the home's zoom is
    no taller than `H` (the story opens on the whole globe; app/components/GlobeMap.tsx:166-171,550
    and app/hooks/useBarPadding.ts:164-190), found by the same 40-step bisection over -4 to 12
    (:83-92). Never raised.
    """
    c = camera_distance()
    lat0 = home["lat"]
    if disk(radius_px(home["zoom"], lat0), c) > H:
        return home["zoom"]
    lo, hi = -4.0, 12.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if disk(radius_px(mid, lat0), c) > H - h:
            hi = mid
        else:
            lo = mid
    return min(home["zoom"], lo)


def project(lat: float, lng: float, home: dict[str, float], h: int) -> tuple[float, float] | None:
    """The pixel (x, y) of a place at the opening, or None when it is on the far side of the globe.

    theta is the great-circle angle from the home's centre and beta the initial bearing; the
    centre sits at the padded middle (W / 2, (H - h) / 2), the bottom padding being the stack's height, app/hooks/useBarPadding.ts:165-169).
    """
    c = camera_distance()
    r = radius_px(opening_zoom(home, h), home["lat"])
    p1, p2 = radians(home["lat"]), radians(lat)
    dlng = radians(lng - home["lng"])
    cos_theta = sin(p1) * sin(p2) + cos(p1) * cos(p2) * cos(dlng)
    if cos_theta < r / (c + r):
        return None
    theta = acos(max(-1.0, min(1.0, cos_theta)))
    beta = atan2(sin(dlng) * cos(p2), cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dlng))
    rho = c * r * sin(theta) / (c + r - r * cos_theta)
    return (W / 2 + rho * sin(beta), (H - h) / 2 - rho * cos(beta))


# ---------------------------------------------------------------------------------- the story rows


def _manifest(story: str) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(
        (SCENARIOS / f"{story}.scenario.json").read_text(encoding="utf-8")
    )
    return loaded


def _placed_rows(story: str) -> list[tuple[str, Row]]:
    """Every row of the story's tracked files that holds a numeric lat and lng, with its kind."""
    out: list[tuple[str, Row]] = []
    for path in sorted((DATA / story).glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            lat, lng = row.get("lat"), row.get("lng")
            numeric = all(
                isinstance(v, (int, float)) and not isinstance(v, bool) for v in (lat, lng)
            )
            if numeric:
                out.append((path.stem, row))
    return out


def _clear(x: float, y: float, h: int) -> bool:
    return MARGIN <= x <= INSPECTOR_LEFT - MARGIN and TOP_CLEAR <= y <= H - h - 12


def _where(story: str, kind: str, row: Row, h: int) -> str:
    at = project(row["lat"], row["lng"], HOMES[story], h)
    shown = "hidden" if at is None else f"({at[0]:.0f}, {at[1]:.0f})"
    return f"{story} {kind} {row['id']} {row.get('city', '-')} at {shown} with a stack of {h}"


# ------------------------------------------------------------ the camera model's own checks


def test_the_model_reproduces_the_plans_hand_values() -> None:
    """A guard on the model itself: the plan's hand positions for the world story, within 3 px."""
    home = {"lat": 30, "lng": -50, "zoom": 2.3}  # the plan's own home for this story, B17
    expected = {
        200: {
            "Portland": ((45.5152, -122.6784), (458, 149)),
            "Warsaw": ((52.2297, 21.0122), (949, 119)),
        },
        280: {
            "Warsaw": ((52.2297, 21.0122), (920, 108)),
            "Sao Paulo": ((-23.5505, -46.6333), (740, 590)),
        },
    }
    for h, cities in expected.items():
        for name, ((lat, lng), (x, y)) in cities.items():
            at = project(lat, lng, home, h)
            assert at is not None, name
            assert abs(at[0] - x) <= 3 and abs(at[1] - y) <= 3, (name, h, at)


def test_a_place_at_the_centre_is_at_the_padded_middle() -> None:
    home = HOMES["volume-step"]
    for h in STACKS:
        at = project(home["lat"], home["lng"], home, h)
        assert at is not None
        assert abs(at[0] - W / 2) < 1e-6 and abs(at[1] - (H - h) / 2) < 1e-6


def test_the_clear_area_check_can_fail() -> None:
    """A guard on the checks: a home that puts Salt Lake City under the Inspector, and one that
    puts it on the far side, are both refused by the same predicate the story tests use."""
    slc = (40.7608, -111.891)
    under_inspector = project(*slc, {"lat": 40.5, "lng": -140, "zoom": 3.5}, 200)
    assert under_inspector is not None and not _clear(*under_inspector, 200)
    assert project(*slc, {"lat": -40.5, "lng": 70, "zoom": 3.5}, 200) is None
    too_high = project(
        *slc, {"lat": 20, "lng": -111.891, "zoom": 3.5}, 200
    )  # home far south: place near the top
    assert too_high is not None and not _clear(*too_high, 200)


# ------------------------------------------------------------------------------ (a) to (f)


@pytest.mark.parametrize("story", STORIES)
def test_the_manifest_home_is_the_planned_one(story: str) -> None:
    assert _manifest(story)["home"] == HOMES[story]


@pytest.mark.parametrize("h", STACKS)
@pytest.mark.parametrize("story", STORIES)
def test_every_placed_row_is_in_the_clear_area_at_the_bare_opening(story: str, h: int) -> None:
    rows = _placed_rows(story)
    assert rows, f"{story} holds no placed row"
    outside: list[str] = []
    for kind, row in rows:
        if row.get("city") in HIDDEN.get(story, set()):
            continue
        at = project(row["lat"], row["lng"], HOMES[story], h)
        if at is None or not _clear(at[0], at[1], h):
            outside.append(_where(story, kind, row, h))
    assert not outside, f"{len(outside)} placed rows outside the clear area, first: {outside[:6]}"


@pytest.mark.parametrize("h", STACKS)
def test_the_hidden_places_lie_on_the_far_side(h: int) -> None:
    for story, cities in HIDDEN.items():
        far = [(k, r) for k, r in _placed_rows(story) if r.get("city") in cities]
        assert far, f"{story} holds no row at {sorted(cities)}"
        for kind, row in far:
            assert project(row["lat"], row["lng"], HOMES[story], h) is None, _where(
                story, kind, row, h
            )


@pytest.mark.parametrize("h", STACKS)
@pytest.mark.parametrize("story", sorted(LANDING))
def test_the_landing_record_is_in_the_clear_area(story: str, h: int) -> None:
    kind, row_id = LANDING[story]
    (row,) = [r for k, r in _placed_rows(story) if k == kind and r["id"] == row_id]
    at = project(row["lat"], row["lng"], HOMES[story], h)
    assert at is not None and _clear(at[0], at[1], h), _where(story, kind, row, h)


def test_only_the_world_story_opens_on_the_whole_globe() -> None:
    c = camera_distance()
    whole = {s for s in STORIES if disk(radius_px(HOMES[s]["zoom"], HOMES[s]["lat"]), c) <= H}
    assert whole == {"key-many-networks"}


@pytest.mark.parametrize("story", STORIES)
def test_no_home_reaches_the_city_tilt(story: str) -> None:
    assert HOMES[story]["zoom"] < CITY_TILT_ZOOM
