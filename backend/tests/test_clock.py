from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_get_clock_default_is_max_txn_time(seeded_db):
    r = client.get("/api/clock")
    assert r.status_code == 200
    body = r.json()
    # No publisher yet -> default t is the latest transaction time (ms), > 0
    assert body["t"] > 0
    assert body["playing"] is False
    assert body["rate"] == 1.0


def test_post_then_get_roundtrips():
    client.post("/api/clock", json={"t": 1748400000000, "playing": True, "rate": 4.0})
    body = client.get("/api/clock").json()
    assert body["t"] == 1748400000000
    assert body["playing"] is True
    assert body["rate"] == 4.0
