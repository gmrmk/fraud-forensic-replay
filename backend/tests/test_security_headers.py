"""GAP 3 - security-headers middleware.

Every response carries the hardening headers (XCTO / XFO / Referrer-Policy /
Permissions-Policy / HSTS), independent of the route. We assert against a known
200 response (/api/health) so a header regression is caught at the gate.

Note: a strict Content-Security-Policy is deliberately NOT asserted here - CSP
needs app-specific tuning for maplibre/deck.gl (workers, blob:, wasm) and is
deferred to a tuned + eyes-verified pass (see the TODO in main.py).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

EXPECTED_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
}


def test_security_headers_present_on_a_sample_response() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    for name, value in EXPECTED_HEADERS.items():
        assert name in response.headers, f"missing security header: {name}"
        assert (
            response.headers[name] == value
        ), f"{name}: expected {value!r}, got {response.headers[name]!r}"


def test_no_content_security_policy_header_yet() -> None:
    # CSP is intentionally deferred (needs maplibre/deck.gl tuning + eyes proof).
    # Pin the absence so a blind CSP cannot land without updating this test.
    response = client.get("/api/health")
    assert "content-security-policy" not in response.headers
