"""Google Places API (New) Nearby Search wrapper + on-disk cache.

A lookup of real businesses near a point, kept for map context. The running
app reads the cache only (`search_nearby(..., fetch=False)`); the service is
called only when a seed-time script calls `search_nearby` itself. None of the
shipped stories uses it.

Architecture:
  - One Nearby Search call per category that has a Places "includedType"
    counterpart (online-only categories like subscription, rideshare,
    online_retail skip Places entirely).
  - Results cached to `data/places_cache/<category>_<lat>_<lng>_<r>.json`
    so later reads use disk, not the API.
  - Defensive on 401 / 403 / 429: log + return [].

API surface used (Places API New, REST):
  POST https://places.googleapis.com/v1/places:searchNearby
  Headers:
    Content-Type: application/json
    X-Goog-Api-Key: <demo key or billing-enabled key>
    X-Goog-FieldMask: places.displayName,places.location,places.id

Auth via header - NEVER via URL parameter, which would leak the key into
server logs, referrer headers, and Browser DevTools history.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = PROJECT_ROOT / "data" / "places_cache"
ENV_FILE = Path(__file__).resolve().parent / ".env"

# Load .env once at import time. Fails silent if missing - caller checks
# `is_enabled()` before attempting any API call.
load_dotenv(ENV_FILE)

PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby"

# Conservative per-call delay (ms) - guards against an undisclosed
# per-second throttle on the demo key. 15 calls × 0.15s = 2.25s extra
# on the first seed; subsequent seeds use cache and pay zero.
INTER_CALL_DELAY_SECONDS = 0.15

# Field mask - only request what we need. Each extra field costs a
# separate SKU under the Places API (New) billing model.
FIELD_MASK = "places.displayName,places.location,places.id"


@dataclass
class Place:
    """Minimal Place record. Caller copies into seed transactions."""

    place_id: str
    name: str
    lat: float
    lng: float


# Mapping from our seed.py category strings to Google's Place "type"
# values. Online-only categories (subscription, rideshare, online_retail)
# return None - those keep their Faker placeholders since there's no
# physical merchant to geocode.
#
# Type names verified against Places API (New) supported types in
# Google's reference. If the API rejects one, swap for a close
# semantic equivalent and re-cache.
CATEGORY_TO_PLACES_TYPES: dict[str, list[str] | None] = {
    "groceries": ["grocery_store", "supermarket"],
    "gas": ["gas_station"],
    "fast_food": ["fast_food_restaurant"],
    "restaurant": ["restaurant"],
    "coffee": ["coffee_shop", "cafe"],
    "warehouse": ["wholesaler"],  # closest in Places types
    "pharmacy": ["pharmacy", "drugstore"],
    "department": ["department_store"],
    "kids_activity": ["child_care_agency"],
    "auto_service": ["car_repair"],
    "work_lodging": ["hotel", "lodging"],
    # Online-only - no physical merchant to fetch.
    "subscription": None,
    "online_retail": None,
    "rideshare": None,
}


def is_enabled() -> bool:
    """True if a GOOGLE_PLACES_API_KEY is configured. Caller short-circuits
    to the Faker fallback when False."""
    return bool(os.environ.get("GOOGLE_PLACES_API_KEY", "").strip())


def _cache_path(category: str, lat: float, lng: float, radius_m: int) -> Path:
    """Stable cache key. Rounded lat/lng so jittered repeats hit the
    same cache file."""
    return CACHE_DIR / f"{category}_{lat:.3f}_{lng:.3f}_{radius_m}.json"


def search_nearby(
    category: str,
    lat: float,
    lng: float,
    radius_m: int = 5000,
    max_results: int = 20,
    *,
    fetch: bool = True,
) -> list[Place]:
    """Return up to `max_results` Place records for the given category
    around (lat, lng). Empty list on any failure mode.

    First call hits Places API, writes raw JSON response to cache.
    Subsequent calls with same key parameters read from disk.

    `fetch=False` reads the cache and nothing else. The running app calls it
    that way: the Places service is for seed time only, and an endpoint that
    took coordinates from the caller would spend the operator's key
    (FIX-2026-11-14-places-endpoint-calls-the-service-at-run-time).
    """
    types = CATEGORY_TO_PLACES_TYPES.get(category)
    if types is None:
        return []

    cache_file = _cache_path(category, lat, lng, radius_m)
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            cache_file.unlink()  # corrupt cache - drop + refetch
            data = None
        if data is not None:
            return _parse_places(data)

    if not fetch or not is_enabled():
        return []

    # Cache miss + key present - actually hit the API.
    api_key = os.environ["GOOGLE_PLACES_API_KEY"].strip()
    body = {
        "includedTypes": types,
        "maxResultCount": max_results,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(radius_m),
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(PLACES_ENDPOINT, headers=headers, json=body)
    except httpx.HTTPError as e:
        logger.error("places: network error for %s: %s", category, type(e).__name__)
        return []

    time.sleep(INTER_CALL_DELAY_SECONDS)

    if resp.status_code == 401:
        logger.warning("places: 401 unauthorized - API key invalid or unconfigured")
        return []
    if resp.status_code == 403:
        logger.warning(
            "places: 403 forbidden - demo key may not allow server-side "
            "calls; check Maps Platform restrictions"
        )
        return []
    if resp.status_code == 429:
        logger.warning("places: 429 rate-limited - daily quota hit on demo key")
        return []
    if resp.status_code >= 400:
        # 400s usually mean a request-shape bug (bad includedType, etc.) -
        # surface the response body so we can fix it without re-running.
        logger.error("places: HTTP %s for %s: %s", resp.status_code, category, resp.text[:200])
        return []

    data = resp.json()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return _parse_places(data)


def _parse_places(data: dict) -> list[Place]:
    places = []
    for p in data.get("places", []):
        name = p.get("displayName", {}).get("text", "")
        loc = p.get("location", {})
        place_id = p.get("id", "")
        if name and "latitude" in loc and "longitude" in loc:
            places.append(
                Place(
                    place_id=place_id,
                    name=name,
                    lat=loc["latitude"],
                    lng=loc["longitude"],
                )
            )
    return places
