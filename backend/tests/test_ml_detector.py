"""The ml-anomaly detector slots the trained scorecard into the existing
RULE_EVALUATORS registry: it emits a Decision through the same seam geo-velocity
and login-anomaly use, so the rule-badge + evidence console render it with zero
new UI code. It must DEGRADE to [] (never raise) when the model layer is absent -
the hand-written rules remain primary, the model is an additive layer."""

from test_ml_train import _seed_corpus  # sibling test module (pytest prepend path)

import db
import rules
from ml import scorer, train

_ML_RULE = {
    "id": "ml-card-anomaly",
    "label": "model anomaly",
    "detector": "ml-anomaly",
    "verdict": "MODEL ANOMALY",
    "decision": "REVIEW",
    "sop": {"what": "The scorecard ranked this transaction high.", "why": "Behavioral model."},
}


def _trained_db(tmp_path, monkeypatch):
    p = tmp_path / "corpus.db"
    _seed_corpus(p)
    conn = db.connect(p)
    bundle, _ = train.train_scorecard(conn, seed=7)
    train.score_population(conn, bundle)
    conn.commit()
    conn.close()
    # Serve the fixture-trained bundle instead of the committed replay.db artifact.
    # The detector loads the ACTIVE pack's artifact via load_bundle_for_active.
    monkeypatch.setattr(scorer, "load_bundle_for_active", lambda *a, **k: bundle)
    return p, bundle


def _top_card(conn, bundle):
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT id, timestamp, amount, merchant_name, merchant_lat, merchant_lng, "
            "merchant_country, mcc, is_card_present, is_3ds, pos_entry_mode, card_id "
            "FROM transactions ORDER BY card_id, timestamp, id"
        )
    ]
    by_card: dict = {}
    for r in rows:
        by_card.setdefault(r["card_id"], []).append(r)
    best_card, best = None, -1.0
    for cid, crows in by_card.items():
        s = max(x["score"] for x in scorer.score_card(bundle, crows))
        if s > best:
            best_card, best = cid, s
    return best_card


def test_ml_detector_fires_with_additive_positive_reasons(tmp_path, monkeypatch):
    p, bundle = _trained_db(tmp_path, monkeypatch)
    conn = db.connect(p)
    try:
        focal = {"card_id": _top_card(conn, bundle)}
        decisions = rules.evaluate(conn, [_ML_RULE], focal)
    finally:
        conn.close()
    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "MODEL ANOMALY"
    assert d.decision == "REVIEW"
    assert 0.0 < d.severity <= 1.0
    assert d.thresholds[0]["breached"] is True
    # Reason codes present, positive, and naming a real feature.
    factors = [e for e in d.evidence if e["label"].startswith(("Top model factor", "Factor"))]
    assert len(factors) >= 1
    assert "log-odds" in factors[0]["value"]
    assert any(
        f["feature"] in factors[0]["value"] for f in [{"feature": n} for n in train.FEATURE_NAMES]
    )
    # Population context computed from ml_scores.
    assert any(e["label"] == "Population context" for e in d.evidence)
    # The model is named, and risk_score exclusion is stated in the inputs.
    inputs = {i["label"]: i["value"] for i in d.inputs}
    assert "risk_score excluded" in inputs["Features"]


def test_ml_detector_surfaces_the_earliest_alerting_transaction(tmp_path, monkeypatch):
    """Above the alert line the scorecard saturates (1 - p sits at float noise), so the
    largest alerting score is decided by rounding: one unrelated row added to a card's
    history flipped Marcus's pick from his first Lagos ATM try to a later Lagos charge.
    The detector surfaces the earliest alerting transaction instead."""
    p, bundle = _trained_db(tmp_path, monkeypatch)
    real = scorer.score_card
    alert = float(bundle["thresholds"]["alert"])

    def noisy(b, rows):
        scored = real(b, rows)
        for s in scored:
            s["score"] = 0.0
        scored[0]["score"] = alert + (1.0 - alert) * 0.25  # earliest row: alerts, lower
        scored[-1]["score"] = alert + (1.0 - alert) * 0.75  # latest row: alerts, higher
        return scored

    monkeypatch.setattr(scorer, "score_card", noisy)
    conn = db.connect(p)
    try:
        focal = {"card_id": _top_card(conn, bundle)}
        first = conn.execute(
            "SELECT id FROM transactions WHERE card_id = ? ORDER BY timestamp, id LIMIT 1",
            (focal["card_id"],),
        ).fetchone()["id"]
        decisions = rules.evaluate(conn, [_ML_RULE], focal)
    finally:
        conn.close()
    assert [d.trigger_entity_ids for d in decisions] == [[first]]


def test_ml_detector_does_not_fire_on_a_purely_benign_card(tmp_path, monkeypatch):
    p, bundle = _trained_db(tmp_path, monkeypatch)
    conn = db.connect(p)
    try:
        decisions = rules.evaluate(conn, [_ML_RULE], {"card_id": "card0"})  # benign coffee card
    finally:
        conn.close()
    assert decisions == []


def test_ml_detector_survives_missing_ml_scores_table(tmp_path, monkeypatch):
    """A pack whose ml_scores was never populated (fresh clone, older schema) must
    still fire the model Decision with reasons and a score-based severity. The
    optional percentile context degrades; a missing ml_scores table must NEVER
    propagate an OperationalError out of evaluate() and 500 the PRIMARY rules."""
    p, bundle = _trained_db(tmp_path, monkeypatch)
    conn = db.connect(p)
    try:
        focal = {"card_id": _top_card(conn, bundle)}
        conn.execute("DROP TABLE ml_scores")  # the optional table is gone
        conn.commit()
        decisions = rules.evaluate(conn, [_ML_RULE], focal)
    finally:
        conn.close()
    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "MODEL ANOMALY"
    assert 0.0 < d.severity <= 1.0  # score-based fallback, not the percentile band
    # Reason codes survive; only the population-context evidence degrades out.
    assert any(e["label"].startswith(("Top model factor", "Factor")) for e in d.evidence)
    assert not any(e["label"] == "Population context" for e in d.evidence)


def test_ml_detector_degrades_to_empty_without_artifact(tmp_path, monkeypatch):
    p, _ = _trained_db(tmp_path, monkeypatch)

    def _boom(*a, **k):
        raise scorer.ArtifactUnavailable("no artifact")

    monkeypatch.setattr(scorer, "load_bundle_for_active", _boom)
    conn = db.connect(p)
    try:
        decisions = rules.evaluate(conn, [_ML_RULE], {"card_id": "cardF"})
    finally:
        conn.close()
    assert decisions == []  # a missing model is a no-op, not a 500
