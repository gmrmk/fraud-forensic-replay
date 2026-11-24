"""Shared fixtures for the backend test suite.

`main` is imported inside the fixtures, never at module top: importing it builds the scenario
registry, which raises when data/replay.db is absent, and that traceback would stop pytest here
before the data notice (tests/_data_notice.py) could say how to build the file.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import seed
from db import init_db
from scenario_registry import BUILD_HINT, REPLAY_DB
from tests._data_notice import missing_data_lines

_ROOT = Path(__file__).resolve().parents[2]


def pytest_report_header(config: pytest.Config) -> list[str]:
    """Name every scenario database the tree lacks before the first test runs."""
    return missing_data_lines(_ROOT)


def pytest_sessionstart(session: pytest.Session) -> None:
    """No replay.db means `import main` raises in every test module: end the run with one
    message that carries the build command, instead of one collection error per module."""
    if not (_ROOT / REPLAY_DB).exists():
        pytest.exit(
            f"DATA NOT BUILT: {REPLAY_DB} is the default scenario's database, so the app and "
            f"the tests cannot start without it. {BUILD_HINT}",
            returncode=4,
        )


@pytest.fixture
def seeded_db(tmp_path, monkeypatch):
    """Seed a temp DB and point main.connect at it for the test."""
    import main

    db = tmp_path / "tx-test.db"
    init_db(db)
    seed.main(db_path=db)

    real_connect = main.connect

    def patched_connect():
        return real_connect(db)

    monkeypatch.setattr(main, "connect", patched_connect)
    return db


@pytest.fixture(autouse=True)
def reset_clock():
    """Reset the in-memory clock broker before each test for order-independence."""
    import main

    main._clock = {"t": None, "playing": False, "rate": 1.0}
    yield
