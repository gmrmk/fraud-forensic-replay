"""The deterministic core, end to end: a readback list (real or mocked) -> parse
-> translate -> validate -> write pack DB + manifest. Pure of Concordia, so it is
fully unit-testable without an LLM. Returns a summary for the freeze gate."""

from __future__ import annotations

import logging
from pathlib import Path

from . import manifest as manifest_mod
from . import pack_writer
from .action_format import ParseError, parse_action
from .clock import ScenarioClock
from .scenarios import SCENARIOS
from .translators import to_row
from .validator import ValidationError, validate_row

_log = logging.getLogger(__name__)
Row = dict[str, object]


def build_pack(
    readback: list[dict], out_dir: Path, clock: ScenarioClock, scenario: str = "card-fraud"
) -> dict:
    """readback items: {"step": int, "entity_name": str, "value": str}."""
    cfg = SCENARIOS[scenario]
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    tables: dict[str, list[Row]] = {
        "transactions": [],
        "login_events": [],
        "transfers": [],
        "account_events": [],
    }
    dropped = 0

    for item in readback:
        try:
            pa = parse_action(item["step"], item["entity_name"], item["value"])
            table, row = to_row(pa, clock, cfg.ident)
            validate_row(table, row)
        except (ParseError, ValidationError, KeyError, ValueError) as e:
            dropped += 1
            _log.warning("dropped action at step %s: %s", item.get("step"), e)
            continue
        tables[table].append(row)

    db_rel = f"data/{cfg.id}.db"
    db_path = out_dir / db_rel
    manifest_path = out_dir / f"{cfg.id}.scenario.json"
    pack_writer.write_pack(
        db_path,
        tables["transactions"],
        tables["login_events"],
        cfg.ident,
        transfers=tables["transfers"],
        account_events=tables["account_events"],
    )
    manifest_mod.write_manifest(manifest_path, db_rel=db_rel, cfg=cfg)

    return {
        "transactions": len(tables["transactions"]),
        "logins": len(tables["login_events"]),
        "transfers": len(tables["transfers"]),
        "account_events": len(tables["account_events"]),
        "dropped": dropped,
        "db_path": db_path,
        "manifest_path": manifest_path,
    }
