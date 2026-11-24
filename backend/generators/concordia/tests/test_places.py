# backend/generators/concordia/tests/test_places.py
from generators.concordia import places


def test_place_resolves_to_geo_and_category():
    p = places.PLACES["gas_houston"]
    assert p.country == "US"
    assert -90 <= p.lat <= 90 and -180 <= p.lng <= 180


def test_houston_and_lagos_are_impossible_travel_apart():
    from arcs import haversine_miles  # backend reuse

    g, a = places.PLACES["gas_houston"], places.PLACES["atm_lagos"]
    assert haversine_miles(g.lat, g.lng, a.lat, a.lng) > 500


def test_ip_and_device_registries_present():
    assert places.IPS["residential_houston"].ip_type == "residential"
    assert places.DEVICES["known"].fp.startswith("Handset")


# --- 2026-06-10 realism program: Priya's world -------------------------------


def test_priya_canon_merchants_exist_with_valid_geo():
    """PROFILES Customer B names her baseline merchants; the registry carries
    them with deterministic hand-picked coords (no Places API)."""
    for key in (
        "coffee_houston",  # Imbermoor (pre-existing)
        "coffee_lathemere",
        "grocery_fiskhaven",
        "grocery_gormvale",
        "rest_ivesford",
        "rest_mottbrook",
        "rest_rhodesvane",
        "pilates_montrose",
        "pharmacy_montrose",
        "rideshare_nevgate",
    ):
        p = places.PLACES[key]
        assert -90 <= p.lat <= 90 and -180 <= p.lng <= 180
        assert p.country == "US"


def test_subscription_descriptors_are_cnp_brands():
    subs = [k for k in places.PLACES if k.startswith("sub_")]
    assert len(subs) == 6  # Tonequay, Kestvale, Verrhaven, Lornmere, Marrowpad, Wrendene Pass
    for key in subs:
        assert places.PLACES[key].category == "subscription"


def test_devices_carry_trust_and_first_seen():
    """The detector reads device intel: a trusted device's first_seen predates
    the pack window (its first in-window row must NOT read as new); an attacker
    device has first_seen='' (born at its first event)."""
    phone = places.DEVICES["priya_phone"]
    laptop = places.DEVICES["priya_laptop"]
    attacker = places.DEVICES["unknown"]
    assert phone.trust == "known" and phone.first_seen != ""
    assert laptop.trust == "known" and laptop.first_seen != ""
    assert attacker.trust == "new" and attacker.first_seen == ""
    assert phone.fp != attacker.fp != laptop.fp


def test_vpn_ip_is_datacenter_with_low_reputation():
    vpn = places.IPS["vpn_us"]
    assert (vpn.country, vpn.lat, vpn.lng) == ("DE", 50.1109, 8.6821)  # Frankfurt exit (owner, 2026-10-06)
    assert vpn.ip_type == "datacenter"
    assert vpn.reputation < 50
    assert vpn.asn != ""
    home = places.IPS["residential_houston"]
    assert home.reputation > 80


def test_payees_registry_exactly_one_elevated_risk():
    assert set(places.PAYEES) >= {"jamie_k", "maria_s", "alex_t", "daniel_reyes"}
    flagged = [k for k, p in places.PAYEES.items() if p.risk_flag == "elevated_risk"]
    assert flagged == ["daniel_reyes"]
    dr = places.PAYEES["daniel_reyes"]
    assert dr.first_seen_at == ""  # born at his payee_add event
    assert "Newark" in dr.bank_name
    jk = places.PAYEES["jamie_k"]
    assert jk.name == "Jamie K." and jk.first_seen_at != ""
