"""The Bunker Hill skimmer ring -- a common-point-of-compromise scenario.

~30 victim cards each take one clean card-present swipe at a single Houston
gas pump (the breach), then a chip-fallback cash-out fraud cluster days later.
The shared CPP terminal_id is the link a later slice's detector groups on.

The victims are Houston-area cards: a visitor whose other card-present activity is
900+ miles away would make every harvest swipe a physically impossible legitimate arc.
`victim_positions` names them so the generators can place them in Houston."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

CDT = timezone(timedelta(hours=-5))
# Cash-out window opens 2026-05-27 (matches Marcus's canonical Lagos date).
CASHOUT_DAY = datetime(2026, 5, 27, tzinfo=CDT)

# The compromised pump -- a fixed Houston Memorial fuel terminal.
CPP: dict = {
    "merchant_name": "Alderlowe Fuel & Go · Pump 4",
    "merchant_lat": 29.7770,
    "merchant_lng": -95.5460,
    "merchant_country": "US",
    "mcc": "5541",
    "category": "gas",
    "acquirer": "Zellmere Payments",
    "terminal_id": "ZEL-7731042",  # the shared point of compromise
}

# Where the cloned cards cash out (mule hubs); Marcus's Lagos chain is separate.
MULE_HUBS: list[tuple[float, float, str, str]] = [
    (6.5244, 3.3792, "NG", "Sorrelwick Switch"),  # Lagos
    (40.0583, -74.4057, "US", "Zellmere Payments"),  # New Jersey
    (25.7617, -80.1918, "US", "Orbitfield Payments"),  # Miami
]


def make_harvest_swipe(card_id: str, account_id: str, day_offset: int) -> dict:
    """A clean card-present gas swipe at the CPP pump, `day_offset` days before
    the cash-out. is_fraud=0 -- it is legitimate at the time it happens."""
    ts = (CASHOUT_DAY - timedelta(days=day_offset)).replace(hour=8, minute=0, second=0)
    return {
        "id": "",
        "card_id": card_id,
        "account_id": account_id,
        "timestamp": ts.isoformat(),
        "amount": round(35 + (day_offset % 5) * 4.5, 2),
        "merchant_name": CPP["merchant_name"],
        "merchant_lat": CPP["merchant_lat"],
        "merchant_lng": CPP["merchant_lng"],
        "merchant_country": "US",
        "mcc": CPP["mcc"],
        "category": CPP["category"],
        "is_card_present": 1,
        "is_fraud": 0,
        "balance_after": 0.0,
        "auth_response_code": "00",
        "pos_entry_mode": "chip",
        "network_ref_number": f"NRN{card_id[-4:]}HARV",
        "terminal_id": CPP["terminal_id"],
        "acquirer": CPP["acquirer"],
        "auth_source": "issuer",
        "risk_score": 45,
        "is_3ds": 0,
        "currency": "USD",
    }


RING_SEED = 99_2026_0607


@dataclass(frozen=True)
class Ring:
    victim_card_ids: list[str]
    transactions: list[dict]  # harvest swipes + cash-out fraud for non-Marcus victims


def _cashout(card_id: str, account_id: str, hub: tuple, rng: random.Random) -> list[dict]:
    lat, lng, country, acquirer = hub
    out: list[dict] = []
    n = rng.randint(2, 3)
    base = CASHOUT_DAY.replace(hour=7, minute=42, second=0)
    for k in range(n):
        ts = base + timedelta(minutes=3 * k)
        out.append(
            {
                "id": "",
                "card_id": card_id,
                "account_id": account_id,
                "timestamp": ts.isoformat(),
                "amount": round(rng.uniform(180, 1300), 2),
                "merchant_name": f"{['ATM','Mall','Market'][k % 3]} · cash-out",
                "merchant_lat": round(lat + (rng.random() - 0.5) * 0.04, 6),
                "merchant_lng": round(lng + (rng.random() - 0.5) * 0.04, 6),
                "merchant_country": country,
                "mcc": "6011",
                "category": "cash_advance",
                "is_card_present": 1,
                "is_fraud": 1,
                "balance_after": 0.0,
                # first attempt declines (velocity signal)
                "auth_response_code": "00" if k else "05",
                "pos_entry_mode": "chip_fallback_swipe",
                "network_ref_number": f"NRN{card_id[-4:]}CO{k}",
                "terminal_id": (
                    f"{acquirer.replace(' ', '')[:3].upper()}" f"-{rng.randint(1000000, 9999999)}"
                ),
                "acquirer": acquirer,
                "auth_source": "stip" if k == 0 else "issuer",
                "risk_score": rng.randint(900, 985),
                "is_3ds": 0,
                "currency": "USD",  # the issuer bills in USD wherever the cash-out happens
            }
        )
    return out


def victim_positions(n_profiles: int, ring_size: int) -> list[int]:
    """Positions in the profile list of the sampled victims, in sample order (Marcus is
    reserved, so ring_size - 1 of them). Callers that move victims to Houston before
    generating their activity use this to agree with the weave on who they are."""
    return random.Random(RING_SEED).sample(range(n_profiles), k=min(ring_size - 1, n_profiles))


def weave_skimmer_ring(profiles: list, ring_size: int, marcus_card_id: str) -> Ring:
    """Pick `ring_size` victims deterministically (Marcus forced in), give each a
    harvest swipe at the CPP pump + a cash-out cluster. Marcus's cash-out is his
    canonical Lagos chain (added in seed.main), so we only inject his harvest swipe
    there -- here we emit harvest + cash-out for the other victims.

    Precondition: `profiles` must NOT contain Marcus -- he is passed by card_id and
    reserved (not sampled), so the caller excludes him from `profiles`."""
    assert all(
        p.card_id != marcus_card_id for p in profiles
    ), "profiles must not contain Marcus; he is reserved by card_id, not sampled"
    chosen = [profiles[j] for j in victim_positions(len(profiles), ring_size)]
    victim_ids = [marcus_card_id] + [p.card_id for p in chosen]
    txs: list[dict] = []
    for i, p in enumerate(chosen):
        vrng = random.Random(RING_SEED + i * 31 + 1)
        txs.append(make_harvest_swipe(p.card_id, p.account_id, day_offset=14 + (i % 10)))
        hub = MULE_HUBS[i % len(MULE_HUBS)]
        txs.extend(_cashout(p.card_id, p.account_id, hub, vrng))
    txs.sort(key=lambda t: (t["card_id"], t["timestamp"]))
    for idx, t in enumerate(txs):
        t["id"] = f"tx-ring-{idx:04d}"
    return Ring(victim_card_ids=victim_ids, transactions=txs)
