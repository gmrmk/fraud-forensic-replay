"""The ML feature module is the credibility floor: every feature must be
point-in-time correct (strictly-prior windows - the leakage test deletes the
future and asserts identical values), and the seeded risk_score / the label
itself are HARD-EXCLUDED (risk_score was authored by the same seed process as
is_fraud, so scoring on it would be circular)."""

import math

from ml.features import EXCLUDED_COLUMNS, TX_FEATURES, compute_tx_features


def _tx(id, ts, amount, lat=29.76, lng=-95.36, country="US", mcc="5411", present=1, **kw):
    row = {
        "id": id,
        "timestamp": ts,
        "amount": amount,
        "merchant_lat": lat,
        "merchant_lng": lng,
        "merchant_country": country,
        "mcc": mcc,
        "merchant_name": kw.get("merchant_name", "M1"),
        "is_card_present": present,
        "is_3ds": kw.get("is_3ds", 0),
        "pos_entry_mode": kw.get("pos_entry_mode", "chip"),
    }
    return row


FIXTURE = [
    _tx("t1", "2026-05-01T08:00:00-05:00", 10.0),
    _tx("t2", "2026-05-01T09:00:00-05:00", 12.0),
    _tx("t3", "2026-05-02T08:00:00-05:00", 11.0),
    _tx("t4", "2026-05-03T08:00:00-05:00", 13.0),
    _tx("t5", "2026-05-04T08:00:00-05:00", 9.0),
    # The anomaly: 02:00, huge amount, new merchant/mcc/country, far away, CNP.
    _tx(
        "t6",
        "2026-05-05T02:00:00-05:00",
        900.0,
        lat=6.52,
        lng=3.38,
        country="NG",
        mcc="6011",
        present=0,
        merchant_name="Lagos ATM",
        pos_entry_mode="ecom",
    ),
]


def test_excluded_columns_never_in_the_feature_list():
    assert {"risk_score", "is_fraud", "auth_response_code"} <= set(EXCLUDED_COLUMNS)
    assert not set(TX_FEATURES) & set(EXCLUDED_COLUMNS)


def test_feature_vectors_align_with_feature_names():
    feats = compute_tx_features(FIXTURE)
    assert len(feats) == len(FIXTURE)
    for f in feats:
        assert list(f.keys()) == list(TX_FEATURES)


def test_first_transaction_has_no_history():
    f = compute_tx_features(FIXTURE)[0]
    assert f["card_tx_count_24h"] == 0
    assert f["card_tx_count_7d"] == 0
    assert f["has_history"] == 0
    assert f["amount_z_own"] == 0.0
    assert f["geo_displacement_km"] == 0.0


def test_velocity_windows_are_strictly_prior():
    feats = compute_tx_features(FIXTURE)
    # t2 (09:00 day1): one prior tx (t1) within 24h.
    assert feats[1]["card_tx_count_24h"] == 1
    # t3 (08:00 day2): t1 is exactly 24h prior (excluded by strict <24h window? t1
    # is exactly at the boundary); t2 (23h prior) counts.
    assert feats[2]["card_tx_count_24h"] == 1
    assert feats[2]["card_tx_count_7d"] == 2


def test_anomaly_row_lights_the_novelty_and_geo_features():
    f = compute_tx_features(FIXTURE)[5]
    assert f["merchant_novelty"] == 1
    assert f["mcc_novelty"] == 1
    assert f["country_novelty"] == 1
    assert f["night_flag"] == 1
    assert f["is_card_present"] == 0
    assert f["geo_displacement_km"] > 9000  # Houston -> Lagos
    assert f["implied_speed_kmh"] > 500
    assert f["amount_z_own"] > 2  # 900 vs the ~9-13 baseline
    assert f["cnp_flip"] == 1  # CNP now, zero prior CNP share


def test_repeat_merchant_is_not_novel():
    f = compute_tx_features(FIXTURE)[3]  # t4, same merchant M1 as priors
    assert f["merchant_novelty"] == 0
    assert f["mcc_novelty"] == 0


def test_point_in_time_leakage_guard():
    """The kill test: features at row i must be IDENTICAL when every later row
    is deleted. If any feature peeks at the future, this fails."""
    full = compute_tx_features(FIXTURE)
    for i in range(len(FIXTURE)):
        truncated = compute_tx_features(FIXTURE[: i + 1])
        assert truncated[i] == full[i], f"feature leakage at row {i}"


def test_log_amount_is_log1p():
    f = compute_tx_features(FIXTURE)[0]
    assert math.isclose(f["log_amount"], math.log1p(10.0))
