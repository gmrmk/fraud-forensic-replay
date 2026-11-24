from __future__ import annotations

from _rule_fixtures import _LOGIN_RULE, _seed_login_takeover

import rules as rules_module
from db import connect, init_db

_LOGIN_INSERT = (
    "INSERT INTO login_events "
    "(id, account_id, timestamp, ip, ip_country, ip_lat, ip_lng, "
    "device_fp, user_agent, outcome, two_fa_used) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
)


def test_login_anomaly_flags_new_device_2fa_bypass(tmp_path):
    conn = _seed_login_takeover(tmp_path / "lt.db")
    try:
        decisions = rules_module._eval_login_anomaly(conn, _LOGIN_RULE)
    finally:
        conn.close()
    assert len(decisions) == 1
    d = decisions[0]
    assert d.verdict == "ACCOUNT TAKEOVER"
    assert d.decision == "STEP-UP"
    assert d.subject_path_kind == "login"
    assert "l3" in d.trigger_entity_ids
    assert 0.0 < d.severity <= 1.0


def test_login_anomaly_clean_logins_no_decision(tmp_path):
    dbfile = tmp_path / "clean.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        "INSERT INTO login_events (id, account_id, timestamp, ip, ip_country, ip_lat, ip_lng, "
        "device_fp, user_agent, outcome, two_fa_used) VALUES "
        "('c1','acct-1','2026-05-01T08:00:00-05:00','192.0.2.5','US',29.76,-95.36,'Handset-Known','ua','success',1)"
    )
    conn.commit()
    try:
        assert rules_module._eval_login_anomaly(conn, _LOGIN_RULE) == []
    finally:
        conn.close()


# --- edge tests ---


def test_login_anomaly_empty_table_returns_no_decision(tmp_path):
    """An empty login_events table must return [] without raising."""
    dbfile = tmp_path / "empty.db"
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        result = rules_module._eval_login_anomaly(conn, _LOGIN_RULE)
        assert result == []
    finally:
        conn.close()


def test_login_anomaly_future_dated_login_does_not_fire(tmp_path):
    """A new device whose device_first_seen_at predates its timestamp
    is a trusted (pre-enrolled) device and must not trigger a takeover decision.
    The detector reads device_first_seen_at < timestamp as 'registered before
    this window'; it short-circuits new_device=False."""
    dbfile = tmp_path / "future.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executemany(
        _LOGIN_INSERT,
        [
            (
                "f1",
                "acct-1",
                "2026-05-01T08:00:00-05:00",
                "192.0.2.5",
                "US",
                29.76,
                -95.36,
                "Handset-Known",
                "ua",
                "success",
                1,
            ),
            (
                "f2",
                "acct-1",
                "2026-05-10T08:00:00-05:00",
                "192.0.2.6",
                "US",
                29.76,
                -95.36,
                "Handset-Enrolled",
                "ua",
                "success",
                1,
            ),
        ],
    )
    conn.commit()
    # device_first_seen_at on f2 earlier than f2's own timestamp - enrolled
    # before this login, so the detector must NOT classify it as new.
    conn.execute(
        "UPDATE login_events SET device_first_seen_at = ? WHERE id = ?",
        ("2026-05-01T06:00:00-05:00", "f2"),
    )
    conn.commit()
    try:
        result = rules_module._eval_login_anomaly(conn, _LOGIN_RULE)
        assert result == [], (
            "A device whose first_seen predates its own timestamp is pre-enrolled "
            "and must not fire a takeover decision."
        )
    finally:
        conn.close()


def test_login_anomaly_single_device_no_prior_baseline_no_fire(tmp_path):
    """A single login on a brand-new account (no prior device history)
    must not fire - the rule requires len(seen_devices) > 0 before evaluating
    a 'new' device (no baseline to deviate from)."""
    dbfile = tmp_path / "single.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        _LOGIN_INSERT,
        (
            "s1",
            "acct-new",
            "2026-05-01T08:00:00-05:00",
            "192.0.2.5",
            "US",
            29.76,
            -95.36,
            "Handset-Brand-New",
            "ua",
            "success",
            0,
        ),
    )
    conn.commit()
    try:
        result = rules_module._eval_login_anomaly(conn, _LOGIN_RULE)
        assert result == [], "First-ever login on a new account must not flag as takeover."
    finally:
        conn.close()


def test_login_anomaly_failed_outcome_new_device_no_fire(tmp_path):
    """A new device that fails authentication (outcome='failed') must not
    trigger a takeover - the rule fires only on authenticated new-device access
    (outcome in 'success' | 'challenge_passed')."""
    dbfile = tmp_path / "failed.db"
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executemany(
        _LOGIN_INSERT,
        [
            (
                "g1",
                "acct-1",
                "2026-05-01T08:00:00-05:00",
                "192.0.2.5",
                "US",
                29.76,
                -95.36,
                "Handset-Known",
                "ua",
                "success",
                1,
            ),
            (
                "g2",
                "acct-1",
                "2026-05-03T03:14:00-05:00",
                "203.0.113.9",
                "US",
                38.0,
                -97.0,
                "Handset-New-Attacker",
                "ua",
                "failed",
                0,
            ),
        ],
    )
    conn.commit()
    try:
        result = rules_module._eval_login_anomaly(conn, _LOGIN_RULE)
        assert result == [], "A failed login from a new device must not fire the takeover rule."
    finally:
        conn.close()
