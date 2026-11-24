"""Concordia freeze gate must reject degenerate packs, not just print them.

A degenerate pack (zero transactions, or a >50% drop rate) should cause the gate
to raise ValueError so the caller (cli.main) returns a non-zero exit code rather
than silently printing a summary and returning 0.

Tests here exercise _check_freeze_gate directly (the new asserting layer that
_print_freeze_gate delegates to).
"""

from __future__ import annotations

import pytest

from generators.concordia.cli import _check_freeze_gate


def _summary(transactions=5, logins=3, transfers=1, account_events=1, dropped=0) -> dict:
    return {
        "transactions": transactions,
        "logins": logins,
        "transfers": transfers,
        "account_events": account_events,
        "dropped": dropped,
        "db_path": "/tmp/fake.db",
        "manifest_path": "/tmp/fake.json",
    }


def test_valid_pack_passes_gate() -> None:
    """A pack with transactions and a low drop rate clears the gate silently."""
    _check_freeze_gate(readback_count=10, summary=_summary(transactions=9, dropped=1))


def test_zero_transactions_fails_gate() -> None:
    """A pack with no transactions is degenerate - every action was dropped."""
    with pytest.raises(ValueError, match="transaction"):
        _check_freeze_gate(readback_count=6, summary=_summary(transactions=0, dropped=6))


def test_high_drop_rate_fails_gate() -> None:
    """More than 50% of actions dropped means the translator/validator is broken."""
    with pytest.raises(ValueError, match="drop"):
        _check_freeze_gate(readback_count=10, summary=_summary(transactions=4, dropped=6))


def test_drop_rate_exactly_at_threshold_passes() -> None:
    """50% drop rate is the boundary - exactly 50% must still pass."""
    _check_freeze_gate(readback_count=10, summary=_summary(transactions=5, dropped=5))


def test_empty_readback_with_zero_transactions_fails() -> None:
    """Zero readback actions producing zero transactions is always degenerate."""
    with pytest.raises(ValueError, match="transaction"):
        _check_freeze_gate(readback_count=0, summary=_summary(transactions=0, dropped=0))
