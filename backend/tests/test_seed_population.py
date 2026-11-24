"""Seam tests for seed_population -- determinism and independence of per-customer RNGs."""

from __future__ import annotations

import seed
import seed_population as sp


def test_customer_rng_different_indexes_produce_different_sequences() -> None:
    """Two distinct customer indexes must diverge immediately."""
    rng1 = sp.customer_rng(1)
    rng2 = sp.customer_rng(2)
    draws1 = [rng1.random() for _ in range(5)]
    draws2 = [rng2.random() for _ in range(5)]
    assert draws1 != draws2, "customer_rng(1) and customer_rng(2) must produce different sequences"


def test_customer_rng_same_index_is_deterministic() -> None:
    """Same index called twice must replay the identical sequence."""
    draws_a = [sp.customer_rng(5).random() for _ in range(5)]
    draws_b = [sp.customer_rng(5).random() for _ in range(5)]
    assert draws_a == draws_b, "customer_rng(5) must be deterministic across calls"


def test_injected_rng_produces_different_output_from_marcus_default() -> None:
    """Injecting customer_rng(0) must yield a structurally different tx list
    from the rng=None Marcus default (different SEED => different values)."""
    marcus_txs = seed.generate_transactions("card-x", "acct-x", days=30)
    custom_txs = seed.generate_transactions("card-x", "acct-x", days=30, rng=sp.customer_rng(0))
    marcus_amounts = [t["amount"] for t in marcus_txs]
    custom_amounts = [t["amount"] for t in custom_txs]
    assert (
        marcus_amounts != custom_amounts
    ), "customer_rng(0) injection must produce different amounts from Marcus default"


def test_population_has_n_distinct_customers():
    pop = sp.generate_population(50)
    ids = [c["id"] for c in pop.customers]
    assert len(ids) == 50
    assert len(set(ids)) == 50


def test_population_is_all_legit():
    pop = sp.generate_population(50)
    assert all(t["is_fraud"] == 0 for t in pop.transactions)


def test_population_is_deterministic():
    a = sp.generate_population(30)
    b = sp.generate_population(30)
    assert [t["id"] for t in a.transactions] == [t["id"] for t in b.transactions]
    assert [t["amount"] for t in a.transactions] == [t["amount"] for t in b.transactions]


def test_population_spans_multiple_metros():
    pop = sp.generate_population(60)
    cities = {c["home_city"] for c in pop.customers}
    assert len(cities) >= 5, f"expected national spread, got {cities}"
