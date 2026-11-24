# backend/generators/concordia/tests/test_identity.py
from generators.concordia import identity


def test_actors_map_to_is_fraud():
    assert identity.is_fraud_for("Fraudster") == 1
    assert identity.is_fraud_for("Victim") == 0


def test_single_shared_card_and_account():
    # The fraudster clones the victim's card -> both act on ONE card_id.
    assert identity.CARD["id"] == "gen-card-001"
    assert identity.ACCOUNT["id"] == "gen-acct-001"
    assert identity.CARD["account_id"] == identity.ACCOUNT["id"]
    assert identity.ACCOUNT["customer_id"] == identity.CUSTOMER["id"]
    assert identity.ACCOUNT["type"] == "credit_card"  # schema CHECK enum
