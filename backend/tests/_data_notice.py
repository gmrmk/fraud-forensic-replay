"""Say up front which scenario databases are absent, so a skipped test is not a silent one.

Several tests skip when the database of a scenario is not in the tree. `data/replay.db` is
never tracked: a fresh clone has to build it. conftest prints these lines in pytest's header.
"""

from __future__ import annotations

import json
from pathlib import Path

from scenario_registry import BUILD_HINT, REPLAY_DB

# The words come from scenario_registry, which also puts them in the missing-database error.
REPLAY_RECIPE = " " + BUILD_HINT


def missing_data_lines(root: Path) -> list[str]:
    """One line per database that a scenario file under `root` names and `root` lacks."""
    lines: list[str] = []
    seen: set[str] = set()
    for path in sorted((root / "backend" / "scenarios").glob("*.scenario.json")):
        manifest = json.loads(path.read_text(encoding="utf-8"))
        db = manifest.get("db")
        if not isinstance(db, str) or db in seen or (root / db).exists():
            continue
        seen.add(db)
        line = (
            f"DATA NOT BUILT: {db} (scenario {manifest.get('id')}): "
            "tests that need it will SKIP."
        )
        lines.append(line + REPLAY_RECIPE if db == REPLAY_DB else line)
    return lines
