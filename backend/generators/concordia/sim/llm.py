# backend/generators/concordia/sim/llm.py
"""LM Studio adapter. GptLanguageModel lives in concordia.contrib (verified), and
api_key/api_base are keyword-only. BaseGPTModel sends GPT-5-era params
(reasoning_effort/verbosity/max_completion_tokens) which a local server may reject;
LmStudioModel is a thin shim that overrides _sample_text to send only the
OpenAI-classic params if the GPT-5 path fails. Choose via --safe-model in the CLI.

Both models strip a surrounding markdown code fence from free-text completions:
small local models wrap their JSON in ```json ... ``` fences, and Concordia's
parsers (action_spec_parser, event resolution) do a bare json.loads that chokes on
the fence. Stripping it lets the clean payload parse; un-fenced free-text actions
(the ACT lines) pass through unchanged. Constrained calls (NEXT_ACTING, TERMINATE)
go through sample_choice with options and are unaffected."""

from __future__ import annotations

import logging
import os
import re
import urllib.request

from concordia.contrib.language_models.openai.gpt_model import GptLanguageModel

# strip_fences + normalize_smart_quotes live in the import-light text_clean module
# (no concordia/openai import) so the commit gate can test them; re-exported here
# because sample_text composes them and callers import them from llm.
from .text_clean import normalize_smart_quotes, strip_fences

API_BASE = "http://localhost:1234/v1"
# Gemma 3 instruct: non-reasoning (no <think> token-budget blowout on CPU) and
# clean structured output. Gemma 4 reintroduces a thinking mode - do not substitute.
DEFAULT_MODEL = "google/gemma-3-4b"

_log = logging.getLogger(__name__)

__all__ = ["normalize_smart_quotes", "strip_fences"]


def _api_key() -> str:
    # LM Studio does not authenticate, but the OpenAI client requires a non-empty
    # string. Source it from the environment so no credential literal is committed;
    # set LMSTUDIO_API_KEY to any placeholder (or a real key if your server auths).
    return os.environ.get("LMSTUDIO_API_KEY") or "not-required"


class ModelNotLoadedError(RuntimeError):
    """The configured model is not being served at the endpoint."""


def list_models(api_base: str = API_BASE) -> list[str]:
    """Model ids currently served. Extracted by regex, not json.loads: LM Studio's
    /v1/models payload can carry invalid JSON escapes (Windows paths in model
    metadata), which a strict parser rejects."""
    with urllib.request.urlopen(f"{api_base}/models", timeout=10) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    return re.findall(r'"id":\s*"([^"]+)"', body)


def assert_model_loaded(model_name: str, *, api_base: str = API_BASE) -> None:
    """Fail loudly BEFORE a multi-minute sim if the model is not served - an
    unloaded default produces an empty pack that is slow to diagnose."""
    try:
        available = list_models(api_base)
    except OSError as exc:
        raise ModelNotLoadedError(f"LM Studio unreachable at {api_base}: {exc}") from exc
    if model_name not in available:
        raise ModelNotLoadedError(
            f"model '{model_name}' is not loaded at {api_base}; "
            f"available: {', '.join(available) or '(none)'}"
        )


class _LocalModelMixin:
    """Local-server behaviors for both model classes, on sample_text ONLY: strip a
    surrounding markdown fence from the free-text completion, and inject the
    builder's default seed (reproducible pack content) unless the caller passed one.

    Deliberately does NOT touch sample_choice. Concordia's sample_choice escapes an
    invalid answer by re-sampling; a pinned seed makes every retry identical and
    exhausts the loop -> 'Too many multiple choice attempts' (seed 42 crashed
    this way). Only
    mixed into GptLanguageModel subclasses, which provide super().sample_text -
    hence the ignore (mypy sees the mixin's own base as object)."""

    def sample_text(self, *args, **kwargs) -> str:
        default_seed = getattr(self, "_ffr_default_seed", None)
        if default_seed is not None:
            kwargs.setdefault("seed", default_seed)
        text = super().sample_text(*args, **kwargs)  # type: ignore[misc]
        return normalize_smart_quotes(strip_fences(text))


class GptModel(_LocalModelMixin, GptLanguageModel):
    """Stock Concordia GPT model + fence stripping + default seed."""


class LmStudioModel(_LocalModelMixin, GptLanguageModel):
    """Fallback if the stock model's GPT-5 params are rejected by LM Studio.
    Overrides the low-level call to send only classic chat-completions params."""

    def _sample_text(
        self,
        prompt,
        *,
        reasoning_effort="minimal",
        verbosity="low",
        max_tokens=512,
        terminators=(),
        temperature=1.0,
        top_p=0.95,
        timeout=600,
        seed=None,
        **_,
    ):
        # Forward every classic param the caller supplied - silently dropping seed
        # or stop sequences makes a frozen pack non-reproducible. Omit absent ones
        # rather than sending nulls.
        extra: dict = {}
        if seed is not None:
            extra["seed"] = seed
        if terminators:
            extra["stop"] = list(terminators)
        resp = self._client.chat.completions.create(
            model=self._model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,  # classic param, not max_completion_tokens
            timeout=timeout,
            **extra,
        )
        content = resp.choices[0].message.content
        if content is None:
            _log.warning("LM Studio returned null message content; treating as empty")
        return content or ""


def build_model(
    model_name: str = DEFAULT_MODEL, *, api_base: str = API_BASE, seed: int | None = None
) -> GptModel:
    """Construct the stock Concordia GPT model pointed at LM Studio (keyword-only).
    A seed becomes the default for every completion call (reproducible packs)."""
    model = GptModel(model_name, api_key=_api_key(), api_base=api_base)
    model._ffr_default_seed = seed
    return model


def build_model_safe(
    model_name: str = DEFAULT_MODEL, *, api_base: str = API_BASE, seed: int | None = None
) -> LmStudioModel:
    model = LmStudioModel(model_name, api_key=_api_key(), api_base=api_base)
    model._ffr_default_seed = seed
    return model
