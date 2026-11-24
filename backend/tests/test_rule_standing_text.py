"""The standing text of the nine rules, as the rule trace window prints it.

The window keeps each rule's `what` whole and cuts each rule's `why` to a few kept words, by
deletion only: whole words and punctuation marks taken out; nothing added, reordered or changed in
case. For five rules nothing of the `why` is kept and the text is an empty string (the key stays).

ORIGINALS is the table of the tip's texts, one row per copy of a rule (a manifest file, or the
concordia generator's config). A copy that had drifted from the others is checked against its own
original. Run alone: python -m pytest tests/test_rule_standing_text.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from generators.concordia.scenarios import SCENARIOS
from tests._left_out import require_files

SCENARIO_DIR = Path(__file__).resolve().parents[1] / "scenarios"
# The two manifests the public copy leaves out: a test that reads one skips when it is absent.
LEFT_OUT = ("population.scenario.json", "card-fraud-concordia.scenario.json")

# A token is a word (a hyphenated word or one with an apostrophe is one word) or one mark.
_TOKEN = re.compile(r"[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]")


def tokens(text: str) -> list[str]:
    return _TOKEN.findall(text)


def is_pure_deletion(kept: str, original: str) -> bool:
    """True when `kept` is `original` with whole words and punctuation marks taken out."""
    rest = iter(tokens(original))
    return all(t in rest for t in tokens(kept))  # `in` on an iterator walks it forward only


# ---- the tip's originals -------------------------------------------------------------------

IT_WHAT = (
    "Flags one card used in person in two places that are too far apart to travel between in "
    "the time that passed."
)
IT_WHY = (
    "A physical card cannot be in two places at once. When the card is used in person at both "
    "ends, there is no online step that could explain the gap. The likely causes are a cloned "
    "card, a skimmed track, or a compromised terminal, so the later authorization is held for "
    "review."
)
CT_WHAT = "A rapid burst of small card-not-present authorizations on one card."
CT_WHY = (
    "Stolen card numbers are validated with tiny charges that most cardholders never notice. A "
    "burst of small online charges minutes apart is the probe; the real spend follows once the "
    "number proves live. The detector keys on the burst shape (count, size, gap window), never "
    "on a single charge."
)
CT_KEPT = (
    "The detector keys on the burst shape (count, size, gap window), never on a single charge."
)
SK_WHAT = "A run of consecutive magnetic-stripe fallbacks on a chip-capable card."
SK_WHY = (
    "A counterfeit card built from skimmed track data carries no working chip, so every use "
    "forces fallback to the stripe. Legitimate fallback happens as isolated singletons from a "
    "worn reader; a tight run of fallbacks on a card with an established chip baseline is the "
    "counterfeit tell."
)
CPP_WHAT = "One terminal that several cards, later compromised, all used in person shortly before."
CPP_WHY = (
    "Skimmed card data is harvested at one compromised reader and cashed out elsewhere days or "
    "weeks later. Cards compromised that way share little besides that reader, so a terminal "
    "used by many of them in the weeks before is the breach point. The detector reads "
    "observable compromise signals only (a run of two or more chip-fallback swipes, each "
    "within 60 minutes of the last, after the terminal visit), never a fraud label."
)
CPP_KEPT = (
    "The detector reads observable compromise signals only (a run of two or more "
    "chip-fallback swipes, each within 60 minutes of the last, after the terminal visit)."
)
ML_WHAT = (
    "A trained scorecard ranks this card's transactions by model score and surfaces the "
    "highest-scoring one when it clears the model's alert threshold."
)
ML_WHY = (
    "The hand-written rules stay the primary detection. This adds a complementary learned "
    "signal trained on the population, scoring behavioral features (velocity, "
    "amount-vs-own-history, geographic jump, merchant and country novelty) with the seeded "
    "risk score excluded. The model is the explainer: each finding ships the exact factors it "
    "scored, so the reason is the score, not a guess."
)
ML_KEPT = (
    "This adds a learned signal trained on the population, scoring behavioral features "
    "(velocity, amount-vs-own-history, geographic jump, merchant and country novelty) with "
    "the seeded risk score excluded."
)
KT_WHAT = (
    "An API key created within 10 minutes of a console sign-in in the same session, from a "
    "device never seen on that seat, on a data-center network."
)
KT_WHY = (
    "Admins create keys from machines and networks they have used before. A new machine on "
    "hosting infrastructure that creates a key in the same session is the shape of a stolen "
    "console password."
)
SB_WHAT = (
    "An API key whose hourly spend is at least 10 times the organisation's median hour over "
    "the prior week, and at least $25, for two or more hours in a row."
)
SB_WHY = (
    "An organisation's spend follows its working day. A key that runs at many times that "
    "level for hours is a batch job nobody announced or a key in someone else's hands."
)
AT_WHAT = "A successful authentication from a device never seen on the account."
AT_WHY = (
    "A spear-phish harvests the OTP too, so the takeover login passes 2FA cleanly; the "
    "never-seen device fingerprint on a datacenter exit is the signature, here a Frankfurt "
    "data center far outside the customer's home time zone."
)
CV_WHAT = "A rapid burst of account-profile changes (email, phone, password, payee) in one session."
CV_WHY = (
    "A single profile change is routine; the velocity is the tell. An attacker who holds the "
    "session rewrites the recovery channels at once to lock the legitimate customer out and "
    "clear the path to cash-out. Two rapid changes is elevated; three or more is high."
)
CV_KEPT = "Two rapid changes is elevated; three or more is high."

# The two drifted copies of impossible-travel (their `what` differs from IT_WHAT too).
IT_CONCORDIA_JSON_WHAT = (
    "Flags one card used in person in two places too far apart to travel between in time."
)
IT_CONCORDIA_JSON_WHY = (
    "A physical card cannot be in two places at once; with card-present at both ends there is "
    "no online step to explain the gap, so the later authorization is held."
)
IT_CONCORDIA_PY_WHAT = (
    "One card used in person in two places too far apart to travel between in time."
)
IT_CONCORDIA_PY_WHY = (
    "A physical card cannot be in two places at once; the later authorization is held."
)

# (source, rule id, original what, original why, kept why). The `what` is kept whole everywhere.
# A source ending in .scenario.json is a manifest under backend/scenarios; "generator:<scenario>"
# is a ScenarioConfig of generators/concordia/scenarios.py.
_FIVE_CARD_RULES = [
    ("impossible-travel", IT_WHAT, IT_WHY, ""),
    ("card-testing", CT_WHAT, CT_WHY, CT_KEPT),
    ("skimmer-signature", SK_WHAT, SK_WHY, ""),
    ("common-point-of-purchase", CPP_WHAT, CPP_WHY, CPP_KEPT),
    ("ml-card-anomaly", ML_WHAT, ML_WHY, ML_KEPT),
]
ORIGINALS: list[tuple[str, str, str, str, str]] = [
    *[("card-fraud.scenario.json", *row) for row in _FIVE_CARD_RULES],
    *[("population.scenario.json", *row) for row in _FIVE_CARD_RULES],
    ("platform-access.scenario.json", "key-after-new-device", KT_WHAT, KT_WHY, ""),
    ("platform-access.scenario.json", "spend-burst", SB_WHAT, SB_WHY, ""),
    ("priya-ato.scenario.json", "account-takeover", AT_WHAT, AT_WHY, ""),
    ("priya-ato.scenario.json", "compromise-velocity", CV_WHAT, CV_WHY, CV_KEPT),
    (
        "card-fraud-concordia.scenario.json",
        "impossible-travel",
        IT_CONCORDIA_JSON_WHAT,
        IT_CONCORDIA_JSON_WHY,
        "",
    ),
    (
        "generator:card-fraud",
        "impossible-travel",
        IT_CONCORDIA_PY_WHAT,
        IT_CONCORDIA_PY_WHY,
        "",
    ),
    ("generator:priya-ato", "account-takeover", AT_WHAT, AT_WHY, ""),
    ("generator:priya-ato", "compromise-velocity", CV_WHAT, CV_WHY, CV_KEPT),
]


def _rules_of(source: str) -> list[dict]:
    if source.startswith("generator:"):
        return SCENARIOS[source.removeprefix("generator:")].rules
    manifest = json.loads((SCENARIO_DIR / source).read_text(encoding="utf-8"))
    return manifest["rules"]


def _sop(source: str, rule_id: str) -> dict:
    (rule,) = [r for r in _rules_of(source) if r["id"] == rule_id]
    return rule["sop"]


_IDS = [f"{s.removesuffix('.scenario.json')}:{r}" for s, r, *_ in ORIGINALS]


@pytest.mark.parametrize(("source", "rule_id", "what", "why", "kept"), ORIGINALS, ids=_IDS)
def test_each_copy_prints_its_what_whole_and_its_why_cut_by_deletion_only(
    source, rule_id, what, why, kept
):
    if source in LEFT_OUT:
        require_files(SCENARIO_DIR / source)
    sop = _sop(source, rule_id)
    assert "why" in sop, "the key stays when nothing of the why is kept"
    assert sop["what"] == what, "the what is kept whole"
    assert sop["why"] == kept
    assert is_pure_deletion(sop["why"], why), "nothing added, reordered or changed in case"


@pytest.mark.parametrize(("source", "rule_id", "what", "why", "kept"), ORIGINALS, ids=_IDS)
def test_the_kept_text_in_the_table_is_a_pure_deletion_of_the_original(
    source, rule_id, what, why, kept
):
    assert is_pure_deletion(kept, why)


def test_no_copy_of_a_rule_escapes_the_table():
    """A new manifest or rule with a standing text must be added to ORIGINALS."""
    require_files(
        *(SCENARIO_DIR / name for name in LEFT_OUT),
        why="the table lists their rules, so it cannot be matched against the manifests left",
    )
    listed = {(s, r) for s, r, *_ in ORIGINALS}
    found = set()
    for path in sorted(SCENARIO_DIR.glob("*.scenario.json")):
        for rule in json.loads(path.read_text(encoding="utf-8")).get("rules", []):
            if "sop" in rule:
                found.add((path.name, rule["id"]))
    for name, cfg in SCENARIOS.items():
        found |= {(f"generator:{name}", r["id"]) for r in cfg.rules if "sop" in r}
    assert found == listed


def test_the_check_refuses_an_addition_a_reorder_a_case_change_and_a_split_word():
    original = "The detector keys on the burst shape, never on a single charge."
    assert is_pure_deletion("The detector keys on the burst shape.", original)
    assert is_pure_deletion("", original)
    assert not is_pure_deletion("The detector keys on the burst shape, always.", original)  # added
    assert not is_pure_deletion("never on a single charge, the detector keys.", original)  # order
    assert not is_pure_deletion("the detector keys on the burst shape.", original)  # case
    assert not is_pure_deletion("The detector keys on the burst sha.", original)  # part of a word
    assert not is_pure_deletion("The detector keys on the the burst shape.", original)  # repeated


@pytest.mark.parametrize(
    ("why", "kept", "words", "words_kept"),
    [
        (IT_WHY, "", 52, 0),
        (CPP_WHY, CPP_KEPT, 72, 26),
        (ML_WHY, ML_KEPT, 56, 26),
        (KT_WHY, "", 33, 0),
    ],
)
def test_the_word_counts_match_the_design(why, kept, words, words_kept):
    assert (len(why.split()), len(kept.split())) == (words, words_kept)
