import pytest
from generators.concordia.action_format import ParseError, parse_action


def test_parses_purchase_with_name_prefix_and_trailing_prose():
    pa = parse_action(
        step=3,
        entity_name="Victim",
        value="Victim ACT purchase place=gas_houston mcc=5541 amount=48.00 present=1  (filling up)",
    )
    assert pa.kind == "purchase"
    assert pa.actor == "Victim"
    assert pa.step == 3
    assert pa.fields == {"place": "gas_houston", "mcc": "5541", "amount": "48.00", "present": "1"}


def test_parses_login():
    pa = parse_action(
        step=2,
        entity_name="Victim",
        value="Victim ACT login ip=residential_houston device=known outcome=success twofa=0",
    )
    assert pa.kind == "login"
    assert pa.fields["outcome"] == "success"


def test_rejects_line_without_act_token():
    with pytest.raises(ParseError):
        parse_action(step=1, entity_name="Victim", value="Victim wanders around the store.")


def test_rejects_unknown_kind():
    with pytest.raises(ParseError):
        parse_action(
            step=1, entity_name="Fraudster", value="Fraudster ACT teleport place=atm_lagos"
        )


# --- ACT-less tolerance: fixtures captured verbatim from the 2026-06-09 live run ---
# (gemma-3-4b omits the literal ACT token on ~half its otherwise well-formed actions)


def test_parses_actless_purchase_with_kind_keyword():
    pa = parse_action(
        step=1,
        entity_name="Victim",
        value="Victim purchase place=grocery_houston mcc=478923 amount=65.12 present=1",
    )
    assert pa.kind == "purchase"
    assert pa.fields == {
        "place": "grocery_houston",
        "mcc": "478923",
        "amount": "65.12",
        "present": "1",
    }


def test_parses_actless_fraudster_purchase():
    pa = parse_action(
        step=4,
        entity_name="Fraudster",
        value="Fraudster purchase place=atm_lagos mcc=7894 amount=500 present=1",
    )
    assert pa.kind == "purchase"
    assert pa.actor == "Fraudster"
    assert pa.fields["place"] == "atm_lagos"


def test_infers_login_from_key_signature_without_kind_keyword():
    pa = parse_action(
        step=3,
        entity_name="Victim",
        value="Victim contacted bank ip=residential_houston device=known outcome=success twofa=1",
    )
    assert pa.kind == "login"
    assert pa.fields == {
        "ip": "residential_houston",
        "device": "known",
        "outcome": "success",
        "twofa": "1",
    }


def test_still_rejects_pure_prose_from_live_capture():
    with pytest.raises(ParseError):
        parse_action(step=5, entity_name="Victim", value="Victim contacts her bank.")


def test_rejects_kind_keyword_without_kv_payload():
    with pytest.raises(ParseError):
        parse_action(step=1, entity_name="Victim", value="Dana considers making a purchase.")


def test_rejects_ambiguous_mixed_signature():
    with pytest.raises(ParseError):
        parse_action(
            step=1,
            entity_name="Victim",
            value="Victim place=grocery_houston mcc=5411 ip=residential_houston device=known",
        )
