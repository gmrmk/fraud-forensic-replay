"""Account-change velocity detector."""

from __future__ import annotations

import sqlite3

from rules.shared import Decision, _change_phrase, _gap_runs, _minutes_between

_ACV_WINDOW_MIN = 120.0  # changes chained within 2h = one compromise episode
_ACV_MIN_COUNT = 2  # a single profile change is routine, never a finding
_ACV_HIGH_COUNT = 3  # 3+ rapid changes (recovery channels rewritten) = high degree
_ACV_SEVERITY = {"elevated": 0.6, "high": 0.85}


def _partition_by_session(rows: list[dict]) -> list[list[dict]]:
    """Group timestamp-ordered rows by session_id, preserving each session's
    first-appearance order so burst selection stays deterministic. A null/empty
    session_id is its OWN bucket per row - a missing session never chains edits
    together. Each returned slice stays chronological because rows arrive sorted."""
    buckets: dict[str, list[dict]] = {}
    order: list[str] = []
    orphans: list[list[dict]] = []
    for r in rows:
        sid = r.get("session_id") or ""
        if not sid:
            orphans.append([r])  # each session-less row is isolated, never chained
            continue
        if sid not in buckets:
            buckets[sid] = []
            order.append(sid)
        buckets[sid].append(r)
    return [buckets[sid] for sid in order] + orphans


def _eval_account_change_velocity(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Compromise-velocity rule: a rapid burst of account-profile changes (email,
    phone, password, payee) inside one window. A single change is routine account
    maintenance; the tell is the VELOCITY: an attacker who holds the session
    rewriting the recovery channels at once to lock the victim out. Keys on the
    burst SHAPE (count within a gap window), never one row, and grades the degree
    (elevated / high) by count. Scoped to the manifest focal account when declared.
    Degrades to [] on a scenario DB without account_events (schema-agnostic),
    never raises."""
    account_id = (focal or {}).get("account_id")
    try:
        if account_id:
            rows = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM account_events WHERE account_id = ? ORDER BY timestamp, id",
                    (account_id,),
                ).fetchall()
            ]
        else:
            rows = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM account_events ORDER BY timestamp, id"
                ).fetchall()
            ]
    except sqlite3.OperationalError:
        return []  # scenario DB without account_events - schema-agnostic degrade

    # The SOP keys the burst on ONE session ("in one session"): an attacker who
    # holds a single session rewrites the recovery channels at once. Two legitimate
    # edits across a normal sign-out/sign-in can fall inside the gap window yet be
    # unrelated, so chain a run only across rows that SHARE a session_id. We
    # pre-partition here rather than touching the shared _gap_runs, which is also
    # used by card_testing and skimmer_signature where session has no meaning.
    # rows arrive timestamp-ordered, so each per-session slice stays chronological.
    burst = next(
        (
            run
            for session_rows in _partition_by_session(rows)
            for run in _gap_runs(session_rows, _ACV_WINDOW_MIN)
            if len(run) >= _ACV_MIN_COUNT
        ),
        None,
    )
    if burst is None:
        return []

    degree = "high" if len(burst) >= _ACV_HIGH_COUNT else "elevated"
    last = burst[-1]
    span_min = _minutes_between(burst[0]["timestamp"], last["timestamp"])
    inputs = [
        {"label": "Changes", "value": " · ".join(_change_phrase(r) for r in burst)},
        {"label": "Window", "value": f"{span_min:.0f} min"},
        {"label": "Session", "value": str(burst[0].get("session_id") or "-")},
    ]
    thresholds = [
        {
            "label": "Change count",
            "actual": str(len(burst)),
            "bound": f">= {_ACV_MIN_COUNT} within {_ACV_WINDOW_MIN:.0f}-min gaps",
            "breached": True,
        },
        {
            "label": "Compromise degree",
            "actual": degree,
            "bound": f"high at >= {_ACV_HIGH_COUNT}",
            "breached": degree == "high",
        },
    ]
    evidence = [
        {
            "label": f"Change {i + 1}",
            "value": f"{_change_phrase(r)} ({r['timestamp']})",
            "entity_ref": r["id"],
        }
        for i, r in enumerate(burst)
    ]
    return [
        Decision(
            id=f"decision:{rule['id']}:{last['id']}",
            rule={
                "id": rule["id"],
                "label": rule.get("label", rule["id"]),
                "kind": rule.get("detector", "account-change-velocity"),
                "sop": rule.get("sop", {}),
            },
            subject_path_kind="account_event",
            trigger_entity_ids=[r["id"] for r in burst],
            inputs=inputs,
            thresholds=thresholds,
            verdict=rule.get("verdict", "COMPROMISE VELOCITY"),
            decision=rule.get("decision", "STEP-UP"),
            evidence=evidence,
            severity=_ACV_SEVERITY[degree],
        )
    ]
