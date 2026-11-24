import db  # backend flat module
import rules  # backend flat module
import scenario_registry  # backend flat module
from generators.concordia.clock import ScenarioClock
from generators.concordia.manifest import SCENARIO_ID
from generators.concordia.pipeline import build_pack

# A recorded/mocked Concordia readback (get_component_values output). Victim shops
# in Houston + logs in; the fraudster (cloned card) cashes out in Lagos minutes
# later -> a card-present Houston->Lagos pair the geo-velocity detector must fire on.
MOCK_READBACK = [
    {
        "step": 1,
        "entity_name": "Victim",
        "value": "Victim ACT purchase place=grocery_houston mcc=5411 amount=84.20 present=1",
    },
    {
        "step": 2,
        "entity_name": "Victim",
        "value": "Victim ACT login ip=residential_houston device=known outcome=success twofa=0",
    },
    {
        "step": 3,
        "entity_name": "Victim",
        "value": "Victim ACT purchase place=gas_houston mcc=5541 amount=48.00 present=1",
    },
    {
        "step": 4,
        "entity_name": "Fraudster",
        "value": "Fraudster ACT purchase place=atm_lagos mcc=6011 amount=900.00 present=1",
    },
    {
        "step": 5,
        "entity_name": "Fraudster",
        "value": "Fraudster ACT purchase place=store_lagos mcc=5999 amount=420.00 present=1",
    },
]


def test_mock_transcript_produces_loadable_pack_and_rules_fire(tmp_path):
    clk = ScenarioClock(start="2026-05-27T08:00:00-05:00", step_minutes=6)
    summary = build_pack(MOCK_READBACK, out_dir=tmp_path, clock=clk)

    # 4 purchases + 1 login parsed/validated/written; nothing dropped.
    assert summary["transactions"] == 4
    assert summary["logins"] == 1
    assert summary["dropped"] == 0

    # Loads in the existing registry.
    m = scenario_registry.load_manifest(summary["manifest_path"], base_dir=tmp_path)
    assert m.id == SCENARIO_ID

    # The existing detector fires on the generated DB.
    conn = db.connect(summary["db_path"])
    try:
        decisions = rules.evaluate(conn, m.rules)
    finally:
        conn.close()
    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "IMPOSSIBLE TRAVEL"
    assert d.decision == "DECLINE"
    assert set(d.trigger_entity_ids) == {
        "gen-tx-00003",
        "gen-tx-00004",
    }  # gas(Houston) -> atm(Lagos)
