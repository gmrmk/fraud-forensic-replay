# backend/generators/concordia/identity.py
"""Fixed Phase-1 personae. The sim has two actors; the fraudster clones the
victim's single card, so both act on ONE card_id -> an impossible-travel pair
is possible. Agent identity is the is_fraud ground truth (design spec section 3)."""

from __future__ import annotations

from dataclasses import dataclass

CUSTOMER: dict[str, object] = {
    "id": "gen-cust-001",
    "name": "Dana Okoro",
    "home_city": "Houston",
    "home_lat": 29.7604,
    "home_lng": -95.3698,
}
ACCOUNT: dict[str, object] = {
    "id": "gen-acct-001",
    "customer_id": "gen-cust-001",
    "type": "credit_card",  # schema.sql CHECK (type IN ('checking','savings','credit_card'))
    "account_number_last4": "4417",
    "opening_balance": 5000.0,
    "status": "active",
    "opened_at": "2023-06-15",
}
CARD: dict[str, object] = {
    "id": "gen-card-001",
    "account_id": "gen-acct-001",
    "bin": "414720",
    "last_four": "4417",
    "network": "Visa",
}

FRAUDSTER = "Fraudster"
VICTIM = "Victim"


def is_fraud_for(actor: str) -> int:
    """Ground-truth label by construction: the fraudster's actions are fraud."""
    return 1 if actor == FRAUDSTER else 0


@dataclass(frozen=True)
class Identity:
    customer: dict
    account: dict
    card: dict


PRIYA_CUSTOMER: dict[str, object] = {
    "id": "gen-cust-priya",
    "name": "Priya Patel",
    "home_city": "Houston",
    "home_lat": 29.7405,
    "home_lng": -95.3920,
}
PRIYA_ACCOUNT: dict[str, object] = {
    "id": "gen-acct-priya",
    "customer_id": "gen-cust-priya",
    "type": "checking",
    "account_number_last4": "8821",
    "opening_balance": 9200.0,
    "status": "active",
    "opened_at": "2022-03-02",
}
PRIYA_CARD: dict[str, object] = {
    "id": "gen-card-priya",
    "account_id": "gen-acct-priya",
    "bin": "401288",
    "last_four": "8821",
    "network": "Visa",
}

IDENTITIES: dict[str, Identity] = {
    "card-fraud": Identity(CUSTOMER, ACCOUNT, CARD),
    "priya-ato": Identity(PRIYA_CUSTOMER, PRIYA_ACCOUNT, PRIYA_CARD),
}
