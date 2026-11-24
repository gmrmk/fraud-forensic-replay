"""The static export carries the model's rank on every card transaction, because the card story's
second lane (the highest model rank of each hour) reads it, and it fails when a lane the manifest
declares reads a field its rows lack.

The scores are a join the endpoint makes (main.py `_TX_SELECT_WITH_ML`) over the pack's own
database and artifact, so the first test reads the real pack, not a temporary seed."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import scenario_registry as sr
from export_static import _check_lane_fields, export
from static_keys import static_path

BACKEND = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND.parent
SCENARIOS = BACKEND / "scenarios"


@pytest.fixture
def registry():
    """The real scenario registry and the real card pack."""
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def _exported_transactions(out: Path) -> list[dict]:
    path = out / "card-fraud" / static_path("/api/transactions")
    return json.loads(path.read_text(encoding="utf-8"))


def test_every_card_transaction_of_the_export_carries_its_rank_and_model_version(
    registry, tmp_path
):
    export(tmp_path / "out", ["card-fraud"], "card-fraud")
    transactions = _exported_transactions(tmp_path / "out")
    assert transactions, "the case bundle holds the card's transactions"
    unscored = [
        t["id"]
        for t in transactions
        if t.get("ml_percentile") is None or t.get("ml_model_version") is None
    ]
    assert unscored == []
    assert all(0 <= t["ml_percentile"] <= 100 for t in transactions)


def test_the_export_fails_when_the_scores_did_not_load(registry, tmp_path, monkeypatch):
    # The scorer swallows a load failure and the endpoint then serves no score key at all.
    monkeypatch.setattr("ml.scorer.active_model_version", lambda: None)
    with pytest.raises(RuntimeError, match="ml_percentile"):
        export(tmp_path / "out", ["card-fraud"], "card-fraud")


def _bodies(rows: list[dict], url: str = "/api/entities?kind=crate") -> dict[str, bytes]:
    return {url: json.dumps(rows).encode("utf-8")}


LANE = {"id": "cost-by-hour", "kinds": ["crate"], "field": "cost"}


def test_a_lane_whose_field_a_kinds_rows_lack_fails_the_check():
    manifest = {"lanes": [LANE]}
    _check_lane_fields(manifest, _bodies([{"id": "a", "cost": 3}, {"id": "b", "cost": 4}]))
    with pytest.raises(RuntimeError, match="cost-by-hour"):
        _check_lane_fields(manifest, _bodies([{"id": "a", "cost": 3}, {"id": "b"}]))


def test_a_present_null_and_a_kind_with_no_rows_do_not_fail_the_check():
    manifest = {"lanes": [LANE, {**LANE, "id": "other", "kinds": ["bale"]}]}
    _check_lane_fields(manifest, _bodies([{"id": "a", "cost": None}]))
    _check_lane_fields(manifest, _bodies([]))


def test_a_manifest_with_no_lane_passes_the_check():
    _check_lane_fields({}, {})
    _check_lane_fields({"lanes": None}, {})


def test_the_transaction_kinds_are_told_apart_by_the_flag():
    rows = [
        {"id": "a", "is_fraud": 0, "amount": 1, "rank": 1.0},
        {"id": "b", "is_fraud": 1, "amount": 2},
    ]
    bodies = _bodies(rows, "/api/transactions")
    lane = {"id": "rank", "kinds": ["auth"], "field": "rank"}
    _check_lane_fields({"lanes": [lane]}, bodies)
    with pytest.raises(RuntimeError, match="rank"):
        _check_lane_fields({"lanes": [{**lane, "kinds": ["fraud"]}]}, bodies)


def test_the_failure_names_the_lanes_id_and_field_and_not_a_score():
    # A lane may read any field, so the message cannot talk about a score key.
    bodies = _bodies([{"id": "a", "cost": 3}, {"id": "b"}])
    with pytest.raises(RuntimeError) as failure:
        _check_lane_fields({"lanes": [LANE]}, bodies)
    message = str(failure.value)
    assert "'cost-by-hour'" in message
    assert "'cost'" in message
    assert "'crate'" in message
    assert "score" not in message
