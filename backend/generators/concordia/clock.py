# backend/generators/concordia/clock.py
"""Maps a sim step index to a wall-clock ISO-8601 timestamp. Concordia gives only
step ordering (its log timestamp is always ''), so the generator owns time."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class ScenarioClock:
    start: str  # ISO-8601 with offset, e.g. "2026-05-27T08:00:00-05:00"
    step_minutes: int = 6

    def ts_for(self, step: int) -> str:
        base = datetime.fromisoformat(self.start)
        return (base + timedelta(minutes=self.step_minutes * step)).isoformat()
