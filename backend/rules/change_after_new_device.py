"""Change-after-new-device detector: a change made within a window after a sign-in in the same
session, from a device never seen on that subject, on a listed network type. What the change is
(an API key, a bank account) is the manifest's business: it names the two kinds, the fields
and the wording. The pure core reads two row lists; the evaluator reads them from the active
manifest's nodes."""

from __future__ import annotations

import logging
import sqlite3
from collections import defaultdict
from datetime import datetime

from rules.shared import Decision, manifest_rows

_REQUIRED = (
    "signin_kind",
    "change_kind",
    "subject_field",
    "session_field",
    "device_field",
    "ip_type_field",
    "ip_types",
    "window_min",
)


def _ts(row: dict) -> datetime:
    return datetime.fromisoformat(row["timestamp"])


def changes_after_new_device(
    signins: list[dict], changes: list[dict], rule: dict
) -> list[Decision]:
    """One Decision per change whose latest earlier sign-in in the same session, by the same
    subject, came from a device new to that subject on a listed network type, inside the window."""
    missing = [k for k in _REQUIRED if k not in rule]
    if missing:
        logging.getLogger(__name__).warning(
            "rule %r lacks %s; skipping", rule.get("id"), ", ".join(missing)
        )
        return []
    subj, sess, dev, ipf = (
        rule[k] for k in ("subject_field", "session_field", "device_field", "ip_type_field")
    )
    window = float(rule["window_min"])
    by_session: dict[str, list[dict]] = defaultdict(list)
    for s in sorted(signins, key=_ts):
        by_session[s.get(sess) or ""].append(s)
    out: list[Decision] = []
    for c in sorted(changes, key=_ts):
        prior = [s for s in by_session.get(c.get(sess) or "\0", []) if _ts(s) <= _ts(c)]
        if not prior:
            continue
        s = prior[-1]
        gap = (_ts(c) - _ts(s)).total_seconds() / 60.0
        new_device = not any(
            o.get(subj) == s.get(subj) and o.get(dev) == s.get(dev) and _ts(o) < _ts(s)
            for o in signins
        )
        if (
            s.get(subj) != c.get(subj)
            or gap > window
            or s.get(ipf) not in rule["ip_types"]
            or not new_device
        ):
            continue
        out.append(_decision(rule, s, c, gap))
    return out


def _decision(rule: dict, s: dict, c: dict, gap: float) -> Decision:
    dev, ipf, sess = rule["device_field"], rule["ip_type_field"], rule["session_field"]
    return Decision(
        id=f"decision:{rule['id']}:{c['id']}",
        rule={
            "id": rule["id"],
            "label": rule.get("label", rule["id"]),
            "kind": rule["detector"],
            "sop": rule.get("sop", {}),
        },
        subject_path_kind=rule["change_kind"],
        trigger_entity_ids=[s["id"], c["id"]],
        inputs=[
            {"label": "Device", "value": str(s.get(dev))},
            {"label": "Network type", "value": str(s.get(ipf))},
            {"label": "Session", "value": str(s.get(sess))},
            {"label": "Sign-in to change", "value": f"{gap:.0f} min"},
        ],
        thresholds=[
            {
                "label": "Minutes from sign-in to change",
                "actual": f"{gap:.0f}",
                "bound": f"<= {float(rule['window_min']):.0f}",
                "breached": True,
            },
            {
                "label": "Device seen before on this subject",
                "actual": "no",
                "bound": "no",
                "breached": True,
            },
            {
                "label": "Network type",
                "actual": str(s.get(ipf)),
                "bound": " or ".join(rule["ip_types"]),
                "breached": True,
            },
        ],
        verdict=rule.get("verdict", "CHANGE AFTER NEW DEVICE"),
        decision=rule.get("decision", "FLAG"),
        evidence=[
            {
                "label": "Sign-in",
                "value": f"{s.get(dev)} ({s['timestamp']})",
                "entity_ref": s["id"],
            },
            {
                "label": rule.get("change_label", "Change"),
                "value": c["timestamp"],
                "entity_ref": c["id"],
            },
        ],
        severity=float(rule.get("severity", 0.9)),
    )


def _eval_change_after_new_device(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Reads the manifest nodes the rule names. Unscoped: these packs have no focal subject."""
    if any(k not in rule for k in ("signin_kind", "change_kind")):
        return changes_after_new_device([], [], rule)  # logs the missing keys
    return changes_after_new_device(
        manifest_rows(conn, rule["signin_kind"]), manifest_rows(conn, rule["change_kind"]), rule
    )
