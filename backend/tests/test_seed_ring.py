from __future__ import annotations

import seed_population as sp
import seed_ring as sr


def test_cpp_is_a_fixed_houston_pump():
    assert sr.CPP["merchant_country"] == "US"
    assert 29.0 <= sr.CPP["merchant_lat"] <= 30.5  # Houston metro
    assert sr.CPP["terminal_id"]  # stable, shared by every victim


def test_harvest_swipe_uses_cpp_terminal_and_is_clean():
    swipe = sr.make_harvest_swipe("card-0001", "acct-0001", day_offset=18)
    assert swipe["terminal_id"] == sr.CPP["terminal_id"]
    assert swipe["is_fraud"] == 0  # clean at swipe time -- the breach point
    assert swipe["is_card_present"] == 1
    assert swipe["merchant_name"] == sr.CPP["merchant_name"]


def test_weave_marks_30_victims_sharing_the_cpp():
    profiles = sp.make_profiles(120)
    ring = sr.weave_skimmer_ring(profiles, ring_size=30, marcus_card_id="card-marcus-visa-001")
    assert len(ring.victim_card_ids) == 30
    assert "card-marcus-visa-001" in ring.victim_card_ids
    # Every victim has a harvest swipe at the shared CPP terminal.
    by_card: dict[str, list[dict]] = {}
    for t in ring.transactions:
        by_card.setdefault(t["card_id"], []).append(t)
    for cid in ring.victim_card_ids:
        if cid == "card-marcus-visa-001":
            continue  # Marcus's harvest swipe is injected in seed.main alongside his canon chain
        terms = {t["terminal_id"] for t in by_card[cid]}
        assert sr.CPP["terminal_id"] in terms
        assert any(t["is_fraud"] == 1 for t in by_card[cid])  # each non-Marcus victim cashes out


def test_weave_is_deterministic():
    # Rebuild profiles independently per call -- guards the full
    # make_profiles -> weave chain, not just "same list -> same output".
    a = sr.weave_skimmer_ring(sp.make_profiles(120), ring_size=30, marcus_card_id="m")
    b = sr.weave_skimmer_ring(sp.make_profiles(120), ring_size=30, marcus_card_id="m")
    assert a.victim_card_ids == b.victim_card_ids
    assert [t["id"] for t in a.transactions] == [t["id"] for t in b.transactions]


def test_ring_is_findable_by_common_terminal():
    """Group fraud-flagged cards by the terminals in their history; the CPP
    pump is the terminal shared by the most fraud cards. This is the signal the
    S3 common-point-of-compromise detector will key on."""
    profiles = sp.make_profiles(120)
    ring = sr.weave_skimmer_ring(profiles, ring_size=30, marcus_card_id="m")
    fraud_cards = {t["card_id"] for t in ring.transactions if t["is_fraud"] == 1}
    # terminals each fraud card touched (across all its ring txs)
    touched: dict[str, set[str]] = {}
    for t in ring.transactions:
        if t["card_id"] in fraud_cards:
            touched.setdefault(t["card_id"], set()).add(t["terminal_id"])
    shared = sum(1 for terms in touched.values() if sr.CPP["terminal_id"] in terms)
    assert shared == len(fraud_cards) == 29  # all non-Marcus victims share the pump
