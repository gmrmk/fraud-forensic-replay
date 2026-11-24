# backend/ml/train.py
"""Train the deterministic card-fraud scorecard on the population corpus and
persist a version-locked joblib artifact + metrics, then batch-score the
population into the ml_scores table.

  python -m ml.train [--db ../data/replay.db] [--out ml/artifacts]

DETERMINISM (the artifact must be byte-reproducible - the sibling ml-gate trains
twice and SHA-256-compares):
  - OMP_NUM_THREADS forced to 1 BEFORE numpy/sklearn import (single-thread BLAS;
    sklearn documents no thread-count reproducibility, so we engineer it).
  - int seeds everywhere; LogisticRegression(lbfgs) is deterministic given the
    fixed feature order from features.py and a fixed data order.
  - no timestamps in the artifact; model_version is a content hash of the fitted
    coefficients + scaler + feature names + params.

Methodology:
  - features come from ml/features.py, which hard-excludes the seeded risk_score
    (circular with the label) and is point-in-time correct.
  - TEMPORAL split (train earlier, evaluate later); random row splits leak a
    card's fingerprint across the split.
  - metrics = average precision (vs the prevalence baseline) + card precision@k,
    never ROC-AUC headline at 0.18% prevalence.
  - the deployed LogisticRegression IS the explainer: per-row contributions are
    exact and additive (CFPB anti-surrogate)."""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402
import sys  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from datetime import datetime  # noqa: E402
from pathlib import Path  # noqa: E402

import joblib  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import average_precision_score  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

from ml.features import TX_FEATURES, compute_tx_features, vectorize  # noqa: E402
from ml.scorer import contributions  # noqa: E402  (one explainer, shared with serving)

__all__ = [
    "build_dataset",
    "contributions",
    "save_artifact",
    "save_artifact_for_db",
    "score_population",
    "train_scorecard",
]

FEATURE_NAMES = TX_FEATURES
_C_GRID = (0.01, 0.1, 1.0, 10.0)
_ALERT_BUDGET_PER_DAY = 10  # the declared operating point (model card)


@dataclass(frozen=True)
class Dataset:
    X: np.ndarray
    y: np.ndarray
    meta: list[dict]  # parallel: {id, card_id, ts (datetime), is_fraud}


def build_dataset(conn: sqlite3.Connection) -> Dataset:
    """Every transaction -> a point-in-time feature vector, grouped by card so
    each row sees only its card's earlier rows. Ordered globally by time for the
    temporal split."""
    rows = [
        dict(r)
        for r in conn.execute(
            "SELECT id, card_id, account_id, timestamp, amount, merchant_name, "
            "merchant_lat, merchant_lng, merchant_country, mcc, category, is_card_present, "
            "is_fraud, is_3ds, pos_entry_mode FROM transactions ORDER BY card_id, timestamp, id"
        ).fetchall()
    ]
    by_card: dict[str, list[dict]] = {}
    for r in rows:
        by_card.setdefault(r["card_id"], []).append(r)

    feats: list[list[float]] = []
    ys: list[int] = []
    meta: list[dict] = []
    for card_id, card_rows in by_card.items():
        for row, fdict in zip(card_rows, compute_tx_features(card_rows), strict=True):
            feats.append(vectorize(fdict))
            ys.append(int(row["is_fraud"]))
            meta.append(
                {
                    "id": row["id"],
                    "card_id": card_id,
                    "ts": datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00")),
                    "is_fraud": int(row["is_fraud"]),
                }
            )
    order = sorted(range(len(meta)), key=lambda i: (meta[i]["ts"], meta[i]["id"]))
    X = np.array([feats[i] for i in order], dtype=np.float64)
    y = np.array([ys[i] for i in order], dtype=np.int64)
    meta = [meta[i] for i in order]
    return Dataset(X=X, y=y, meta=meta)


def _grouped_split(meta: list[dict], frac: float = 0.8) -> tuple[np.ndarray, np.ndarray]:
    """CARD-GROUPED, fraud-stratified split (the IEEE-CIS winning protocol): no
    card appears on both sides (a card's behavioral fingerprint must not leak),
    and the fraud-bearing cards are distributed across train/eval so both carry
    positives. Deterministic: cards are sorted, fraud-cards and clean-cards are
    each split at `frac`, no RNG.

    NOTE (model card): a PURE temporal split is impossible on this corpus - all
    fraud is a single time-clustered ring cashout in the final week, so a time
    cut starves training to a handful of positives. Card-grouping is the
    leakage-safe alternative; point-in-time features keep each row causal."""
    fraud_cards: set[str] = set()
    all_cards: set[str] = set()
    for m in meta:
        all_cards.add(m["card_id"])
        if m["is_fraud"]:
            fraud_cards.add(m["card_id"])
    clean_cards = sorted(all_cards - fraud_cards)
    fraud_cards_sorted = sorted(fraud_cards)

    def _take(cards: list[str]) -> set[str]:
        # With 2+ cards always hold at least one out, so both splits are non-empty
        # for each stratum (fraud-cards must appear on both sides).
        if len(cards) <= 1:
            return set(cards)
        cut = min(len(cards) - 1, max(1, round(len(cards) * frac)))
        return set(cards[:cut])

    train_cards = _take(fraud_cards_sorted) | _take(clean_cards)
    train_idx = [i for i, m in enumerate(meta) if m["card_id"] in train_cards]
    eval_idx = [i for i, m in enumerate(meta) if m["card_id"] not in train_cards]
    return np.array(train_idx), np.array(eval_idx)


def _precision_at_k(y_true: np.ndarray, scores: np.ndarray, k: int) -> float:
    if k <= 0 or len(scores) == 0:
        return 0.0
    top = np.argsort(scores)[::-1][:k]
    return float(y_true[top].sum()) / float(min(k, len(top)))


def _fit_logreg(X: np.ndarray, y: np.ndarray, c: float, seed: int) -> LogisticRegression:
    # penalty defaults to l2 in sklearn 1.9 (explicit penalty='l2' is deprecated
    # since 1.8); class_weight balances the 0.18% prevalence.
    model = LogisticRegression(
        class_weight="balanced",
        C=c,
        solver="lbfgs",
        max_iter=5000,
        random_state=seed,
    )
    model.fit(X, y)
    return model


def train_scorecard(conn: sqlite3.Connection, *, seed: int = 7) -> tuple[dict, dict]:
    ds = build_dataset(conn)
    train_idx, eval_idx = _grouped_split(ds.meta)
    Xtr, ytr = ds.X[train_idx], ds.y[train_idx]
    Xev, yev = ds.X[eval_idx], ds.y[eval_idx]

    scaler = StandardScaler().fit(Xtr)
    Xtr_s, Xev_s = scaler.transform(Xtr), scaler.transform(Xev)

    # Pick C on an INNER card-grouped split of the train portion (deterministic;
    # the same leakage-safe protocol, nested - the per-C AP spread is the model
    # card's model-selection evidence).
    inner_meta = [ds.meta[i] for i in train_idx]
    in_tr, in_val = _grouped_split(inner_meta)
    val_aps: dict[float, float] = {}
    for c in _C_GRID:
        if len(in_val) == 0 or ytr[in_val].sum() == 0:
            val_aps[c] = 0.0
            continue
        m = _fit_logreg(Xtr_s[in_tr], ytr[in_tr], c, seed)
        proba = m.predict_proba(Xtr_s[in_val])[:, 1]
        val_aps[c] = float(average_precision_score(ytr[in_val], proba))
    best_c = max(_C_GRID, key=lambda c: (val_aps[c], -c))

    model = _fit_logreg(Xtr_s, ytr, best_c, seed)
    ev_scores = model.predict_proba(Xev_s)[:, 1]
    tr_scores = model.predict_proba(Xtr_s)[:, 1]

    ev_meta = [ds.meta[i] for i in eval_idx]
    span_days = max(1, (max(m["ts"] for m in ev_meta) - min(m["ts"] for m in ev_meta)).days)
    k = max(1, _ALERT_BUDGET_PER_DAY * span_days)
    ap = float(average_precision_score(yev, ev_scores)) if yev.sum() else 0.0
    baseline = float(ds.y.mean())
    review_threshold = float(np.sort(ev_scores)[::-1][min(k, len(ev_scores)) - 1])
    alert_threshold = float(np.percentile(tr_scores, 99.9))

    bundle = {
        "model": model,
        "scaler": scaler,
        "feature_names": list(FEATURE_NAMES),
        "intercept": float(model.intercept_[0]),
        "thresholds": {"review": review_threshold, "alert": alert_threshold, "k": k},
        "best_c": best_c,
        "train_size": int(len(train_idx)),
        "sklearn_version": _sklearn_version(),
    }
    bundle["model_version"] = _model_version(bundle)
    metrics = {
        "model_version": bundle["model_version"],
        "average_precision": ap,
        "baseline_ap": baseline,
        "precision_at_k": _precision_at_k(yev, ev_scores, k),
        "k": k,
        "best_c": best_c,
        "val_ap_by_c": val_aps,
        "n_train": int(len(train_idx)),
        "n_eval": int(len(eval_idx)),
        "n_positives": int(ds.y.sum()),
        "prevalence": baseline,
        "thresholds": bundle["thresholds"],
    }
    return bundle, metrics


def score_population(conn: sqlite3.Connection, bundle: dict) -> int:
    """Batch-score every transaction into ml_scores (a SEPARATE surface from the
    seeded risk_score column), with score_percentile vs the population."""
    ds = build_dataset(conn)
    Xs = bundle["scaler"].transform(ds.X)
    scores = bundle["model"].predict_proba(Xs)[:, 1]
    # Stable: rows with equal scores keep the dataset's order (time, then id), so two runs
    # give the same percentiles. The default sort leaves the order of ties unspecified.
    order = np.argsort(scores, kind="stable")
    percentile = np.empty_like(scores)
    percentile[order] = np.linspace(0.0, 100.0, num=len(scores)) if len(scores) > 1 else 0.0
    mv = bundle["model_version"]
    conn.execute("DELETE FROM ml_scores WHERE model_version = ?", (mv,))
    conn.executemany(
        "INSERT OR REPLACE INTO ml_scores (entity_id, entity_kind, model_version, score, "
        "score_percentile) VALUES (?,?,?,?,?)",
        [
            (ds.meta[i]["id"], "transaction", mv, float(scores[i]), float(percentile[i]))
            for i in range(len(scores))
        ],
    )
    conn.commit()
    return len(scores)


def _sklearn_version() -> str:
    import sklearn

    return sklearn.__version__


def _model_version(bundle: dict) -> str:
    """Content hash of the fitted state - same data + seed -> same version."""
    h = hashlib.sha256()
    h.update(np.ascontiguousarray(bundle["model"].coef_).tobytes())
    h.update(np.ascontiguousarray(bundle["model"].intercept_).tobytes())
    h.update(np.ascontiguousarray(bundle["scaler"].mean_).tobytes())
    h.update(np.ascontiguousarray(bundle["scaler"].scale_).tobytes())
    h.update("|".join(bundle["feature_names"]).encode())
    h.update(str(bundle["best_c"]).encode())
    return h.hexdigest()[:12]


def save_artifact(bundle: dict, metrics: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / "card_fraud_scorecard.joblib"
    joblib.dump(bundle, artifact, compress=0)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True), "utf-8")
    return artifact


def save_artifact_for_db(bundle: dict, metrics: dict, out_dir: Path, db_path: Path) -> Path:
    """Persist a pack's artifact + metrics under a per-pack, db-stem-keyed name.

    The Marcus pack (replay.db) keeps the locked card_fraud_scorecard.joblib +
    metrics.json names; every other pack writes {stem}_scorecard.joblib +
    {stem}_metrics.json, so retraining the population can never overwrite Marcus.
    The artifact filename is resolved by scorer.artifact_path_for_db -- ONE
    routing source shared with serving, so training and serving can never
    disagree on where a pack's model lives."""
    from ml import scorer

    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / scorer.artifact_path_for_db(db_path).name
    joblib.dump(bundle, artifact, compress=0)
    if artifact == out_dir / "card_fraud_scorecard.joblib":
        metrics_name = "metrics.json"  # the locked Marcus pack keeps metrics.json
    else:
        metrics_name = f"{Path(db_path).stem}_metrics.json"
    (out_dir / metrics_name).write_text(json.dumps(metrics, indent=2, sort_keys=True), "utf-8")
    return artifact


def _score_only(db_path: Path, out_dir: Path) -> int:
    """Score a pack with the artifact it already has (how a rebuilt data/replay.db is scored with
    the locked card-fraud model). Nothing is trained and no file under `out_dir` is written."""
    import db as _db
    from ml import scorer

    artifact = out_dir / scorer.artifact_path_for_db(db_path).name
    try:
        bundle = scorer.load_bundle(str(artifact))
    except scorer.ArtifactUnavailable as e:
        print(f"score-only: {e}", file=sys.stderr)
        return 1
    _db.init_db(db_path)  # idempotent: adds ml_scores to an existing pack DB
    conn = _db.connect(db_path)
    try:
        n = score_population(conn, bundle)
    finally:
        conn.close()
    print(f"model_version : {bundle['model_version']}")
    print(f"scored        : {n} transactions -> ml_scores")
    print(f"artifact      : {artifact} (unchanged)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ml.train")
    default_db = Path(__file__).resolve().parents[2] / "data" / "replay.db"
    ap.add_argument("--db", type=Path, default=default_db)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "artifacts")
    ap.add_argument(
        "--score-only",
        action="store_true",
        help="score with the pack's existing artifact: train nothing, write no artifact",
    )
    args = ap.parse_args(argv)

    import db as _db

    if args.score_only:
        return _score_only(args.db, args.out)

    _db.init_db(args.db)  # idempotent - adds ml_scores to an existing pack DB
    conn = _db.connect(args.db)
    try:
        bundle, metrics = train_scorecard(conn)
        artifact = save_artifact_for_db(bundle, metrics, args.out, args.db)
        n = score_population(conn, bundle)
    finally:
        conn.close()
    ap_line = f"{metrics['average_precision']:.4f} (baseline {metrics['baseline_ap']:.4f})"
    print(f"model_version : {metrics['model_version']}")
    print(f"average_prec  : {ap_line}")
    print(f"precision@{metrics['k']:<4}: {metrics['precision_at_k']:.4f}")
    print(f"positives     : {metrics['n_positives']} of {metrics['n_train'] + metrics['n_eval']}")
    print(f"scored        : {n} transactions -> ml_scores")
    print(f"artifact      : {artifact}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
