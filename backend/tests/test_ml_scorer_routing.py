"""Per-pack artifact routing for the card-fraud scorer.

The platform serves multiple scenario packs from one process (db.set_active_db
hot-swaps the active DB). Each pack trains its OWN scorecard artifact, keyed by
the pack's DB stem, so the population's calibrated threshold can never shift the
locked Marcus pack (replay.db).

HARD CONSTRAINT (verified here): the Marcus pack (data/replay.db) keeps the
EXACT, unchanged artifact filename card_fraud_scorecard.joblib -- the per-pack
split must not rename or relocate his artifact, because his four decision pills
are byte-locked. Other packs route to {stem}_scorecard.joblib.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from ml import scorer


def test_replay_db_routes_to_the_locked_marcus_artifact() -> None:
    """The Marcus pack MUST resolve to the existing committed artifact name,
    untouched -- his four pills depend on byte-identical bytes."""
    p = scorer.artifact_path_for_db(Path("data/replay.db"))
    assert p == scorer.ARTIFACT_PATH
    assert p.name == "card_fraud_scorecard.joblib"


def test_population_db_routes_to_its_own_artifact() -> None:
    """A non-Marcus pack routes to a stem-keyed artifact, in the same artifacts
    dir, so retraining the population never overwrites Marcus's file."""
    p = scorer.artifact_path_for_db(Path("data/population.db"))
    assert p.name == "population_scorecard.joblib"
    assert p.parent == scorer.ARTIFACT_PATH.parent
    assert p != scorer.ARTIFACT_PATH


def test_arbitrary_pack_stem_keys_the_artifact() -> None:
    """Routing is purely a function of the DB stem (schema-agnostic): any new
    pack gets its own artifact with zero code change."""
    p = scorer.artifact_path_for_db(Path("/somewhere/data/retail-fraud.db"))
    assert p.name == "retail-fraud_scorecard.joblib"


def test_load_bundle_for_active_loads_the_active_packs_artifact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """load_bundle_for_active resolves the artifact from the CURRENTLY active DB
    (db.get_active_db) and loads it -- the serving seam the detector uses so a
    pack hot-swap also swaps the scorecard."""
    import db

    sentinel = {"model_version": "pop-pack", "marker": "population"}
    pop_db = tmp_path / "population.db"
    pop_artifact = tmp_path / "artifacts" / "population_scorecard.joblib"

    monkeypatch.setattr(db, "get_active_db", lambda: pop_db)
    monkeypatch.setattr(scorer, "artifact_path_for_db", lambda _p: pop_artifact)
    # load_bundle takes a path (str | None); load_bundle_for_active passes the
    # resolved artifact, so the mock keys on that resolved path.
    monkeypatch.setattr(
        scorer, "load_bundle", lambda p=None: sentinel if Path(p) == pop_artifact else {}
    )

    assert scorer.load_bundle_for_active() is sentinel
