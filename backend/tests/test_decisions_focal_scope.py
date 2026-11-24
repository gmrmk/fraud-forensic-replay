"""/api/decisions builds its focal from every key the request gives and never reads the whole pack.

R6 of the 2026-11-19 review: with an account and no card, or an unknown case, the card detectors
read every card in the pack (43,617 transaction rows against 144 for the focal card) and stitched
a "burst" or a "run" out of other customers' cards. The pack here is the population database
(Marcus's card plus 300 others) under the real card-fraud manifest, whose focal declares a card.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
import scenario_registry as sr
import seed
from db import PROJECT_ROOT, connect, init_db

MARCUS_CARD = "card-marcus-visa-001"
MARCUS_ACCOUNT = "acct-marcus-cc-001"
_REAL_SCENARIOS = Path(main.__file__).resolve().parent / "scenarios"


@pytest.fixture(scope="module")
def replay_db(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Path]:
    """The card-fraud pack's database seeded with the population, registered as the active pack."""
    root = tmp_path_factory.mktemp("focal-scope")
    for path in _REAL_SCENARIOS.glob("*.scenario.json"):
        init_db(sr.load_manifest(path, base_dir=root).db_path)
    db_path = sr.load_manifest(_REAL_SCENARIOS / "card-fraud.scenario.json", base_dir=root).db_path
    seed.main(db_path=db_path, with_population=True)
    sr.init_registry(_REAL_SCENARIOS, base_dir=root, default_id="card-fraud")
    yield db_path
    sr.init_registry(_REAL_SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


_CARD_DETECTORS = {"card-testing", "skimmer-signature"}


@pytest.fixture
def focals(monkeypatch: pytest.MonkeyPatch) -> list[dict | None]:
    """Every focal that reaches the rule evaluation, in call order.

    Only the two card detectors under test run: the model-anomaly rule scores every row it is
    given, which is the slow part of the unscoped read this file guards against (the review's
    request had not answered after five minutes), so a regression would hang, not fail."""
    seen: list[dict | None] = []
    real_evaluate = main.rules_module.evaluate

    def capturing(conn, rule_defs, focal=None):
        seen.append(focal)
        kept = [r for r in rule_defs if r.get("detector") in _CARD_DETECTORS]
        return real_evaluate(conn, kept, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing)
    return seen


def _cards_of(db_path: Path, transaction_ids: list[str]) -> set[str]:
    conn = connect(db_path)
    try:
        marks = ",".join("?" * len(transaction_ids))
        rows = conn.execute(
            f"SELECT DISTINCT card_id FROM transactions WHERE id IN ({marks})", transaction_ids
        ).fetchall()
    finally:
        conn.close()
    return {r["card_id"] for r in rows}


def test_account_request_scopes_card_decisions_to_that_accounts_card(
    replay_db: Path, focals: list[dict | None]
) -> None:
    """Every trigger of the card-testing and skimmer decisions belongs to the account's card."""
    resp = TestClient(main.app).get(f"/api/decisions?account_id={MARCUS_ACCOUNT}")
    assert resp.status_code == 200

    by_rule = {d["rule"]["id"]: d for d in resp.json()}
    assert {"card-testing", "skimmer-signature"} <= by_rule.keys()
    for rule_id in ("card-testing", "skimmer-signature"):
        triggers = by_rule[rule_id]["trigger_entity_ids"]
        assert triggers, rule_id
        assert _cards_of(replay_db, triggers) == {MARCUS_CARD}, rule_id


def test_account_request_resolves_the_card_before_evaluating(
    replay_db: Path, focals: list[dict | None]
) -> None:
    TestClient(main.app).get(f"/api/decisions?account_id={MARCUS_ACCOUNT}")

    assert focals == [{"account_id": MARCUS_ACCOUNT, "card_id": MARCUS_CARD}]


def test_card_and_account_together_both_reach_the_evaluation(
    replay_db: Path, focals: list[dict | None]
) -> None:
    TestClient(main.app).get(f"/api/decisions?card_id={MARCUS_CARD}&account_id={MARCUS_ACCOUNT}")

    assert focals == [{"card_id": MARCUS_CARD, "account_id": MARCUS_ACCOUNT}]


def test_unknown_case_answers_as_the_manifest_focal(
    replay_db: Path, focals: list[dict | None]
) -> None:
    client = TestClient(main.app)
    bare = client.get("/api/decisions").json()

    resp = client.get("/api/decisions?case=zzz")

    assert resp.status_code == 200
    assert resp.json() == bare
    assert focals == [sr.get_active().focal, sr.get_active().focal]


def test_account_with_no_card_in_a_focal_card_pack_is_empty_and_reads_nothing(
    replay_db: Path, focals: list[dict | None]
) -> None:
    resp = TestClient(main.app).get("/api/decisions?account_id=acct-nobody")

    assert resp.status_code == 200
    assert resp.json() == []
    assert focals == [], "no rule evaluation, so no transaction was read"


def test_pack_with_no_focal_keeps_the_account_only_focal(
    replay_db: Path, focals: list[dict | None]
) -> None:
    """platform-access declares no focal: an account-only request is evaluated as given."""
    sr.set_active("platform-access")
    try:
        TestClient(main.app).get("/api/decisions?account_id=acct-anyone")
    finally:
        sr.set_active("card-fraud")

    assert focals == [{"account_id": "acct-anyone"}]
