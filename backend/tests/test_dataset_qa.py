"""Read-only dataset QA over the seeded packs.

The 2026-06-10 geo-velocity overflow (FIX-2026-06-10-geo-velocity-overflow-
population-db) was hidden by a degrade-to-empty endpoint catch; that fix log's
"Next time" asks for a stats / non-empty-rules smoke that fails SOME gate when a
detector silently returns [] on a flagship scenario. This module is that smoke,
in the spirit of the uv-scripts/dataset-stats recipe (streaming aggregates +
guarded arithmetic + graceful degrade) but adapted to FFR's local SQLite packs.

STRICTLY READ-ONLY: every pack is opened with SQLite `mode=ro` and only SELECTs
are issued -- it never seeds, writes, or mutates canonical data. Each check skips
cleanly when its pack is unseeded (a clean-clone CI), and fires on a developer
machine (or any box where `python -m seed` has run).
"""

from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

import pytest

import rules
from db import PROJECT_ROOT

SCENARIOS_DIR = PROJECT_ROOT / "backend" / "scenarios"


def _scenarios() -> list[dict]:
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(SCENARIOS_DIR.glob("*.scenario.json"))
    ]


def _readonly(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _mph_speeds(decision: rules.Decision) -> list[float]:
    """Parse the 'NNN mph' threshold strings a geo-velocity Decision carries."""
    speeds: list[float] = []
    for t in decision.thresholds:
        actual = str(t.get("actual", ""))
        if "mph" in actual:
            speeds.append(float(actual.replace("mph", "").replace(",", "").strip()))
    return speeds


_SCEN = _scenarios()
_IDS = [s["id"] for s in _SCEN]


@pytest.mark.parametrize("scenario", _SCEN, ids=_IDS)
def test_geo_velocity_never_overflows(scenario: dict) -> None:
    """_eval_geo_velocity must never raise OverflowError and must emit only finite
    speeds, on BOTH the focal-scoped path and the unscoped population path -- the
    exact regression from FIX-2026-06-10 (round(inf) on a same-timestamp
    cross-card pair)."""
    geo = next((r for r in scenario.get("rules", []) if r.get("detector") == "geo-velocity"), None)
    if geo is None:
        pytest.skip("scenario declares no geo-velocity rule")
    db = PROJECT_ROOT / scenario["db"]
    if not db.exists():
        pytest.skip(f"pack not seeded: {db}")
    conn = _readonly(db)
    try:
        for focal in (scenario.get("focal"), None):  # scoped AND unscoped (population) path
            for d in rules._eval_geo_velocity(conn, geo, focal):  # must not raise
                bad = [s for s in _mph_speeds(d) if not math.isfinite(s)]
                assert not bad, f"{scenario['id']}: non-finite speeds {bad}"
    finally:
        conn.close()


@pytest.mark.parametrize("scenario", _SCEN, ids=_IDS)
def test_declared_rules_fire(scenario: dict) -> None:
    """Each promoted scenario's declared NON-ML rules must produce at least one
    decision on its real pack -- the degrade-to-empty class that hid the
    geo-velocity crash. ML rules degrade to [] when the bundle is absent, so they
    are excluded; the assertion is that the hand-written detectors fire."""
    non_ml = [r for r in scenario.get("rules", []) if r.get("detector") != "ml-anomaly"]
    if not non_ml:
        pytest.skip("scenario declares only ML rules")
    db = PROJECT_ROOT / scenario["db"]
    if not db.exists():
        pytest.skip(f"pack not seeded: {db}")
    conn = _readonly(db)
    try:
        decisions = rules.evaluate(conn, non_ml, focal=scenario.get("focal"))
    finally:
        conn.close()
    assert decisions, (
        f"{scenario['id']}: declared non-ML rules produced ZERO decisions "
        "(degrade-to-empty regression; see FIX-2026-06-10)"
    )
