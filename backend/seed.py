"""Seed Marcus Chen's baseline 30 days of transactions into replay.db.

Merchant names come from a hand-rolled placeholder generator (Faker stalled on
import under RAM pressure); real merchant names and coordinates come from the
Places API at seed time.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypedDict

from arcs import detect_arcs
from db import connect, init_db
from seed_population import generate_population, jitter_rng, make_profiles
from seed_ring import make_harvest_swipe, victim_positions, weave_skimmer_ring

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SEED = 26052026  # deterministic; change to regenerate

# Marcus Chen - Memorial / Spring Branch home anchor.
MARCUS_ID = "cust-marcus-chen"
MARCUS_HOME_LAT = 29.7770
MARCUS_HOME_LNG = -95.5460

# Small hand-rolled name banks - keep diverse-enough to avoid every merchant
# reading as "Smith Market" three times. Real names come from the Places API.
_PLACEHOLDER_SURNAMES = [
    "Oswinwood",
    "Perrinley",
    "Quenbydale",
    "Raspcombe",
    "Sedgelowe",
    "Tarrowfield",
    "Umberbury",
    "Vinnstone",
    "Wexleycombe",
    "Yorenwood",
    "Zephirstone",
    "Emmetridge",
    "Dovetfield",
    "Carrowridge",
    "Callowaydale",
    "Hollincrofte",
    "Jorisridge",
    "Elwinbury",
    "Merrinness",
    "Nettlelowe",
    "Perrinworth",
    "Quenbyfield",
    "Gillamridge",
    "Tarrowstone",
    "Vinncombe",
    "Yorenbury",
]
_PLACEHOLDER_PLACE_WORDS = [
    "Alderlowe",
    "Ashbystone",
    "Birchcrofte",
    "Callowayridge",
    "Dorrincombe",
    "Dovetbury",
    "Elwinworth",
    "Farrowbury",
    "Gillamwood",
    "Hollinridge",
    "Inglecrofte",
    "Joriscombe",
    "Keldbury",
    "Merrinfield",
    "Nettleness",
]


def setup_customer_and_account(conn) -> tuple[str, str, str]:
    """Create Marcus + his credit-card account + Visa card. Idempotent.
    Each row carries bank-grade enrichment fields."""
    conn.execute(
        "INSERT OR REPLACE INTO customers "
        "(id, name, home_city, home_lat, home_lng, "
        " kyc_level, dob_year, customer_since) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            MARCUS_ID,
            "Marcus Chen",
            "Houston, TX",
            MARCUS_HOME_LAT,
            MARCUS_HOME_LNG,
            "enhanced",
            1988,
            "2019-03-14",
        ),
    )
    account_id = "acct-marcus-cc-001"
    conn.execute(
        "INSERT OR REPLACE INTO accounts "
        "(id, customer_id, type, account_number_last4, opening_balance, "
        " status, opened_at, risk_tier, segment) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            account_id,
            MARCUS_ID,
            "credit_card",
            "4729",
            0.0,
            "active",
            "2023-06-15",
            "low",
            "premium",
        ),
    )
    card_id = "card-marcus-visa-001"
    conn.execute(
        "INSERT OR REPLACE INTO cards "
        "(id, account_id, bin, last_four, network, issuer_country, "
        " status, product_type, funding_type, issued_at, activated_at, "
        " card_on_file_count) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            card_id,
            account_id,
            "414720",
            "4729",
            "visa",
            "US",
            "active",
            "Visa Signature Cash Rewards",
            "credit",
            "2023-06-15",
            "2023-06-17",
            12,
        ),
    )
    return MARCUS_ID, account_id, card_id


# Category specs: weight (probability per draw), MCC, amount range,
# whether card-present, location radius from home in miles.
class CategorySpec(TypedDict):
    category: str
    weight: float
    mcc: str
    amount: tuple[int, int]
    cp: bool
    radius: int


class TravelDest(TypedDict):
    city: str
    lat: float
    lng: float


class Device(TypedDict):
    fp: str
    ua: str
    weight: float
    first_seen: str  # per-device first-seen date, looked up by fingerprint


CATEGORY_SPECS: list[CategorySpec] = [
    {
        "category": "groceries",
        "weight": 0.14,
        "mcc": "5411",
        "amount": (45, 280),
        "cp": True,
        "radius": 5,
    },
    {
        "category": "gas",
        "weight": 0.10,
        "mcc": "5541",
        "amount": (35, 70),
        "cp": True,
        "radius": 12,
    },
    {
        "category": "fast_food",
        "weight": 0.18,
        "mcc": "5814",
        "amount": (8, 22),
        "cp": True,
        "radius": 15,
    },
    {
        "category": "restaurant",
        "weight": 0.12,
        "mcc": "5812",
        "amount": (35, 140),
        "cp": True,
        "radius": 18,
    },
    {
        "category": "coffee",
        "weight": 0.10,
        "mcc": "5814",
        "amount": (4, 11),
        "cp": True,
        "radius": 15,
    },
    {
        "category": "warehouse",
        "weight": 0.03,
        "mcc": "5300",
        "amount": (90, 320),
        "cp": True,
        "radius": 14,
    },
    {
        "category": "pharmacy",
        "weight": 0.04,
        "mcc": "5912",
        "amount": (8, 60),
        "cp": True,
        "radius": 6,
    },
    {
        "category": "department",
        "weight": 0.05,
        "mcc": "5311",
        "amount": (25, 180),
        "cp": True,
        "radius": 14,
    },
    {
        "category": "subscription",
        "weight": 0.05,
        "mcc": "5815",
        "amount": (8, 22),
        "cp": False,
        "radius": 0,
    },
    {
        "category": "kids_activity",
        "weight": 0.04,
        "mcc": "8351",
        "amount": (40, 220),
        "cp": True,
        "radius": 8,
    },
    {
        "category": "auto_service",
        "weight": 0.02,
        "mcc": "7538",
        "amount": (40, 350),
        "cp": True,
        "radius": 10,
    },
    {
        "category": "work_lodging",
        "weight": 0.05,
        "mcc": "7011",
        "amount": (110, 240),
        "cp": True,
        "radius": 0,
    },
    {
        "category": "online_retail",
        "weight": 0.04,
        "mcc": "5942",
        "amount": (12, 90),
        "cp": False,
        "radius": 0,
    },
    {
        "category": "rideshare",
        "weight": 0.04,
        "mcc": "4121",
        "amount": (8, 35),
        "cp": False,
        "radius": 0,
    },
]

# Travel destinations Marcus visits for work (Midland, San Antonio).
TRAVEL_DESTINATIONS: list[TravelDest] = [
    {"city": "Midland, TX", "lat": 31.9973, "lng": -102.0779},
    {"city": "San Antonio, TX", "lat": 29.4252, "lng": -98.4946},
]


# === Bank-grade enrichment constants/helpers ========================

# Card-network acquirers Marcus's POS swipes would hit (US retail).
_ACQUIRERS_US = [
    "Halvard Settlement Services",
    "Orbitfield Payments",
    "Ladleton Pay",
    "Plinthwell Pay",
    "Zellmere Payments",
    "Vesscairn",
]

# Lagos retail terminals would typically clear through Nigerian
# acquirers. Fraud routing often goes through these.
_ACQUIRERS_NG = ["Sorrelwick Switch", "Fenthwaite Payments", "Zamberi Pay"]

# POS entry modes weighted toward chip-present in the US baseline.
_POS_ENTRY_MODES_CP = [
    ("chip", 0.55),
    ("contactless", 0.30),
    ("swipe", 0.10),
    ("manual", 0.03),
    ("chip_fallback_swipe", 0.02),
]
_POS_ENTRY_MODES_CNP = [
    ("ecom", 0.60),
    ("cnp_token", 0.30),
    ("cnp_key", 0.10),
]

# Auth response codes. 00 = approved. Baseline is all approved.
_AUTH_RESPONSE_CLEAN = "00"

# IP types weighted toward residential/mobile for Marcus's baseline.
_IP_TYPES_BASELINE = [
    ("residential", 0.65),
    ("mobile", 0.30),
    ("datacenter", 0.05),
]

# Houston-area ISPs mapped to ASN labels. Synthetic AS numbers omitted
# from labels in some cases - the label is what investigators read.
_ASN_BY_PREFIX = {
    "2001:db8:64": "Quiltide Fiber Texas (AS64496)",
    "2001:db8:65": "Quiltide Fiber Texas (AS64496)",
    "2001:db8:66": "Longleaf Cable Houston (AS64497)",
    "2001:db8:67": "Longleaf Cable Houston (AS64497)",
    "2001:db8:68": "Redbluff Broadband Houston (AS64498)",
}


def _weighted_choice(weighted: list[tuple[str, float]], r: random.Random) -> str:
    """Pick a value by weight from a [(value, weight), ...] list."""
    return r.choices(
        [v for v, _ in weighted],
        weights=[w for _, w in weighted],
        k=1,
    )[0]


def _gen_nrn(r: random.Random) -> str:
    """Network reference number -- synthetic but shaped like the real
    thing. Visa uses 23-char alphanumeric; we use shorter 12-char for
    readability in the UI."""
    chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    return "NRN" + "".join(r.choice(chars) for _ in range(9))


def _gen_terminal_id(acquirer: str, r: random.Random) -> str:
    """Terminal IDs are acquirer-prefixed in real card networks."""
    prefix = acquirer.replace(" ", "")[:3].upper()
    return f"{prefix}-{r.randint(1000000, 9999999)}"


def _baseline_risk_score(is_card_present: int, r: random.Random) -> int:
    """Synthetic issuer-side risk score for a CLEAN transaction. CNP
    runs hotter than CP at the baseline."""
    if is_card_present:
        return r.randint(20, 180)
    return r.randint(60, 260)


def pick_category(r: random.Random) -> CategorySpec:
    weights = [c["weight"] for c in CATEGORY_SPECS]
    return r.choices(CATEGORY_SPECS, weights=weights, k=1)[0]


def make_merchant_name(category: str, r: random.Random) -> str:
    """Hand-rolled placeholder name; real Houston merchants come from the Places API."""
    suffix_by_cat = {
        "groceries": ["Market", "Grocers", "Foods"],
        "gas": ["Fuel", "Gas Station", "Petro"],
        "fast_food": ["Quick Bites", "Express Kitchen"],
        "restaurant": ["Bistro", "Grill", "Kitchen"],
        "coffee": ["Roasters", "Coffee Co", "Cafe"],
        "warehouse": ["Wholesale Club"],
        "pharmacy": ["Pharmacy", "Drug"],
        "department": ["Department Store"],
        "subscription": ["Streaming Co", "Digital Service"],
        "kids_activity": ["Youth Sports", "Tutoring Co", "Academy"],
        "auto_service": ["Auto Care", "Tire Center"],
        "work_lodging": ["Hotel", "Inn", "Suites"],
        "online_retail": ["Online Goods", "Marketplace"],
        "rideshare": ["Rideshare Co"],
    }
    suffix = r.choice(suffix_by_cat[category])
    if r.random() < 0.4:
        seed_name = r.choice(_PLACEHOLDER_SURNAMES)
    else:
        seed_name = r.choice(_PLACEHOLDER_PLACE_WORDS)
    return f"{seed_name} {suffix}"


def make_timestamp(day: datetime, category: str, r: random.Random) -> datetime:
    """Bias timestamps by category -- coffee morning, dinner night."""
    if category == "coffee":
        hour = r.choices(range(6, 11), k=1)[0]
    elif category == "fast_food":
        hour = r.choices([11, 12, 13, 18, 19], k=1)[0]
    elif category == "restaurant":
        hour = r.choices([18, 19, 20, 21], k=1)[0]
    elif category == "gas":
        hour = r.choices([7, 8, 17, 18, 19], k=1)[0]
    elif category == "groceries":
        hour = r.choices([10, 11, 17, 18, 19], k=1)[0]
    else:
        hour = r.randint(8, 21)
    minute = r.randint(0, 59)
    return day.replace(hour=hour, minute=minute, second=r.randint(0, 59))


def generate_transactions(
    card_id: str,
    account_id: str,
    days: int = 30,
    *,
    home_lat: float = MARCUS_HOME_LAT,
    home_lng: float = MARCUS_HOME_LNG,
    rng: random.Random | None = None,
) -> list[dict]:
    """Generate ~150 transactions across `days` ending 2026-05-26 (Houston tz).

    Passing `rng` makes generation order-independent and per-customer
    deterministic. With `rng=None` a fresh `random.Random(SEED)` is used,
    so output is deterministic and structurally faithful to Marcus's baseline
    on every run. Synthetic values (amounts, NRNs, timestamps) may differ
    from pre-refactor output because each generator now starts its own
    `Random(SEED)` rather than drawing from a shared module-level PRNG.
    """
    r = rng if rng is not None else random.Random(SEED)
    txs: list[dict] = []
    end = datetime(2026, 5, 26, 23, 59, 59, tzinfo=timezone(timedelta(hours=-5)))
    target_total = 150
    per_day_avg = target_total / days
    counts: list[int] = []
    for d in range(days):
        day = end - timedelta(days=(days - 1 - d))
        weekend_boost = 1.4 if day.weekday() >= 5 else 1.0
        counts.append(max(1, int(r.gauss(per_day_avg * weekend_boost, 1.2))))

    travel_starts = sorted(r.sample(range(2, days - 4), 2))
    travel_windows = [(s, s + r.randint(2, 3)) for s in travel_starts]

    for d_index in range(days):
        day_anchor = (end - timedelta(days=(days - 1 - d_index))).replace(
            hour=0, minute=0, second=0
        )
        in_travel = any(s <= d_index <= e for s, e in travel_windows)
        dest = r.choice(TRAVEL_DESTINATIONS) if in_travel else None

        for _ in range(counts[d_index]):
            spec = pick_category(r)
            if in_travel and spec["category"] in {"groceries", "kids_activity", "auto_service"}:
                continue
            amount = round(r.uniform(*spec["amount"]), 2)
            ts = make_timestamp(day_anchor, spec["category"], r)
            if spec["category"] == "work_lodging" and dest is not None:
                lat, lng, country = dest["lat"], dest["lng"], "US"
            elif in_travel and dest is not None and spec["cp"]:
                lat = jitter_rng(r, dest["lat"], 6)
                lng = jitter_rng(r, dest["lng"], 6)
                country = "US"
            else:
                lat = jitter_rng(r, home_lat, spec["radius"]) if spec["radius"] > 0 else home_lat
                lng = jitter_rng(r, home_lng, spec["radius"]) if spec["radius"] > 0 else home_lng
                country = "US"
            is_cp = 1 if spec["cp"] else 0
            acquirer = r.choice(_ACQUIRERS_US)
            entry_modes = _POS_ENTRY_MODES_CP if is_cp else _POS_ENTRY_MODES_CNP
            txs.append(
                {
                    # `id` filled below after sort so IDs match chronological order.
                    # Deterministic across runs (same SEED + same code = same IDs),
                    # so INSERT OR REPLACE truly replaces on re-seed.
                    "id": "",
                    "card_id": card_id,
                    "account_id": account_id,
                    "timestamp": ts.isoformat(),
                    "amount": amount,
                    "merchant_name": make_merchant_name(spec["category"], r),
                    "merchant_lat": round(lat, 6),
                    "merchant_lng": round(lng, 6),
                    "merchant_country": country,
                    "mcc": spec["mcc"],
                    "category": spec["category"],
                    "is_card_present": is_cp,
                    "is_fraud": 0,
                    "balance_after": 0.0,
                    # --- bank-grade fields ---
                    "auth_response_code": _AUTH_RESPONSE_CLEAN,
                    "pos_entry_mode": _weighted_choice(entry_modes, r),
                    "network_ref_number": _gen_nrn(r),
                    "terminal_id": _gen_terminal_id(acquirer, r),
                    "acquirer": acquirer,
                    "auth_source": "issuer",
                    "risk_score": _baseline_risk_score(is_cp, r),
                    "is_3ds": 0 if is_cp else r.choices([0, 1], [0.35, 0.65])[0],
                    "currency": "USD",
                }
            )

    txs.sort(key=lambda t: t["timestamp"])
    for idx, tx in enumerate(txs):
        tx["id"] = f"tx-{card_id}-{idx:04d}"
    return txs


# Marcus's revolving balance band: he carries $1,800-$3,500.
REVOLVING_FLOOR = 1800.0
REVOLVING_CEILING = 3500.0
REVOLVING_OPENING = 2400.0  # prior-cycle carryover


def reconcile_balances(
    txs: list[dict],
    opening_balance: float = REVOLVING_OPENING,
    floor: float = REVOLVING_FLOOR,
    ceiling: float = REVOLVING_CEILING,
) -> None:
    """Running credit-card balance with modeled autopay.

    Charges grow the balance; modeled autopay pays the statement down to `floor`
    whenever a LEGIT charge pushes it past `ceiling`, so Marcus stays in his
    ~$1,800-$3,500 revolving band. FRAUD charges are NOT auto-paid
    (the victim hasn't paid them), so the Lagos chain visibly spikes the balance
    -- the marquee fraud's odometer climb on the customer dashboard. Payments are
    modeled at the balance level (a real statement itemizes them as credits); the
    transaction set, amounts, and fraud signature are unchanged. A declined row (an
    auth_response_code other than "00") posts nothing: its balance_after is the balance
    before it and the autopay rule is not run for it; a row with no code counts as approved.
    """
    running = opening_balance
    for tx in sorted(txs, key=lambda t: t["timestamp"]):
        if tx.get("auth_response_code", _AUTH_RESPONSE_CLEAN) != _AUTH_RESPONSE_CLEAN:
            tx["balance_after"] = round(running, 2)
            continue
        running += tx["amount"]
        if not tx.get("is_fraud") and running > ceiling:
            running = floor  # autopay the legit statement down to the revolving floor
        tx["balance_after"] = round(running, 2)


# === Marcus fraud signature ==================================================
#
# Carding / clone case: Marcus's card data was breached at a national retailer
# ~30 days ago; track data sold on a carding forum, cloned to magstripe in Lagos.
#
# Timeline (all times CDT = UTC-5):
#   2026-05-21 ~09:14-09:17  Three CNP micro-test precursors - $0.99/$4.99/$9.99 -
#                             at MCCs Marcus has never touched (music, dating, newsletter).
#   2026-05-26 22:00:00      Cobstead Grocers Bunker Hill anchor - Marcus's last CLEAN card-present
#                             swipe before the impossible-travel sequence. (is_fraud=0)
#   2026-05-27 07:41:00      Declined ATM attempt in Lagos (auth "05") - decline before
#                             first success is the velocity-escalation signal.
#   2026-05-27 07:42:00      First Lagos success - Tidewater Trust Bank ATM, $580.40, STIP-routed.
#                             Gap from anchor: ~9.7 h → implied ~674 mph. Unambiguous fraud.
#   2026-05-27 07:45:00      Garrmere Shopping Mall Lekki, $1,240.00 - rapid cluster hit 2.
#   2026-05-27 07:49:00      Heskford Lekki, $890.50 - rapid cluster hit 3.
#                             All three cluster hits < 5 min apart → velocity rule.

# Lagos anchors. Real Lekki/Lagos Island coords for plausibility.
_LAGOS_LAT = 6.5244
_LAGOS_LNG = 3.3792

# Cobstead Grocers Bunker Hill anchor - Marcus's last CLEAN card-present swipe before
# the fraud sequence. Must be after the baseline's last 2026-05-26 txn and
# before the first Lagos hit. is_fraud=0 (wired separately in main()).
_GROCERY_ANCHOR = {
    "timestamp": "2026-05-26T22:00:00-05:00",
    "amount": 87.43,
    "merchant_name": "Cobstead Grocers Bunker Hill",
    "merchant_lat": MARCUS_HOME_LAT,
    "merchant_lng": MARCUS_HOME_LNG,
    "merchant_country": "US",
    "mcc": "5411",
    "category": "groceries",
    "is_card_present": 1,
    "auth_response_code": "00",
    "pos_entry_mode": "chip",
    "acquirer": "Halvard Settlement Services",
    "auth_source": "issuer",
    "risk_score": 40,
    "is_3ds": 0,
    "currency": "USD",
}

# Three CNP precursor micro-tests ~5 days before the marquee.
# MCCs 5815 (digital music) and 5968 (dating/newsletter subscriptions) are
# novel for Marcus - a key anomaly signal for the rules engine.
_PRECURSORS = [
    {
        "timestamp": "2026-05-21T09:14:00-05:00",
        "amount": 0.99,
        "merchant_name": "Brookharp Audio",
        "merchant_lat": MARCUS_HOME_LAT,
        "merchant_lng": MARCUS_HOME_LNG,
        "merchant_country": "US",
        "mcc": "5815",
        "category": "subscription",
        "is_card_present": 0,
        "auth_response_code": "00",
        "pos_entry_mode": "cnp_key",
        "acquirer": "Ladleton Pay",
        "auth_source": "issuer",
        "risk_score": 610,
        "is_3ds": 0,
        "currency": "USD",
    },
    {
        "timestamp": "2026-05-21T09:15:00-05:00",
        "amount": 4.99,
        "merchant_name": "Quilgate Dating",
        "merchant_lat": MARCUS_HOME_LAT,
        "merchant_lng": MARCUS_HOME_LNG,
        "merchant_country": "US",
        "mcc": "5968",
        "category": "subscription",
        "is_card_present": 0,
        "auth_response_code": "00",
        "pos_entry_mode": "cnp_key",
        "acquirer": "Ladleton Pay",
        "auth_source": "issuer",
        "risk_score": 640,
        "is_3ds": 0,
        "currency": "USD",
    },
    {
        "timestamp": "2026-05-21T09:17:00-05:00",
        "amount": 9.99,
        "merchant_name": "The Tallow Ledger",
        "merchant_lat": MARCUS_HOME_LAT,
        "merchant_lng": MARCUS_HOME_LNG,
        "merchant_country": "US",
        "mcc": "5968",
        "category": "subscription",
        "is_card_present": 0,
        "auth_response_code": "00",
        "pos_entry_mode": "cnp_key",
        "acquirer": "Ladleton Pay",
        "auth_source": "issuer",
        "risk_score": 660,
        "is_3ds": 0,
        "currency": "USD",
    },
]

# Lagos fraud cluster: 1 declined attempt + 3 rapid card-present successes.
# All chip_fallback_swipe - the classic magstripe-clone signature.
_FRAUD_SIGNATURE = [
    {
        # Declined ATM attempt before first success - velocity/escalation signal.
        "timestamp": "2026-05-27T07:41:00-05:00",
        "amount": 580.40,
        "merchant_name": "Tidewater Trust Bank ATM · Lekki",
        "merchant_lat": _LAGOS_LAT + 0.012,
        "merchant_lng": _LAGOS_LNG + 0.018,
        "merchant_country": "NG",
        "mcc": "6011",
        "category": "cash_advance",
        "is_card_present": 1,
        "auth_response_code": "05",  # declined - do not honor
        "pos_entry_mode": "chip_fallback_swipe",
        "acquirer": "Sorrelwick Switch",
        "terminal_id": "SOR-7221054",  # the same ATM as the try that succeeds
        "auth_source": "stip",
        "risk_score": 940,
        "is_3ds": 0,
        "currency": "USD",  # the issuer bills in USD
    },
    {
        # First Lagos success - ATM cash advance, STIP-routed.
        # Gap from Cobstead Grocers anchor (22:00 CDT) to here (07:42 CDT next day) = ~9.7h.
        # Implied speed ~674 mph - above commercial-jet cruise, impossible for CP.
        "timestamp": "2026-05-27T07:42:00-05:00",
        "amount": 580.40,
        "merchant_name": "Tidewater Trust Bank ATM · Lekki",
        "merchant_lat": _LAGOS_LAT + 0.012,
        "merchant_lng": _LAGOS_LNG + 0.018,
        "merchant_country": "NG",
        "mcc": "6011",
        "category": "cash_advance",
        "is_card_present": 1,
        "auth_response_code": "00",
        "pos_entry_mode": "chip_fallback_swipe",
        "acquirer": "Sorrelwick Switch",
        "terminal_id": "SOR-7221054",
        "auth_source": "stip",
        "risk_score": 942,
        "is_3ds": 0,
        "currency": "USD",  # the issuer bills in USD
    },
    {
        # Cluster hit 2 - department store, 3 min after first success.
        "timestamp": "2026-05-27T07:45:00-05:00",
        "amount": 1240.00,
        "merchant_name": "Garrmere Shopping Mall · Lekki",
        "merchant_lat": _LAGOS_LAT + 0.008,
        "merchant_lng": _LAGOS_LNG + 0.022,
        "merchant_country": "NG",
        "mcc": "5311",
        "category": "department",
        "is_card_present": 1,
        "auth_response_code": "00",
        "pos_entry_mode": "chip_fallback_swipe",
        "acquirer": "Fenthwaite Payments",
        "auth_source": "issuer",
        "risk_score": 967,
        "is_3ds": 0,
        "currency": "USD",  # the issuer bills in USD
    },
    {
        # Cluster hit 3 - supermarket, 4 min after hit 2 (7 min from first success).
        "timestamp": "2026-05-27T07:49:00-05:00",
        "amount": 890.50,
        "merchant_name": "Heskford Lekki",
        "merchant_lat": _LAGOS_LAT + 0.014,
        "merchant_lng": _LAGOS_LNG + 0.025,
        "merchant_country": "NG",
        "mcc": "5411",
        "category": "groceries",
        "is_card_present": 1,
        "auth_response_code": "00",
        "pos_entry_mode": "chip_fallback_swipe",
        "acquirer": "Zamberi Pay",
        "auth_source": "issuer",
        "risk_score": 981,
        "is_3ds": 0,
        "currency": "USD",  # the issuer bills in USD
    },
]


def _build_fraud_row(
    spec: dict,
    card_id: str,
    account_id: str,
    is_fraud: int,
    r: random.Random,
) -> dict:
    """Build a complete transaction dict from a fraud/anchor spec dict."""
    acquirer = spec["acquirer"]
    return {
        "id": "",
        "card_id": card_id,
        "account_id": account_id,
        **spec,
        "is_fraud": is_fraud,
        "balance_after": 0.0,  # reconcile_balances rewrites this
        "network_ref_number": _gen_nrn(r),
        "terminal_id": spec.get("terminal_id") or _gen_terminal_id(acquirer, r),
    }


def append_fraud_signature(
    txs: list[dict],
    card_id: str,
    account_id: str,
    rng: random.Random | None = None,
) -> None:
    """Append Marcus's fraud signature to the txs list. Caller re-sorts
    + re-numbers IDs. Includes Cobstead Grocers anchor (is_fraud=0),
    3 CNP precursors (is_fraud=1), and Lagos cluster with decline (is_fraud=1)."""
    r = rng if rng is not None else random.Random(SEED)
    # Cobstead Grocers anchor -- clean swipe, is_fraud=0
    txs.append(_build_fraud_row(_GROCERY_ANCHOR, card_id, account_id, is_fraud=0, r=r))
    # 3 CNP precursor micro-tests -- is_fraud=1
    for spec in _PRECURSORS:
        txs.append(_build_fraud_row(spec, card_id, account_id, is_fraud=1, r=r))
    # Lagos cluster (decline + 3 successes) -- is_fraud=1
    for spec in _FRAUD_SIGNATURE:
        txs.append(_build_fraud_row(spec, card_id, account_id, is_fraud=1, r=r))


def insert_transactions(conn, txs: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO transactions "
        "(id, card_id, account_id, timestamp, amount, merchant_name, "
        " merchant_lat, merchant_lng, merchant_country, mcc, category, "
        " is_card_present, is_fraud, balance_after, "
        " auth_response_code, pos_entry_mode, network_ref_number, "
        " terminal_id, acquirer, auth_source, risk_score, is_3ds, "
        " currency) "
        "VALUES (:id, :card_id, :account_id, :timestamp, :amount, "
        "        :merchant_name, :merchant_lat, :merchant_lng, "
        "        :merchant_country, :mcc, :category, :is_card_present, "
        "        :is_fraud, :balance_after, :auth_response_code, "
        "        :pos_entry_mode, :network_ref_number, :terminal_id, "
        "        :acquirer, :auth_source, :risk_score, :is_3ds, "
        "        :currency)",
        txs,
    )


# === Login events =====================================================

# Houston residential ISP labels on the IPv6 documentation prefix (2001:db8::/32, RFC 3849), so
# no displayed address is routable or resolves to a real provider, and none is private space a
# bank could never see (the 10.x addresses used until 2026-10-05). Synthetic last groups.
_HOUSTON_ISP_RANGES = [
    ("2001:db8:64", "Quiltide Fiber Texas"),
    ("2001:db8:65", "Quiltide Fiber Texas"),
    ("2001:db8:66", "Longleaf Cable Houston"),
    ("2001:db8:67", "Longleaf Cable Houston"),
    ("2001:db8:68", "Redbluff Broadband Houston"),
]

# Two devices Marcus uses regularly. The attacker in Priya's compromised
# session uses a separate device.
#
# Each device carries its own first_seen date so the seeder can
# look up the exact timestamp by fingerprint rather than guessing by fp-prefix.
# Adding a new device here requires only adding a "first_seen" entry - no
# conditional string matching elsewhere.
_MARCUS_DEVICES: list[Device] = [
    {
        "fp": "Handset-Browser-A1F8",
        "ua": "Mozilla/5.0 (Handset; CPU HandsetOS 17_5) Engine/605.1.15 Browser/17.5 Mobile",
        # Mobile gets more frequent quick checks throughout the day.
        "weight": 0.62,
        "first_seen": "2023-06-20",
    },
    {
        "fp": "Laptop-Browser-B2E7",
        "ua": "Mozilla/5.0 (Desktop; DesktopOS 14_5) Engine/537.36 Browser/127.0",
        # Desktop is the evening-review session.
        "weight": 0.38,
        "first_seen": "2024-02-11",
    },
]


def _random_houston_ip(r: random.Random) -> tuple[str, str]:
    """Return (ip, isp_label). Random Houston residential prefix + synthetic
    last two octets. Geolocates to Memorial area (we trust the caller to
    geocode the lat/lng -- see _geolocate_houston_ip)."""
    prefix, isp = r.choice(_HOUSTON_ISP_RANGES)
    return f"{prefix}:{r.randint(0, 255):x}::{r.randint(2, 254):x}", isp


def _geolocate_houston_ip(
    home_lat: float, home_lng: float, r: random.Random
) -> tuple[float, float]:
    """Returns (lat, lng) clustered near the customer's home. Real
    MaxMind-style geoIP lookup is not used."""
    return (
        jitter_rng(r, home_lat, 1.2),
        jitter_rng(r, home_lng, 1.2),
    )


def _pick_device(r: random.Random) -> Device:
    weights = [d["weight"] for d in _MARCUS_DEVICES]
    return r.choices(_MARCUS_DEVICES, weights=weights, k=1)[0]


def _pick_login_outcome(r: random.Random) -> tuple[str, int]:
    """Marcus's baseline: mostly clean, occasional step-up challenge that
    he resolves. No outright failures in the baseline -- those belong to
    Priya's compromised session."""
    roll = r.random()
    if roll < 0.85:
        return ("success", 0)
    if roll < 0.97:
        # 2FA challenge issued AND resolved cleanly. Represented as a
        # single record with outcome=challenge_passed and two_fa_used=1.
        return ("challenge_passed", 1)
    # ~3% -- challenge issued but the user gave up / declined. Treated as
    # failed for visual signal even though it's not malicious.
    return ("challenge_failed", 1)


def _make_login_timestamp(day_anchor: datetime, r: random.Random) -> datetime:
    """Marcus's login pattern: morning quick-check on phone, midday check,
    evening desktop session. We pick from a weighted hour distribution
    rather than uniform -- adds visual rhythm when scrubbing."""
    hour = r.choices(
        [7, 8, 12, 13, 18, 19, 20, 21, 22],
        weights=[2, 3, 1, 1, 2, 2, 2, 2, 1],
        k=1,
    )[0]
    minute = r.randint(0, 59)
    return day_anchor.replace(hour=hour, minute=minute, second=r.randint(0, 59))


def generate_logins(
    account_id: str,
    days: int = 30,
    *,
    home_lat: float = MARCUS_HOME_LAT,
    home_lng: float = MARCUS_HOME_LNG,
    rng: random.Random | None = None,
) -> list[dict]:
    """Generate ~75 baseline login events for Marcus across `days`.

    Distribution: ~2-3 per day, biased to morning + evening windows,
    mostly success with occasional step-up challenges he passes. IDs
    are derived from sorted position -- re-seed produces identical IDs
    so INSERT OR REPLACE truly replaces.

    Passing `rng` makes generation order-independent and per-customer
    deterministic. With `rng=None` a fresh `random.Random(SEED)` is used,
    so output is deterministic and structurally faithful to Marcus's baseline
    on every run. Synthetic values (NRNs, terminal IDs, IPs, devices,
    login timestamps) may differ from pre-refactor output because each
    generator now starts its own `Random(SEED)` rather than drawing from
    a shared module-level PRNG.
    """
    r = rng if rng is not None else random.Random(SEED)
    logins: list[dict] = []
    end = datetime(2026, 5, 26, 23, 59, 59, tzinfo=timezone(timedelta(hours=-5)))
    # Monotonic counter embedded in session_id so that same-second logins
    # with the same 4-digit random suffix cannot collide.
    session_counter = 0

    for d_index in range(days):
        day_anchor = (end - timedelta(days=(days - 1 - d_index))).replace(
            hour=0, minute=0, second=0
        )
        # 2-3 logins per day, slightly bumped on weekends.
        n = r.randint(2, 3 if day_anchor.weekday() < 5 else 4)
        for _ in range(n):
            device = _pick_device(r)
            ip, _isp = _random_houston_ip(r)
            lat, lng = _geolocate_houston_ip(home_lat, home_lng, r)
            outcome, two_fa = _pick_login_outcome(r)
            ts = _make_login_timestamp(day_anchor, r)
            # Enrichment -- ASN by IP prefix, session_id
            # derived from timestamp + counter (the counter prevents
            # same-second collisions regardless of the random suffix).
            prefix = ":".join(ip.split(":")[:3])
            asn_label = _ASN_BY_PREFIX.get(prefix, "Unknown ISP")
            session_id = (
                f"sess-{ts.strftime('%Y%m%d%H%M%S')}-{session_counter:04d}-{r.randint(1000, 9999)}"
            )
            session_counter += 1
            # Keyed lookup per device fingerprint - no prefix guessing.
            device_first_seen = device["first_seen"]
            logins.append(
                {
                    "id": "",  # backfilled after sort
                    "account_id": account_id,
                    "timestamp": ts.isoformat(),
                    "ip": ip,
                    "ip_country": "US",
                    "ip_lat": round(lat, 6),
                    "ip_lng": round(lng, 6),
                    "device_fp": device["fp"],
                    "user_agent": device["ua"],
                    "outcome": outcome,
                    "two_fa_used": two_fa,
                    # --- bank-grade fields ---
                    "session_id": session_id,
                    "ip_type": _weighted_choice(_IP_TYPES_BASELINE, r),
                    "ip_asn": asn_label,
                    "ip_reputation": r.randint(85, 100),
                    "device_first_seen_at": device_first_seen,
                    "device_trust": "known",
                    "auth_method": r.choices(["password", "passkey"], [0.7, 0.3])[0],
                    "challenge_reason": (None if outcome == "success" else "risk_score"),
                }
            )

    logins.sort(key=lambda row: row["timestamp"])
    for idx, login in enumerate(logins):
        login["id"] = f"login-{account_id}-{idx:04d}"
    return logins


def insert_logins(conn, logins: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO login_events "
        "(id, account_id, timestamp, ip, ip_country, ip_lat, ip_lng, "
        " device_fp, user_agent, outcome, two_fa_used, "
        " session_id, ip_type, ip_asn, ip_reputation, "
        " device_first_seen_at, device_trust, auth_method, "
        " challenge_reason) "
        "VALUES (:id, :account_id, :timestamp, :ip, :ip_country, "
        "        :ip_lat, :ip_lng, :device_fp, :user_agent, :outcome, "
        "        :two_fa_used, :session_id, :ip_type, :ip_asn, "
        "        :ip_reputation, :device_first_seen_at, :device_trust, "
        "        :auth_method, :challenge_reason)",
        logins,
    )


def insert_customers(conn, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO customers (id, name, home_city, home_lat, home_lng, "
        "kyc_level, dob_year, customer_since) VALUES (:id, :name, :home_city, "
        ":home_lat, :home_lng, :kyc_level, :dob_year, :customer_since)",
        rows,
    )


def insert_accounts(conn, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO accounts (id, customer_id, type, account_number_last4, "
        "opening_balance, status, opened_at, risk_tier, segment) VALUES (:id, :customer_id, "
        ":type, :account_number_last4, :opening_balance, :status, :opened_at, :risk_tier, "
        ":segment)",
        rows,
    )


def insert_cards(conn, rows: list[dict]) -> None:
    conn.executemany(
        "INSERT OR REPLACE INTO cards (id, account_id, bin, last_four, network, "
        "issuer_country, status, product_type, funding_type, issued_at, activated_at, "
        "card_on_file_count) VALUES (:id, :account_id, :bin, :last_four, :network, "
        ":issuer_country, :status, :product_type, :funding_type, :issued_at, :activated_at, "
        ":card_on_file_count)",
        rows,
    )


def main(db_path: Path | None = None, *, with_population: bool = False) -> None:
    """Seed the DB. Idempotent -- re-running produces identical rows.

    Each generator defaults to `random.Random(SEED)` internally, so
    determinism flows from the per-function RNG, not from any module-level
    state. Transaction IDs are derived from sorted position
    (`tx-<card_id>-<NNNN>`), so INSERT OR REPLACE truly replaces instead
    of appending.
    """
    init_db(db_path)
    conn = connect(db_path)
    try:
        _, account_id, card_id = setup_customer_and_account(conn)
        txs = generate_transactions(card_id, account_id, days=30)
        # Append Marcus's fraud signature (3 CNP precursors + 1 decline + 3 Lagos POS).
        append_fraud_signature(txs, card_id, account_id)

        # Build the national population and skimmer ring -- gated; default is
        # single-customer Marcus (the card-fraud demo is ONE customer).
        pop = None
        ring = None
        POP_N = 300
        RING_SIZE = 30
        if with_population:
            # The ring's victims live in Houston, next to the pump they swiped at.
            victims = victim_positions(POP_N, RING_SIZE)
            pop = generate_population(POP_N, rehome=victims)
            # Marcus is a ring victim too: a harvest swipe at the CPP pump.
            # May 10: a morning his own records put him in Houston (May 11 would sit 17 minutes
            # after a Midland cafe charge, 412 miles away).
            txs.append(make_harvest_swipe(card_id, account_id, day_offset=17))
            ring = weave_skimmer_ring(
                make_profiles(POP_N, rehome=victims), ring_size=RING_SIZE, marcus_card_id=card_id
            )

        # Re-sort + re-number Marcus's own txs (now possibly incl. the harvest swipe).
        txs.sort(key=lambda t: t["timestamp"])
        for idx, t in enumerate(txs):
            t["id"] = f"tx-{card_id}-{idx:04d}"
        reconcile_balances(txs)

        if with_population and pop is not None and ring is not None:
            insert_customers(conn, pop.customers)
            insert_accounts(conn, pop.accounts)
            insert_cards(conn, pop.cards)
        insert_transactions(conn, txs)
        if with_population and pop is not None and ring is not None:
            insert_transactions(conn, pop.transactions)
            insert_transactions(conn, ring.transactions)
        logins = generate_logins(account_id, days=30)
        insert_logins(conn, logins)
        if with_population and pop is not None:
            insert_logins(conn, pop.login_events)

        # Bake impossible-travel arcs with true geodesic geometry.
        # Detect on Marcus's txs only (population/ring don't need baked arcs in S1).
        conn.execute("DELETE FROM arcs")
        baked_arcs = detect_arcs(txs)
        for a in baked_arcs:
            conn.execute(
                "INSERT INTO arcs (id, kind, severity, is_hero, points_json) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    a["id"],
                    a["kind"],
                    a["severity"],
                    1 if a["is_hero"] else 0,
                    json.dumps(a["points"]),
                ),
            )
        conn.commit()
        fraud_count = sum(1 for t in txs if t["is_fraud"])
        print(f"seeded {len(txs)} transactions for Marcus Chen ({fraud_count} fraud)")
        if with_population and pop is not None and ring is not None:
            print(f"seeded {1 + POP_N} customers ({POP_N} population + Marcus)")
            print(f"seeded {len(pop.transactions)} population transactions")
            n_victims = len(ring.victim_card_ids)
            print(f"seeded {len(ring.transactions)} ring transactions ({n_victims} victims)")
        print(f"seeded {len(logins)} login events for Marcus Chen")
        hero_n = sum(1 for a in baked_arcs if a["is_hero"])
        print(f"baked {len(baked_arcs)} impossible-travel arcs ({hero_n} hero)")
        print(f"closing balance: {txs[-1]['balance_after']:.2f}")
    finally:
        conn.close()


def cli(argv: list[str] | None = None) -> int:
    """`python -m seed` builds Marcus alone into the default database. `--with-population` adds
    the 300-card population and the skimmer ring: that is how data/replay.db is made (then
    `python -m ml.train --db data/replay.db --score-only` scores it with the locked artifact)."""
    import argparse

    parser = argparse.ArgumentParser(prog="seed", description=cli.__doc__)
    parser.add_argument(
        "--db", type=Path, default=None, help="database file (default: the active one)"
    )
    parser.add_argument("--with-population", action="store_true")
    args = parser.parse_args(argv)
    main(db_path=args.db, with_population=args.with_population)
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
