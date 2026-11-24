# backend/generators/concordia/tests/test_kill_chain_kinds.py
"""The four kill-chain ACT kinds (tamsinmere, wire, profile_change, payee_add) parse,
translate, and validate end-to-end. These are AUTHORED-scenario kinds: the parser
accepts them, but only purchase/login are in the sim prompt grammar (PROMPTED_KINDS)
- the model is never asked to emit a wire."""

import pytest
from generators.concordia.action_format import PROMPTED_KINDS, ParseError, parse_action
from generators.concordia.clock import ScenarioClock
from generators.concordia.identity import IDENTITIES
from generators.concordia.translators import to_row
from generators.concordia.validator import ValidationError, validate_row

CLK = ScenarioClock(start="2026-04-27T00:00:00-05:00", step_minutes=1)
IDENT = IDENTITIES["priya-ato"]


def _row(value: str, *, actor: str = "Victim", step: int = 100):
    pa = parse_action(step, actor, value)
    table, row = to_row(pa, CLK, IDENT)
    validate_row(table, row)
    return table, row


def test_prompted_kinds_stay_sim_only():
    assert PROMPTED_KINDS == ("purchase", "login")


def test_tamsinmere_translates_to_sent_transfer():
    table, row = _row("ACT tamsinmere payee=jamie_k amount=47")
    assert table == "transfers"
    assert row["rail"] == "tamsinmere" and row["status"] == "sent"
    assert row["amount"] == 47.0
    assert row["payee_id"] == "gen-payee-jamie_k"
    assert row["is_fraud"] == 0


def test_wire_blocked_carries_decline_reason_and_fraud_label():
    table, row = _row(
        "ACT wire payee=daniel_reyes amount=3800 status=blocked reason=velocity_rule "
        "session=sess-takeover",
        actor="Fraudster",
    )
    assert table == "transfers"
    assert row["rail"] == "wire" and row["status"] == "blocked"
    assert row["decline_reason"] == "velocity_rule"
    assert row["session_id"] == "sess-takeover"
    assert row["is_fraud"] == 1


def test_profile_change_preserves_old_and_new_values():
    table, row = _row(
        "ACT profile_change field=email old=priya.patel@tealmoor.example "
        "new=p.patel.recovery@sentrypine.example session=sess-takeover",
        actor="Fraudster",
    )
    assert table == "account_events"
    assert row["kind"] == "profile_change"
    assert row["field"] == "email"
    assert row["old_value"] == "priya.patel@tealmoor.example"
    assert row["new_value"] == "p.patel.recovery@sentrypine.example"
    assert row["is_fraud"] == 1


def test_payee_add_references_the_payee():
    table, row = _row("ACT payee_add payee=daniel_reyes session=sess-takeover", actor="Fraudster")
    assert table == "account_events"
    assert row["kind"] == "payee_add"
    assert row["payee_id"] == "gen-payee-daniel_reyes"


def test_unknown_payee_is_rejected():
    with pytest.raises((ParseError, ValidationError, KeyError)):
        _row("ACT tamsinmere payee=nobody_real amount=10")


def test_wire_without_status_is_rejected():
    with pytest.raises((ParseError, ValidationError, KeyError)):
        _row("ACT wire payee=daniel_reyes amount=100")


def test_zero_amount_transfer_is_rejected():
    with pytest.raises((ParseError, ValidationError)):
        _row("ACT tamsinmere payee=jamie_k amount=0")


# --- enrichment stops being silent (research delta 3) -------------------------


def test_cnp_purchase_gets_ecom_entry_mode_and_subscription_3ds():
    _, row = _row("ACT purchase place=sub_tonequay mcc=5815 amount=11 present=0")
    assert row["pos_entry_mode"] == "ecom"
    assert row["is_3ds"] == 1


def test_card_present_purchase_gets_chip_and_terminal():
    _, row = _row("ACT purchase place=coffee_houston mcc=5814 amount=6 present=1")
    assert row["pos_entry_mode"] == "chip"
    assert row["terminal_id"] != ""
    assert row["is_3ds"] == 0


def test_login_carries_device_intel_and_session():
    _, row = _row(
        "ACT login ip=vpn_us device=unknown outcome=challenge_passed twofa=1 "
        "session=sess-takeover",
        actor="Fraudster",
    )
    assert row["session_id"] == "sess-takeover"
    assert row["ip_type"] == "datacenter"
    assert row["ip_reputation"] < 50
    assert row["device_trust"] == "new"
    # attacker device is born at this event: first_seen stamps the row time
    assert row["device_first_seen_at"] == row["timestamp"]
    assert row["auth_method"] == "password+otp"


def test_trusted_login_first_seen_predates_window():
    _, row = _row("ACT login ip=residential_houston device=priya_phone outcome=success twofa=1")
    assert row["device_trust"] == "known"
    assert row["device_first_seen_at"] < row["timestamp"]
    assert row["session_id"].startswith("sess-")  # deterministic default
