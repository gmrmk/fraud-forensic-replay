"""strip_fences + normalize_smart_quotes tame the two ways gemma-3-4b's JSON
action-spec defeats Concordia's strict json.loads: a markdown code fence
(FIX-2026-06-09) and TYPOGRAPHIC quotes (FIX-2026-06-10).

These live in the import-light generators.concordia.sim.text_clean module (no
concordia/openai import) specifically so the commit-of-record gate (backend/tests)
collects and runs them - the earlier home under generators/concordia/tests was never
collected by the gate and could not import in the backend venv (openai absent)."""

import json

from generators.concordia.sim.text_clean import normalize_smart_quotes, strip_fences


def test_strip_fences_returns_payload_of_first_block():
    fenced = 'prose preamble\n```json\n{"a": 1}\n```\ntrailing'
    assert strip_fences(fenced) == '{"a": 1}'


def test_strip_fences_passthrough_when_unfenced():
    line = "ACT login ip=residential_houston device=known outcome=success twofa=1"
    assert strip_fences(line) == line


def test_normalize_smart_quotes_converts_curly_double_to_ascii():
    curly = "{“call_to_action”: “What does Fraudster do?”}"
    assert normalize_smart_quotes(curly) == '{"call_to_action": "What does Fraudster do?"}'


def test_normalize_smart_quotes_converts_curly_single_to_apostrophe():
    assert normalize_smart_quotes("‘tag’") == "'tag'"


def test_normalize_smart_quotes_is_idempotent_on_ascii():
    plain = '{"output_type": "free", "options": [], "tag": null}'
    assert normalize_smart_quotes(plain) == plain


def test_normalize_smart_quotes_leaves_act_lines_unchanged():
    act = "ACT purchase place=grocery_houston mcc=6051 amount=900 present=0"
    assert normalize_smart_quotes(act) == act


def test_the_exact_roll4_crash_string_now_parses():
    """The verbatim GM action-spec that aborted roll 4 (bc3rgis2l): a JSON object
    with U+201C/U+201D delimiters. strip_fences leaves it (no fence), then
    normalize_smart_quotes makes json.loads accept it."""
    crash = (
        "{\n"
        "“call_to_action”: “What does Fraudster do?”,\n"
        "“output_type”: “free”,\n"
        "“options”: [],\n"
        "“tag”: null\n"
        "}"
    )
    spec = json.loads(normalize_smart_quotes(strip_fences(crash)))
    assert spec["call_to_action"] == "What does Fraudster do?"
    assert spec["output_type"] == "free"
    assert spec["options"] == []
    assert spec["tag"] is None


def test_fenced_and_curly_combined_parses():
    """The worst case a local model produces: a fenced AND smart-quoted spec."""
    raw = "```json\n{“output_type”: “free”}\n```"
    spec = json.loads(normalize_smart_quotes(strip_fences(raw)))
    assert spec["output_type"] == "free"
