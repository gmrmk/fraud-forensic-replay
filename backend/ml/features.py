# backend/ml/features.py
"""Point-in-time-correct behavioral features for the card-fraud scorer, derived
from ONLY the transaction columns FFR already has. ONE module, consumed by both
ml/train.py and the ml-anomaly serving evaluator, so training and serving can
never compute a feature differently (training-serving skew is silent and fatal).

Two disciplines, enforced here:

1. POINT-IN-TIME: every feature for row i uses ONLY rows strictly earlier than i
   for the same card. test_ml_features deletes the future and asserts identical
   values. No feature may peek forward.
2. NO LEAKAGE COLUMNS: risk_score was authored by the same deterministic seed
   process as the is_fraud label - using it is circular. It, the label, and the
   auth_response_code (a post-decision field) are HARD-EXCLUDED; the test asserts
   the feature list never intersects EXCLUDED_COLUMNS.

Pure stdlib (math + datetime), no numpy/sklearn import, so the fast suite covers
it and the serving path stays import-light."""

from __future__ import annotations

import math
from datetime import datetime

# Columns a feature may NEVER be derived from (the leakage rail).
EXCLUDED_COLUMNS = ("risk_score", "is_fraud", "auth_response_code")

# The deployed feature vector, in a FIXED order (the artifact's scaler + coef are
# positional). Changing this list invalidates a trained artifact by design - the
# model_version hash folds the feature names in.
TX_FEATURES: list[str] = [
    "log_amount",
    "card_tx_count_24h",
    "card_tx_count_7d",
    "card_amount_sum_24h",
    "amount_z_own",
    "has_history",
    "log_seconds_since_prev_tx",
    "geo_displacement_km",
    "implied_speed_kmh",
    "merchant_novelty",
    "mcc_novelty",
    "country_novelty",
    "is_card_present",
    "cnp_flip",
    "night_flag",
    "weekend_flag",
    "is_3ds",
    "chip_fallback_flag",
]

_DAY_S = 86_400.0
_EARTH_KM = 6371.0


def _ts(row: dict) -> datetime:
    return datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00"))


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * _EARTH_KM * math.asin(min(1.0, math.sqrt(a)))


def _feature_row(row: dict, priors: list[dict]) -> dict:
    """Features for `row` given its card's strictly-prior transactions `priors`
    (already time-ordered). All history-derived features collapse to a neutral 0
    when there is no history, paired with has_history so the model can tell a
    genuine zero from an absent one."""
    amount = float(row["amount"])
    ts = _ts(row)
    has_history = 1 if priors else 0

    # Velocity: strictly-prior counts/sums within rolling windows.
    cnt_24h = cnt_7d = 0
    sum_24h = 0.0
    cnp_prior_7d = 0
    for p in priors:
        elapsed = (ts - _ts(p)).total_seconds()
        if 0 < elapsed < _DAY_S:
            cnt_24h += 1
            sum_24h += float(p["amount"])
        if 0 < elapsed < 7 * _DAY_S:
            cnt_7d += 1
            if int(p["is_card_present"]) == 0:
                cnp_prior_7d += 1

    # Amount vs the card's own prior distribution (expanding; needs >=2 to have a
    # std, >=5 for a stable z per the handbook - below that, neutral 0).
    if len(priors) >= 5:
        amounts = [float(p["amount"]) for p in priors]
        mean = sum(amounts) / len(amounts)
        var = sum((a - mean) ** 2 for a in amounts) / len(amounts)
        std = math.sqrt(var)
        amount_z = (amount - mean) / std if std > 1e-9 else 0.0
    else:
        amount_z = 0.0

    # Recency + geo vs the immediately previous transaction.
    if priors:
        prev = priors[-1]
        gap_s = max(0.0, (ts - _ts(prev)).total_seconds())
        log_gap = math.log1p(gap_s)
        disp_km = _haversine_km(
            float(prev["merchant_lat"]),
            float(prev["merchant_lng"]),
            float(row["merchant_lat"]),
            float(row["merchant_lng"]),
        )
        hours = gap_s / 3600.0
        speed = disp_km / hours if hours > 1e-6 else 0.0
    else:
        log_gap = 0.0
        disp_km = 0.0
        speed = 0.0

    seen_merchants = {p["merchant_name"] for p in priors}
    seen_mccs = {p["mcc"] for p in priors}
    seen_countries = {p.get("merchant_country", "US") for p in priors}
    present = int(row["is_card_present"])
    cnp_share_7d = (cnp_prior_7d / cnt_7d) if cnt_7d else 0.0

    return {
        "log_amount": math.log1p(amount),
        "card_tx_count_24h": float(cnt_24h),
        "card_tx_count_7d": float(cnt_7d),
        "card_amount_sum_24h": sum_24h,
        "amount_z_own": amount_z,
        "has_history": float(has_history),
        "log_seconds_since_prev_tx": log_gap,
        "geo_displacement_km": disp_km,
        "implied_speed_kmh": speed,
        "merchant_novelty": 1.0 if (priors and row["merchant_name"] not in seen_merchants) else 0.0,
        "mcc_novelty": 1.0 if (priors and row["mcc"] not in seen_mccs) else 0.0,
        "country_novelty": (
            1.0 if (priors and row.get("merchant_country", "US") not in seen_countries) else 0.0
        ),
        "is_card_present": float(present),
        "cnp_flip": 1.0 if (present == 0 and cnp_share_7d < 0.2) else 0.0,
        "night_flag": 1.0 if ts.hour <= 6 else 0.0,
        "weekend_flag": 1.0 if ts.weekday() >= 5 else 0.0,
        "is_3ds": float(row.get("is_3ds", 0)),
        "chip_fallback_flag": 1.0 if row.get("pos_entry_mode") == "chip_fallback_swipe" else 0.0,
    }


def compute_tx_features(card_rows: list[dict]) -> list[dict]:
    """Feature dicts (ordered TX_FEATURES) for ONE card's transactions, in input
    order. Caller passes rows time-ordered by (timestamp, id); each row sees only
    the rows before it in the list, so the function is point-in-time by
    construction (the leakage test relies on exactly this)."""
    out: list[dict] = []
    for i, row in enumerate(card_rows):
        out.append(_feature_row(row, card_rows[:i]))
    return out


def vectorize(feature_dict: dict) -> list[float]:
    """Feature dict -> positional vector in TX_FEATURES order (model input)."""
    return [float(feature_dict[name]) for name in TX_FEATURES]
