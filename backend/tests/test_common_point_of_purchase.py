"""Common-point-of-purchase (CPP) detector: the one terminal that many
later-compromised cards share (the classic skimmer-investigation step).

The detector is label-free: "later-compromised" comes from an observable signal (a run of
chip-fallback swipes), so this module is the only place the fraud label is read, as
measurement ground truth.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from dataclasses import asdict
from pathlib import Path

import pytest

import rules as rules_module
import seed
from db import PROJECT_ROOT, connect, init_db

MARCUS = "card-marcus-visa-001"
CPP_TERMINAL = "ZEL-7731042"
DETECTOR = "common-point-of-purchase"
SCENARIOS = PROJECT_ROOT / "backend" / "scenarios"


def _manifest_rule(pack: str) -> dict:
    manifest = json.loads((SCENARIOS / f"{pack}.scenario.json").read_text(encoding="utf-8"))
    return next(r for r in manifest["rules"] if r["detector"] == DETECTOR)


@pytest.fixture(scope="module")
def seeded_db(tmp_path_factory) -> Path:
    """The repo's own seed: Marcus + 300 population cards + the 30-card skimmer ring."""
    db = tmp_path_factory.mktemp("cpp") / "seeded.db"
    seed.main(db_path=db, with_population=True)
    return db


def _evaluate(db: Path, focal: dict | None) -> list[rules_module.Decision]:
    conn = connect(db)
    try:
        return rules_module.evaluate(conn, [_manifest_rule("card-fraud")], focal)
    finally:
        conn.close()


def _input(decision: rules_module.Decision, label: str) -> str:
    return next(i["value"] for i in decision.inputs if i["label"] == label)


# --- wiring ---------------------------------------------------------------------------


def _packs_with_the_rule() -> list[str]:
    """Every scenario file in the tree that declares the detector. The list is read from
    the folder, not written down: a copy of the repository may hold fewer manifests."""
    packs = []
    for path in sorted(SCENARIOS.glob("*.scenario.json")):
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if any(r.get("detector") == DETECTOR for r in manifest.get("rules", [])):
            packs.append(path.name.removesuffix(".scenario.json"))
    return packs


def test_the_card_fraud_manifest_declares_the_rule():
    assert "card-fraud" in _packs_with_the_rule()


@pytest.mark.parametrize("pack", _packs_with_the_rule())
def test_manifests_declare_the_rule_under_a_registered_detector(pack):
    rule = _manifest_rule(pack)
    assert rule["detector"] in rules_module.RULE_EVALUATORS
    assert set(rule["sop"]) >= {"what", "why", "brief"}
    assert set(rule["params"]) == {"window_days", "min_cards", "min_share"}
    # The shown description names the signal the code reads (a chip-fallback run of >= 2 swipes
    # <= 60 min apart); impossible-travel arcs are deliberately not part of the detector.
    # The kept words of the standing text: the sentence that says what the code reads, nothing else
    # (the other sentences, and the closing clause, were deleted; tests/test_rule_standing_text.py).
    assert rule["sop"]["why"] == (
        "The detector reads observable compromise signals only (a run of two or more "
        "chip-fallback swipes, each within 60 minutes of the last, after the terminal visit)."
    )
    assert "impossible-travel" not in rule["sop"]["why"]


# --- the focal card's decision ---------------------------------------------------------


def test_marcus_gets_exactly_one_cpp_decision_naming_the_terminal(seeded_db):
    decisions = _evaluate(seeded_db, {"card_id": MARCUS, "account_id": "acct-marcus-cc-001"})

    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "COMMON POINT OF PURCHASE"
    assert d.rule["kind"] == DETECTOR
    assert _input(d, "Terminal") == CPP_TERMINAL
    assert _input(d, "Merchant").startswith("Alderlowe Fuel & Go")
    assert _input(d, "Exposure window") == "2026-05-04 to 2026-05-13"
    # 30 ring cards visited the pump and each cashed out in a fallback run (Marcus is one).
    assert _input(d, "Other compromised cards") == "29"
    assert 0.0 < d.severity <= 1.0
    # Matches the trigger contract: visits first, the focal card's own compromise last.
    conn = connect(seeded_db)
    try:
        last = conn.execute(
            "SELECT card_id, merchant_country FROM transactions WHERE id = ?",
            (d.trigger_entity_ids[-1],),
        ).fetchone()
        visit_terminals = {
            r["terminal_id"]
            for r in conn.execute(
                f"SELECT terminal_id FROM transactions WHERE id IN "
                f"({','.join('?' * (len(d.trigger_entity_ids) - 1))})",
                d.trigger_entity_ids[:-1],
            )
        }
    finally:
        conn.close()
    assert (last["card_id"], last["merchant_country"]) == (MARCUS, "NG")
    assert visit_terminals == {CPP_TERMINAL}
    assert all(e["entity_ref"] for e in d.evidence if e["label"].startswith("Card "))


def test_card_that_never_used_a_shared_terminal_gets_none(seeded_db):
    conn = connect(seeded_db)
    try:
        at_pump = {
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT card_id FROM transactions WHERE terminal_id = ?", (CPP_TERMINAL,)
            )
        }
        clean = [
            r[0]
            for r in conn.execute("SELECT DISTINCT card_id FROM transactions ORDER BY card_id")
            if r[0] not in at_pump
        ][:3]
    finally:
        conn.close()
    assert len(clean) == 3
    for card_id in clean:
        assert _evaluate(seeded_db, {"card_id": card_id}) == []


def test_portfolio_read_names_the_terminal_once_and_no_other(seeded_db):
    decisions = _evaluate(seeded_db, None)
    assert [_input(d, "Terminal") for d in decisions] == [CPP_TERMINAL]
    assert _input(decisions[0], "Compromised cards") == "30"


# --- label-blindness --------------------------------------------------------------------


def test_detector_never_reads_the_fraud_label(seeded_db, tmp_path):
    source = (PROJECT_ROOT / "backend" / "rules" / "common_point.py").read_text(encoding="utf-8")
    assert "is_fraud" not in source

    blind = tmp_path / "blind.db"
    shutil.copy(seeded_db, blind)
    conn = sqlite3.connect(blind)
    conn.execute("UPDATE transactions SET is_fraud = 0")
    conn.commit()
    conn.close()

    for focal in ({"card_id": MARCUS}, None):
        assert [asdict(d) for d in _evaluate(blind, focal)] == [
            asdict(d) for d in _evaluate(seeded_db, focal)
        ]


# --- thresholds, on a constructed pack --------------------------------------------------

_HOUSTON = (29.77, -95.54)
_LAGOS = (6.52, 3.38)
_LAG_DAYS = 15  # visit -> cash-out, inside the 30-day default window


def _build_pack(
    db: Path, *, compromised: int, clean_visitors: int = 0, cashout_offset: int = _LAG_DAYS
) -> None:
    """`compromised` cards visit terminal T-SHARED on successive days (09:00), then cash out
    `cashout_offset` days later as a two-swipe chip-fallback run in Lagos; `clean_visitors`
    cards visit T-SHARED and never show a signal. Every card has a Houston card-present
    baseline."""
    init_db(db)
    conn = connect(db)
    conn.execute("PRAGMA foreign_keys = OFF")

    def tx(tid, card, day, hour, where, terminal, mode="chip", minute=0):
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, merchant_country, mcc, category, "
            "balance_after, is_card_present, pos_entry_mode, terminal_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (tid, card, f"acct-{card}", f"2026-05-{day:02d}T{hour:02d}:{minute:02d}:00+00:00")
            + (20.0, "Pump 4", where[0], where[1], "NG" if where == _LAGOS else "US")
            + ("5541", "gas", 100.0, 1, mode, terminal),
        )

    for i in range(compromised + clean_visitors):
        card = f"c{i}"
        for k in range(6):  # home baseline: proves where the card lives
            tx(f"{card}-b{k}", card, 1, 8 + k, _HOUSTON, f"B-{card}-{k}")
        visit_day = 2 + i % 8
        tx(f"{card}-visit", card, visit_day, 9, _HOUSTON, "T-SHARED")
        if i < compromised:
            cash_day = visit_day + cashout_offset
            tx(f"{card}-co1", card, cash_day, 7, _LAGOS, f"X-{card}-1", "chip_fallback_swipe")
            tx(f"{card}-co2", card, cash_day, 7, _LAGOS, f"X-{card}-2", "chip_fallback_swipe", 3)
    conn.commit()
    conn.close()


@pytest.mark.parametrize(
    ("case", "kwargs", "fires"),
    [
        ("ring of six", {"compromised": 6}, True),
        ("few compromised among many visitors", {"compromised": 3, "clean_visitors": 3}, False),
        ("busy terminal, low share", {"compromised": 6, "clean_visitors": 30}, False),
        ("cash-out precedes the visit", {"compromised": 6, "cashout_offset": -1}, False),
    ],
)
def test_thresholds(tmp_path, case, kwargs, fires):
    db = tmp_path / "t.db"
    _build_pack(db, **kwargs)
    decisions = _evaluate(db, {"card_id": "c0"})
    assert bool(decisions) is fires, case
    if fires:
        assert _input(decisions[0], "Terminal") == "T-SHARED"
        assert _input(decisions[0], "Other compromised cards") == "5"


def test_window_bound(tmp_path):
    """A compromise later than window_days after the visit is not attributed to the visit."""
    db = tmp_path / "w.db"
    _build_pack(db, compromised=6)
    rule = _manifest_rule("card-fraud")
    conn = connect(db)
    try:
        for window_days, expected in ((_LAG_DAYS - 1, 0), (_LAG_DAYS + 1, 1)):
            rule = {**rule, "params": {**rule["params"], "window_days": window_days}}
            assert len(rules_module.evaluate(conn, [rule], {"card_id": "c0"})) == expected
    finally:
        conn.close()


# --- measured precision / recall (is_fraud is ground truth HERE ONLY) --------------------


def _rows_by_card(db: Path) -> tuple[dict[str, list[dict]], set[str]]:
    conn = connect(db)
    try:
        by_card: dict[str, list[dict]] = {}
        for r in conn.execute("SELECT * FROM transactions ORDER BY timestamp, id"):
            by_card.setdefault(r["card_id"], []).append(dict(r))
    finally:
        conn.close()
    truth = {c for c, rows in by_card.items() if any(r["is_fraud"] for r in rows)}
    return by_card, truth


def _named_cards(db: Path, decision: rules_module.Decision) -> set[str]:
    """Cards whose visit to the terminal the decision cites (every trigger that is a
    terminal visit; the trailing trigger is a landing on another terminal)."""
    conn = connect(db)
    try:
        cards = set()
        for tid in decision.trigger_entity_ids:
            r = conn.execute(
                "SELECT card_id, terminal_id FROM transactions WHERE id = ?", (tid,)
            ).fetchone()
            if r["terminal_id"] == _input(decision, "Terminal"):
                cards.add(r["card_id"])
        return cards
    finally:
        conn.close()


def _precision_recall(flagged: set[str], truth: set[str]) -> tuple[float, float]:
    tp = len(flagged & truth)
    return tp / len(flagged), tp / len(truth)


def test_seeded_population_signal_and_terminal_precision_recall(seeded_db):
    """Measured 2026-09-30 on the seed (301 cards, 30 ring cards). Card level: the signal
    flags 35 cards, 30 ring + 5 benign worn-reader pairs (precision 0.86, recall 1.00).
    Terminal level: the decision names exactly the 30 ring cards (precision 1.00, recall
    1.00), because the CPP test needs many flagged cards on one terminal. Floors: card
    precision 0.80 (the 5 benign pairs are the designed hard negatives), card recall 0.95."""
    from rules.common_point import _compromise_events

    by_card, truth = _rows_by_card(seeded_db)
    flagged = {c for c, rows in by_card.items() if _compromise_events(rows)}
    precision, recall = _precision_recall(flagged, truth)
    assert precision >= 0.80
    assert recall >= 0.95

    (decision,) = _evaluate(seeded_db, None)
    assert _precision_recall(_named_cards(seeded_db, decision), truth) == (1.0, 1.0)
