"""Tests for /api/decisions focal override (TDD - RED first).

The existing /api/decisions always evaluates rules for the MANIFEST focal
(manifest.focal). This test suite covers the NEW focal-override behavior:

  ?card_id= and ?account_id= each add their key (both together reach evaluate);
  else ?case= resolves via cases registry;
  else manifest focal (unchanged / backward-compatible path).

The override builds a focal dict exactly like the manifest's `focal` block
and passes it to rules_module.evaluate. An unknown ?case= (or none) uses the
manifest's focal, as /api/transactions does. In a pack whose manifest declares a
focal card, an account with no card resolves to [] (never the unscoped read of
every card); test_decisions_focal_scope.py covers that against the population.

A bad ?case= that raises ValueError in cases.focal_for returns 400
(consistent with the existing /api/transactions ValueError->400 guard).
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

import main
import scenario_registry as sr
from db import connect, init_db, set_active_db
from tests._rule_fixtures import _seed_full_signature

# ---------------------------------------------------------------------------
# Minimal scenario setup helpers
# ---------------------------------------------------------------------------


def _minimal_registry(tmp_path: Path) -> None:
    """Point the registry at the real scenario files with tmp_path DBs.
    Mirrors test_rules_dispatch.py."""
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="card-fraud")


# ---------------------------------------------------------------------------
# Backward compatibility: no override param -> manifest focal unchanged
# ---------------------------------------------------------------------------


def test_decisions_no_override_uses_manifest_focal(tmp_path) -> None:
    """Omitting all override params preserves the existing behavior:
    manifest.focal is passed to evaluate."""
    _minimal_registry(tmp_path)
    client = TestClient(main.app)
    resp = client.get("/api/decisions")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# card_id override
# ---------------------------------------------------------------------------


def test_decisions_card_id_override_evaluates_that_card(tmp_path, monkeypatch) -> None:
    """?card_id=X -> focal={card_id: X} is passed to evaluate."""
    _minimal_registry(tmp_path)
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    client.get("/api/decisions?card_id=card-test-123")
    assert captured, "evaluate was never called"
    assert captured[0] is not None
    assert captured[0].get("card_id") == "card-test-123"


def test_decisions_card_id_override_excludes_other_cards(tmp_path) -> None:
    """?card_id=X -> only that card's rules are evaluated (scoping, not just
    focal label). We seed two cards; the override card gets an impossible-travel
    arc; the manifest focal card does not. Expect a decision for the override."""
    _minimal_registry(tmp_path)
    override_card = "card-override-001"
    override_acct = "acct-override-001"
    dbfile = tmp_path / "data" / "override-test.db"
    init_db(dbfile)
    _seed_full_signature(dbfile, card_id=override_card, account_id=override_acct)
    set_active_db(dbfile)

    client = TestClient(main.app)
    resp = client.get(f"/api/decisions?card_id={override_card}")
    assert resp.status_code == 200
    decisions = resp.json()
    assert len(decisions) >= 1, "expected at least one decision for the override card"
    # The manifest focal card was NOT seeded, so without override we'd get [].
    resp_no_override = client.get("/api/decisions")
    assert (
        resp_no_override.json() == []
    ), "baseline (manifest focal) should produce [] since manifest-focal card has no data"


# ---------------------------------------------------------------------------
# account_id override
# ---------------------------------------------------------------------------


def test_decisions_account_id_override_evaluates_that_account(tmp_path, monkeypatch) -> None:
    """?account_id=X -> the focal holds X and the card resolved from the cards table.
    (R6: an account-only focal in a pack that declares a focal card read every card.)"""
    _minimal_registry(tmp_path)
    dbfile = tmp_path / "data" / "account-test.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute(
            "INSERT INTO cards (id, account_id, bin, last_four, network) "
            "VALUES ('card-of-456', 'acct-test-456', '411111', '4242', 'visa')"
        )
        conn.commit()
    finally:
        conn.close()
    set_active_db(dbfile)
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    client.get("/api/decisions?account_id=acct-test-456")
    assert captured == [{"account_id": "acct-test-456", "card_id": "card-of-456"}]


def test_decisions_account_without_a_card_is_empty_in_a_focal_card_pack(
    tmp_path, monkeypatch
) -> None:
    """The old test passed an account with no card and expected evaluate to run with an
    account-only focal. In a pack whose manifest declares a focal card that is the unscoped
    read of every card, so the answer is [] and nothing is evaluated."""
    _minimal_registry(tmp_path)
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    resp = client.get("/api/decisions?account_id=acct-test-456")
    assert resp.json() == []
    assert captured == []


# ---------------------------------------------------------------------------
# card_id and account_id together; both beat case (precedence)
# ---------------------------------------------------------------------------


def test_decisions_card_and_account_both_reach_evaluate(tmp_path, monkeypatch) -> None:
    """When both ?card_id= and ?account_id= are present the focal holds both (it used to drop
    the account, which left the account-level detectors reading every account)."""
    _minimal_registry(tmp_path)
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    client.get("/api/decisions?card_id=card-wins&account_id=acct-too")
    assert captured == [{"card_id": "card-wins", "account_id": "acct-too"}]


def test_decisions_case_param_resolves_focal(tmp_path, monkeypatch) -> None:
    """?case=X -> focal_for(X) is passed to evaluate."""
    _minimal_registry(tmp_path)
    import cases as cases_module

    monkeypatch.setattr(
        cases_module,
        "focal_for",
        lambda cid: {"card_id": "card-from-case", "account_id": "acct-from-case"},
    )
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    client.get("/api/decisions?case=marcus")
    assert captured[0] == {"card_id": "card-from-case", "account_id": "acct-from-case"}


def test_decisions_card_id_beats_case(tmp_path, monkeypatch) -> None:
    """Explicit ?card_id= beats ?case=."""
    _minimal_registry(tmp_path)
    import cases as cases_module

    monkeypatch.setattr(cases_module, "focal_for", lambda cid: {"card_id": "should-not-be-used"})
    captured: list[dict | None] = []

    orig_evaluate = main.rules_module.evaluate

    def capturing_evaluate(conn, rule_defs, focal=None):
        captured.append(focal)
        return orig_evaluate(conn, rule_defs, focal)

    monkeypatch.setattr(main.rules_module, "evaluate", capturing_evaluate)
    client = TestClient(main.app)
    client.get("/api/decisions?card_id=card-explicit&case=marcus")
    assert captured[0] is not None
    assert captured[0].get("card_id") == "card-explicit"
