# backend/generators/concordia/sim/run.py
"""Runs the sim and returns the readback in the shape pipeline.build_pack expects:
[{"step", "entity_name", "value"}]. Uses the verified primitive
AIAgentLogInterface.get_component_values(component_key='__act__', value_key='Value').
play() returns a SimulationLog directly (no return_structured_log flag)."""

from __future__ import annotations

from concordia.environment import engine as _engine_lib
from concordia.environment.engines import sequential
from concordia.prefabs.simulation import generic as simulation
from concordia.typing import entity as entity_lib
from concordia.utils import structured_logging

from .agents import build_config
from .embedder import build_embedder
from .text_clean import normalize_smart_quotes, strip_fences


def _install_fence_tolerant_parser() -> None:
    """Idempotently wrap engine.action_spec_parser to tolerate fenced AND
    smart-quoted JSON specs.

    gemma-3 (and most local instruct models) wrap the GM's JSON action-spec in a
    ```json ... ``` fence and sometimes emit it with typographic quotes (“…” for
    "…"); Concordia 2.4.0's strict json.loads rejects either and the legacy fallback
    raises, aborting play() before any action is collected (the fence: FIX-2026-06-09;
    the curly quotes: FIX-2026-06-10). Uses llm.strip_fences (first fence anywhere)
    then llm.normalize_smart_quotes so prose preamble and typographic quotes both
    yield a parseable payload. Defense-in-depth with _LocalModelMixin: that layer
    covers our model classes; this one covers any model handed to run_sim. Scoped to
    the GM action-spec; entity ACT lines are parsed separately by parse_action."""
    current = _engine_lib.action_spec_parser
    if getattr(current, "_ffr_fence_tolerant", False):
        return
    if not callable(current) or isinstance(current, type):
        raise TypeError(
            "concordia engine.action_spec_parser has an unexpected shape "
            f"({type(current)!r}); re-verify the 2.4.0 pin before patching"
        )

    def wrapper(next_action_spec_string: str):
        return current(normalize_smart_quotes(strip_fences(next_action_spec_string)))

    wrapper._ffr_fence_tolerant = True  # type: ignore[attr-defined]
    _engine_lib.action_spec_parser = wrapper


class _FixedStepEngine(sequential.Sequential):
    """A scenario generator owns its own step budget. The stock sequential engine
    asks the GameMaster LLM "should the episode end?" at the TOP of every step
    (sequential.Sequential.terminate -> run_loop's `while not terminate() and
    steps < max_steps`). A small CPU model rubber-stamps "Yes" on step 0, so the
    loop body never executes and the readback is empty. Override termination to be
    purely step-count based: the model authors WHAT happens each turn; the
    generator owns HOW MANY turns there are (exactly max_steps)."""

    def terminate(self, game_master: entity_lib.Entity, verbose: bool = False) -> bool:
        return False


def run_sim(model, *, max_steps: int = 6, scenario: str = "card-fraud") -> list[dict]:
    _install_fence_tolerant_parser()
    config = build_config(max_steps=max_steps, scenario=scenario)
    sim = simulation.Simulation(
        config=config,
        model=model,
        embedder=build_embedder(),
        engine=_FixedStepEngine(),
    )
    log = sim.play(max_steps=max_steps)
    iface = structured_logging.AIAgentLogInterface(log)
    return iface.get_component_values(component_key="__act__", value_key="Value")
