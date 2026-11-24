"""Skimmer-signature (counterfeit card) detector."""

from __future__ import annotations

import sqlite3

from rules.shared import Decision, _gap_runs, _minutes_between, _subject_card_rows

_SK_MIN_RUN = 3  # legitimate fallback is a singleton; a run is the tell
_SK_WINDOW_MIN = 60.0  # max gap between consecutive fallbacks inside one run
_SK_MIN_CHIP_BASELINE = 5  # the card must be PROVEN chip-capable first


def _eval_skimmer_signature(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Counterfeit-stripe tell: a run of chip-fallback swipes on a card with an
    established chip baseline. A cloned stripe card cannot complete the chip
    exchange, so every use falls back; legitimate fallback happens as isolated
    singletons (a worn reader). Keys on the run, never a single fallback, and
    requires the card to be proven chip-capable first."""
    rows = _subject_card_rows(conn, focal)
    chip_count = sum(1 for r in rows if r.get("pos_entry_mode") == "chip")
    if chip_count < _SK_MIN_CHIP_BASELINE:
        return []
    fallbacks = [r for r in rows if r.get("pos_entry_mode") == "chip_fallback_swipe"]
    run = next((x for x in _gap_runs(fallbacks, _SK_WINDOW_MIN) if len(x) >= _SK_MIN_RUN), None)
    if run is None:
        return []

    last = run[-1]
    span_min = _minutes_between(run[0]["timestamp"], last["timestamp"])
    peak = max(int(r.get("risk_score") or 0) for r in run)
    countries = sorted({str(r.get("merchant_country") or "?") for r in run})
    inputs = [
        {
            "label": "Fallback run",
            "value": " · ".join(f"${r['amount']:.2f} {r['merchant_name']}" for r in run),
        },
        {"label": "Run window", "value": f"{span_min:.0f} min"},
        {"label": "Run countries", "value": ", ".join(countries)},
    ]
    thresholds = [
        {
            "label": "Fallback run",
            "actual": f"{len(run)} in {span_min:.0f} min",
            "bound": f">= {_SK_MIN_RUN} within {_SK_WINDOW_MIN:.0f}-min gaps",
            "breached": True,
        },
        {
            "label": "Chip baseline",
            "actual": f"{chip_count} chip auths",
            "bound": f">= {_SK_MIN_CHIP_BASELINE} (proven chip-capable)",
            "breached": False,
        },
    ]
    evidence = [
        {
            "label": f"Fallback {i + 1}",
            "value": f"${r['amount']:.2f} {r['merchant_name']} "
            f"({r.get('merchant_country', '?')}, risk {r.get('risk_score', '?')})",
            "entity_ref": r["id"],
        }
        for i, r in enumerate(run)
    ]
    return [
        Decision(
            id=f"decision:{rule['id']}:{last['id']}",
            rule={
                "id": rule["id"],
                "label": rule.get("label", rule["id"]),
                "kind": rule.get("detector", "skimmer-signature"),
                "sop": rule.get("sop", {}),
            },
            subject_path_kind="fraud" if last.get("is_fraud") == 1 else "auth",
            trigger_entity_ids=[r["id"] for r in run],
            inputs=inputs,
            thresholds=thresholds,
            verdict=rule.get("verdict", "SKIMMER SIGNATURE"),
            decision=rule.get("decision", "REVIEW"),
            evidence=evidence,
            severity=round((peak if peak else 500) / 1000.0, 2),
        )
    ]
