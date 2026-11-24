"""The rule that lets a test skip when a file the public copy leaves out is not in the tree.

`require_files` (tests/_left_out.py) skips, with a reason that names each absent file, and does
nothing when every file is there. These cases pin the reason's words, the repository-relative
name, and that a file which is present never skips. They read no file of the repository beyond
this one."""

from __future__ import annotations

from pathlib import Path

import pytest

from db import PROJECT_ROOT
from tests._left_out import require_files


def _skip_message(*paths: Path, why: str = "") -> str:
    with pytest.raises(pytest.skip.Exception) as caught:
        require_files(*paths, why=why)
    return str(caught.value.msg)


def _skips(*paths: Path) -> bool:
    """True when the call skips. A skip raised straight in a test would end it as skipped, so a
    case that wants "does not skip" must catch it here."""
    try:
        require_files(*paths)
    except pytest.skip.Exception:
        return True
    return False


def test_a_file_that_is_present_does_not_skip():
    assert not _skips(Path(__file__))
    assert not _skips(Path(__file__), Path(__file__).parent)


def test_no_path_at_all_does_not_skip():
    assert not _skips()


def test_one_absent_path_among_present_ones_skips():
    assert _skips(Path(__file__), PROJECT_ROOT / "docs" / "decisions" / "NOT-IN-THIS-TREE.md")


def test_an_absent_file_skips_and_the_reason_names_it_from_the_repository_root():
    absent = PROJECT_ROOT / "docs" / "decisions" / "NOT-IN-THIS-TREE.md"
    assert not absent.exists()
    reason = _skip_message(absent)
    assert reason.startswith("docs/decisions/NOT-IN-THIS-TREE.md is not in this tree")
    assert "public copy leaves it out" in reason


def test_the_reason_names_only_the_files_that_are_absent():
    absent = PROJECT_ROOT / "backend" / "scenarios" / "none-of-these.scenario.json"
    reason = _skip_message(Path(__file__), absent)
    assert "backend/scenarios/none-of-these.scenario.json" in reason
    assert Path(__file__).name not in reason


def test_two_absent_files_are_both_named_and_the_verb_agrees():
    first = PROJECT_ROOT / "backend" / "scenarios" / "first-absent.scenario.json"
    second = PROJECT_ROOT / "backend" / "scenarios" / "second-absent.scenario.json"
    reason = _skip_message(first, second)
    assert "first-absent.scenario.json" in reason and "second-absent.scenario.json" in reason
    assert " are not in this tree" in reason
    assert "public copy leaves them out" in reason


def test_a_note_for_the_reader_follows_the_reason():
    absent = PROJECT_ROOT / "docs" / "decisions" / "NOT-IN-THIS-TREE.md"
    reason = _skip_message(absent, why="the fence has nothing to read without it")
    assert reason.endswith(": the fence has nothing to read without it")


def test_a_path_outside_the_repository_is_named_as_it_is(tmp_path: Path):
    absent = tmp_path / "elsewhere.json"
    assert absent.as_posix() in _skip_message(absent)


def test_a_file_that_is_there_but_wrong_is_not_the_helpers_business(tmp_path: Path):
    """The helper looks only for presence: reading a bad file still fails in the test."""
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert not _skips(bad)
