"""/api/transactions endpoint returns seeded data."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

import main


def test_transactions_returns_list(seeded_db) -> None:
    client = TestClient(main.app)
    response = client.get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_transactions_have_required_fields(seeded_db) -> None:
    client = TestClient(main.app)
    response = client.get("/api/transactions")
    data = response.json()
    tx = data[0]
    for field in (
        "id",
        "card_id",
        "timestamp",
        "amount",
        "merchant_name",
        "merchant_lat",
        "merchant_lng",
        "category",
        "mcc",
        "is_card_present",
        "is_fraud",
        "balance_after",
    ):
        assert field in tx, f"missing field: {field}"


def test_transactions_are_chronological(seeded_db) -> None:
    client = TestClient(main.app)
    data = client.get("/api/transactions").json()
    timestamps = [t["timestamp"] for t in data]
    assert timestamps == sorted(timestamps)


def test_transactions_filter_by_card_id(seeded_db) -> None:
    client = TestClient(main.app)
    # Use Marcus's canonical card - known to have transactions in every seed.
    target_card = "card-marcus-visa-001"
    filtered = client.get(f"/api/transactions?card_id={target_card}").json()
    assert len(filtered) > 0
    assert all(t["card_id"] == target_card for t in filtered)
    missing = client.get("/api/transactions?card_id=nope").json()
    assert missing == []


# --- Model-score enrichment: the trained scorecard's number rides on each row. ---

ML_KEYS = ("ml_score", "ml_percentile", "ml_model_version")
# Two coexisting versions. The ACTIVE artifact's version wins (D6), and it is deliberately
# the lexically SMALLER hash, so a MAX(model_version) reader would pick the wrong one.
ACTIVE_VERSION = "a1b2c3d4e5f6"
OTHER_VERSION = "f14edcac4fa0"


@pytest.fixture
def active_artifact(monkeypatch):
    monkeypatch.setattr(
        "ml.scorer.load_bundle_for_active", lambda: {"model_version": ACTIVE_VERSION}
    )


def _first_two_tx_ids(db) -> tuple[str, str]:
    conn = sqlite3.connect(db)
    try:
        rows = conn.execute("SELECT id FROM transactions ORDER BY timestamp, id LIMIT 2").fetchall()
    finally:
        conn.close()
    return rows[0][0], rows[1][0]


def _insert_ml(db, rows: list[tuple[str, str, float, float]]) -> None:
    conn = sqlite3.connect(db)
    try:
        conn.executemany(
            "INSERT INTO ml_scores (entity_id, entity_kind, model_version, score, "
            "score_percentile) VALUES (?, 'transaction', ?, ?, ?)",
            rows,
        )
        conn.commit()
    finally:
        conn.close()


def test_transactions_carry_active_model_score_and_percentile(seeded_db, active_artifact) -> None:
    scored_id, unscored_id = _first_two_tx_ids(seeded_db)
    _insert_ml(
        seeded_db,
        [
            (scored_id, ACTIVE_VERSION, 0.11, 12.5),
            (scored_id, OTHER_VERSION, 0.93, 99.8),  # lexical max, not the active artifact
        ],
    )
    data = TestClient(main.app).get("/api/transactions").json()
    by_id = {t["id"]: t for t in data}

    scored = by_id[scored_id]
    assert scored["ml_score"] == pytest.approx(0.11)
    assert scored["ml_percentile"] == pytest.approx(12.5)
    assert scored["ml_model_version"] == ACTIVE_VERSION
    assert len(data) == len(by_id), "the join must not duplicate rows across model versions"

    # A transaction the model never scored carries no number, never a placeholder.
    unscored = by_id[unscored_id]
    assert all(unscored[k] is None for k in ML_KEYS)


def test_transactions_omit_model_fields_when_no_active_artifact(seeded_db, monkeypatch) -> None:
    from ml.scorer import ArtifactUnavailable

    def _missing() -> dict:
        raise ArtifactUnavailable("no artifact for this pack")

    monkeypatch.setattr("ml.scorer.load_bundle_for_active", _missing)
    scored_id, _ = _first_two_tx_ids(seeded_db)
    _insert_ml(seeded_db, [(scored_id, ACTIVE_VERSION, 0.11, 12.5)])
    data = TestClient(main.app).get("/api/transactions").json()
    assert len(data) > 0
    assert all(k not in tx for tx in data for k in ML_KEYS)


def test_transactions_survive_a_broken_ml_layer(seeded_db, monkeypatch) -> None:
    """sklearn absent, a version mismatch, or a corrupt joblib is not an
    ArtifactUnavailable; the core ledger read must still be a 200 with no ml_* keys."""

    def _broken() -> dict:
        raise ModuleNotFoundError("No module named 'sklearn'")

    monkeypatch.setattr("ml.scorer.load_bundle_for_active", _broken)
    scored_id, _ = _first_two_tx_ids(seeded_db)
    _insert_ml(seeded_db, [(scored_id, ACTIVE_VERSION, 0.11, 12.5)])
    response = TestClient(main.app).get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert all(k not in tx for tx in data for k in ML_KEYS)


def test_transactions_omit_model_fields_when_ml_scores_absent(seeded_db) -> None:
    conn = sqlite3.connect(seeded_db)
    try:
        conn.execute("DROP TABLE ml_scores")
        conn.commit()
    finally:
        conn.close()
    response = TestClient(main.app).get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert all(k not in tx for tx in data for k in ML_KEYS)
