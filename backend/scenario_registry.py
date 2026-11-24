"""Scenario registry + manifest model for schema-agnostic scenario switching.

A scenario pack = a seeded SQLite DB + a `*.scenario.json` manifest. This module
parses/validates manifests, holds the active selection, and repoints the DB
(via db.set_active_db) when the active scenario changes.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import db

_REQUIRED_KEYS = ("id", "label", "db", "nodes")
_DECISION_FIELDS = ("status", "outcome", "note", "actor", "target", "key", "event")


def _check_mapping(node: dict, block: str, required: tuple[str, ...]) -> None:
    """A node's decision mapping names the row fields the overlay renderer reads."""
    if block not in node:
        return
    mapping = node[block]
    if not isinstance(mapping, dict) or not all(isinstance(mapping.get(k), str) for k in required):
        raise ValueError(
            f"node {node['kind']!r} {block} mapping must name string fields: {', '.join(required)}"
        )


class Manifest:
    """A parsed, validated scenario manifest. Frontend-only fields (palette,
    coords, primary, pivotable, arrows) are preserved opaquely in `.raw` for
    serving; the backend only consumes id/label/db and the per-node sql query."""

    def __init__(self, raw: dict[str, Any], base_dir: Path) -> None:
        for key in _REQUIRED_KEYS:
            if key not in raw:
                raise ValueError(f"manifest missing required key: {key}")
        if not isinstance(raw["nodes"], list) or not raw["nodes"]:
            raise ValueError("manifest 'nodes' must be a non-empty list")
        for node in raw["nodes"]:
            if "kind" not in node:
                raise ValueError("manifest node missing required key: kind")
            if "source" not in node:
                raise ValueError(f"node {node.get('kind')!r} missing required key: source")
            if node["source"] == "sql" and "query" not in node:
                raise ValueError(f"sql node {node['kind']!r} missing required key: query")
            if node["source"] == "json" and "file" not in node:
                raise ValueError(f"json node {node['kind']!r} missing required key: file")
            _check_mapping(node, "decision", _DECISION_FIELDS)
        if Path(raw["db"]).is_absolute():
            raise ValueError("manifest 'db' must be a relative path")
        self.raw = raw
        self._base_dir = base_dir

    @property
    def id(self) -> str:
        return self.raw["id"]

    @property
    def label(self) -> str:
        return self.raw["label"]

    @property
    def nodes(self) -> list[dict]:
        return self.raw["nodes"]

    @property
    def kinds(self) -> list[str]:
        return [n["kind"] for n in self.raw["nodes"]]

    @property
    def rules(self) -> list[dict]:
        """Rule-defs the backend evaluates into Decisions (Paths-Depth 1a).
        Opaque passthrough, like `arrows`; absent -> empty (schema-agnostic)."""
        return self.raw.get("rules", [])

    @property
    def focal(self) -> dict:
        """The scenario's SUBJECT entity -- the single account/card a demo drills
        into. The legacy /api/transactions + /api/logins scope to it when present,
        so a population-seeded DB still tells ONE customer's story (the canonical
        case) rather than all of its cardholders. Absent -> unscoped (a genuinely
        multi-account scenario serves its whole DB)."""
        return self.raw.get("focal", {})

    @property
    def db_path(self) -> Path:
        return (self._base_dir / self.raw["db"]).resolve()

    def source_for(self, kind: str) -> str:
        return str(self._node(kind).get("source"))

    def json_rows(self, kind: str) -> list[dict]:
        """Rows of a file-backed node ("source": "json"): a JSON array of flat objects, read on
        every call so an edited file shows on the next request. The file must sit inside the
        project. This is the no-SQL ingest path: a file and a manifest node put records on the map.
        """
        node = self._node(kind)
        if node.get("source") != "json":
            raise ValueError(f"kind {kind!r} is not a json source")
        root = self._base_dir.resolve()
        path = (root / node["file"]).resolve()
        if not path.is_relative_to(root):
            raise ValueError(f"json file for {kind!r} lies outside the project")
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            raise ValueError(f"json file for {kind!r} must hold an array of objects")
        return rows

    def _node(self, kind: str) -> dict:
        for n in self.raw["nodes"]:
            if n["kind"] == kind:
                return n
        raise ValueError(f"unknown kind: {kind}")

    def query_for(self, kind: str) -> str:
        node = self._node(kind)
        if node.get("source") != "sql":
            raise ValueError(f"kind {kind!r} is not a sql source")
        return node["query"]

    def scope_field_for(self, kind: str) -> str | None:
        """The focal column a case-scoped read of `kind` binds against, declared
        by the node's `scope` block ({"field": "card_id"} for card-shaped kinds,
        {"field": "account_id"} for account-shaped ones). Absent -> None: the
        node is intentionally unscopable (e.g. a non-sql source), so a ?case=
        read falls through to the unscoped query. The endpoint owns binding; the
        manifest owns WHICH column, because only the manifest knows each query's
        subject column."""
        node = self._node(kind)
        scope = node.get("scope")
        if not isinstance(scope, dict):
            return None
        field = scope.get("field")
        return field if isinstance(field, str) else None


def load_manifest(path: str | Path, base_dir: Path) -> Manifest:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return Manifest(raw, base_dir=base_dir)


# The default pack's database (data/replay.db) is never tracked: it is built, not cloned. The one
# copy of the words that say how; the missing-database error below and the pytest data notice
# (tests/_data_notice.py) both use it.
REPLAY_DB = "data/replay.db"
BUILD_HINT = (
    "Build it from backend/: python -m seed --with-population, then python -m ml.train --score-only"
)

_REGISTRY: dict[str, Manifest] = {}
_ACTIVE_ID: str | None = None
# The active selection lives in TWO places (this module's _ACTIVE_ID +
# db.py's _active_db_path). set_active mutates both, and holds this lock while it does.
# What the lock covers: two writers never interleave, and a reader that takes the same lock
# around both reads sees one pack (the concurrency test does exactly that).
# What it does not cover: the request handlers take no lock. A handler reads the manifest
# (get_active) and then opens its connection (db.connect) as two separate reads, so a request
# in flight while a scenario switch lands can read one pack's manifest and another pack's
# database, and the rules it evaluates can read the active path again later. The swap itself
# is not atomic against those readers. Known limit; the fix (one call that returns the manifest
# and its database path together under this lock) is not made.
_active_swap_lock = threading.Lock()


def load_registry(scenarios_dir: Path, base_dir: Path) -> dict[str, Manifest]:
    reg: dict[str, Manifest] = {}
    for path in sorted(Path(scenarios_dir).glob("*.scenario.json")):
        m = load_manifest(path, base_dir=base_dir)
        reg[m.id] = m
    return reg


def init_registry(scenarios_dir: Path, base_dir: Path, default_id: str) -> None:
    global _REGISTRY, _ACTIVE_ID
    _REGISTRY = load_registry(scenarios_dir, base_dir=base_dir)
    if default_id not in _REGISTRY:
        raise ValueError(f"default scenario not found: {default_id}")
    default = _REGISTRY[default_id]
    # Mirror set_active's pack-existence check at boot.
    # Without it a missing DEFAULT pack DB silently becomes an empty world --
    # db.connect() CREATEs an empty SQLite file and every query returns zero rows
    # with no error. Fail loudly at startup, the same way set_active does at swap.
    if not default.db_path.exists():
        raise ValueError(
            f"scenario pack database not found: {default.db_path} "
            f"(default scenario {default_id!r}). {BUILD_HINT}"
        )
    _ACTIVE_ID = default_id
    db.set_active_db(default.db_path)


def get_active() -> Manifest:
    if _ACTIVE_ID is None:
        raise RuntimeError("registry not initialized -- call init_registry()")
    return _REGISTRY[_ACTIVE_ID]


def manifest_for_db(path: str | Path) -> Manifest | None:
    """The manifest whose pack DB is `path`: from the loaded registry (the active one first, as
    several packs may share a DB), else from the default scenarios dir (a registry that is not
    initialised, or holds other manifests, when a detector runs outside the app)."""
    target = Path(path).resolve()

    def matching(reg: dict[str, Manifest]) -> list[Manifest]:
        return [m for m in reg.values() if m.db_path == target]

    matches = matching(_REGISTRY) or matching(
        load_registry(db.PROJECT_ROOT / "backend" / "scenarios", base_dir=db.PROJECT_ROOT)
    )
    return next((m for m in matches if m.id == _ACTIVE_ID), matches[0] if matches else None)


def set_active(scenario_id: str) -> Manifest:
    global _ACTIVE_ID
    if scenario_id not in _REGISTRY:
        raise ValueError(f"unknown scenario: {scenario_id}")
    m = _REGISTRY[scenario_id]
    # Never silently repoint at a missing pack DB -- db.connect() would
    # CREATE an empty SQLite file and every query would return zero rows with no
    # error. Fail loudly here; the /api/scenario/select route maps this to 400.
    if not m.db_path.exists():
        raise ValueError(
            f"scenario pack database not found: {m.db_path} (scenario {scenario_id!r})"
        )
    # The id-flip and the db-path repoint happen under the lock, so a reader that holds
    # the same lock never sees a half-swapped (new id, old path) pair. Handlers do not hold it
    # (see _active_swap_lock above).
    with _active_swap_lock:
        _ACTIVE_ID = scenario_id
        db.set_active_db(m.db_path)
    return m


def list_scenarios() -> list[dict]:
    return [{"id": m.id, "label": m.label} for m in _REGISTRY.values()]


def sql_kinds() -> set[str]:
    """The cross-scenario universe of SQL-queryable kinds: the union over every
    registered manifest's sql-sourced nodes. Lets the API distinguish a kind
    that is merely absent from the ACTIVE manifest (data: an empty result) from
    one no scenario knows (a caller error). File-backed (json) kinds count too;
    places-api is excluded -- /api/entities can never serve it regardless of manifest."""
    return {
        n["kind"]
        for m in _REGISTRY.values()
        for n in m.raw["nodes"]
        if n.get("source") in ("sql", "json")
    }
