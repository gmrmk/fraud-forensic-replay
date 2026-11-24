"""Server-side forensic decision authority.

Turns the active scenario's rule-defs (manifest `rules` block) into a list of
schema-agnostic `Decision` objects. The Decision shape + the detector registry
are the generic seam; each detector (e.g. `geo-velocity`) is a concrete adapter
that reuses the existing detection (`arcs.py`) and reads its scenario's fields.
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable

from rules.account_change_velocity import _eval_account_change_velocity
from rules.card_testing import _eval_card_testing
from rules.change_after_new_device import _eval_change_after_new_device
from rules.common_point import _eval_common_point
from rules.geo_velocity import _eval_geo_velocity
from rules.login_anomaly import _eval_login_anomaly
from rules.magnitude_burst import _eval_magnitude_burst
from rules.ml_anomaly import _eval_ml_anomaly
from rules.shared import Decision
from rules.skimmer_signature import _eval_skimmer_signature

__all__ = ["Decision", "RULE_EVALUATORS", "evaluate"]

RULE_EVALUATORS: dict[str, Callable[[sqlite3.Connection, dict, dict | None], list[Decision]]] = {
    "geo-velocity": _eval_geo_velocity,
    "login-anomaly": _eval_login_anomaly,
    "ml-anomaly": _eval_ml_anomaly,
    "card-testing": _eval_card_testing,
    "skimmer-signature": _eval_skimmer_signature,
    "account-change-velocity": _eval_account_change_velocity,
    "common-point-of-purchase": _eval_common_point,
    "change-after-new-device": _eval_change_after_new_device,
    "magnitude-burst": _eval_magnitude_burst,
}


def evaluate(
    conn: sqlite3.Connection, rule_defs: list[dict], focal: dict | None = None
) -> list[Decision]:
    """Dispatch each manifest rule to its detector evaluator, scoped to the
    manifest's focal subject when declared (a detector evaluates ONE case's
    path, never the population). Unknown detectors are skipped (schema-agnostic
    degrade), never raised."""
    out: list[Decision] = []
    for rule in rule_defs:
        evaluator = RULE_EVALUATORS.get(rule.get("detector", ""))
        if evaluator is None:
            logging.getLogger(__name__).warning(
                "unknown detector %r in rule %r; skipping", rule.get("detector"), rule.get("id")
            )
            continue
        out.extend(evaluator(conn, rule, focal))
    return out
