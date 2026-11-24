from generators.concordia import identity
from generators.concordia.action_format import ParsedAction
from generators.concordia.clock import ScenarioClock
from generators.concordia.translators import to_row

CLK = ScenarioClock(start="2026-05-27T08:00:00-05:00", step_minutes=6)
IDENT = identity.IDENTITIES["card-fraud"]


def test_fraudster_purchase_uses_shared_card_and_labels_fraud():
    pa = ParsedAction(
        step=4,
        actor="Fraudster",
        kind="purchase",
        fields={"place": "atm_lagos", "mcc": "6011", "amount": "900.00", "present": "1"},
    )
    table, row = to_row(pa, CLK, IDENT)
    assert table == "transactions"
    assert row["card_id"] == identity.CARD["id"]  # cloned card
    assert row["is_fraud"] == 1  # actor identity
    assert row["merchant_country"] == "NG"  # generator-owned geo
    assert row["merchant_lat"] == 6.5244
    assert row["timestamp"] == "2026-05-27T08:24:00-05:00"
    assert row["amount"] == 900.0
    assert row["is_card_present"] == 1


def test_victim_purchase_is_not_fraud():
    pa = ParsedAction(
        step=3,
        actor="Victim",
        kind="purchase",
        fields={"place": "gas_houston", "mcc": "5541", "amount": "48.00", "present": "1"},
    )
    _, row = to_row(pa, CLK, IDENT)
    assert row["is_fraud"] == 0
    assert row["category"] == "gas"


def test_login_translates_with_registry_geo():
    pa = ParsedAction(
        step=2,
        actor="Victim",
        kind="login",
        fields={"ip": "residential_houston", "device": "known", "outcome": "success", "twofa": "0"},
    )
    table, row = to_row(pa, CLK, IDENT)
    assert table == "login_events"
    assert row["account_id"] == identity.ACCOUNT["id"]
    assert row["ip"] == "192.0.2.5"
    assert row["device_fp"] == "Handset-15-Dana"
    assert row["outcome"] == "success"
    assert row["two_fa_used"] == 0
