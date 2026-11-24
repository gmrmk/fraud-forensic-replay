"""Geodesic arc geometry + impossible-travel arc detection.

Precomputes true WGS84 great-circle geodesics for the seeded fraud scenario so
the frontend renders authoritative arc geometry (the client previously used a
linear lng/lat interpolation, which is not a great circle). Detection thresholds
mirror frontend/investigator/src/lib/arcs.ts exactly.
"""

from __future__ import annotations

import math
from datetime import datetime

from pyproj import Geod

_GEOD = Geod(ellps="WGS84")

# Mirror src/lib/arcs.ts thresholds.
SPEED_THRESHOLD_MPH = 600.0
MIN_IMPOSSIBLE_DISTANCE_MI = 500.0
SEVERITY_SPAN_MPH = 600.0


def densify_geodesic(
    lon1: float, lat1: float, lon2: float, lat2: float, n_intermediate: int = 128
) -> list[tuple[float, float]]:
    """Return [start, ...n_intermediate geodesic points..., end] as (lng, lat)."""
    inter = _GEOD.npts(lon1, lat1, lon2, lat2, n_intermediate)
    return [(lon1, lat1), *[(lon, lat) for lon, lat in inter], (lon2, lat2)]


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles (matches entities.ts haversineMiles)."""
    r = 3958.7613  # Earth radius, miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _speed_mph(lat1, lon1, t1, lat2, lon2, t2) -> float:
    dist = haversine_miles(lat1, lon1, lat2, lon2)
    hours = abs((_parse_ts(t2) - _parse_ts(t1)).total_seconds()) / 3600.0
    if hours == 0:
        return float("inf")
    return dist / hours


def detect_arcs(transactions: list[dict], n_intermediate: int = 128) -> list[dict]:
    """Impossible-travel arcs with baked geodesic points. Mirrors src/lib/arcs.ts:
    impossible = consecutive card-present pair, speed > 600mph AND dist >= 500mi.
    The single most-severe impossible arc is the hero."""
    cp = sorted(
        [t for t in transactions if t.get("is_card_present") == 1],
        key=lambda t: t["timestamp"],
    )
    arcs: list[dict] = []
    for prev, curr in zip(cp, cp[1:], strict=False):
        dist = haversine_miles(
            prev["merchant_lat"],
            prev["merchant_lng"],
            curr["merchant_lat"],
            curr["merchant_lng"],
        )
        speed = _speed_mph(
            prev["merchant_lat"],
            prev["merchant_lng"],
            prev["timestamp"],
            curr["merchant_lat"],
            curr["merchant_lng"],
            curr["timestamp"],
        )
        if speed > SPEED_THRESHOLD_MPH and dist >= MIN_IMPOSSIBLE_DISTANCE_MI:
            arcs.append(
                {
                    "id": f'{prev["id"]}->{curr["id"]}',
                    "kind": "impossible",
                    "severity": max(
                        0.0, min(1.0, (speed - SPEED_THRESHOLD_MPH) / SEVERITY_SPAN_MPH)
                    ),
                    "implied_speed_mph": speed,
                    "is_hero": False,
                    "points": densify_geodesic(
                        prev["merchant_lng"],
                        prev["merchant_lat"],
                        curr["merchant_lng"],
                        curr["merchant_lat"],
                        n_intermediate,
                    ),
                }
            )
    if arcs:
        hero = max(arcs, key=lambda a: a["implied_speed_mph"])
        hero["is_hero"] = True
    return arcs
