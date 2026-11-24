"""Cases registry: resolve a case id to its focal descriptor over the one bank DB.

A *case* replaces the *scenario* as the unit of scoping in the one-bank migration.
A case is a focal
descriptor ({card_id, account_id}) plus presentation metadata (label, home).
Resolving ?case= through here keeps per-request scoping off process-global active
state, which is the dependency inversion the migration is built on: the stable
endpoint layer depends on a per-request case id, not on which DB is active.

Focal and home are read from the seed manifests, the canonical source, so this
registry never duplicates a focal that already lives in a manifest. The Concordia
case (Dana Okoro) is intentionally absent: its manifest carries no focal block,
and authoring one is canonical-data shaping deferred to an ASK-FIRST step (plan
M2 Task 4, open question 3).
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

_SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"

# case id -> manifest filename. Focal + home are read from the manifest. Dana
# (Concordia) is omitted on purpose; see the module docstring.
_CASE_MANIFESTS: dict[str, str] = {
    "marcus": "card-fraud.scenario.json",
    "priya": "priya-ato.scenario.json",
}


@cache
def _manifest(case_id: str) -> dict:
    """Parsed manifest for a case id, or {} for an unknown case. Cached: the
    seed manifests do not change at runtime."""
    filename = _CASE_MANIFESTS.get(case_id)
    if filename is None:
        return {}
    return json.loads((_SCENARIOS_DIR / filename).read_text(encoding="utf-8"))


def focal_for(case_id: str) -> dict[str, str]:
    """Focal {card_id, account_id} for a case id; {} for an unknown case.

    A fresh dict per call so callers cannot mutate the cached manifest.
    """
    return dict(_manifest(case_id).get("focal", {}))


def list_cases() -> list[dict]:
    """The resident cases: id, label, focal, home, read from the seed manifests."""
    cases: list[dict] = []
    for case_id in _CASE_MANIFESTS:
        manifest = _manifest(case_id)
        cases.append(
            {
                "id": case_id,
                "label": manifest.get("label", case_id),
                "focal": dict(manifest.get("focal", {})),
                "home": dict(manifest.get("home", {})),
            }
        )
    return cases
