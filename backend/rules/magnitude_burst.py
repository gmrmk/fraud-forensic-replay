"""Magnitude-burst detector: a subject whose hourly value runs at a multiple of its group's own
recent median for several consecutive hours.

What the value is (token spend, transfers, requests) is the manifest's business: the rule names
the kind, the fields, the numbers and the wording. The pure core reads one row list; the
evaluator reads it from the active manifest's node. No label is read: the rows this detector
is used on carry none.

The rule, exactly. Buckets are walked in time order. A bucket is hot when its value is at
least `floor` and at least `multiple` times its baseline. The baseline is the median of the
positive, not-hot buckets of the same `baseline_field` group in the `baseline_hours` before
it: the group's own recent history, the subject's included. Hot buckets are left out, so a
long burst never raises its own baseline. A run is a maximal sequence of one subject's hot
buckets in consecutive hours; a run of at least `min_run` buckets is one Decision, whose
triggers are every hour of the run in time order (as the other burst detectors do).

ponytail: buckets are one hour wide (BUCKET). A pack with another bucket width needs a rule
key for it; none exists yet.
"""

from __future__ import annotations

import logging
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median

from rules.shared import Decision, manifest_rows

log = logging.getLogger(__name__)

BUCKET = timedelta(hours=1)
_REQUIRED = (
    "kind",
    "subject_field",
    "baseline_field",
    "value_field",
    "multiple",
    "min_run",
    "floor",
    "baseline_hours",
)


def _ts(row: dict) -> datetime:
    return datetime.fromisoformat(row["timestamp"])


def _positive(value: object) -> float | None:
    """The value as a positive number, or None for anything else (zero, missing, text)."""
    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        return None
    return float(value)


def bursts(rows: list[dict], rule: dict) -> list[Decision]:
    """One Decision per run of hot buckets that is at least `min_run` long."""
    missing = [k for k in _REQUIRED if k not in rule]
    if missing:
        log.warning("rule %r lacks %s; skipping", rule.get("id"), ", ".join(missing))
        return []
    subject_field, group_field, value_field = (
        rule[k] for k in ("subject_field", "baseline_field", "value_field")
    )
    multiple, floor, min_run = float(rule["multiple"]), float(rule["floor"]), int(rule["min_run"])
    lookback = timedelta(hours=float(rule["baseline_hours"]))

    history: dict[object, list[tuple[datetime, float]]] = defaultdict(list)
    hot: dict[object, list[dict]] = defaultdict(list)
    unjudged: set[object] = set()
    for row in sorted(rows, key=lambda r: (r["timestamp"], str(r.get("id")))):
        value = _positive(row.get(value_field))
        if value is None:
            continue
        at, group = _ts(row), row.get(group_field)
        past = [v for when, v in history[group] if at - lookback <= when < at]
        baseline = median(past) if past else None
        if baseline is not None and value >= floor and value >= multiple * baseline:
            hot[row.get(subject_field)].append(
                {"row": row, "at": at, "value": value, "baseline": baseline}
            )
            continue
        if baseline is None and value >= floor and group not in unjudged:
            unjudged.add(group)
            log.info(
                "rule %r: no baseline for %s=%r at %s; not judged",
                rule.get("id"),
                group_field,
                group,
                row["timestamp"],
            )
        history[group].append((at, value))

    out: list[Decision] = []
    for subject, buckets in hot.items():
        run: list[dict] = []
        for b in buckets:
            if run and b["at"] - run[-1]["at"] != BUCKET:
                if len(run) >= min_run:
                    out.append(_decision(rule, subject, run))
                run = []
            run.append(b)
        if len(run) >= min_run:
            out.append(_decision(rule, subject, run))
    return sorted(out, key=lambda d: d.evidence[0]["value"])


def _decision(rule: dict, subject: object, run: list[dict]) -> Decision:
    first, last = run[0]["row"], run[-1]["row"]
    prefix = rule.get("unit_prefix", "")
    value_label = rule.get("value_label", "Value")
    peak = max(run, key=lambda b: b["value"] / b["baseline"])
    peak_multiple = peak["value"] / peak["baseline"]
    peak_value = max(b["value"] for b in run)
    total = sum(b["value"] for b in run)
    hours = float(rule["baseline_hours"])
    return Decision(
        id=f"decision:{rule['id']}:{first['id']}",
        rule={
            "id": rule["id"],
            "label": rule.get("label", rule["id"]),
            "kind": rule["detector"],
            "sop": rule.get("sop", {}),
        },
        subject_path_kind=rule["kind"],
        # Every hour of the run, the last hour last: the app treats the last trigger as the
        # event the rule queued, and shows the finding on any record that is a trigger.
        trigger_entity_ids=[b["row"]["id"] for b in run],
        inputs=[
            {"label": rule.get("subject_label", "Subject"), "value": str(subject)},
            {"label": "Run", "value": f"{len(run)} hour{'s' if len(run) != 1 else ''}"},
            {"label": "Peak", "value": f"{peak_multiple:.0f} times the baseline"},
            {"label": "Total", "value": f"{prefix}{total:,.2f}"},
        ],
        thresholds=[
            {
                "label": "Peak multiple of the baseline",
                "actual": f"{peak_multiple:.0f}",
                "bound": f">= {float(rule['multiple']):.0f}",
                "breached": True,
            },
            {
                "label": "Consecutive hours",
                "actual": str(len(run)),
                "bound": f">= {int(rule['min_run'])}",
                "breached": True,
            },
            {
                "label": f"Peak {value_label.lower()}",
                "actual": f"{prefix}{peak_value:,.2f}",
                "bound": f">= {prefix}{float(rule['floor']):,.2f}",
                "breached": True,
            },
        ],
        verdict=rule.get("verdict", "BURST"),
        decision=rule.get("decision", "REVIEW"),
        evidence=[
            {"label": "First hour", "value": first["timestamp"], "entity_ref": first["id"]},
            {"label": "Last hour", "value": last["timestamp"], "entity_ref": last["id"]},
            {
                "label": "Baseline",
                "value": (
                    f"{prefix}{run[0]['baseline']:,.2f} per hour "
                    f"(median of the prior {hours:.0f} hours)"
                ),
            },
        ],
        severity=float(rule.get("severity", 0.8)),
    )


def _eval_magnitude_burst(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Reads the manifest node the rule names. Unscoped: these packs have no focal subject."""
    if "kind" not in rule:
        return bursts([], rule)  # logs the missing keys
    return bursts(manifest_rows(conn, rule["kind"]), rule)
