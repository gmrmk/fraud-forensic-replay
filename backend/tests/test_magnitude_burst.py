"""magnitude-burst: a subject whose hourly value runs at a multiple of its group's own recent
median for several consecutive hours. The platform-access pack uses it for token spend per
API key against the organisation's prior week. The detector reads no label."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import rules as rules_module
from rules.magnitude_burst import bursts

RULE = {
    "id": "spend-burst",
    "label": "Spend burst",
    "detector": "magnitude-burst",
    "kind": "usage",
    "subject_field": "key",
    "baseline_field": "org",
    "value_field": "cost",
    "multiple": 10,
    "min_run": 2,
    "floor": 25,
    "baseline_hours": 168,
    "verdict": "SPEND BURST",
    "decision": "REVIEW",
    "severity": 0.8,
}
T0 = datetime(2026, 6, 1, tzinfo=UTC)


def bucket(n: int, key: str, org: str, hour: int, cost) -> dict:
    return {
        "id": f"u{n}",
        "key": key,
        "org": org,
        "cost": cost,
        "timestamp": (T0 + timedelta(hours=hour)).isoformat(),
    }


def week(org: str = "o1", key: str = "old", cost: float = 10.0, hours: int = 30) -> list[dict]:
    """An ordinary history: `hours` consecutive buckets at `cost`."""
    return [bucket(n, key, org, n, cost) for n in range(hours)]


def run(key: str, org: str, first_hour: int, costs: list, start_id: int = 1000) -> list[dict]:
    return [bucket(start_id + i, key, org, first_hour + i, c) for i, c in enumerate(costs)]


def test_a_new_subject_running_hot_for_five_hours_is_one_decision():
    rows = [*week(), *run("minted", "o1", 40, [400.0] * 5)]
    assert not [r for r in rows if r["key"] == "minted" and r["timestamp"] < rows[30]["timestamp"]]
    (d,) = bursts(rows, RULE)
    assert d.id == "decision:spend-burst:u1000"
    assert d.trigger_entity_ids == ["u1000", "u1001", "u1002", "u1003", "u1004"]
    assert d.subject_path_kind == "usage"
    assert (d.verdict, d.decision, d.severity) == ("SPEND BURST", "REVIEW", 0.8)
    assert d.rule["kind"] == "magnitude-burst"
    values = {i["label"]: i["value"] for i in d.inputs}
    assert values["Subject"] == "minted"
    assert values["Run"] == "5 hours"
    assert values["Peak"] == "40 times the baseline"
    assert values["Total"] == "2,000.00"
    assert all(t["breached"] for t in d.thresholds)
    assert [e["entity_ref"] for e in d.evidence if "entity_ref" in e] == ["u1000", "u1004"]


def test_a_single_hot_hour_is_not_a_run():
    assert bursts([*week(), *run("minted", "o1", 40, [400.0])], RULE) == []
    assert len(bursts([*week(), *run("minted", "o1", 40, [400.0])], {**RULE, "min_run": 1})) == 1


def test_a_single_subject_group_is_judged_against_its_own_history():
    rows = [*week(key="only"), *run("only", "o1", 40, [150.0] * 3)]
    (d,) = bursts(rows, RULE)
    assert {i["label"]: i["value"] for i in d.inputs}["Peak"] == "15 times the baseline"


def test_a_busy_group_does_not_fire_on_the_same_absolute_value():
    rows = [*week(cost=100.0), *run("minted", "o1", 40, [400.0] * 5)]
    assert bursts(rows, RULE) == []


def test_a_long_burst_does_not_raise_its_own_baseline():
    rows = [*week(), *run("minted", "o1", 40, [400.0] * 80)]
    (d,) = bursts(rows, RULE)
    assert d.trigger_entity_ids == [f"u{n}" for n in range(1000, 1080)]


def test_two_runs_separated_by_a_quiet_hour_are_two_decisions():
    rows = [
        *week(),
        *run("minted", "o1", 40, [400.0, 400.0]),
        *run("minted", "o1", 43, [400.0, 400.0, 400.0], start_id=2000),
    ]
    first, second = bursts(rows, RULE)
    assert first.trigger_entity_ids == ["u1000", "u1001"]
    assert second.trigger_entity_ids == ["u2000", "u2001", "u2002"]


def test_zero_missing_and_negative_values_are_never_hot_and_never_history():
    rows = [*week(), *run("minted", "o1", 40, [0, None, -5.0, "400"])]
    assert bursts(rows, RULE) == []
    # Zeros in the history do not pull the median down: two hours at 10 and three at 0 is a
    # baseline of 10, so 90 is nine times it, not a burst. Counted, the median would be 0.
    thin = [bucket(n, "old", "o1", n, cost) for n, cost in enumerate([10.0, 0, 10.0, 0, 0])]
    assert bursts([*thin, *run("minted", "o1", 40, [90.0] * 3)], RULE) == []


def test_a_value_below_the_floor_is_not_hot_however_large_the_multiple():
    rows = [*week(cost=0.5), *run("minted", "o1", 40, [20.0] * 4)]
    assert bursts(rows, RULE) == []


def test_history_older_than_the_lookback_is_not_a_baseline(caplog):
    rows = [*week(), *run("minted", "o1", 30 + 400, [400.0] * 3)]
    with caplog.at_level(logging.INFO, logger="rules.magnitude_burst"):
        assert bursts(rows, RULE) == []
    assert "no baseline" in caplog.text


def test_groups_do_not_share_a_baseline():
    rows = [*week(org="quiet", cost=10.0), *week(org="busy", key="b", cost=100.0)]
    rows += run("minted", "busy", 40, [400.0] * 3)
    assert bursts(rows, RULE) == []


def test_the_unit_and_names_come_from_the_rule():
    rule = {**RULE, "subject_label": "API key", "value_label": "Spend", "unit_prefix": "$"}
    (d,) = bursts([*week(), *run("minted", "o1", 40, [400.0] * 5)], rule)
    values = {i["label"]: i["value"] for i in d.inputs}
    assert values["API key"] == "minted"
    assert values["Total"] == "$2,000.00"
    assert d.thresholds[2] == {
        "label": "Peak spend",
        "actual": "$400.00",
        "bound": ">= $25.00",
        "breached": True,
    }


def test_an_incomplete_rule_returns_nothing_and_warns(caplog):
    rule = {k: v for k, v in RULE.items() if k != "value_field"}
    with caplog.at_level(logging.WARNING, logger="rules.magnitude_burst"):
        assert bursts([*week(), *run("minted", "o1", 40, [400.0] * 5)], rule) == []
    assert "value_field" in caplog.text


def test_it_is_registered():
    assert "magnitude-burst" in rules_module.RULE_EVALUATORS
