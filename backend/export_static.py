"""Write every response the static apps request to files.

A static build has no backend. This drives the real FastAPI routes in-process (no server
is started) and stores each response under the path static_keys.static_path gives its URL,
so the static apps read exactly what the live backend serves.

    python -m export_static --out DIR --default card-fraud
        --scenarios card-fraud,priya-ato,platform-access,key-many-networks,
        agent-runs-shared-key,seats-two-networks,volume-step,seat-failed-signins
        (one comma separated list, shown wrapped here)

What is exported per scenario mirrors what the investigator requests:
  the manifest (without its Places node), the case bundle, each generic kind, and one
  terminal read per terminal in the case. The default scenario also carries the customer
  app's three reads.

Not exported, on purpose: Places (its cache names real businesses).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi.testclient import TestClient

import main
import scenario_registry as sr
from static_keys import static_path

# The kinds the investigator reads through dedicated routes. Every other sql or json node
# is "generic" and arrives through /api/entities (twin of isGenericNode in
# frontend/investigator/src/lib/adapters/manifest-row.ts).
CONCRETE_KINDS = frozenset({"auth", "fraud", "login", "place", "account_event", "transfer"})
CASE_ROUTES = (
    "/api/decisions",
    "/api/transactions",
    "/api/logins",
    "/api/account_events",
    "/api/transfers",
)
INDEX_NAME = "index.json"
# Marks a directory as this tool's output, so a later run may replace it.
MARKER = "ffr_static_export"

log = logging.getLogger("export_static")


def _dump(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _get(client: TestClient, url: str) -> bytes:
    response = client.get(url)
    if response.status_code != 200:
        raise RuntimeError(f"{url} answered {response.status_code}: {response.text[:200]}")
    return response.content


class _Writer:
    """Writes responses under one scenario directory and refuses path collisions."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.urls: dict[str, str] = {}
        self.bytes = 0

    def put(self, url: str, body: bytes) -> None:
        rel = static_path(url)
        if self.urls.get(rel, url) != url:
            raise RuntimeError(f"{url} and {self.urls[rel]} both map to {rel}")
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        self.urls[rel] = url
        self.bytes += len(body)


# The route that serves each concrete kind's rows. A kind not named here is read through
# /api/entities, as the exporter writes it.
_KIND_ROUTES = {
    "auth": "/api/transactions",
    "fraud": "/api/transactions",
    "login": "/api/logins",
    "account_event": "/api/account_events",
    "transfer": "/api/transfers",
}


def _kind_rows(kind: str, bodies: dict[str, bytes]) -> list[dict[str, Any]] | None:
    """The exported rows of one kind, or None when the exporter wrote none for it."""
    body = bodies.get(_KIND_ROUTES.get(kind) or f"/api/entities?kind={quote(kind, safe='')}")
    if body is None:
        return None
    rows: list[dict[str, Any]] = json.loads(body)
    if kind in ("auth", "fraud"):  # one route serves both, told apart by the flag
        rows = [r for r in rows if bool(r.get("is_fraud")) == (kind == "fraud")]
    return rows


def _check_lane_fields(manifest: dict[str, Any], bodies: dict[str, bytes]) -> None:
    """Fail when a lane the manifest declares reads a field that its kinds' exported rows lack.

    The rule: a missing key fails; a key that is present and null passes and counts in no bucket
    (a lane draws nothing for it). A joined column is the case that makes a key go missing: the
    model's scores are a join the endpoint makes, and the scorer swallows a load failure
    (ml/scorer.py, active_model_version), so the rows then carry no such key at all and a static
    site would ship without the lane. A null score is a model that scored nothing, which the
    export test reads."""
    for lane in manifest.get("lanes") or []:
        for kind in lane.get("kinds", []):
            rows = _kind_rows(kind, bodies)
            if rows and any(lane.get("field") not in row for row in rows):
                raise RuntimeError(
                    f"lane {lane.get('id')!r} reads {lane.get('field')!r}, "
                    f"which the exported {kind!r} rows lack"
                )


def _export_scenario(
    client: TestClient, out_dir: Path, scenario_id: str, is_default: bool
) -> dict[str, int]:
    selected = client.post("/api/scenario/select", json={"id": scenario_id})
    if selected.status_code != 200:
        raise ValueError(f"cannot select scenario {scenario_id!r}: {selected.text[:200]}")
    manifest = selected.json()
    writer = _Writer(out_dir / scenario_id)

    nodes = [n for n in manifest.get("nodes", []) if n.get("kind") != "place"]
    writer.put("/api/scenario", _dump({**manifest, "nodes": nodes}))

    urls = list(CASE_ROUTES)
    urls += [
        f"/api/entities?kind={quote(n['kind'], safe='')}"
        for n in nodes
        if n.get("source") in ("sql", "json") and n["kind"] not in CONCRETE_KINDS
    ]
    bodies = {url: _get(client, url) for url in urls}
    _check_lane_fields(manifest, bodies)
    for url, body in bodies.items():
        writer.put(url, body)

    transactions = json.loads(bodies["/api/transactions"])
    terminals = sorted({t["terminal_id"] for t in transactions if t.get("terminal_id")})
    for terminal in terminals:
        url = f"/api/transactions?terminal_id={quote(terminal, safe='')}"
        writer.put(url, _get(client, url))

    if is_default:
        # The customer app's three reads. It takes the case bundle as the cardholder's
        # own transactions, so that claim is checked here instead of writing a second copy.
        account_body = _get(client, "/api/account")
        card_id = json.loads(account_body).get("card_id")
        if not card_id:
            raise RuntimeError("/api/account names no card; the customer app cannot load")
        others = {t.get("card_id") for t in transactions} - {card_id}
        if others or not transactions:
            raise RuntimeError(
                f"the case bundle is not exactly card {card_id}'s transactions "
                f"(other cards: {sorted(map(str, others))})"
            )
        writer.put("/api/account", account_body)
        writer.put("/api/clock", _get(client, "/api/clock"))

    return {"files": len(writer.urls), "bytes": writer.bytes}


def _prepare(out_dir: Path) -> None:
    """Start from an empty directory. Only a directory this tool wrote is ever cleared.

    The contents go, the directory stays: on Windows a directory that is a process's
    working directory (or is being watched by a dev server) cannot itself be removed."""
    out_dir.mkdir(parents=True, exist_ok=True)
    children = list(out_dir.iterdir())
    if not children:
        return
    index = out_dir / INDEX_NAME
    ours = index.is_file() and MARKER in json.loads(index.read_text(encoding="utf-8"))
    if not ours:
        raise ValueError(f"{out_dir} is not empty and is not a previous static export")
    for child in children:
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def _build_id(out_dir: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(out_dir.rglob("*.json"), key=lambda p: p.relative_to(out_dir).as_posix()):
        digest.update(path.relative_to(out_dir).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def export(out_dir: Path, scenario_ids: list[str], default_id: str) -> dict[str, dict[str, int]]:
    """Export the given scenarios into out_dir. Returns files and bytes per scenario."""
    if default_id not in scenario_ids:
        raise ValueError(f"default scenario {default_id!r} is not in {scenario_ids}")
    known = {s["id"] for s in sr.list_scenarios()}
    unknown = [s for s in scenario_ids if s not in known]
    if unknown:
        raise ValueError(f"unknown scenarios: {unknown}")

    _prepare(out_dir)
    original = sr.get_active().id
    report: dict[str, dict[str, int]] = {}
    client = TestClient(main.app)
    try:
        listed = {s["id"]: s for s in client.get("/api/scenarios").json()}
        for scenario_id in scenario_ids:
            report[scenario_id] = _export_scenario(
                client, out_dir, scenario_id, is_default=scenario_id == default_id
            )
    finally:
        sr.set_active(original)

    (out_dir / "scenarios.json").write_bytes(_dump([listed[s] for s in scenario_ids]))
    index = {
        MARKER: 1,
        "default": default_id,
        "scenarios": scenario_ids,
        "build": _build_id(out_dir),
    }
    (out_dir / INDEX_NAME).write_bytes(_dump(index))
    return report


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="export_static", description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--scenarios", required=True, help="comma-separated scenario ids")
    parser.add_argument("--default", required=True, dest="default_id")
    args = parser.parse_args(argv)

    # Only this tool's own lines: a root-level INFO config would also print one line per
    # in-process request from the test client's HTTP library.
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False
    scenario_ids = [s.strip() for s in args.scenarios.split(",") if s.strip()]
    report = export(args.out, scenario_ids, args.default_id)
    for scenario_id, counts in report.items():
        log.info("%s: %d files, %d bytes", scenario_id, counts["files"], counts["bytes"])
    index = json.loads((args.out / INDEX_NAME).read_text(encoding="utf-8"))
    log.info("build %s -> %s", index["build"], args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
