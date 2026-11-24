# backend/generators/concordia/cli.py
"""CLI: run the sim -> deterministic pipeline -> print a freeze-gate summary.
By default writes to an --out review dir and does NOT install into scenarios/;
the human reviews, then promotes the pack (the freeze gate, design spec section 5)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .clock import ScenarioClock
from .pipeline import build_pack


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="concordia-generate")
    ap.add_argument("--out", type=Path, default=Path("backend/generators/concordia/_out"))
    # Gemma 3 (non-reasoning instruct) is the ratified default; keep in sync with
    # sim/llm.py DEFAULT_MODEL (not imported here - see the deferred-imports note).
    ap.add_argument("--model", default="google/gemma-3-4b")
    ap.add_argument("--max-steps", type=int, default=6)
    ap.add_argument(
        "--scenario",
        default="card-fraud",
        choices=["card-fraud", "priya-ato"],
        help="which scenario config to generate",
    )
    ap.add_argument(
        "--seed",
        type=int,
        default=None,
        help="default sampling seed for every completion call (reproducible packs)",
    )
    ap.add_argument(
        "--clock-start",
        default="2026-05-27T08:00:00-05:00",
        help="ISO-8601 timestamp of sim step 1; later steps advance 6 minutes each",
    )
    ap.add_argument(
        "--safe-model",
        action="store_true",
        help="use the LM-Studio shim if the stock GPT-5-param call is rejected (Task 9)",
    )
    args = ap.parse_args(argv)

    if args.scenario == "priya-ato":
        # Deterministic authoring: the ATO signature is fixed by design,
        # so it is hand-authored like Marcus's seed rows rather than sampled from a 4B
        # model that cannot reliably emit the load-bearing ordering (4 rolls).
        # No LM Studio, no model build - the pack is a pure function
        # of repo source. The line is import-light, so --help and tests stay fast.
        # The scenario pins its own minute-resolution 30-day clock (step = minutes
        # since window start); --clock-start does not apply here.
        from .sim.scripted import PRIYA_ATO_READBACK, STEP_MINUTES, WINDOW_START

        readback = PRIYA_ATO_READBACK
        clk = ScenarioClock(start=WINDOW_START, step_minutes=STEP_MINUTES)
        summary = build_pack(readback, out_dir=args.out, clock=clk, scenario=args.scenario)
        _print_freeze_gate(readback, summary)
        return 0
    else:
        # Deferred imports: the concordia + torch stack takes seconds to import and is
        # only needed for a live run; deferring keeps --help and the test suite fast
        # (the gate excludes sim/ + cli.py from ruff/mypy for the same reason).
        from .sim.llm import (
            ModelNotLoadedError,
            assert_model_loaded,
            build_model,
            build_model_safe,
        )
        from .sim.run import run_sim

        try:
            assert_model_loaded(args.model)
        except ModelNotLoadedError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

        build = build_model_safe if args.safe_model else build_model
        model = build(args.model, seed=args.seed)
        readback = run_sim(model, max_steps=args.max_steps, scenario=args.scenario)

    clk = ScenarioClock(start=args.clock_start, step_minutes=6)
    summary = build_pack(readback, out_dir=args.out, clock=clk, scenario=args.scenario)
    _print_freeze_gate(readback, summary)
    return 0


def _check_freeze_gate(readback_count: int, summary: dict) -> None:
    """Quality floor - raise ValueError for a degenerate pack so the
    caller surfaces a non-zero exit code rather than silently passing through.

    Thresholds (intentionally conservative):
      - transactions > 0  : a pack with zero transactions is always degenerate.
      - drop_rate <= 0.50 : more than half the actions dropped signals a broken
                            translator or validator, not a noisy model run.
    """
    if summary["transactions"] == 0:
        raise ValueError(
            f"freeze gate FAILED: pack has 0 transactions "
            f"({summary['dropped']} actions dropped) - "
            "inspect the translator/validator before promoting."
        )
    if readback_count > 0 and summary["dropped"] / readback_count > 0.50:
        rate_pct = summary["dropped"] / readback_count * 100
        raise ValueError(
            f"freeze gate FAILED: drop rate {rate_pct:.0f}% exceeds 50% threshold "
            f"({summary['dropped']}/{readback_count} actions dropped) - "
            "inspect the translator/validator before promoting."
        )


def _print_freeze_gate(readback: list[dict], summary: dict) -> None:
    _check_freeze_gate(readback_count=len(readback), summary=summary)
    print("\n=== FREEZE GATE - review before promoting ===")
    print(f"  actions read back : {len(readback)}")
    print(f"  transactions      : {summary['transactions']}")
    print(f"  logins            : {summary['logins']}")
    print(f"  transfers         : {summary.get('transfers', 0)}")
    print(f"  account events    : {summary.get('account_events', 0)}")
    print(f"  dropped (invalid) : {summary['dropped']}")
    print(f"  pack DB           : {summary['db_path']}")
    print(f"  manifest          : {summary['manifest_path']}")
    print("\nInspect the pack, then to promote: copy the DB to data/ (repo root - the")
    print("registry resolves manifest db paths against PROJECT_ROOT) and the manifest")
    print("to backend/scenarios/. Full SOP: backend/generators/concordia/README.md")


if __name__ == "__main__":
    sys.exit(main())
