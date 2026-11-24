# backend/generators/concordia/tests/test_validator.py
import pytest
from generators.concordia.validator import ValidationError, validate_row


def _tx(**over):
    base = {
        "id": "gen-tx-0001",
        "card_id": "gen-card-001",
        "account_id": "gen-acct-001",
        "timestamp": "2026-05-27T08:00:00-05:00",
        "amount": 10.0,
        "merchant_name": "X",
        "merchant_lat": 29.7,
        "merchant_lng": -95.3,
        "merchant_country": "US",
        "mcc": "5411",
        "category": "grocery",
        "is_card_present": 1,
        "is_fraud": 0,
        "balance_after": 0.0,
    }
    base.update(over)
    return base


def _login(**over):
    base = {
        "id": "gen-login-0001",
        "account_id": "gen-acct-001",
        "timestamp": "2026-05-27T08:00:00-05:00",
        "ip": "192.0.2.4",
        "ip_country": "US",
        "ip_lat": 29.7,
        "ip_lng": -95.3,
        "device_fp": "d",
        "user_agent": "u",
        "outcome": "success",
        "two_fa_used": 0,
    }
    base.update(over)
    return base


def test_valid_rows_pass():
    validate_row("transactions", _tx())
    validate_row("login_events", _login())


def test_bad_outcome_enum_rejected():
    with pytest.raises(ValidationError):
        validate_row("login_events", _login(outcome="approved"))  # not in schema CHECK


def test_out_of_range_coord_rejected():
    with pytest.raises(ValidationError):
        validate_row("transactions", _tx(merchant_lat=999.0))


def test_nonpositive_amount_rejected():
    with pytest.raises(ValidationError):
        validate_row("transactions", _tx(amount=0.0))


def test_bad_is_card_present_flag_rejected():
    with pytest.raises(ValidationError):
        validate_row("transactions", _tx(is_card_present=2))


def test_unparseable_timestamp_rejected():
    with pytest.raises(ValidationError):
        validate_row("transactions", _tx(timestamp="not-a-time"))
