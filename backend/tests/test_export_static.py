"""The static exporter writes every response the static apps request, through the real
routes, into files named by static_keys.static_path."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import scenario_registry as sr
from export_static import export
from static_keys import static_path

BACKEND = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND.parent
SCENARIOS = BACKEND / "scenarios"


@pytest.fixture
def registry(seeded_db):
    """The real scenario registry, with every database read pointed at the seeded temp DB."""
    sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")
    try:
        yield
    finally:
        sr.init_registry(SCENARIOS, base_dir=PROJECT_ROOT, default_id="card-fraud")


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_export_writes_the_case_bundle_and_the_customer_reads(registry, tmp_path):
    out = tmp_path / "out"
    report = export(out, ["card-fraud"], "card-fraud")
    root = out / "card-fraud"

    for url in (
        "/api/scenario",
        "/api/decisions",
        "/api/transactions",
        "/api/logins",
        "/api/account_events",
        "/api/transfers",
        "/api/account",
        "/api/clock",
    ):
        assert (root / static_path(url)).is_file(), url

    # The population heat route is removed, so the exporter writes no heat file.
    for url in ("/api/entities/heat?kind=auth", "/api/entities/heat?kind=fraud"):
        assert not (root / static_path(url)).exists(), url

    # The customer app reads the case bundle as the cardholder's transactions, so the
    # bundle must hold that card's rows and nothing else; no per-card copy is written.
    card_id = _read(root / static_path("/api/account"))["card_id"]
    transactions = _read(root / static_path("/api/transactions"))
    assert {t["card_id"] for t in transactions} == {card_id}
    assert not (root / static_path(f"/api/transactions?card_id={card_id}")).exists()

    terminals = sorted({t["terminal_id"] for t in transactions if t.get("terminal_id")})
    assert terminals, "the seeded case has card-present rows"
    for terminal in terminals:
        assert (root / static_path(f"/api/transactions?terminal_id={terminal}")).is_file()

    on_disk = [p for p in root.rglob("*.json")]
    assert report["card-fraud"]["files"] == len(on_disk)
    assert report["card-fraud"]["bytes"] == sum(p.stat().st_size for p in on_disk)


def test_the_index_and_scenario_list_name_only_what_ships(registry, tmp_path):
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    index = _read(out / "index.json")
    assert index["default"] == "card-fraud"
    assert index["scenarios"] == ["card-fraud"]
    assert len(index["build"]) == 12
    assert [s["id"] for s in _read(out / "scenarios.json")] == ["card-fraud"]


def test_the_exported_manifest_has_no_place_node(registry, tmp_path):
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    manifest = _read(out / "card-fraud" / static_path("/api/scenario"))
    kinds = [n["kind"] for n in manifest["nodes"]]
    assert kinds, "the manifest keeps its other nodes"
    assert "place" not in kinds


def test_generic_kinds_are_exported_through_the_entities_route(registry, tmp_path):
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    root = out / "card-fraud"
    manifest = _read(root / static_path("/api/scenario"))
    concrete = {"auth", "fraud", "login", "place", "account_event", "transfer"}
    generic = [
        n["kind"]
        for n in manifest["nodes"]
        if n.get("source") in ("sql", "json") and n["kind"] not in concrete
    ]
    assert generic, "the card pack declares a json decision node"
    for kind in generic:
        assert (root / static_path(f"/api/entities?kind={kind}")).is_file()
    # A concrete kind is read through its own route, never dumped whole through /api/entities.
    assert not (root / static_path("/api/entities?kind=auth")).exists()


def test_every_exported_file_is_json(registry, tmp_path):
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    for path in out.rglob("*.json"):
        _read(path)


def test_two_exports_are_byte_identical(registry, tmp_path):
    first, second = tmp_path / "a", tmp_path / "b"
    export(first, ["card-fraud"], "card-fraud")
    export(second, ["card-fraud"], "card-fraud")
    assert _read(first / "index.json")["build"] == _read(second / "index.json")["build"]

    def names(root: Path) -> list[str]:
        return sorted(p.relative_to(root).as_posix() for p in root.rglob("*.json"))

    assert names(first) == names(second)


def test_an_unknown_scenario_is_rejected(registry, tmp_path):
    with pytest.raises(ValueError):
        export(tmp_path / "out", ["no-such-pack"], "no-such-pack")


def test_the_default_must_be_one_of_the_shipped_scenarios(registry, tmp_path):
    with pytest.raises(ValueError):
        export(tmp_path / "out", ["card-fraud"], "priya-ato")


def test_the_active_scenario_is_restored(registry, tmp_path):
    sr.set_active("priya-ato")
    export(tmp_path / "out", ["card-fraud"], "card-fraud")
    assert sr.get_active().id == "priya-ato"


def test_a_previous_export_is_replaced_not_merged(registry, tmp_path):
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    stale = out / "card-fraud" / "stale" / "_.json"
    stale.parent.mkdir(parents=True)
    stale.write_text("{}", encoding="utf-8")
    export(out, ["card-fraud"], "card-fraud")
    assert not stale.exists()


def test_a_previous_export_is_replaced_while_a_process_sits_in_the_directory(
    registry, tmp_path, monkeypatch
):
    # On Windows a directory that is some process's working directory cannot be removed.
    # The exporter clears the directory's contents and keeps the directory itself.
    out = tmp_path / "out"
    export(out, ["card-fraud"], "card-fraud")
    monkeypatch.chdir(out)
    export(out, ["card-fraud"], "card-fraud")
    assert (out / "index.json").is_file()


def test_a_directory_this_tool_did_not_write_is_never_cleared(registry, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    keep = out / "notes.txt"
    keep.write_text("mine", encoding="utf-8")
    with pytest.raises(ValueError):
        export(out, ["card-fraud"], "card-fraud")
    assert keep.read_text(encoding="utf-8") == "mine"
