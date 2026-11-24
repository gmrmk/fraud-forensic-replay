# backend/generators/concordia/places.py
"""Deterministic registries. NO Places API at runtime or generate time
(seed-time-only rule); these are fixed, hand-picked coordinates. The generator
owns geo so rows are always valid (the Hybrid decision).

2026-06-10 realism program: Priya's canon world (PROFILES Customer B merchants,
her two trusted devices, the attacker device, payees) joins the registry. Device
and Ip carry the intel fields the enrichment columns persist (trust, first_seen,
asn, reputation) so translated rows stop leaning on silent schema defaults."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lng: float
    country: str
    category: str


@dataclass(frozen=True)
class Ip:
    ip: str
    lat: float
    lng: float
    country: str
    ip_type: str  # residential | business | hosting | datacenter
    asn: str = ""
    reputation: int = 100  # 0-100; low = known-bad infrastructure


@dataclass(frozen=True)
class Device:
    fp: str  # the device fingerprint persisted as device_fp
    trust: str  # known | new
    first_seen: str  # ISO ts predating the pack window; '' = born at first event


@dataclass(frozen=True)
class Payee:
    name: str
    bank_name: str
    account_ref_last4: str
    risk_flag: str  # none | elevated_risk
    first_seen_at: str  # ISO ts; '' = born at its payee_add event


PLACES: dict[str, Place] = {
    # --- card-fraud (Dana) world ---
    "grocery_houston": Place(
        "Cobstead Grocers Buffalo Speedway", 29.7250, -95.4310, "US", "grocery"
    ),
    "gas_houston": Place("Alderlowe Fuel & Go", 29.7770, -95.5460, "US", "gas"),
    "atm_lagos": Place("Lagos Cash Point", 6.5244, 3.3792, "NG", "cash_advance"),
    "store_lagos": Place("Ikeja Market", 6.6018, 3.3515, "NG", "retail"),
    # Card-not-present cash-out target (gift card, the textbook monetization).
    "online_giftcard": Place("Prepaid Gift Hub", 29.7600, -95.3600, "US", "gift_card"),
    # --- Priya (account-takeover) world: PROFILES Customer B canon ---
    # Coffee, 5x/week. Imbermoor is her Montrose home shop; Lathemere Cafe EaDo.
    "coffee_houston": Place("Imbermoor Coffee", 29.7430, -95.3990, "US", "coffee"),
    "coffee_lathemere": Place("Lathemere Cafe", 29.7506, -95.3540, "US", "coffee"),
    "grocery_fiskhaven": Place("Fiskhaven Market Montrose", 29.7560, -95.3990, "US", "grocery"),
    "grocery_gormvale": Place("Gormvale Provisions Montrose", 29.7480, -95.4100, "US", "grocery"),
    "rest_ivesford": Place("Ivesford Table", 29.7430, -95.4010, "US", "restaurant"),
    "rest_mottbrook": Place("Mottbrook Kitchen", 29.7390, -95.3910, "US", "restaurant"),
    "rest_rhodesvane": Place("Rhodes & Vane", 29.7530, -95.4080, "US", "restaurant"),
    "pilates_montrose": Place("Montrose Pilates Collective", 29.7440, -95.3950, "US", "fitness"),
    "pharmacy_montrose": Place("Holmlyn Pharmacy Montrose", 29.7426, -95.3853, "US", "pharmacy"),
    # Rideshare plots in the service city (product precedent: Marcus's seed
    # plots rideshare locally), card-not-present.
    "rideshare_nevgate": Place("Nevgate Trip", 29.7437, -95.3900, "US", "rideshare"),
    # Subscriptions: CNP descriptors at their real billing cities - honest
    # cross-country texture; benign auth dots, not fraud.
    "sub_tonequay": Place("Tonequay USA", 40.7128, -74.0060, "US", "subscription"),
    "sub_kestvale": Place("Kestvale.com", 37.2358, -121.9624, "US", "subscription"),
    "sub_verrhaven": Place("Verrhaven Studio Suite", 37.3382, -121.8863, "US", "subscription"),
    "sub_lornmere": Place("Lornmere Inc", 37.7749, -122.4194, "US", "subscription"),
    "sub_marrowpad": Place("Marrowpad Labs", 37.7849, -122.4094, "US", "subscription"),
    "sub_wrendene": Place("Wrendene Pass", 40.7414, -73.9897, "US", "subscription"),
}

IPS: dict[str, Ip] = {
    "residential_houston": Ip(
        "192.0.2.5", 29.76, -95.36, "US", "residential", asn="AS64496 Quiltide", reputation=95
    ),
    "office_eado": Ip(
        "198.51.100.12", 29.7520, -95.3520, "US", "business", asn="AS64497 Longleaf", reputation=90
    ),
    "hosting_lagos": Ip(
        "203.0.113.7", 6.52, 3.38, "NG", "hosting", asn="AS64500 Gantrywell", reputation=40
    ),
    # The takeover exit: a datacenter VPN egress in Frankfurt, seven time zones east of her Houston home, so the
    # time-zone overlay shows it (owner, 2026-10-06; it was a US exit with no geographic anomaly before).
    # ponytail: the key keeps its old name because the frozen readback (sim/scripted.py) quotes "ip=vpn_us";
    # rename it there and here together if the readback is ever regenerated.
    "vpn_us": Ip(
        "203.0.113.9", 50.1109, 8.6821, "DE", "datacenter", asn="AS64499 Hesktide", reputation=20
    ),
}

DEVICES: dict[str, Device] = {
    # Customer A (card-fraud / Dana) home device.
    "known": Device("Handset-15-Dana", "known", "2024-11-05T09:12:00-06:00"),
    # Never-seen attacker device, shared across scenarios.
    "unknown": Device("Handset-Unknown-9f2", "new", ""),
    # Customer B's two trusted devices; first_seen predates any pack window so
    # their first in-window login never reads as a new device.
    "priya_phone": Device("Handset-14-Priya", "known", "2025-03-12T08:00:00-05:00"),
    "priya_laptop": Device("Laptop-Slim-Priya", "known", "2025-06-20T19:30:00-05:00"),
}

PAYEES: dict[str, Payee] = {
    # Priya's established Tamsinmere circle (PROFILES: ~10 small transfers/month).
    "jamie_k": Payee("Jamie K.", "Harlowe Bank", "4521", "none", "2026-01-15T00:00:00-05:00"),
    "maria_s": Payee(
        "Maria S.", "Tallgrass National Bank", "8830", "none", "2025-09-02T00:00:00-05:00"
    ),
    "alex_t": Payee(
        "Alex T.", "Ashgrove Federal Bank", "2214", "none", "2025-12-10T00:00:00-05:00"
    ),
    # The money mule: a Newark-area bank on the elevated-risk list; first_seen
    # is '' because he is BORN at the attacker's payee_add event.
    "daniel_reyes": Payee("Daniel Reyes", "First Newark Savings", "7702", "elevated_risk", ""),
}
