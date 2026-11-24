"""The training pipeline must be honest and deterministic. These run on a small
seeded fixture corpus (a benign baseline + a planted Houston->Lagos fraud burst)
so they are fast and self-contained - the real corpus is replay.db at runtime.

Verified here: the scorecard's reason codes are EXACT (per-row contributions sum
to decision_function, the additivity proof any
explanation needs), the model_version is a content hash, risk_score never enters the
features, and two trains on identical data yield identical coefficients (the
determinism the sibling ml-gate proves at the artifact-byte level)."""

import numpy as np

import db
from ml import scorer, train
from ml.features import TX_FEATURES


def _seed_corpus(path):
    """260 benign daily transactions across 4 cards + a 6-row fraud burst on a
    5th card (night, huge, Lagos, CNP) - enough signal for a linear model."""
    db.init_db(path)
    conn = db.connect(path)
    conn.execute("PRAGMA foreign_keys = OFF")
    rows = []
    for c in range(4):
        for d in range(1, 61):  # 60 benign days each
            day = f"2026-04-{(d % 28) + 1:02d}T08:{c:02d}:00-05:00"
            rows.append(
                (
                    f"b{c}-{d}",
                    f"card{c}",
                    f"acct{c}",
                    day,
                    8.0 + (d % 5),
                    "Imbermoor Coffee",
                    29.74,
                    -95.40,
                    "US",
                    "5814",
                    "coffee",
                    1,
                    0,
                    0.0,
                )
            )
    # TWO fraud cards (the grouped split needs fraud on both sides): each a clean
    # baseline then a burst (so the burst rows HAVE history).
    for fc in ("cardF", "cardG"):
        for d in range(1, 20):
            rows.append(
                (
                    f"vb{fc}{d}",
                    fc,
                    f"acct{fc}",
                    f"2026-04-{(d % 28) + 1:02d}T09:00:00-05:00",
                    12.0,
                    "Fiskhaven Market",
                    29.75,
                    -95.40,
                    "US",
                    "5411",
                    "grocery",
                    1,
                    0,
                    0.0,
                )
            )
        for i, (h, amt) in enumerate([("02", 1200.0), ("02", 1500.0), ("03", 1800.0)]):
            rows.append(
                (
                    f"fr{fc}{i}",
                    fc,
                    f"acct{fc}",
                    f"2026-05-2{i}T{h}:00:00-05:00",
                    amt,
                    "Lagos Cash Point",
                    6.52,
                    3.38,
                    "NG",
                    "6011",
                    "cash_advance",
                    0,
                    1,
                    0.0,
                )
            )
    conn.executemany(
        "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, merchant_name, "
        "merchant_lat, merchant_lng, merchant_country, mcc, category, is_card_present, is_fraud, "
        "balance_after) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()
    conn.close()


def test_build_dataset_excludes_leakage_and_aligns(tmp_path):
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        ds = train.build_dataset(conn)
    finally:
        conn.close()
    assert ds.X.shape[1] == len(TX_FEATURES)
    assert ds.X.shape[0] == len(ds.y) == len(ds.meta)
    assert "risk_score" not in train.FEATURE_NAMES
    assert set(ds.y) == {0, 1}


def test_trained_scorecard_ranks_the_fraud_burst_first(tmp_path):
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, metrics = train.train_scorecard(conn, seed=7)
    finally:
        conn.close()
    # Average precision must beat the prevalence baseline by a wide margin.
    assert metrics["average_precision"] > 5 * metrics["baseline_ap"]
    assert metrics["model_version"]
    assert metrics["n_positives"] == 6  # 3 per fraud card x 2 cards


def test_reason_codes_are_additive(tmp_path):
    """The CFPB anti-surrogate guarantee: the deployed model IS the explainer.
    Per-row signed contributions must sum to decision_function (within float eps)."""
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, _ = train.train_scorecard(conn, seed=7)
    finally:
        conn.close()
    x = np.array([[0.5] * len(TX_FEATURES)])
    contribs = train.contributions(bundle, x[0])
    total = sum(c["contribution"] for c in contribs) + bundle["intercept"]
    margin = float(bundle["model"].decision_function(bundle["scaler"].transform(x))[0])
    assert abs(total - margin) < 1e-6


def test_model_version_is_content_addressed(tmp_path):
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        b1, _ = train.train_scorecard(conn, seed=7)
        b2, _ = train.train_scorecard(conn, seed=7)
    finally:
        conn.close()
    # Identical data + seed -> identical coefficients -> identical version.
    assert b1["model_version"] == b2["model_version"]
    assert np.allclose(b1["model"].coef_, b2["model"].coef_)


def test_score_population_writes_separate_table_not_risk_score(tmp_path):
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, _ = train.train_scorecard(conn, seed=7)
        train.score_population(conn, bundle)
        n = conn.execute("SELECT COUNT(*) FROM ml_scores").fetchone()[0]
        kinds = {r[0] for r in conn.execute("SELECT DISTINCT entity_kind FROM ml_scores")}
        # The seeded risk_score column is UNTOUCHED.
        rs = conn.execute("SELECT DISTINCT risk_score FROM transactions").fetchone()[0]
    finally:
        conn.close()
    assert n > 0 and kinds == {"transaction"}
    assert rs == 0  # fixture seeded risk_score=0 default; model never overwrote it


def test_save_artifact_for_db_routes_per_pack_and_spares_marcus(tmp_path):
    """Training against a population pack must write {stem}_scorecard.joblib, NOT
    overwrite the locked Marcus artifact (card_fraud_scorecard.joblib). The
    per-pack split exists precisely so the population's threshold can't shift
    Marcus."""
    p = tmp_path / "population.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, metrics = train.train_scorecard(conn, seed=7)
    finally:
        conn.close()
    out = tmp_path / "artifacts"
    artifact = train.save_artifact_for_db(bundle, metrics, out, p)
    assert artifact.name == "population_scorecard.joblib"
    assert artifact.exists()
    # Marcus's filename was NOT produced by a population train.
    assert not (out / "card_fraud_scorecard.joblib").exists()
    # The serving router agrees with the training router (one source of truth).
    assert artifact.name == scorer.artifact_path_for_db(p).name


def test_save_artifact_for_replay_db_keeps_marcus_filename(tmp_path):
    """The Marcus pack (replay.db) keeps the exact committed artifact name."""
    p = tmp_path / "replay.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, metrics = train.train_scorecard(conn, seed=7)
    finally:
        conn.close()
    out = tmp_path / "artifacts"
    artifact = train.save_artifact_for_db(bundle, metrics, out, p)
    assert artifact.name == "card_fraud_scorecard.joblib"


def test_population_pack_scores_a_known_fraud_row_above_threshold(tmp_path):
    """A population-trained scorecard must rank a planted fraud cash-out above its
    own alert threshold -- the model is calibrated to fire on the population's
    fraud, independently of Marcus's pack."""
    p = tmp_path / "population.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        bundle, _ = train.train_scorecard(conn, seed=7)
        # Pull one card's transactions that includes its planted fraud burst.
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT id, timestamp, amount, merchant_name, merchant_lat, merchant_lng, "
                "merchant_country, mcc, is_card_present, is_3ds, pos_entry_mode, is_fraud "
                "FROM transactions WHERE card_id = 'cardF' ORDER BY timestamp, id"
            ).fetchall()
        ]
    finally:
        conn.close()
    scored = scorer.score_card(bundle, rows)
    alert = float(bundle["thresholds"]["alert"])
    fraud_scores = [s["score"] for s in scored if int(s["row"]["is_fraud"]) == 1]
    assert fraud_scores, "the fixture must contain fraud rows for cardF"
    assert max(fraud_scores) >= alert


def _scores(path) -> list[tuple]:
    conn = db.connect(path)
    try:
        return [
            tuple(r)
            for r in conn.execute(
                "SELECT entity_id, model_version, score, score_percentile FROM ml_scores "
                "ORDER BY entity_id"
            )
        ]
    finally:
        conn.close()


def test_score_only_uses_the_packs_existing_artifact_and_writes_none(tmp_path):
    """`--score-only` is how a rebuilt pack is scored with its locked model: nothing is trained
    and no file in the artifact folder changes."""
    p = tmp_path / "population.db"
    _seed_corpus(p)
    out = tmp_path / "artifacts"
    assert train.main(["--db", str(p), "--out", str(out)]) == 0  # train, save, score
    artifact = out / "population_scorecard.joblib"
    before = {f.name: f.read_bytes() for f in out.iterdir()}
    trained = _scores(p)
    assert trained and len({row[1] for row in trained}) == 1

    conn = db.connect(p)
    conn.execute("DELETE FROM ml_scores")
    conn.commit()
    conn.close()
    scorer.load_bundle.cache_clear()

    assert train.main(["--db", str(p), "--out", str(out), "--score-only"]) == 0
    assert {f.name: f.read_bytes() for f in out.iterdir()} == before
    assert artifact.exists()
    assert _scores(p) == trained


def test_score_only_without_an_artifact_fails_plainly(tmp_path, capsys):
    p = tmp_path / "population.db"
    _seed_corpus(p)
    out = tmp_path / "empty"
    assert train.main(["--db", str(p), "--out", str(out), "--score-only"]) == 1
    assert "population_scorecard.joblib" in capsys.readouterr().err
    assert _scores(p) == []
    assert not out.exists() or not list(out.iterdir())


class _Tied:
    """A stand-in model with only three distinct scores, so almost every row is in a tie."""

    def transform(self, X):
        return X

    def predict_proba(self, X):
        score = (np.arange(len(X)) % 3) * 0.25
        return np.column_stack([1.0 - score, score])


def test_tied_scores_take_their_percentiles_in_dataset_order(tmp_path):
    """Equal scores must rank the same way on every run: by the dataset's own order (time, then
    id), not by whatever the sort happens to do with ties."""
    p = tmp_path / "c.db"
    _seed_corpus(p)
    conn = db.connect(p)
    try:
        train.score_population(conn, {"scaler": _Tied(), "model": _Tied(), "model_version": "tied"})
        scored = {
            r[0]: (r[1], r[2])
            for r in conn.execute("SELECT entity_id, score, score_percentile FROM ml_scores")
        }
        order = [r[0] for r in conn.execute("SELECT id FROM transactions ORDER BY timestamp, id")]
    finally:
        conn.close()
    assert len(order) > 250 and len({score for score, _ in scored.values()}) == 3
    for tied in (0.0, 0.25, 0.5):
        percentiles = [scored[i][1] for i in order if scored[i][0] == tied]
        assert len(percentiles) > 80
        assert percentiles == sorted(percentiles), f"ties at {tied} are out of dataset order"
