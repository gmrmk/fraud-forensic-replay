"""Card-testing precursor detector."""

from __future__ import annotations

import sqlite3

from rules.shared import (
    _CT_MAX_AMOUNT,
    _CT_MIN_COUNT,
    _CT_WINDOW_MIN,
    Decision,
    _minutes_between,
    _probe_bursts,
    _subject_card_rows,
)


def _eval_card_testing(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Card-testing precursor: a rapid burst of small card-not-present
    authorizations. Stolen numbers are validated with tiny charges before the
    real spend, so the detector keys on the burst SHAPE (count, size, gap
    window), never on a single charge and never on the fraud label. Emits one
    decision for the first qualifying burst (the precursor headline)."""
    rows = _subject_card_rows(conn, focal)
    burst = next(iter(_probe_bursts(rows)), None)
    if burst is None:
        return []

    last = burst[-1]
    span_min = _minutes_between(burst[0]["timestamp"], last["timestamp"])
    peak = max(int(r.get("risk_score") or 0) for r in burst)
    inputs = [
        {
            "label": "Probes",
            "value": " · ".join(f"${r['amount']:.2f} {r['merchant_name']}" for r in burst),
        },
        {"label": "Burst window", "value": f"{span_min:.0f} min"},
    ]
    thresholds = [
        {
            "label": "Probe count",
            "actual": str(len(burst)),
            "bound": f">= {_CT_MIN_COUNT} within {_CT_WINDOW_MIN:.0f}-min gaps",
            "breached": True,
        },
        {
            "label": "Charge size",
            "actual": f"max ${max(float(r['amount']) for r in burst):.2f}",
            "bound": f"<= ${_CT_MAX_AMOUNT:.2f} each",
            "breached": True,
        },
    ]
    evidence = [
        {
            "label": f"Probe {i + 1}",
            "value": f"${r['amount']:.2f} CNP - {r['merchant_name']} "
            f"(risk {r.get('risk_score', '?')})",
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
                "kind": rule.get("detector", "card-testing"),
                "sop": rule.get("sop", {}),
            },
            subject_path_kind="fraud" if last.get("is_fraud") == 1 else "auth",
            trigger_entity_ids=[r["id"] for r in burst],
            inputs=inputs,
            thresholds=thresholds,
            verdict=rule.get("verdict", "CARD TESTING"),
            decision=rule.get("decision", "FLAG"),
            evidence=evidence,
            severity=round((peak if peak else 500) / 1000.0, 2),
        )
    ]
