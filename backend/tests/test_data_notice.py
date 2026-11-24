"""The header notice for a database that a scenario names and the tree does not hold."""

from __future__ import annotations

import json
from pathlib import Path

from tests._data_notice import missing_data_lines


def _scenario(root: Path, scenario_id: str, db: str) -> None:
    folder = root / "backend" / "scenarios"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{scenario_id}.scenario.json").write_text(
        json.dumps({"id": scenario_id, "db": db}), encoding="utf-8"
    )


def _database(root: Path, rel: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")


def test_absent_replay_database_gets_one_line_with_both_build_commands(tmp_path: Path) -> None:
    _scenario(tmp_path, "card-fraud", "data/replay.db")
    _scenario(tmp_path, "priya-ato", "data/priya-ato.db")
    _database(tmp_path, "data/priya-ato.db")

    lines = missing_data_lines(tmp_path)

    assert len(lines) == 1
    assert lines[0].startswith("DATA NOT BUILT: data/replay.db (scenario card-fraud)")
    assert "will SKIP" in lines[0]
    assert "python -m seed --with-population" in lines[0]
    assert "python -m ml.train --score-only" in lines[0]


def test_another_absent_database_is_named_without_a_build_command(tmp_path: Path) -> None:
    _scenario(tmp_path, "population", "data/population.db")

    lines = missing_data_lines(tmp_path)

    assert lines == [
        "DATA NOT BUILT: data/population.db (scenario population): tests that need it will SKIP."
    ]


def test_no_line_when_every_database_is_present(tmp_path: Path) -> None:
    _scenario(tmp_path, "card-fraud", "data/replay.db")
    _database(tmp_path, "data/replay.db")

    assert missing_data_lines(tmp_path) == []


def test_no_line_without_a_scenarios_folder(tmp_path: Path) -> None:
    assert missing_data_lines(tmp_path) == []


def test_a_database_named_by_two_scenarios_is_reported_once(tmp_path: Path) -> None:
    _scenario(tmp_path, "a-first", "data/shared.db")
    _scenario(tmp_path, "b-second", "data/shared.db")

    lines = missing_data_lines(tmp_path)

    assert len(lines) == 1
    assert "(scenario a-first)" in lines[0]
