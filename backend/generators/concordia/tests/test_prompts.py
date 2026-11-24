# backend/generators/concordia/tests/test_prompts.py
"""Contract tests for the agent prompt vocabulary (sim/prompts.py is import-light:
registries only, no concordia/torch). The prompt must be DERIVED from the
registries and agree with the parser, so the three can never drift apart."""

import re

from generators.concordia import places
from generators.concordia.action_format import _SIGNATURE_KEYS, PROMPTED_KINDS
from generators.concordia.sim import prompts


def test_format_lists_every_place_and_ip_id():
    for place_id in places.PLACES:
        assert place_id in prompts.FORMAT, f"place {place_id!r} missing from FORMAT"
    for ip_id in places.IPS:
        assert ip_id in prompts.FORMAT, f"ip {ip_id!r} missing from FORMAT"


def test_format_kv_keys_match_parser_signature():
    # Only the PROMPTED kinds appear in the model-facing FORMAT; the authored
    # kill-chain kinds (tamsinmere/wire/...) parse but are never put before a model.
    for kind in PROMPTED_KINDS:
        keys = _SIGNATURE_KEYS[kind]
        line = next(ln for ln in prompts.FORMAT.splitlines() if f"ACT {kind}" in ln)
        line_keys = set(re.findall(r"(\w+)=", line))
        assert line_keys == set(keys), f"{kind}: prompt keys {line_keys} != parser {set(keys)}"


def test_format_forbids_inventing_vocabulary():
    assert "Never invent" in prompts.FORMAT


def test_victim_goal_carries_role_vocabulary():
    goal = prompts.VICTIM_GOAL
    assert "grocery_houston" in goal
    assert "gas_houston" in goal
    assert "residential_houston" in goal
    assert "device=known" in goal


def test_victim_goal_maps_bank_contact_to_login():
    goal = prompts.VICTIM_GOAL
    assert "bank" in goal.lower()
    assert "ACT login" in goal


def test_fraudster_goal_carries_role_vocabulary():
    goal = prompts.FRAUDSTER_GOAL
    assert "atm_lagos" in goal
    assert "store_lagos" in goal
    assert "hosting_lagos" in goal
    assert "device=unknown" in goal


def test_premise_exists_and_demands_act_lines():
    assert "ACT" in prompts.PREMISE


def test_format_lists_the_vpn_us_ip():
    assert "vpn_us" in places.IPS  # registry has the US-VPN attacker ip
    assert "vpn_us" in prompts.FORMAT  # ...and FORMAT (derived from IPS) quotes it


def test_no_priya_prompts_remain():
    """priya-ato is AUTHORED (sim/scripted.py), not simulated; the coercive prompt
    goals were removed with it. Their reappearance would mean the unsupported
    model path is being revived - block it here."""
    assert not hasattr(prompts, "PRIYA_VICTIM_GOAL")
    assert not hasattr(prompts, "PRIYA_FRAUDSTER_GOAL")
    assert not hasattr(prompts, "PRIYA_PREMISE")
