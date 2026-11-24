"""Helpers the pack generators share: `iso`, `numbered` and `write_pack`, then `place_row` and
`carry_network`, which put a city on every row that names a network.

The first three are the helpers `seed_platform.py` holds (`_iso`, `_numbered`, `write`), with two
changes the new packs need. `numbered` takes its tie columns as an argument, because most new
kinds carry no `org_id`. `iso` refuses a stamp with no zone, because a naive stamp would take
the machine's clock zone and a seeded pack must not depend on it. `seed_platform.py` keeps its
own copies; the duplication is a later refactor, not done here.

`place_row` copies a network's city, country and coordinates onto a row that names it, and refuses
a row whose typed place disagrees with the table. `carry_network` names the network of an event
row that names none, by time alone: the nearest earlier row that does. Neither reads a clock or a
random source, and neither invents a place: a network the table lacks is an error.

`great_circle_km` and `hop_figures` give a path kind its two figures: the seconds and the km of
each hop, by one definition (see `hop_figures`). They read the rows' stamps and the places of the
networks and nothing else: no clock, no random source, no outside service.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any

from db import init_db

Row = dict[str, Any]
Place = tuple[str, str, float, float]  # city, country, latitude, longitude

_PLACE_KEYS = ("city", "country", "lat", "lng")

_KIND = re.compile(r"[a-z][a-z0-9_]*")


def iso(at: datetime) -> str:
    """A stamp in UTC with its offset written. A datetime with no zone is an error."""
    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError(f"a pack stamp needs a time zone, got {at.isoformat()}")
    return at.astimezone(UTC).isoformat()


def numbered(
    prefix: str,
    rows: list[Row],
    width: int = 4,
    ts: str = "timestamp",
    ties: tuple[str, ...] = (),
) -> list[Row]:
    """Rows in time order, each given an id `<prefix>-<n>` in that order, id first.

    Equal times fall back to the `ties` columns (a row without one counts as empty), then to
    the order the rows came in, so the ids are a function of the rows. Every stamp of one kind
    carries one UTC offset, so the string order is the time order; an untimed kind holds
    timestamp 0 on every row and keeps its input order."""
    ordered = sorted(rows, key=lambda r: (r[ts], *(str(r.get(c) or "") for c in ties)))
    out = []
    for i, row in enumerate(ordered, start=1):
        if "id" in row:
            raise ValueError(f"row already has an id: {row['id']!r}")
        out.append({"id": f"{prefix}-{i:0{width}d}", **row})
    return out


def place_row(row: Row, networks: Mapping[str, Place]) -> Row:
    """Set the row's city, country, lat and lng from its network's entry, after its own keys. A
    key the row already holds keeps its place in the row when its value equals the entry's; one
    that differs is refused, so a typed place and the table cannot disagree. A row whose
    `network_id` is None holds four nulls. The row is changed in place and returned."""
    if "network_id" not in row:
        raise ValueError(f"row {row.get('id')!r} has no network_id to place")
    network = row["network_id"]
    if network is None:
        place: tuple[Any, ...] = (None, None, None, None)
    elif network in networks:
        place = networks[network]
    else:
        raise ValueError(f"row {row.get('id')!r} names network {network!r}, which has no place")
    for key, value in zip(_PLACE_KEYS, place, strict=True):
        if key in row and row[key] != value:
            raise ValueError(
                f"row {row.get('id')!r} holds {key}={row[key]!r}, but its network "
                f"{network!r} puts it at {value!r}"
            )
        row.setdefault(key, value)
    return row


def carry_network(
    row: Row, sources: Sequence[Row], by: str | None, ts: str = "timestamp"
) -> str | None:
    """The network of an event row that names none: among the sources (rows that name one), with
    the same `by` value as the row when `by` is given, the latest at or before the row's time, else
    the earliest; None with no source. Order is (stamp, id): every stamp of a pack carries the
    offset +00:00, so the string order is the time order (as `numbered` says). A tie of instants
    goes to the larger id. The rule is by time alone: it reads no field but `by`, the stamp, the
    id and the network."""
    pool = [
        s
        for s in sources
        if s.get("network_id") is not None and (by is None or s.get(by) == row.get(by))
    ]
    if not pool:
        return None
    ordered = sorted(pool, key=lambda s: (s[ts], str(s.get("id", ""))))
    early = [s for s in ordered if s[ts] <= row[ts]]
    if early:
        chosen = early[-1]
    else:
        first = ordered[0][ts]
        chosen = [s for s in ordered if s[ts] == first][-1]
    network: str = chosen["network_id"]
    return network


EARTH_RADIUS_KM = 6371.0  # mean radius; app/lib/entities.ts takes 3958.8 miles, the same sphere

SECONDS_KEY, KM_KEY = "seconds_since_previous", "km_from_previous"


def great_circle_km(a: tuple[float, float], b: tuple[float, float]) -> int:
    """Haversine distance between two (lat, lng) points in degrees, on a sphere of
    `EARTH_RADIUS_KM`, rounded to a whole km by Python's `round`."""
    lat1, lng1, lat2, lng2 = (radians(v) for v in (*a, *b))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return round(2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(h))))


def _latest(rows: Sequence[Row]) -> Row | None:
    """The row of the latest instant, ties to the larger id."""
    if not rows:
        return None
    return max(rows, key=lambda r: (datetime.fromisoformat(r["timestamp"]), str(r.get("id", ""))))


def hop_figures(
    path_rows: list[Row],
    by: str,
    networks: Mapping[str, Place],
    story_rows: Sequence[Row] = (),
    previous: str | None = None,
) -> None:
    """Write `seconds_since_previous` and `km_from_previous` on every row of one path kind, after
    the row's own keys, by the one definition of a hop. A hop ends at a row R; its key K is R's
    `by` value. Rows are read in time order (instant, then id), each key apart.

    - If R holds a non-empty `previous` network N, the hop starts at N's place, at the time of
      K's latest row before R that is on N: looked for among the path kind's rows first, and when
      the path kind holds none, among `story_rows` that carry K in the `by` field and name N. A
      path row is before R when it comes earlier in the order; a story row, which can be of
      another kind, when its instant is earlier than R's (one at R's own instant is not before it).
    - Otherwise the hop starts at K's previous row of the path kind, at that row's network's
      place and time.
    - `seconds_since_previous` is the whole seconds from that start time to R's time;
      `km_from_previous` is `great_circle_km` from the start place to R's network's place.
    - A row with no start (K's first row, or a named previous network K was never seen on before
      R) holds both as None: a row holds both figures or neither.

    A row that names no network the table knows, or that already holds either figure, is
    refused: the figures are computed here and never typed. The rows are changed in place and
    the list is not reordered."""
    for row in path_rows:
        if SECONDS_KEY in row or KM_KEY in row:
            raise ValueError(f"row {row.get('id')!r} already holds a hop figure")
        if row.get("network_id") not in networks:
            raise ValueError(f"row {row.get('id')!r} names a network with no place")
    earlier: dict[Any, list[Row]] = {}
    for row in sorted(
        path_rows, key=lambda r: (datetime.fromisoformat(r["timestamp"]), str(r.get("id", "")))
    ):
        before = earlier.setdefault(row[by], [])
        named = row.get(previous) if previous else None
        start: Row | None
        if named:
            if named not in networks:
                raise ValueError(f"row {row.get('id')!r} follows network {named!r}, no place")
            on_network = [r for r in before if r["network_id"] == named]
            if not on_network:
                moment = datetime.fromisoformat(row["timestamp"])
                on_network = [
                    r
                    for r in story_rows
                    if r.get(by) == row[by]
                    and r.get("network_id") == named
                    and isinstance(r.get("timestamp"), str)
                    and datetime.fromisoformat(r["timestamp"]) < moment
                ]
            start, start_network = _latest(on_network), named
        else:
            start = before[-1] if before else None
            start_network = start["network_id"] if start else None
        if start is None or start_network is None:
            row[SECONDS_KEY] = row[KM_KEY] = None
        else:
            gap = datetime.fromisoformat(row["timestamp"]) - datetime.fromisoformat(
                start["timestamp"]
            )
            _c, _n, lat0, lng0 = networks[start_network]
            _c, _n, lat1, lng1 = networks[row["network_id"]]
            row[SECONDS_KEY] = round(gap.total_seconds())
            row[KM_KEY] = great_circle_km((lat0, lng0), (lat1, lng1))
        before.append(row)


def _require_empty(db_path: Path) -> None:
    """A pack database holds the schema and no rows; anything else is not this module's own
    earlier output and is left alone."""
    conn = sqlite3.connect(db_path)
    try:
        names = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        for name in names:
            quoted = '"' + name.replace('"', '""') + '"'  # a name read from sqlite_master
            if conn.execute(f"SELECT 1 FROM {quoted} LIMIT 1").fetchone():
                raise ValueError(f"{db_path} holds rows in {name}; it is not an empty pack db")
    finally:
        conn.close()


def write_pack(rows: dict[str, list[Row]], data_dir: Path, db_path: Path) -> list[Path]:
    """Write `<kind>.json` for each kind of `rows` into `data_dir`, and an empty pack database
    at `db_path` through `init_db`. Rerunning replaces those files and nothing else: other
    files in `data_dir` are not touched, and a database at `db_path` that holds rows is refused.
    The active database is not changed."""
    for kind in rows:
        if not _KIND.fullmatch(kind):
            raise ValueError(f"a kind is a lower-case name, got {kind!r}")
    if db_path.exists():
        _require_empty(db_path)
    data_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for kind, items in rows.items():
        path = data_dir / f"{kind}.json"
        path.write_text(json.dumps(items, indent=1) + "\n", encoding="utf-8", newline="\n")
        paths.append(path)
    db_path.unlink(missing_ok=True)
    init_db(db_path)
    return [*paths, db_path]
