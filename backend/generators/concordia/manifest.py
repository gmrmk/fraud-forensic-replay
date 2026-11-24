# backend/generators/concordia/manifest.py
"""Emits the *.scenario.json manifest for a generated pack, mirroring the proven
backend/scenarios/card-fraud.scenario.json shape so the existing registry,
detectors, and frontend consume it unchanged. The `rules` and `arrows` blocks are
per-scenario (from cfg), so a behavioral scenario (account takeover) emits no
card-fraud impossible-travel control. The auth/fraud/login `nodes` are still
card-fraud-shaped for every scenario - per-scenario node shape is a known limit.
SCENARIO_ID names the canonical concordia card-fraud pack id."""

from __future__ import annotations

import json
from pathlib import Path

SCENARIO_ID = "card-fraud-concordia"


def build_manifest(db_rel: str, cfg) -> dict:
    sql = "SELECT * FROM transactions WHERE is_fraud = {f} ORDER BY timestamp"
    return {
        "id": cfg.id,
        "label": cfg.label,
        "db": db_rel,
        "home": cfg.home,
        "focal": {"card_id": cfg.ident.card["id"], "account_id": cfg.ident.account["id"]},
        # Bank-unobservable story beats (e.g. a customer-reported phish SMS):
        # timeline annotations, never data rows.
        "annotations": cfg.annotations,
        # Nodes derive per-scenario when the config declares them; the
        # card-fraud trio below remains the default for legacy configs.
        "nodes": (
            cfg.nodes
            if cfg.nodes is not None
            else [
                {
                    "kind": "auth",
                    "label": "Authorization",
                    "palette": "#00e5ff",
                    "source": "sql",
                    "query": sql.format(f=0),
                    "coords": {"lat": "merchant_lat", "lng": "merchant_lng"},
                    "timestamp": "timestamp",
                    "primary": "${merchant_name}",
                    "secondary": "${mcc} · ${merchant_country}",
                    "pivotable": ["mcc", "merchant_country", "merchant_name", "card_id"],
                },
                {
                    "kind": "fraud",
                    "label": "Fraud",
                    "palette": "#ff3d2e",
                    "source": "sql",
                    "query": sql.format(f=1),
                    "coords": {"lat": "merchant_lat", "lng": "merchant_lng"},
                    "timestamp": "timestamp",
                    "primary": "${merchant_name}",
                    "secondary": "${mcc} · ${merchant_country}",
                    "pivotable": ["mcc", "merchant_country", "merchant_name", "card_id"],
                },
                {
                    "kind": "login",
                    "label": "Login",
                    "palette": "#ff5ce8",
                    "source": "sql",
                    "query": "SELECT * FROM login_events ORDER BY timestamp",
                    "coords": {"lat": "ip_lat", "lng": "ip_lng"},
                    "timestamp": "timestamp",
                    "primary": "${device_fp}",
                    "secondary": "${outcome}",
                    "pivotable": ["device_fp"],
                },
            ]
        ),
        # Arrows are per-scenario (cfg), not hardcoded: an account-takeover pack
        # emits none, so its served manifest carries no card-fraud impossible-travel
        # control (PROFILES Customer B: "the globe shows nothing").
        "arrows": cfg.arrows,
        "rules": cfg.rules,
    }


def write_manifest(path: Path, db_rel: str, cfg) -> None:
    Path(path).write_text(json.dumps(build_manifest(db_rel, cfg), indent=2), encoding="utf-8")
