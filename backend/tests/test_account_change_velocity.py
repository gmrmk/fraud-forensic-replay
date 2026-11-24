from __future__ import annotations

from pathlib import Path

from _rule_fixtures import (
    _ACV_RULE,
    _seed_account_change_burst,
    _seed_account_events_with_sessions,
)

import main
import rules as rules_module
import scenario_registry as sr
from db import connect, init_db


def test_account_change_velocity_fires_on_a_rapid_change_burst(tmp_path):
    conn = _seed_account_change_burst(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T11:00:00-05:00",
                "profile_change",
                "email",
                "priya@example.com",
                "drain@sentrypine.example",
            ),
            (
                "ae2",
                "2026-05-25T11:02:00-05:00",
                "profile_change",
                "phone",
                "+1-713-555-0100",
                "+1-202-555-0199",
            ),
            ("ae3", "2026-05-25T11:05:00-05:00", "profile_change", "password", "***", "***"),
        ],
    )
    try:
        decisions = rules_module._eval_account_change_velocity(conn, _ACV_RULE)
    finally:
        conn.close()

    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "COMPROMISE VELOCITY"
    assert d.decision == "STEP-UP"
    assert d.subject_path_kind == "account_event"
    assert d.trigger_entity_ids == ["ae1", "ae2", "ae3"]
    assert 0.0 < d.severity <= 1.0
    degree = next(t for t in d.thresholds if t["label"] == "Compromise degree")
    assert degree["actual"] == "high"
    # the new email IS the evidence - the full value is surfaced, not masked
    assert any("drain@sentrypine.example" in e["value"] for e in d.evidence)


def test_account_change_velocity_ignores_a_lone_change(tmp_path):
    """A single profile change is routine account maintenance, never a finding."""
    conn = _seed_account_change_burst(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T11:00:00-05:00",
                "profile_change",
                "email",
                "a@x.example",
                "b@y.example",
            )
        ],
    )
    try:
        assert rules_module._eval_account_change_velocity(conn, _ACV_RULE) == []
    finally:
        conn.close()


def test_account_change_velocity_grades_two_changes_as_elevated(tmp_path):
    """Two rapid changes clear the floor but sit below the high-degree bound."""
    conn = _seed_account_change_burst(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T11:00:00-05:00",
                "profile_change",
                "email",
                "a@x.example",
                "b@y.example",
            ),
            ("ae2", "2026-05-25T11:01:00-05:00", "payee_add", None, None, None),
        ],
    )
    try:
        decisions = rules_module._eval_account_change_velocity(conn, _ACV_RULE)
    finally:
        conn.close()
    assert len(decisions) == 1
    degree = next(t for t in decisions[0].thresholds if t["label"] == "Compromise degree")
    assert degree["actual"] == "elevated"


def test_account_change_velocity_ignores_changes_spread_over_time(tmp_path):
    """Three changes spread across weeks are not a velocity burst (gaps > window)."""
    conn = _seed_account_change_burst(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-04-01T11:00:00-05:00",
                "profile_change",
                "email",
                "a@x.example",
                "b@y.example",
            ),
            ("ae2", "2026-04-15T11:00:00-05:00", "profile_change", "phone", "1", "2"),
            ("ae3", "2026-05-01T11:00:00-05:00", "profile_change", "password", "*", "*"),
        ],
    )
    try:
        assert rules_module._eval_account_change_velocity(conn, _ACV_RULE) == []
    finally:
        conn.close()


def test_account_change_velocity_fires_when_burst_shares_one_session(tmp_path):
    """Honors the SOP ('in one session'): edits inside the gap window that SHARE
    a session_id still chain into a firing burst - the legitimate-takeover path."""
    conn = _seed_account_events_with_sessions(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T10:00:00-05:00",
                "profile_change",
                "email",
                "p@x.example",
                "d@z.example",
                "s",
            ),
            ("ae2", "2026-05-25T11:30:00-05:00", "profile_change", "phone", "1", "2", "s"),
        ],
    )
    try:
        decisions = rules_module._eval_account_change_velocity(conn, _ACV_RULE)
    finally:
        conn.close()
    assert len(decisions) == 1
    assert decisions[0].trigger_entity_ids == ["ae1", "ae2"]


def test_account_change_velocity_does_not_chain_across_sessions(tmp_path):
    """The SOP says the burst is 'in one session'. Two legitimate edits across a
    normal sign-out/sign-in (email 10:00 in session A, phone 11:30 in session B)
    are inside the 120-min gap window but belong to DIFFERENT sessions, so they
    must NOT chain into a compromise-velocity burst. Each per-session subset has
    only one edit, below the >=2 floor."""
    conn = _seed_account_events_with_sessions(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T10:00:00-05:00",
                "profile_change",
                "email",
                "p@x.example",
                "n@x.example",
                "sess-A",
            ),
            ("ae2", "2026-05-25T11:30:00-05:00", "profile_change", "phone", "1", "2", "sess-B"),
        ],
    )
    try:
        assert rules_module._eval_account_change_velocity(conn, _ACV_RULE) == []
    finally:
        conn.close()


def test_account_change_velocity_does_not_chain_null_session_rows(tmp_path):
    """Rows with empty session_id do not chain with rows of a different session
    (or with each other across a different session) - a missing session is not a
    license to merge unrelated edits into one burst."""
    conn = _seed_account_events_with_sessions(
        tmp_path / "acv.db",
        [
            (
                "ae1",
                "2026-05-25T10:00:00-05:00",
                "profile_change",
                "email",
                "a@x.example",
                "b@x.example",
                "",
            ),
            ("ae2", "2026-05-25T10:30:00-05:00", "profile_change", "phone", "1", "2", "sess-B"),
        ],
    )
    try:
        assert rules_module._eval_account_change_velocity(conn, _ACV_RULE) == []
    finally:
        conn.close()


def test_account_change_velocity_degrades_when_table_absent(tmp_path):
    """A scenario DB without account_events degrades to [] (schema-agnostic), never raises."""
    dbfile = tmp_path / "noae.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("DROP TABLE account_events")
        conn.commit()
        assert rules_module._eval_account_change_velocity(conn, _ACV_RULE) == []
    finally:
        conn.close()


def test_priya_manifest_declares_account_change_velocity(tmp_path):
    real_dir = Path(main.__file__).resolve().parent / "scenarios"
    for _p in real_dir.glob("*.scenario.json"):
        init_db(sr.load_manifest(_p, base_dir=tmp_path).db_path)
    sr.init_registry(real_dir, base_dir=tmp_path, default_id="priya-ato")
    rules = sr.get_active().rules
    assert any(r["detector"] == "account-change-velocity" for r in rules)
