"""Skip a test, with a reason, when a file it reads is not in the tree.

The public copy leaves some files of the repository out (the profiles file, one scenario file).
A test that reads such a file calls `require_files` at the point where it reads: when a file is
absent the test is skipped and the reason names the file; when every file is there the call does
nothing and the test runs exactly as it does in the working repository.

This is not a general "skip on any error". It looks only at presence. A file that is there but
wrong still fails the test that reads it, and a file the copy is meant to hold must not be passed
here, or its absence would be hidden.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from db import PROJECT_ROOT


def _named(path: Path) -> str:
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def require_files(*paths: Path, why: str = "") -> None:
    """Skip the running test, naming each path that does not exist. `why` says what the test
    cannot prove without the file, for a test that would otherwise skip all it was written to
    prove."""
    absent = [_named(p) for p in paths if not p.exists()]
    if not absent:
        return
    one = len(absent) == 1
    reason = (
        f"{', '.join(absent)} {'is' if one else 'are'} not in this tree; "
        f"the public copy leaves {'it' if one else 'them'} out"
    )
    pytest.skip(f"{reason}: {why}" if why else reason)
