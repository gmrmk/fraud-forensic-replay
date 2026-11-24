"""The helpers the five new pack generators share: `iso`, `numbered` and `write_pack`.

They are the three helpers `seed_platform.py` holds, with two changes the new packs need and
the tests below pin: `numbered` takes its tie columns as an argument (most new kinds carry no
`org_id`), and `iso` refuses a stamp with no zone (a naive stamp would take the machine's
clock zone, which is a wall-clock dependency in seeded data)."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

import db
import seed_packs as sp


def test_iso_writes_a_utc_offset_on_every_stamp():
    plus_two = timezone(timedelta(hours=2))
    assert sp.iso(datetime(2026, 11, 18, 10, 30, tzinfo=plus_two)) == "2026-11-18T08:30:00+00:00"
    assert sp.iso(datetime(2026, 11, 18, 8, 30, tzinfo=UTC)) == "2026-11-18T08:30:00+00:00"


def test_iso_keeps_seconds_and_refuses_a_stamp_with_no_zone():
    assert sp.iso(datetime(2026, 11, 18, 2, 31, 8, tzinfo=UTC)) == "2026-11-18T02:31:08+00:00"
    with pytest.raises(ValueError, match="zone"):
        sp.iso(datetime(2026, 11, 18, 8, 30))


def test_numbered_gives_unique_ids_with_the_prefix_first_in_each_row():
    rows = [{"timestamp": f"2026-11-18T08:{m:02d}:00+00:00", "n": m} for m in (5, 1, 3)]
    out = sp.numbered("ns", rows)
    assert [r["id"] for r in out] == ["ns-0001", "ns-0002", "ns-0003"]
    assert [r["n"] for r in out] == [1, 3, 5], "ids follow time order"
    assert all(next(iter(r)) == "id" for r in out)
    assert len({r["id"] for r in out}) == len(out)


def test_numbered_width_prefix_and_the_timestamp_key_are_arguments():
    rows = [{"decided_at": "b"}, {"decided_at": "a"}]
    out = sp.numbered("dc", rows, width=2, ts="decided_at")
    assert [(r["id"], r["decided_at"]) for r in out] == [("dc-01", "a"), ("dc-02", "b")]


def test_numbered_needs_no_org_id_and_breaks_ties_by_the_named_columns():
    at = "2026-11-18T08:00:00+00:00"
    rows = [
        {"timestamp": at, "seat_id": "seat-b"},
        {"timestamp": at, "seat_id": "seat-a"},
        {"timestamp": at, "seat_id": "seat-c"},
    ]
    out = sp.numbered("rs", rows, ties=("seat_id",))
    assert [(r["id"], r["seat_id"]) for r in out] == [
        ("rs-0001", "seat-a"),
        ("rs-0002", "seat-b"),
        ("rs-0003", "seat-c"),
    ]
    # Same rows in another input order give the same ids: the order is a function of the rows.
    assert sp.numbered("rs", list(reversed(rows)), ties=("seat_id",)) == out


def test_numbered_tie_columns_may_be_absent_from_some_rows():
    at = "2026-11-18T08:00:00+00:00"
    rows = [{"timestamp": at, "org_id": "o-2"}, {"timestamp": at}]
    out = sp.numbered("x", rows, ties=("org_id",))
    assert "org_id" not in out[0] and out[1]["org_id"] == "o-2", "the row with none sorts first"


def test_numbered_untimed_rows_all_carry_timestamp_zero_and_keep_input_order():
    rows = [{"timestamp": 0, "name": n} for n in ("c", "a", "b")]
    assert [r["name"] for r in sp.numbered("o", rows)] == ["c", "a", "b"], "a stable order"


def test_numbered_does_not_overwrite_an_id_the_row_already_has():
    with pytest.raises(ValueError, match="id"):
        sp.numbered("x", [{"timestamp": 0, "id": "mine"}])


ROWS = {
    "org": [{"id": "org-0001", "timestamp": 0, "org_name": "Alder Works"}],
    "usage_day": [
        {"id": "ud-0001", "timestamp": "2026-11-17T08:00:00+00:00", "requests": 2940},
        {"id": "ud-0002", "timestamp": "2026-11-18T08:00:00+00:00", "requests": 21460},
    ],
}


def _write(root: Path) -> list[Path]:
    return sp.write_pack(ROWS, root / "pack", root / "pack.db")


def test_write_pack_writes_one_json_file_for_each_kind_that_round_trips(tmp_path):
    paths = _write(tmp_path)
    assert sorted(p.name for p in paths) == ["org.json", "pack.db", "usage_day.json"]
    for kind, rows in ROWS.items():
        assert json.loads((tmp_path / "pack" / f"{kind}.json").read_text("utf-8")) == rows


def test_write_pack_bytes_are_the_format_the_other_pack_uses(tmp_path):
    _write(tmp_path)
    raw = (tmp_path / "pack" / "org.json").read_bytes()
    assert raw == (json.dumps(ROWS["org"], indent=1) + "\n").encode("utf-8")
    assert b"\r" not in raw


def test_write_pack_database_holds_the_schema_and_no_rows(tmp_path):
    _write(tmp_path)
    conn = sqlite3.connect(tmp_path / "pack.db")
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        assert "transactions" in tables
        for name in tables:
            # the name comes from sqlite_master of a database this test just built
            assert conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] == 0, name
    finally:
        conn.close()


def test_write_pack_run_twice_writes_the_same_bytes(tmp_path):
    first = tmp_path / "a"
    second = tmp_path / "b"
    sp.write_pack(ROWS, first / "pack", first / "pack.db")
    sp.write_pack(ROWS, second / "pack", second / "pack.db")
    sp.write_pack(ROWS, second / "pack", second / "pack.db")
    for name in ("org.json", "usage_day.json"):
        assert (first / "pack" / name).read_bytes() == (second / "pack" / name).read_bytes()
    assert (first / "pack.db").read_bytes() == (second / "pack.db").read_bytes()


def test_write_pack_replaces_its_own_earlier_output_only(tmp_path):
    _write(tmp_path)
    stray_in_dir = tmp_path / "pack" / "notes.txt"
    stray_beside_db = tmp_path / "other.db"
    stray_in_dir.write_text("keep me", encoding="utf-8")
    stray_beside_db.write_bytes(b"not a database")
    (tmp_path / "pack" / "org.json").write_text("stale", encoding="utf-8")

    _write(tmp_path)

    assert stray_in_dir.read_text("utf-8") == "keep me"
    assert stray_beside_db.read_bytes() == b"not a database"
    assert json.loads((tmp_path / "pack" / "org.json").read_text("utf-8")) == ROWS["org"]


def test_write_pack_does_not_move_the_active_database(tmp_path):
    before = db.get_active_db()
    _write(tmp_path)
    assert db.get_active_db() == before


def test_write_pack_refuses_a_kind_that_is_not_a_plain_name(tmp_path):
    for bad in ("../escape", "a/b", "", "A b"):
        with pytest.raises(ValueError, match="kind"):
            sp.write_pack({bad: []}, tmp_path / "pack", tmp_path / "pack.db")
    assert not (tmp_path / "escape.json").exists()


def test_write_pack_will_not_replace_a_database_that_holds_rows(tmp_path):
    _write(tmp_path)
    conn = sqlite3.connect(tmp_path / "pack.db")
    try:
        conn.execute("CREATE TABLE precious (x)")
        conn.execute("INSERT INTO precious VALUES (1)")
        conn.commit()
    finally:
        conn.close()
    before = (tmp_path / "pack.db").read_bytes()
    with pytest.raises(ValueError, match="rows"):
        _write(tmp_path)
    assert (tmp_path / "pack.db").read_bytes() == before


# ------------------------------------------------------------------ place_row and carry_network

LISBON = ("Lisbon", "PT", 38.7223, -9.1393)
TABLE = {"n1": LISBON, "n2": ("Porto", "PT", 41.1579, -8.6291)}
AT = "2026-11-18T08:00:00+00:00"


def test_place_row_appends_city_country_lat_and_lng_from_the_table():
    row = {"id": "x-1", "timestamp": AT, "network_id": "n1"}
    placed = sp.place_row(row, TABLE)
    assert list(placed) == ["id", "timestamp", "network_id", "city", "country", "lat", "lng"]
    assert [placed[k] for k in ("city", "country", "lat", "lng")] == list(LISBON)
    assert placed is row, "the row is set in place and returned"


def test_place_row_leaves_a_row_holding_its_place_as_it_is():
    row = {"id": "x-1", "city": "Lisbon", "network_id": "n1", "country": "PT", "lat": 38.7223}
    row["lng"] = -9.1393
    before = dict(row)
    sp.place_row(row, TABLE)
    assert row == before
    assert list(row) == list(before), "key order is kept"


def test_place_row_adds_only_the_keys_a_row_lacks():
    row = {"id": "x-1", "network_id": "n1", "city": "Lisbon"}
    sp.place_row(row, TABLE)
    assert list(row) == ["id", "network_id", "city", "country", "lat", "lng"]


def test_place_row_refuses_a_row_whose_typed_place_differs():
    for key, wrong in (("city", "Porto"), ("country", "ES"), ("lat", 1.0), ("lng", 2.0)):
        row = {"id": "x-1", "network_id": "n1", key: wrong}
        with pytest.raises(ValueError, match="x-1"):
            sp.place_row(row, TABLE)


def test_place_row_writes_four_nulls_for_a_row_with_no_network():
    row = {"id": "x-1", "network_id": None}
    sp.place_row(row, TABLE)
    assert [row[k] for k in ("city", "country", "lat", "lng")] == [None] * 4
    with pytest.raises(ValueError, match="x-2"):
        sp.place_row({"id": "x-2", "network_id": None, "city": "Lisbon"}, TABLE)


def test_place_row_refuses_a_network_the_table_lacks():
    with pytest.raises(ValueError, match="n9"):
        sp.place_row({"id": "x-1", "network_id": "n9"}, TABLE)
    with pytest.raises(ValueError, match="x-3"):
        sp.place_row({"id": "x-3"}, TABLE)  # a row with no network_id key at all


def _src(id_: str, at: str, network: str, **more: str) -> dict:
    return {"id": id_, "timestamp": at, "network_id": network, **more}


def _event(at: str, **more: str) -> dict:
    return {"id": "e-1", "timestamp": at, **more}


def test_carry_network_takes_the_latest_source_at_or_before_the_row():
    sources = [
        _src("s-1", "2026-11-18T08:00:00+00:00", "n1"),
        _src("s-2", "2026-11-18T09:00:00+00:00", "n2"),
        _src("s-3", "2026-11-18T11:00:00+00:00", "n1"),
    ]
    assert sp.carry_network(_event("2026-11-18T10:00:00+00:00"), sources, None) == "n2"
    assert sp.carry_network(_event("2026-11-18T12:00:00+00:00"), sources, None) == "n1"


def test_carry_network_takes_the_earliest_source_when_none_is_that_early():
    sources = [
        _src("s-1", "2026-11-18T09:00:00+00:00", "n2"),
        _src("s-2", "2026-11-18T08:30:00+00:00", "n1"),
    ]
    assert sp.carry_network(_event("2026-11-18T07:00:00+00:00"), sources, None) == "n1"


def test_carry_network_keeps_to_the_rows_own_link_value():
    sources = [
        _src("s-1", "2026-11-18T08:00:00+00:00", "n1", seat="a"),
        _src("s-2", "2026-11-18T09:00:00+00:00", "n2", seat="b"),
        _src("s-3", "2026-11-18T10:30:00+00:00", "n1", seat="b"),
    ]
    late = _event("2026-11-18T12:00:00+00:00", seat="a")
    assert sp.carry_network(late, sources, "seat") == "n1"
    early_b = _event("2026-11-18T08:30:00+00:00", seat="b")
    assert sp.carry_network(early_b, sources, "seat") == "n2", "none of b's is earlier"
    assert sp.carry_network(_event(AT, seat="c"), sources, "seat") is None, "no source of c"


def test_carry_network_reads_every_source_with_no_link_field():
    sources = [
        _src("s-1", "2026-11-18T08:00:00+00:00", "n1", seat="a"),
        _src("s-2", "2026-11-18T09:00:00+00:00", "n2", seat="b"),
    ]
    assert sp.carry_network(_event("2026-11-18T09:30:00+00:00", seat="a"), sources, None) == "n2"


def test_carry_network_gives_none_with_no_source():
    assert sp.carry_network(_event(AT), [], None) is None
    unnamed = [{"id": "s-1", "timestamp": AT, "network_id": None}]
    assert sp.carry_network(_event(AT), unnamed, None) is None


def test_carry_network_breaks_a_tie_of_instants_by_the_larger_id():
    sources = [_src("s-2", AT, "n2"), _src("s-1", AT, "n1"), _src("s-3", AT, "n1")]
    assert sp.carry_network(_event(AT), sources[:2], None) == "n2"
    assert sp.carry_network(_event(AT), sources, None) == "n1"
    # The same tie among earliest sources, when the row precedes them all.
    assert sp.carry_network(_event("2026-11-18T07:00:00+00:00"), sources[:2], None) == "n2"


def test_carry_network_counts_a_source_at_the_rows_own_instant():
    sources = [
        _src("s-1", "2026-11-18T07:00:00+00:00", "n1"),
        _src("s-2", AT, "n2"),
        _src("s-3", "2026-11-18T09:00:00+00:00", "n1"),
    ]
    assert sp.carry_network(_event(AT), sources, None) == "n2"


# ------------------------------------------------------------- great_circle_km and hop_figures

SECONDS, KM = "seconds_since_previous", "km_from_previous"
# Three places on the equator, one degree (111 km) apart, so a hop's km is easy to read.
LINE = {"n0": ("A", "XX", 0.0, 0.0), "n1": ("B", "XX", 0.0, 1.0), "n2": ("C", "XX", 0.0, 2.0)}
T0 = datetime(2026, 11, 18, 8, 0, 0, tzinfo=UTC)


def _at(seconds: int) -> str:
    return sp.iso(T0 + timedelta(seconds=seconds))


def _hop(id_: str, key: str, seconds: int, network: str | None, **more: str) -> dict:
    return {"id": id_, "timestamp": _at(seconds), "k": key, "network_id": network, **more}


def _figures(row: dict) -> tuple:
    return (row[SECONDS], row[KM])


def test_great_circle_km_is_the_haversine_on_a_6371_km_sphere_to_a_whole_km():
    assert sp.EARTH_RADIUS_KM == 6371.0
    assert sp.great_circle_km((0.0, 0.0), (0.0, 1.0)) == 111
    assert sp.great_circle_km((0.0, 0.0), (0.0, 180.0)) == 20015
    assert sp.great_circle_km((52.3676, 4.9041), (52.3676, 4.9041)) == 0
    a, b = (45.5152, -122.6784), (52.3676, 4.9041)
    far = sp.great_circle_km(a, b)
    assert type(far) is int and 8000 < far < 8100
    assert sp.great_circle_km(b, a) == far, "the distance is symmetric"


def test_great_circle_km_agrees_with_an_independent_reckoning():
    from math import atan2, cos, radians, sin, sqrt

    import seed_agent_runs_shared_key as ar
    import seed_key_many_networks as km
    import seed_seat_failed_signins as sf
    import seed_seats_two_networks as st
    import seed_volume_step as vs

    def unit(lat: float, lng: float) -> tuple[float, float, float]:
        p, q = radians(lat), radians(lng)
        return (cos(p) * cos(q), cos(p) * sin(q), sin(p))

    def reckoned(a: tuple[float, float], b: tuple[float, float]) -> int:
        (x1, y1, z1), (x2, y2, z2) = unit(*a), unit(*b)
        cross = sqrt((y1 * z2 - z1 * y2) ** 2 + (z1 * x2 - x1 * z2) ** 2 + (x1 * y2 - y1 * x2) ** 2)
        return round(atan2(cross, x1 * x2 + y1 * y2 + z1 * z2) * 6371.0)

    points = [
        (lat, lng)
        for module in (km, sf, ar, st, vs)
        for (_city, _country, lat, lng) in module.NETWORKS.values()
    ]
    assert len(points) == 27, "17, 2, 2, 4 and 2 networks"
    for i, a in enumerate(points):
        for b in points[i:]:
            assert sp.great_circle_km(a, b) == reckoned(a, b), (a, b)


def test_hop_figures_leaves_a_keys_first_row_with_neither_figure():
    rows = [_hop("p-1", "a", 0, "n0"), _hop("p-2", "a", 60, "n1")]
    sp.hop_figures(rows, "k", LINE)
    assert _figures(rows[0]) == (None, None)
    assert _figures(rows[1]) == (60, 111)


def test_hop_figures_measures_each_key_from_its_own_previous_row():
    rows = [
        _hop("p-1", "a", 0, "n0"),
        _hop("p-2", "b", 10, "n2"),
        _hop("p-3", "a", 30, "n1"),
        _hop("p-4", "b", 100, "n0"),
        _hop("p-5", "a", 130, "n2"),
    ]
    sp.hop_figures(rows, "k", LINE)
    assert [_figures(r) for r in rows] == [
        (None, None),
        (None, None),
        (30, 111),  # a: n0 to n1
        (90, 222),  # b: n2 to n0, not from a's row
        (100, 111),  # a: n1 to n2
    ]


def test_hop_figures_takes_a_key_in_time_order_whatever_the_order_of_the_list():
    rows = [_hop("p-2", "a", 50, "n1"), _hop("p-1", "a", 20, "n0")]
    sp.hop_figures(rows, "k", LINE)
    assert _figures(rows[0]) == (30, 111) and _figures(rows[1]) == (None, None)
    assert [r["id"] for r in rows] == ["p-2", "p-1"], "the list is not reordered"


def test_hop_figures_gives_whole_seconds_and_whole_km():
    rows = [_hop("p-1", "a", 0, "n0"), _hop("p-2", "a", 7, "n2")]
    sp.hop_figures(rows, "k", LINE)
    for value in _figures(rows[1]):
        assert type(value) is int
    assert _figures(rows[1]) == (7, 222)


def test_hop_figures_measures_a_named_previous_network_from_the_keys_latest_path_row_on_it():
    rows = [
        _hop("p-1", "a", 0, "n0", prev=""),
        _hop("p-2", "a", 10, "n1", prev="n0"),
        _hop("p-3", "a", 20, "n0", prev="n1"),
        _hop("p-4", "a", 50, "n2", prev="n1"),
    ]
    sp.hop_figures(rows, "k", LINE, previous="prev")
    # p-4 names n1: the key's latest row on n1 is p-2 at 10 s, though p-3 is the row before it.
    assert _figures(rows[3]) == (40, 111)
    assert _figures(rows[2]) == (10, 111), "p-3 measures from p-2, the key's row on n1"
    assert _figures(rows[0]) == (None, None), "an empty previous names no network"


def test_hop_figures_falls_back_to_the_keys_latest_row_of_the_story_on_it():
    path = [_hop("p-1", "a", 100, "n1", prev="n0")]
    story: list[dict] = [
        {"id": "x-1", "timestamp": _at(30), "k": "a", "network_id": "n0"},
        {"id": "x-2", "timestamp": _at(60), "k": "a", "network_id": "n0"},
        {"id": "x-3", "timestamp": _at(80), "k": "a", "network_id": "n2"},  # another network
        {"id": "x-4", "timestamp": _at(90), "k": "b", "network_id": "n0"},  # another key
        {"id": "x-5", "timestamp": _at(120), "k": "a", "network_id": "n0"},  # after the row
        {"id": "x-6", "timestamp": _at(100), "k": "a", "network_id": "n0"},  # at its instant
        {"id": "x-7", "timestamp": 0, "k": "a", "network_id": "n0"},  # untimed
        {"id": "x-8", "timestamp": _at(70), "k": "a", "network_id": None},  # names no network
    ]
    sp.hop_figures(path, "k", LINE, story_rows=story, previous="prev")
    assert _figures(path[0]) == (40, 111), "from x-2 at 60 s; a row at its own instant is no start"


def test_hop_figures_reads_the_story_only_when_the_path_kind_has_no_row_on_the_network():
    path = [_hop("p-1", "a", 20, "n0"), _hop("p-2", "a", 100, "n1", prev="n0")]
    story = [{"id": "x-1", "timestamp": _at(90), "k": "a", "network_id": "n0"}]
    sp.hop_figures(path, "k", LINE, story_rows=story, previous="prev")
    assert _figures(path[1]) == (80, 111), "the path kind's own row on n0 comes first"


def test_hop_figures_gives_neither_when_the_key_was_never_on_it():
    path = [_hop("p-1", "a", 100, "n1", prev="n0")]
    story = [{"id": "x-1", "timestamp": _at(10), "k": "b", "network_id": "n0"}]
    sp.hop_figures(path, "k", LINE, story_rows=story, previous="prev")
    assert _figures(path[0]) == (None, None)


def test_hop_figures_gives_zero_km_on_one_network():
    rows = [_hop("p-1", "a", 0, "n1"), _hop("p-2", "a", 974, "n1")]
    sp.hop_figures(rows, "k", LINE)
    assert _figures(rows[1]) == (974, 0)


def test_hop_figures_orders_one_instant_by_id():
    rows = [_hop("p-2", "a", 40, "n1"), _hop("p-1", "a", 40, "n0"), _hop("p-3", "a", 40, "n2")]
    sp.hop_figures(rows, "k", LINE)
    assert [_figures(r) for r in rows] == [(0, 111), (None, None), (0, 111)]


def test_hop_figures_writes_seconds_then_km_after_the_rows_keys():
    row = _hop("p-2", "a", 60, "n1", more="x")
    sp.hop_figures([_hop("p-1", "a", 0, "n0"), row], "k", LINE)
    assert list(row) == ["id", "timestamp", "k", "network_id", "more", SECONDS, KM]


def test_hop_figures_refuses_a_row_that_already_holds_a_figure_or_names_no_known_network():
    with pytest.raises(ValueError, match="p-1"):
        sp.hop_figures([{**_hop("p-1", "a", 0, "n0"), SECONDS: 5}], "k", LINE)
    with pytest.raises(ValueError, match="p-2"):
        sp.hop_figures([_hop("p-2", "a", 0, "n9")], "k", LINE)
    with pytest.raises(ValueError, match="p-3"):
        sp.hop_figures([_hop("p-3", "a", 0, None)], "k", LINE)
