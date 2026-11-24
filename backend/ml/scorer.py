# backend/ml/scorer.py
"""Serving side of the card-fraud scorecard: load the version-locked artifact and
score a card's transactions, with EXACT per-row reason codes.

The deployed LogisticRegression IS the explainer (CFPB Circular 2022-03: reasons
must describe the factors the model actually scored - no surrogate model). A
reason's contribution is coef_j * scaled_value_j; the contributions sum to
decision_function + intercept (proven by test_reason_codes_are_additive).

Import-light at module top (numpy + joblib + the pure feature module). The
detector imports this lazily so rules.py stays importable - and the ml-anomaly
detector degrades to [] - when the artifact or sklearn is absent."""

from __future__ import annotations

import logging
import warnings
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from ml.features import TX_FEATURES, compute_tx_features, vectorize

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
ARTIFACT_PATH = ARTIFACTS_DIR / "card_fraud_scorecard.joblib"

# The locked Marcus pack keeps its EXACT, committed artifact filename -- his four
# decision pills are byte-locked, so the per-pack split must never rename or
# relocate his file. Every other pack routes to {db_stem}_scorecard.joblib.
_MARCUS_DB_STEM = "replay"


class ArtifactUnavailable(RuntimeError):
    """The trained model artifact is missing or unreadable."""


def artifact_path_for_db(db_path: str | Path) -> Path:
    """Resolve a pack's scorecard artifact from its DB path, keyed by the DB stem.

    The Marcus pack (replay.db) maps to the existing committed artifact name so
    his locked pills never move; every other pack gets its own
    {stem}_scorecard.joblib in the same artifacts dir. Routing is a pure function
    of the stem, so a new pack needs zero code change."""
    stem = Path(db_path).stem
    if stem == _MARCUS_DB_STEM:
        return ARTIFACT_PATH
    return ARTIFACTS_DIR / f"{stem}_scorecard.joblib"


@lru_cache(maxsize=2)
def load_bundle(path: str | None = None) -> dict:
    p = Path(path) if path else ARTIFACT_PATH
    if not p.exists():
        raise ArtifactUnavailable(f"model artifact not found at {p} (run: python -m ml.train)")
    # A model loaded under a different sklearn version is unsupported by sklearn
    # and silently wrong - promote that warning to a hard failure.
    with warnings.catch_warnings():
        warnings.filterwarnings("error", message=".*InconsistentVersionWarning.*")
        try:
            from sklearn.exceptions import InconsistentVersionWarning

            warnings.simplefilter("error", InconsistentVersionWarning)
        except Exception:
            pass
        return joblib.load(p)


def load_bundle_for_active() -> dict:
    """Load the scorecard artifact for the CURRENTLY active pack.

    Resolves the active DB (db.get_active_db) -> its per-pack artifact path ->
    the bundle. This is the serving seam the ml-anomaly detector uses, so a pack
    hot-swap (db.set_active_db) also swaps the scorecard -- the population's
    calibrated threshold serves the population, the Marcus artifact serves Marcus.
    Raises ArtifactUnavailable (via load_bundle) when the pack has no artifact;
    the detector catches that and degrades to a no-op."""
    import db

    artifact = artifact_path_for_db(db.get_active_db())
    return load_bundle(str(artifact))


def active_model_version() -> str | None:
    """The active pack's artifact version, or None when the pack has no artifact.

    The single answer to "which model version does the screen show": every reader of
    ml_scores pins to it, so a retrain that leaves two versions in a database cannot make
    two surfaces disagree (a MAX over content hashes is lexical, not chronological).

    The ML layer is optional for the core ledger read: any load failure (missing artifact,
    sklearn absent or version-mismatched, corrupt joblib) degrades to None, like
    rules/ml_anomaly.py, so /api/transactions never 500s on it."""
    try:
        return load_bundle_for_active()["model_version"]
    except Exception as e:  # noqa: BLE001 - any ml-layer failure degrades to no-ml
        logging.getLogger(__name__).info("ml model version unavailable: %s", e)
        return None


def contributions(bundle: dict, raw_vector) -> list[dict]:
    """Exact signed log-odds contribution per feature for one RAW (unscaled)
    vector: coef_j * scaled_value_j, sorted by magnitude. Sums to
    decision_function + intercept."""
    raw = np.asarray(raw_vector, dtype=np.float64)
    scaled = bundle["scaler"].transform(raw.reshape(1, -1))[0]
    coef = bundle["model"].coef_[0]
    out = [
        {
            "feature": name,
            "value": float(raw[j]),
            "contribution": float(coef[j] * scaled[j]),
        }
        for j, name in enumerate(bundle["feature_names"])
    ]
    out.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return out


def score_card(bundle: dict, card_rows: list[dict]) -> list[dict]:
    """Score one card's transactions (time-ordered). Returns per row:
    {row, score (fraud probability), vector}. Point-in-time features."""
    if not card_rows:
        return []
    feats = compute_tx_features(card_rows)
    vectors = np.array([vectorize(f) for f in feats], dtype=np.float64)
    scaled = bundle["scaler"].transform(vectors)
    scores = bundle["model"].predict_proba(scaled)[:, 1]
    return [
        {"row": row, "score": float(scores[i]), "vector": vectors[i]}
        for i, row in enumerate(card_rows)
    ]


# Human-readable phrasing for the top reason codes (investigator register).
_REASON_PHRASE: dict[str, str] = {
    "amount_z_own": "amount far above this card's own history",
    "geo_displacement_km": "large geographic jump from the prior swipe",
    "implied_speed_kmh": "implied travel speed between swipes",
    "country_novelty": "first-ever transaction in this country for the card",
    "merchant_novelty": "never-seen merchant for this card",
    "mcc_novelty": "never-seen merchant category for this card",
    "cnp_flip": "card-not-present against a card-present history",
    "night_flag": "overnight transaction (after midnight)",
    "chip_fallback_flag": "chip-fallback magstripe swipe (skimmer tell)",
    "card_tx_count_24h": "transaction velocity in the last 24h",
    "is_card_present": "card-present flag",
    "log_amount": "transaction amount",
}


def phrase_for(feature: str) -> str:
    return _REASON_PHRASE.get(feature, feature.replace("_", " "))


__all__ = [
    "ARTIFACTS_DIR",
    "ARTIFACT_PATH",
    "ArtifactUnavailable",
    "TX_FEATURES",
    "artifact_path_for_db",
    "contributions",
    "load_bundle",
    "load_bundle_for_active",
    "phrase_for",
    "score_card",
]
