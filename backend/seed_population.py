"""National portfolio generation -- parameterized, per-customer-deterministic.

Extends the single-customer Marcus generators in seed.py to a population.
Each customer is generated from its own random.Random(seed) so generation is
order-independent and idempotent (re-seed -> identical rows)."""

from __future__ import annotations

import random
from collections.abc import Collection
from dataclasses import dataclass, replace

POP_SEED = 7_2026_0607  # base seed for the population RNG family


def customer_rng(index: int) -> random.Random:
    """Deterministic, independent RNG per customer index."""
    return random.Random(POP_SEED + index * 7919)


def jitter_rng(rng: random.Random, center: float, miles: float) -> float:
    """RNG-driven coordinate offset within `miles` of `center` (1 deg lat ~= 69 mi)."""
    return center + (rng.random() - 0.5) * 2 * (miles / 69.0)


# (lat, lng, city) for a national spread of US metros.
US_METROS: list[tuple[float, float, str]] = [
    (40.7128, -74.0060, "New York, NY"),
    (34.0522, -118.2437, "Los Angeles, CA"),
    (41.8781, -87.6298, "Chicago, IL"),
    (29.7604, -95.3698, "Houston, TX"),
    (33.4484, -112.0740, "Phoenix, AZ"),
    (39.7392, -104.9903, "Denver, CO"),
    (47.6062, -122.3321, "Seattle, WA"),
    (25.7617, -80.1918, "Miami, FL"),
    (42.3601, -71.0589, "Boston, MA"),
    (33.7490, -84.3880, "Atlanta, GA"),
    (32.7767, -96.7970, "Dallas, TX"),
    (37.7749, -122.4194, "San Francisco, CA"),
]


HOUSTON: tuple[float, float, str] = next(m for m in US_METROS if m[2] == "Houston, TX")


@dataclass(frozen=True)
class CustomerProfile:
    index: int
    customer_id: str
    account_id: str
    card_id: str
    name: str
    home_city: str
    home_lat: float
    home_lng: float


@dataclass(frozen=True)
class Population:
    customers: list[dict]
    accounts: list[dict]
    cards: list[dict]
    transactions: list[dict]
    login_events: list[dict]


def move_to_houston(p: CustomerProfile) -> CustomerProfile:
    """The same cardholder living in Houston, with the home draws make_profiles makes for a
    Houston slot (the skimmer ring's victims live next to the pump they swiped at)."""
    r = customer_rng(p.index)
    lat, lng, city = HOUSTON
    return replace(
        p, home_city=city, home_lat=jitter_rng(r, lat, 8), home_lng=jitter_rng(r, lng, 8)
    )


def make_profiles(n: int, *, rehome: Collection[int] = ()) -> list[CustomerProfile]:
    """`rehome` lists profile positions that live in Houston instead of their cycle metro
    (the skimmer ring's victims). Every RNG draw is position-keyed, so nobody else changes."""
    profiles: list[CustomerProfile] = []
    for i in range(n):
        r = customer_rng(i)
        lat, lng, city = US_METROS[i % len(US_METROS)]
        p = CustomerProfile(
            index=i,
            customer_id=f"cust-{i:04d}",
            account_id=f"acct-{i:04d}",
            card_id=f"card-{i:04d}",
            name=f"Cardholder {i:04d}",
            home_city=city,
            home_lat=jitter_rng(r, lat, 8),
            home_lng=jitter_rng(r, lng, 8),
        )
        profiles.append(move_to_houston(p) if i in rehome else p)
    return profiles


def generate_population(n: int, *, rehome: Collection[int] = ()) -> Population:
    """Generate n legit cardholders across US metros (no fraud -- the ring is
    woven in separately by seed_ring.weave_skimmer_ring). `rehome` as in make_profiles."""
    import seed  # local import to avoid a cycle (seed imports seed_population)

    customers, accounts, cards, txs, logins = [], [], [], [], []
    for p in make_profiles(n, rehome=rehome):
        r = customer_rng(p.index)
        customers.append(
            {
                "id": p.customer_id,
                "name": p.name,
                "home_city": p.home_city,
                "home_lat": round(p.home_lat, 6),
                "home_lng": round(p.home_lng, 6),
                "kyc_level": "standard",
                "dob_year": 1960 + r.randint(0, 45),
                "customer_since": f"20{r.randint(10, 23):02d}-{r.randint(1, 12):02d}-15",
            }
        )
        accounts.append(
            {
                "id": p.account_id,
                "customer_id": p.customer_id,
                "type": "credit_card",
                "account_number_last4": f"{r.randint(1000, 9999)}",
                "opening_balance": 0.0,
                "status": "active",
                "opened_at": "2022-01-01",
                "risk_tier": "low",
                "segment": "standard",
            }
        )
        cards.append(
            {
                "id": p.card_id,
                "account_id": p.account_id,
                "bin": "414720",
                "last_four": f"{r.randint(1000, 9999)}",
                "network": "visa",
                "issuer_country": "US",
                "status": "active",
                "product_type": "Visa Platinum",
                "funding_type": "credit",
                "issued_at": "2022-01-05",
                "activated_at": "2022-01-07",
                "card_on_file_count": r.randint(0, 6),
            }
        )
        ptx = seed.generate_transactions(
            p.card_id,
            p.account_id,
            days=30,
            home_lat=p.home_lat,
            home_lng=p.home_lng,
            rng=r,
        )
        txs.extend(ptx)
        logins.extend(
            seed.generate_logins(
                p.account_id,
                days=30,
                home_lat=p.home_lat,
                home_lng=p.home_lng,
                rng=r,
            )
        )
    return Population(customers, accounts, cards, txs, logins)
