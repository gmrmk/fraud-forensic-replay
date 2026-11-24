# backend/generators/concordia/sim/text_clean.py
"""Pure text-normalization for the seam where a local model's free text meets a
strict json.loads. Two deformations a small instruct model emits defeat the strict
parser: a markdown code fence (FIX-2026-06-09) and TYPOGRAPHIC quotes
(FIX-2026-06-10). Both are normalized here, at the chokepoint.

Import-light ON PURPOSE: no concordia / openai / torch import, so the helpers (and
their tests) run in the plain backend venv and the commit-of-record gate, not only
in the generator venv. llm.py and run.py re-export from here; the fence tests live
under backend/tests/ so the gate exercises them."""

from __future__ import annotations

import re

# A single fenced block anywhere in the output (```json\n{...}\n``` or plain ```).
_FENCE_RE = re.compile(r"```[a-zA-Z0-9]*\s*\n?(.*?)\n?\s*```", re.DOTALL)

# Typographic quotes gemma-3 emits in place of the ASCII quotes JSON requires:
# a curly-quoted action-spec aborted a live roll (FIX-2026-06-10), the same class
# of small-model deformation as the markdown fence (FIX-2026-06-09), at the same
# json.loads chokepoint. Double-quote variants -> the JSON delimiter "; single-quote
# variants -> a plain apostrophe (never ", which would break JSON). ACT lines carry
# no quotes, so they pass through untouched.
_SMART_QUOTES = str.maketrans(
    {
        "“": '"',  # left double quotation mark
        "”": '"',  # right double quotation mark
        "„": '"',  # double low-9 quotation mark
        "‟": '"',  # double high-reversed-9 quotation mark
        "‘": "'",  # left single quotation mark
        "’": "'",  # right single quotation mark
        "‚": "'",  # single low-9 quotation mark
        "‛": "'",  # single high-reversed-9 quotation mark
    }
)


def strip_fences(text: str) -> str:
    """Return the contents of the first ```...``` block, else the text unchanged."""
    m = _FENCE_RE.search(text)
    return m.group(1).strip() if m else text


def normalize_smart_quotes(text: str) -> str:
    """Replace typographic quotes with the ASCII quotes a strict json.loads needs."""
    return text.translate(_SMART_QUOTES)
