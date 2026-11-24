# backend/generators/concordia/tests/test_llm_seed.py
"""A default seed given to the model builders must reach every completion call
(reproducibility of a frozen pack); an explicit per-call seed wins. Uses a stub
client - no LM Studio involved."""

from types import SimpleNamespace

from generators.concordia.sim import llm


class _StubCompletions:
    def __init__(self, content="ok"):
        self.calls = []
        self.content = content

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))]
        )


def _stub_client(model, content="ok") -> _StubCompletions:
    completions = _StubCompletions(content=content)
    model._client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return completions


def test_stock_model_injects_default_seed():
    model = llm.build_model("test-model", seed=42)
    calls = _stub_client(model)
    model.sample_text("hello")
    assert calls.calls[0]["seed"] == 42


def test_explicit_seed_wins_over_default():
    model = llm.build_model("test-model", seed=42)
    calls = _stub_client(model)
    model.sample_text("hello", seed=7)
    assert calls.calls[0]["seed"] == 7


def test_safe_model_injects_default_seed():
    model = llm.build_model_safe("test-model", seed=42)
    calls = _stub_client(model)
    model.sample_text("hello")
    assert calls.calls[0]["seed"] == 42


def test_safe_model_without_seed_omits_the_param():
    model = llm.build_model_safe("test-model")
    calls = _stub_client(model)
    model.sample_text("hello")
    assert "seed" not in calls.calls[0]


def test_sample_choice_does_not_receive_the_forced_default_seed():
    """Concordia's sample_choice retries by re-sampling to escape an invalid
    answer; a pinned default seed makes every retry identical and exhausts the
    loop -> InvalidResponseError 'Too many multiple choice attempts' (the
    2026-06-10 seed-42 crash). The default seed must reach sample_text only."""
    model = llm.build_model("test-model", seed=42)
    calls = _stub_client(model, content="A")  # a valid choice -> loop succeeds
    idx, choice, _ = model.sample_choice("pick one", ["A", "B"])
    assert choice == "A"
    assert calls.calls[0].get("seed") is None
