"""Impossible-travel (geo-velocity) detector."""

from __future__ import annotations

import math
import sqlite3

from arcs import (
    MIN_IMPOSSIBLE_DISTANCE_MI,
    SPEED_THRESHOLD_MPH,
    detect_arcs,
    haversine_miles,
)
from rules.shared import (
    Decision,
    _card_rows,
    _elapsed_human,
    _gather_evidence,
    _landing_cluster,
)

# The impossible-travel severity floor (0..1), scaled by how far the implied speed
# clears the bound. A leg that is card-present at both ends above the speed bound is
# physically impossible from the geometry alone (detect_arcs only emits such arcs),
# so even a zero/absent risk_score (the model-generated concordia pack seeds none)
# must not collapse severity to 0.0. A flat floor would tie a 630 mph
# artifact with a 3,000 mph leap and flatten the severity ranking, so the floor runs
# from 0.60 at the 600 mph bound to 0.90 at 2,000 mph and above. Label-free: speed
# comes from the arc. Authored packs whose landing cluster carries real risk scores
# (Lagos peaks at 981) stay unchanged: the peak risk dominates the floor.
_FLOOR_AT_BOUND = 0.6
_FLOOR_SPAN = 0.3
_FLOOR_FULL_MPH_OVER_BOUND = 1400.0  # full floor from 2,000 mph (600 + 1,400)


def _eval_geo_velocity(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Impossible-travel rule: reuse detect_arcs over the SUBJECT's transactions;
    build one Decision per detected impossible arc, hero (max-speed) first.

    One Decision per arc: the globe draws one arc per
    impossible pair, so a single hero-only Decision leaves every non-hero labeled
    txn without a matching pill. Each arc becomes its own Decision keyed to its
    pair's trigger ids, so every labeled endpoint has a pill. A single-arc pack
    still yields exactly one Decision (the authored card-fraud UX is unchanged).

    Scoped to the manifest focal card when declared: on a population DB,
    consecutive card-present rows belong to DIFFERENT cards, and a same-timestamp
    cross-card pair implies infinite speed - not travel at all
    (FIX-2026-06-10-geo-velocity-overflow-population-db). Non-finite arcs are
    additionally skipped outright: a zero-elapsed pair is never the headline."""
    card_id = (focal or {}).get("card_id")
    if card_id:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM transactions WHERE card_id = ? ORDER BY timestamp",
                (card_id,),
            ).fetchall()
        ]
        row_groups = [rows]
    else:
        rows = [
            dict(r)
            for r in conn.execute("SELECT * FROM transactions ORDER BY timestamp").fetchall()
        ]
        # Impossible travel is PER-CARD: consecutive rows across DIFFERENT cards are
        # not one journey. Detect arcs within each card and union - else an unscoped
        # multi-card DB (replay.db carries 301 cards / 43k rows) yields ~30k spurious
        # cross-card arcs, and one Decision each. Grouping preserves per-card
        # timestamp order (rows are already globally ordered).
        groups: dict[str | None, list[dict]] = {}
        for r in rows:
            groups.setdefault(r.get("card_id"), []).append(r)
        row_groups = list(groups.values())
    arcs = [
        a
        for group in row_groups
        for a in detect_arcs(group)
        if math.isfinite(a["implied_speed_mph"])
    ]
    if not arcs:
        return []
    # Hero (max implied speed) first, so the headline arc leads the pill list; the
    # rest follow in chronological (detection) order. is_hero was already stamped
    # by detect_arcs on the same max-speed arc (per group).
    ordered = sorted(arcs, key=lambda a: (not a["is_hero"],))
    by_id = {r["id"]: r for r in rows}
    cards: dict[str, list[dict]] = {}  # each card's rows, loaded once per evaluation
    return [_build_decision(conn, rule, arc, by_id, cards) for arc in ordered]


def _build_decision(
    conn: sqlite3.Connection,
    rule: dict,
    arc: dict,
    by_id: dict,
    cards: dict[str, list[dict]],
) -> Decision:
    """Build one IMPOSSIBLE TRAVEL Decision from a single impossible arc's two
    endpoint transactions. `cards` caches `_card_rows` per card across arcs."""
    prev_id, curr_id = arc["id"].split("->", 1)
    prev, curr = by_id[prev_id], by_id[curr_id]
    if curr["card_id"] not in cards:
        cards[curr["card_id"]] = _card_rows(conn, curr["card_id"])
    card = cards[curr["card_id"]]

    dist = haversine_miles(
        prev["merchant_lat"], prev["merchant_lng"], curr["merchant_lat"], curr["merchant_lng"]
    )
    speed = arc["implied_speed_mph"]
    # Display-only: fraud vs auth path colouring. Evidence and severity never read it.
    subject_kind = "fraud" if curr.get("is_fraud") == 1 else "auth"

    inputs = [
        {
            "label": "Last card-present swipe",
            "value": f'{prev["merchant_name"]} ({prev.get("merchant_country", "US")})',
        },
        {
            "label": "Next authorization",
            "value": f'{curr["merchant_name"]} ({curr.get("merchant_country", "US")})',
        },
        {"label": "Elapsed", "value": _elapsed_human(prev["timestamp"], curr["timestamp"])},
        {"label": "Great-circle distance", "value": f"{round(dist):,} mi"},
    ]
    thresholds = [
        {
            "label": "Implied travel speed",
            "actual": f"{round(speed)} mph",
            "bound": f"{round(SPEED_THRESHOLD_MPH)} mph jet-cruise",
            "breached": speed > SPEED_THRESHOLD_MPH,
        },
        {
            "label": "Min separation",
            "actual": f"{round(dist):,} mi",
            "bound": f"{round(MIN_IMPOSSIBLE_DISTANCE_MI)} mi",
            "breached": False,
        },
        {
            "label": "Card-present both ends",
            "actual": "true",
            "bound": "no air-gap possible",
            "breached": True,
        },
    ]
    severity = _severity(card, curr, speed)

    return Decision(
        id=f"decision:{rule['id']}:{prev_id}:{curr_id}",
        rule={
            "id": rule["id"],
            "label": rule.get("label", rule["id"]),
            "kind": rule.get("detector", "geo-velocity"),
            # The rule's standing SOP (what it is + why it fires) - a property
            # of the rule, identical for every instance; the panel leads with it.
            "sop": rule.get("sop", {}),
        },
        subject_path_kind=subject_kind,
        trigger_entity_ids=[prev_id, curr_id],
        inputs=inputs,
        thresholds=thresholds,
        verdict=rule.get("verdict", "IMPOSSIBLE TRAVEL"),
        decision=rule.get("decision", "DECLINE"),
        evidence=_gather_evidence(card, curr),
        severity=severity,
    )


def _severity(card_rows: list[dict], curr: dict, speed: float) -> float:
    """Decision severity is forensic confidence, NOT the arc's over-threshold ratio.
    Impossible travel with card-present both ends is physically impossible whether
    it implies 674 mph or 6,000 - so the geometric (speed-600)/span score (0.12 at
    674 mph) understates it. Use the landing cluster's peak risk score (the issuer's
    authorization-time score, a legitimate input): the Lagos cluster peaks at
    981/1000 -> 0.98.

    The floor needs no label: every arc this detector builds is card-present at
    both ends above the speed bound, so the geometry alone guarantees high severity
    even if the pack carries no risk scores (the model-generated
    concordia pack seeds risk_score=0, so the peak is 0 - not None - and without the
    floor severity collapsed to 0.0). The floor scales with the implied speed
    (`_FLOOR_AT_BOUND` at the bound up to `_FLOOR_AT_BOUND + _FLOOR_SPAN` at
    2,000 mph) so a barely-over-the-bound artifact ranks below a clear leap. Real
    risk scores above the floor still dominate."""
    peak_risk = max(
        (
            int(r["risk_score"])
            for r in _landing_cluster(card_rows, curr)
            if r.get("risk_score") is not None
        ),
        default=0,
    )
    over = min(1.0, (speed - SPEED_THRESHOLD_MPH) / _FLOOR_FULL_MPH_OVER_BOUND)
    floor = _FLOOR_AT_BOUND + _FLOOR_SPAN * over
    return round(max(peak_risk / 1000.0, floor), 2)
