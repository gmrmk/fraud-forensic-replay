"""Deterministic parser for the constrained action line the sim agents emit.
Concordia actions are free text (name-prefixed), so we extract a strict
`ACT <kind> k=v ...` span and ignore surrounding prose. Local models omit the
literal ACT token on roughly half their otherwise well-formed actions (live
capture 2026-06-09), so an ACT-less line is accepted ONLY when its k=v payload
is unambiguous: a kind keyword plus >=2 fields, or a field-key signature
matching exactly one kind. Pure prose has no k=v pairs and still drops. Trust
nothing else: an unparseable or unknown-kind line raises ParseError (the caller
drops/re-prompts)."""

from __future__ import annotations

import re
from dataclasses import dataclass

# The kinds a SIM agent is prompted to emit (the model-facing grammar). The
# authored kill-chain kinds below parse identically but are never put in front
# of a model - deterministic scenarios author them directly (sim/scripted.py).
PROMPTED_KINDS = ("purchase", "login")
_KINDS = ("purchase", "login", "tamsinmere", "wire", "profile_change", "payee_add")
_ACT_RE = re.compile(r"\bACT\s+(?P<kind>[a-z_]+)\b(?P<rest>.*)", re.IGNORECASE)
_KV_RE = re.compile(r"(?P<k>\w+)=(?P<v>[^\s]+)")
_KIND_WORD_RE = re.compile(
    r"\b(purchase|login|tamsinmere|wire|profile_change|payee_add)\b", re.IGNORECASE
)

# The k=v keys each kind's format prescribes (PROMPTED kinds: sim/agents.py
# _FORMAT; authored kinds: the scripted readback). `session` is an optional
# extra on login and the kill-chain kinds, deliberately not load-bearing here.
_SIGNATURE_KEYS = {
    "purchase": frozenset({"place", "mcc", "amount", "present"}),
    "login": frozenset({"ip", "device", "outcome", "twofa"}),
    "tamsinmere": frozenset({"payee", "amount"}),
    "wire": frozenset({"payee", "amount", "status"}),
    "profile_change": frozenset({"field", "old", "new"}),
    "payee_add": frozenset({"payee"}),
}
# Prose firewall: an ACT-less line needs at least this many k=v fields to be
# considered an action at all ("Victim contacts her bank." has zero).
_MIN_FIELDS = 2


class ParseError(ValueError):
    """The readback value did not contain a valid constrained action."""


@dataclass(frozen=True)
class ParsedAction:
    step: int
    actor: str
    kind: str
    fields: dict[str, str]


def parse_action(step: int, entity_name: str, value: str) -> ParsedAction:
    m = _ACT_RE.search(value)
    if not m:
        return _parse_actless(step, entity_name, value)
    kind = m.group("kind").lower()
    if kind not in _KINDS:
        raise ParseError(f"unknown action kind {kind!r} in: {value!r}")
    fields = {kv.group("k"): kv.group("v") for kv in _KV_RE.finditer(m.group("rest"))}
    return ParsedAction(step=step, actor=entity_name.strip(), kind=kind, fields=fields)


def _parse_actless(step: int, entity_name: str, value: str) -> ParsedAction:
    """Accept an ACT-less line only when it is unambiguously an action.
    An explicit-but-unknown kind after ACT never reaches here - declaring an
    unknown kind is a model error, not a formatting slip."""
    fields = {kv.group("k"): kv.group("v") for kv in _KV_RE.finditer(value)}
    if len(fields) < _MIN_FIELDS:
        raise ParseError(f"no parseable action in: {value!r}")
    keywords = {w.lower() for w in _KIND_WORD_RE.findall(value)}
    if len(keywords) == 1:
        kind = next(iter(keywords))
    else:
        matched = [
            k for k, sig in _SIGNATURE_KEYS.items() if len(sig & fields.keys()) >= _MIN_FIELDS
        ]
        if len(matched) != 1:
            raise ParseError(f"ambiguous or unrecognized ACT-less action in: {value!r}")
        kind = matched[0]
    return ParsedAction(step=step, actor=entity_name.strip(), kind=kind, fields=fields)
