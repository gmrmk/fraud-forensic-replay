"""_kill_chain_evidence() median must be scoped to the focal account.

On a population DB the unscoped median crosses account boundaries - a foreign
account's cheap P2P transfers can drag the median down, making the multiple
look artificially large (or real small). The fix is an account_id filter on
the query that reads the baseline amounts.
"""

from __future__ import annotations

import sqlite3

from db import connect, init_db
from rules.shared import _kill_chain_evidence


def _seed_two_account_transfers(
    dbfile, focal_account: str, other_account: str
) -> sqlite3.Connection:
    """Two accounts in one DB.
    - focal_account: one wire (fraud, $50 000) + one benign tamsinmere ($200)
    - other_account: 99 benign tamsinmere transfers at $1 each

    Without the account_id filter the global median is dominated by other_account's
    $1 transfers, making the multiple ~50 000x instead of the honest ~250x.
    With the filter the median is over focal_account's own $200 transfer -> ~250x.
    """
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")

    # Focal account: one benign $200 tamsinmere + one fraud $50 000 wire
    conn.execute(
        "INSERT INTO transfers (id, account_id, timestamp, amount, payee_id, "
        "rail, status, session_id, is_fraud) VALUES "
        "('tr-focal-benign', ?, '2026-05-01T09:00:00Z', 200.0, "
        "'payee-1', 'tamsinmere', 'sent', '', 0)",
        (focal_account,),
    )
    conn.execute(
        "INSERT INTO transfers (id, account_id, timestamp, amount, payee_id, "
        "rail, status, session_id, is_fraud, decline_reason) VALUES "
        "('tr-focal-wire', ?, '2026-05-25T10:00:00Z', 50000.0, "
        "'payee-new', 'wire', 'blocked', 'sess-takeover', 1, 'fraud_hold')",
        (focal_account,),
    )

    # Other account: 99 benign $1 tamsinmere transfers - these pollute the unscoped median
    for i in range(99):
        conn.execute(
            "INSERT INTO transfers (id, account_id, timestamp, amount, payee_id, "
            "rail, status, session_id, is_fraud) VALUES "
            "(?, ?, '2026-04-01T08:00:00Z', 1.0, 'payee-other', 'tamsinmere', 'sent', '', 0)",
            (f"tr-other-{i:03d}", other_account),
        )

    conn.commit()
    return conn


def test_kill_chain_median_scoped_to_focal_account(tmp_path):
    """The multiple must reflect the FOCAL account's own median, not the population.

    focal_account has one benign tamsinmere ($200) and one fraud wire ($50 000).
    other_account has 99 benign $1 tamsinmere transfers.

    Unscoped median = ~$1 -> multiple ~50 000x  (wrong: foreign data)
    Scoped median   = $200 -> multiple ~250x     (correct: own history)
    """
    focal = "acct-priya"
    other = "acct-noise"
    conn = _seed_two_account_transfers(tmp_path / "rml15.db", focal, other)
    try:
        # We need the session that contains the wire
        ev = _kill_chain_evidence(conn, "sess-takeover")
    finally:
        conn.close()

    # There must be an "Amount vs baseline" evidence entry
    baseline_ev = next((e for e in ev if e.get("label") == "Amount vs baseline"), None)
    assert baseline_ev is not None, f"expected 'Amount vs baseline' in evidence, got: {ev}"

    # The multiple must be ~250x (focal median $200), NOT ~50 000x (global median $1)
    # We accept 100x-500x as the valid range for a $200 focal median.
    value = baseline_ev["value"]
    # Extract the 'Nx' token from the string, e.g. "... 250x the account's median ..."
    import re

    m = re.search(r"([\d,]+)x the account", value)
    assert m is not None, f"could not parse multiple from: {value!r}"
    multiple = float(m.group(1).replace(",", ""))
    assert multiple < 1000, (
        f"multiple {multiple:.0f}x is too high - cross-account pollution suspected "
        f"(expected ~250x for a $200 focal median). Evidence: {value!r}"
    )
    assert multiple > 50, f"multiple {multiple:.0f}x is too low - median filter too aggressive"
