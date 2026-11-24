"""login_events seed + /api/logins endpoint."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
import seed
from db import init_db

# Houston ISP prefix set - matches seed._HOUSTON_ISP_RANGES. Tests reach
# back into seed so a future addition there fails this immediately.
_VALID_PREFIXES = {p for p, _ in seed._HOUSTON_ISP_RANGES}

_VALID_OUTCOMES = {
    "success",
    "challenge_required",
    "challenge_passed",
    "challenge_failed",
    "failed",
}


@pytest.fixture
def seeded_db(tmp_path, monkeypatch):
    """Seed a temp DB and point main.connect at it for the test."""
    db = tmp_path / "logins-test.db"
    init_db(db)
    seed.main(db_path=db)

    real_connect = main.connect

    def patched_connect():
        return real_connect(db)

    monkeypatch.setattr(main, "connect", patched_connect)
    return db


def test_logins_endpoint_returns_list(seeded_db) -> None:
    client = TestClient(main.app)
    response = client.get("/api/logins")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_logins_have_required_fields(seeded_db) -> None:
    client = TestClient(main.app)
    data = client.get("/api/logins").json()
    login = data[0]
    for field in (
        "id",
        "account_id",
        "timestamp",
        "ip",
        "ip_country",
        "ip_lat",
        "ip_lng",
        "device_fp",
        "user_agent",
        "outcome",
        "two_fa_used",
    ):
        assert field in login, f"missing field: {field}"


def test_logins_are_chronological(seeded_db) -> None:
    client = TestClient(main.app)
    data = client.get("/api/logins").json()
    timestamps = [ev["timestamp"] for ev in data]
    assert timestamps == sorted(timestamps)


def test_logins_filter_by_account_id(seeded_db) -> None:
    client = TestClient(main.app)
    # Use Marcus's canonical account - known to have logins in every seed.
    target = "acct-marcus-cc-001"
    filtered = client.get(f"/api/logins?account_id={target}").json()
    assert len(filtered) > 0
    assert all(ev["account_id"] == target for ev in filtered)
    assert client.get("/api/logins?account_id=nope").json() == []


def test_login_outcomes_are_valid(seeded_db) -> None:
    """CHECK constraint protects the DB; this test protects the generator
    from emitting an outcome the constraint doesn't know about."""
    client = TestClient(main.app)
    data = client.get("/api/logins").json()
    for login in data:
        assert login["outcome"] in _VALID_OUTCOMES


def test_login_ips_are_from_houston_isp_range(seeded_db) -> None:
    """Baseline: every Marcus login should resolve to a Houston
    residential ISP prefix."""
    client = TestClient(main.app)
    data = client.get("/api/logins").json()
    for login in data:
        prefix = ":".join(login["ip"].split(":")[:3])
        assert prefix in _VALID_PREFIXES, f"login {login['id']} has non-Houston IP {login['ip']}"


def test_login_geolocation_clusters_at_home(seeded_db) -> None:
    """Marcus's logins should geolocate near his Memorial home (within
    ~1.5° box - generous, but anything outside is a synthesis bug)."""
    client = TestClient(main.app)
    data = client.get("/api/logins?account_id=acct-marcus-cc-001").json()
    for login in data:
        assert abs(login["ip_lat"] - seed.MARCUS_HOME_LAT) < 1.5
        assert abs(login["ip_lng"] - seed.MARCUS_HOME_LNG) < 1.5


def test_login_count_in_expected_range(seeded_db) -> None:
    """30 days × 2-3 logins/day ≈ 60-100. Tightens regression of the
    generator's daily rate. Scoped to Marcus to isolate his generator."""
    client = TestClient(main.app)
    data = client.get("/api/logins?account_id=acct-marcus-cc-001").json()
    assert 60 <= len(data) <= 100


def test_logins_have_bank_grade_fields(seeded_db) -> None:
    """Every login carries session_id, ip_asn label,
    ip_type, ip_reputation, device_first_seen_at, device_trust,
    auth_method. challenge_reason is null for success outcomes."""
    client = TestClient(main.app)
    data = client.get("/api/logins").json()
    for login in data:
        assert login["session_id"].startswith("sess-")
        # ASN labels include "(AS<num>)" or "Unknown ISP" - all logins
        # in the baseline come from Houston ISP ranges so we expect a
        # mapped ASN with an AS number.
        assert "AS" in login["ip_asn"], f"login {login['id']} has no ASN: {login['ip_asn']}"
        assert login["ip_type"] in {"residential", "mobile", "datacenter", "vpn", "tor"}
        assert login["device_first_seen_at"]  # not empty
        assert login["device_trust"] in {"new", "known", "suspicious", "blocked"}
        assert login["auth_method"] in {"password", "passkey", "sso"}
        assert 0 <= login["ip_reputation"] <= 100
        # Baseline successes have no challenge reason.
        if login["outcome"] == "success":
            assert login["challenge_reason"] is None


def test_seed_logins_are_idempotent(tmp_path) -> None:
    """Re-running main() against the same DB must produce the same IDs -
    INSERT OR REPLACE relies on stable IDs to truly replace, not append."""
    db = tmp_path / "idem.db"
    init_db(db)
    seed.main(db_path=db)
    from db import connect

    ids_first = [
        r["id"] for r in connect(db).execute("SELECT id FROM login_events ORDER BY id").fetchall()
    ]
    seed.main(db_path=db)  # second pass
    ids_second = [
        r["id"] for r in connect(db).execute("SELECT id FROM login_events ORDER BY id").fetchall()
    ]
    assert ids_first == ids_second
    assert len(ids_first) == len(set(ids_first)), "duplicate IDs after re-seed"
