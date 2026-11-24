from arcs import densify_geodesic, detect_arcs, haversine_miles


def _tx(id, ts, lat, lng, cp=1):
    return {
        "id": id,
        "timestamp": ts,
        "merchant_lat": lat,
        "merchant_lng": lng,
        "is_card_present": cp,
    }


def test_detect_arcs_flags_houston_lagos_as_impossible_hero():
    txns = [
        _tx("a", "2026-05-20T10:00:00Z", 29.76, -95.37),
        _tx("b", "2026-05-20T11:00:00Z", 6.52, 3.38),  # ~6500mi in 1h -> impossible
    ]
    arcs = detect_arcs(txns)
    assert len(arcs) == 1
    arc = arcs[0]
    assert arc["kind"] == "impossible"
    assert arc["is_hero"] is True
    assert arc["points"][0] == (-95.37, 29.76)
    assert arc["points"][-1] == (3.38, 6.52)
    assert len(arc["points"]) >= 100  # densified


def test_detect_arcs_ignores_near_simultaneous_same_city():
    txns = [
        _tx("a", "2026-05-20T10:00:00Z", 29.76, -95.37),
        _tx("b", "2026-05-20T10:00:30Z", 29.77, -95.38),  # tiny distance -> not impossible
    ]
    assert detect_arcs(txns) == []


def test_detect_arcs_ignores_card_not_present():
    # Same impossible Houston->Lagos jump but card-not-present -> no arc.
    txns = [
        _tx("a", "2026-05-20T10:00:00Z", 29.76, -95.37, cp=0),
        _tx("b", "2026-05-20T11:00:00Z", 6.52, 3.38, cp=0),
    ]
    assert detect_arcs(txns) == []


def test_densify_geodesic_includes_endpoints_and_count():
    # Houston -> Lagos
    pts = densify_geodesic(-95.37, 29.76, 3.38, 6.52, n_intermediate=10)
    assert pts[0] == (-95.37, 29.76)
    assert pts[-1] == (3.38, 6.52)
    assert len(pts) == 12  # 2 endpoints + 10 intermediate


def test_densify_geodesic_midpoint_bends_north_of_rhumb():
    # A great circle from Houston to Lagos bows north of the straight lng/lat line.
    pts = densify_geodesic(-95.37, 29.76, 3.38, 6.52, n_intermediate=1)
    mid_lat = pts[1][1]
    linear_mid_lat = (29.76 + 6.52) / 2
    assert mid_lat > linear_mid_lat  # geodesic bows poleward


def test_haversine_houston_lagos_about_6500_miles():
    d = haversine_miles(29.76, -95.37, 6.52, 3.38)
    assert 6200 < d < 6800
