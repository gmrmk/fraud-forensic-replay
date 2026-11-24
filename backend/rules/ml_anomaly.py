"""ML anomaly detector (complementary layer)."""

from __future__ import annotations

import logging
import sqlite3

from rules.shared import Decision


def _ml_population_context(
    conn: sqlite3.Connection, entity_id: str, model_version: str
) -> tuple[float | None, int]:
    """Read this transaction's score percentile and the scored-population size from
    ml_scores. Returns (None, 0) when the table is absent or unreadable - a fresh
    clone or an older-schema pack may have no ml_scores. The percentile context is
    OPTIONAL; a missing table must degrade here, never propagate an OperationalError
    out of evaluate() and 500 the PRIMARY rules alongside the additive ML layer."""
    try:
        prow = conn.execute(
            "SELECT score_percentile FROM ml_scores WHERE entity_id = ? AND model_version = ?",
            (entity_id, model_version),
        ).fetchone()
        if not prow:
            return None, 0
        total = conn.execute(
            "SELECT COUNT(*) FROM ml_scores WHERE model_version = ?", (model_version,)
        ).fetchone()[0]
        return float(prow[0]), int(total)
    except sqlite3.OperationalError as e:
        logging.getLogger(__name__).info("ml_scores unavailable for percentile context: %s", e)
        return None, 0


def _eval_ml_anomaly(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Complementary ML layer (2026-06-10): the trained card-fraud scorecard
    ranks the focal card's transactions and surfaces the highest-scoring one as a
    Decision IF it clears the artifact's alert threshold. The hand-written rules
    remain the PRIMARY detection mechanism (BACKLOG cut-list); this ADDS a model
    signal, it does not replace anything.

    Degrades to [] (never raises) when the model layer is unavailable - a missing
    artifact, sklearn, or ml package is a no-op, not a 500. The ml imports are
    lazy so rules.py stays importable without the ML stack."""
    try:
        from ml import scorer
        from ml.train import FEATURE_NAMES

        bundle = scorer.load_bundle_for_active()
    except Exception as e:  # noqa: BLE001 - any ml-layer absence degrades to no-op
        logging.getLogger(__name__).info("ml-anomaly unavailable, skipping: %s", e)
        return []

    card_id = (focal or {}).get("card_id")
    # Column list is a fixed literal, not user-supplied - safe to embed directly.
    # Define it as a module constant so the pattern is not misread as an
    # injection surface (ruff B608 / bandit S608 target dynamic interpolation;
    # this is a known-fixed string).
    if card_id:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT "
                "id, timestamp, amount, merchant_name, merchant_lat, merchant_lng, "
                "merchant_country, mcc, is_card_present, is_3ds, pos_entry_mode "
                "FROM transactions WHERE card_id = ? ORDER BY timestamp, id",
                (card_id,),
            ).fetchall()
        ]
    else:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT "
                "id, timestamp, amount, merchant_name, merchant_lat, merchant_lng, "
                "merchant_country, mcc, is_card_present, is_3ds, pos_entry_mode "
                "FROM transactions ORDER BY timestamp, id"
            ).fetchall()
        ]
    scored = scorer.score_card(bundle, rows)
    if not scored:
        return []
    alert = float(bundle["thresholds"]["alert"])
    alerting = [s for s in scored if s["score"] >= alert]
    if not alerting:
        return []
    # Above the alert line the scorecard saturates (1 - p sits at float noise), so the largest
    # alerting score is decided by rounding. Surface the earliest alerting transaction (rows
    # arrive in time order).
    top = alerting[0]

    mv = bundle["model_version"]
    row = top["row"]
    # Optional ml_scores context, guarded so a missing table can never take the
    # primary rules down with the additive ML layer (see _ml_population_context).
    pct, total = _ml_population_context(conn, row["id"], mv)
    severity = round(pct / 100.0, 2) if pct is not None else round(min(0.99, top["score"]), 2)

    reasons = [r for r in scorer.contributions(bundle, top["vector"]) if r["contribution"] > 0][:4]
    evidence: list[dict] = [
        {
            "label": "Top model factor" if i == 0 else f"Factor {i + 1}",
            "value": f"{scorer.phrase_for(r['feature'])} ({r['feature']}={r['value']:.2f}) "
            f"-> +{r['contribution']:.2f} log-odds",
            "entity_ref": row["id"],
        }
        for i, r in enumerate(reasons)
    ]
    if pct is not None:
        evidence.append(
            {
                "label": "Population context",
                "value": f"top {100.0 - pct:.1f}% of {total:,} scored transactions",
                "entity_ref": row["id"],
            }
        )

    inputs: list[dict] = [
        {"label": "Scored transaction", "value": f"{row['merchant_name']} (${row['amount']:.0f})"},
        {"label": "Model", "value": f"card-fraud scorecard {mv}"},
        {"label": "Features", "value": f"{len(FEATURE_NAMES)} behavioral, risk_score excluded"},
    ]
    thresholds: list[dict] = [
        {
            "label": "Model score",
            "actual": f"{top['score']:.3f}",
            "bound": f"alert >= {alert:.3f}",
            "breached": True,
        },
    ]
    return [
        Decision(
            id=f"decision:{rule['id']}:{row['id']}",
            rule={
                "id": rule["id"],
                "label": rule.get("label", rule["id"]),
                "kind": rule.get("detector", "ml-anomaly"),
                "sop": rule.get("sop", {}),
            },
            subject_path_kind="fraud",
            trigger_entity_ids=[row["id"]],
            inputs=inputs,
            thresholds=thresholds,
            verdict=rule.get("verdict", "MODEL ANOMALY"),
            decision=rule.get("decision", "REVIEW"),
            evidence=evidence,
            severity=severity,
        )
    ]
