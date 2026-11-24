# backend/generators/concordia/tests/test_clock.py
from datetime import datetime

from generators.concordia.clock import ScenarioClock


def test_step_maps_to_monotonic_iso_timestamps():
    clk = ScenarioClock(start="2026-05-27T08:00:00-05:00", step_minutes=6)
    t3 = clk.ts_for(3)
    t4 = clk.ts_for(4)
    assert t3 == "2026-05-27T08:18:00-05:00"
    assert datetime.fromisoformat(t4) > datetime.fromisoformat(t3)


def test_six_minute_gap_houston_to_lagos_is_impossible():
    # gas (step 3) -> atm (step 4): 6 minutes -> any 500+mi jump is > 600 mph.
    clk = ScenarioClock(start="2026-05-27T08:00:00-05:00", step_minutes=6)
    secs = (
        datetime.fromisoformat(clk.ts_for(4)) - datetime.fromisoformat(clk.ts_for(3))
    ).total_seconds()
    assert secs == 360
