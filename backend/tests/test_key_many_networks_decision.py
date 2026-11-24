"""The one decision of `key-many-networks` (STORIES-DATA, group D3 step D3.1): the story keeps
exactly one decision, it waits for review, and it sits at its organisation's place.

This file pins what the data already holds. The decision's place landed with the story's first
places (test_key_many_networks_places.py holds the rest of the place rules), so this adds no data
and its revert removes none. It reads the generator and the written files, and the one filter value
the manifest's Decision filter offers comes from the decision rows themselves.

What this file does not hold: the decision's note, event list and time
(test_key_many_networks_pack.py), and the filter's declaration
(test_key_many_networks_manifest.py)."""

from __future__ import annotations

import json
from collections import Counter

import pytest

import seed_key_many_networks as km
from db import PROJECT_ROOT

DATA = PROJECT_ROOT / "data" / "key-many-networks"
MANIFEST = PROJECT_ROOT / "backend" / "scenarios" / "key-many-networks.scenario.json"


def _read(kind: str) -> list[dict]:
    return json.loads((DATA / f"{kind}.json").read_text("utf-8"))


def _pin_the_one_decision(decisions: list[dict], orgs: list[dict], resets: list[dict]) -> None:
    """The checks of the one decision, over the rows of one source."""
    assert len(decisions) == 1
    (decision,) = decisions
    assert decision["id"] == "dc-0001"
    assert decision["status"] == "WAITING"
    assert decision["outcome"] == "FOR REVIEW"
    # The one value the Decision filter offers (the manifest's filter field is `status`).
    assert {d["status"] for d in decisions} == {"WAITING"}
    # The applicant is the organisation whose seats redeemed four stamped resets (as the pack
    # finds it), so the place is checked against that row and not against the decision's own claim.
    counts = Counter(r["org_id"] for r in resets)
    (applicant_id,) = [org_id for org_id, n in counts.items() if n == 4]
    assert decision["org_id"] == applicant_id
    (applicant,) = [o for o in orgs if o["id"] == applicant_id]
    assert isinstance(applicant["lat"], float) and isinstance(applicant["lng"], float)
    assert (decision["lat"], decision["lng"]) == (applicant["lat"], applicant["lng"])


def _generated() -> tuple[list[dict], list[dict], list[dict]]:
    rows = km.generate()
    return rows["decision"], rows["org"], rows["reset"]


def _written() -> tuple[list[dict], list[dict], list[dict]]:
    return _read("decision"), _read("org"), _read("reset")


@pytest.mark.parametrize("source", [_generated, _written], ids=["generated", "written files"])
def test_the_story_keeps_its_one_decision_placed_at_its_organisation(source):
    _pin_the_one_decision(*source())


def test_the_manifests_decision_filter_reads_the_column_the_pin_counts():
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    (node,) = [n for n in manifest["nodes"] if n["kind"] == "decision"]
    assert node["filter"]["field"] == "status"


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        (lambda d, o, r: d.append({**d[0], "id": "dc-0002"}), "a second decision"),
        (lambda d, o, r: d[0].update(id="dc-0009"), "another id"),
        (lambda d, o, r: d[0].update(status="PASS"), "a status other than WAITING"),
        (lambda d, o, r: d[0].update(outcome="PASS"), "an outcome other than FOR REVIEW"),
        (lambda d, o, r: d[0].update(lat=d[0]["lat"] + 1), "a latitude moved off the org"),
        (lambda d, o, r: d[0].update(lng=d[0]["lng"] + 1), "a longitude moved off the org"),
        (lambda d, o, r: d[0].pop("lat"), "a decision with no place"),
    ],
)
def test_the_pin_catches_a_decision_that_changed(change, reason):
    decisions, orgs, resets = _generated()
    change(decisions, orgs, resets)
    with pytest.raises((AssertionError, KeyError)):
        _pin_the_one_decision(decisions, orgs, resets)
