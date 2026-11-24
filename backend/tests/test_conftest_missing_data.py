"""On a tree with no data/replay.db, pytest ends with the data notice, not a conftest traceback.

The run happens in a copy of backend/ with no data/ folder next to it, as on a fresh clone or a
bare worker worktree. The copy is the only way to see the real conftest meet a missing file.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
_SKIP = shutil.ignore_patterns(
    ".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "*.pyc"
)


def test_pytest_without_replay_db_ends_with_the_notice_not_a_traceback(tmp_path: Path) -> None:
    copy = tmp_path / "backend"
    shutil.copytree(BACKEND, copy, ignore=_SKIP)
    assert not (tmp_path / "data").exists()

    run = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/test_account.py"],
        cwd=copy,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    out = run.stdout + run.stderr

    assert run.returncode != 0
    assert "DATA NOT BUILT: data/replay.db" in out
    assert "python -m seed --with-population" in out
    assert "python -m ml.train --score-only" in out
    assert "ImportError while loading conftest" not in out
    assert "Traceback" not in out
