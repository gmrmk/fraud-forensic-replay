# backend/generators/concordia/tests/test_scenarios.py
# NOTE: the plan wrote `from concordia.scenarios import SCENARIOS`, but this repo's
# pytest.ini pins `pythonpath = ../..` (root = backend/), where `concordia` is the
# installed Concordia LIBRARY (no scenarios module). The in-repo package is
# `generators.concordia`, matching every sibling test - so the import is qualified
# accordingly. The assertions are unchanged from the plan.
from generators.concordia.scenarios import SCENARIOS


def test_two_scenarios_registered():
    assert set(SCENARIOS) == {"card-fraud", "priya-ato"}


def test_priya_is_login_anomaly_no_geo():
    # priya-ato is AUTHORED (sim/scripted.py), so the US-VPN / no-globe-anomaly
    # truth lives in the scripted readback, not in an agent prompt (the coercive
    # Priya prompts were removed 2026-06-10; goals are explicit placeholders).
    from generators.concordia.sim.scripted import PRIYA_ATO_READBACK

    cfg = SCENARIOS["priya-ato"]
    assert cfg.rules[0]["detector"] == "login-anomaly"
    takeover = [a for a in PRIYA_ATO_READBACK if "ip=vpn_us" in a["value"]]
    assert len(takeover) == 1  # the Frankfurt datacenter exit
    assert "the sim is not used" in cfg.fraudster_goal
    assert cfg.ident.account["id"] == "gen-acct-priya"
    assert cfg.arrows == []  # behavioral scenario: no impossible-travel control
