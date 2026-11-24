"""Account-takeover (login-anomaly) detector."""

from __future__ import annotations

import sqlite3

from rules.shared import Decision, _kill_chain_evidence


def _eval_login_anomaly(
    conn: sqlite3.Connection, rule: dict, focal: dict | None = None
) -> list[Decision]:
    """Account-takeover: a SUCCESSFUL authentication from a device never seen on
    the account. Re-keyed 2026-06-10 (user-approved) from the 2FA-bypass framing:
    a spear-phish harvests the OTP too, so the realistic takeover login passes
    its challenge cleanly (Google's 350k-hijacking study: knowledge/SMS challenges
    stop as few as 10% of phishing-rooted takeovers) - the device fingerprint is
    the tell. Device novelty reads device_first_seen_at when present (a trusted
    device whose intel predates the window never fires on its first in-window
    row); rows without that column fall back to seen-earlier-in-rows. Behavioral,
    not geographic - the globe shows nothing. Single-account scenario DB."""
    account_id = (focal or {}).get("account_id")
    if account_id:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM login_events WHERE account_id = ? ORDER BY timestamp",
                (account_id,),
            ).fetchall()
        ]
    else:
        rows = [
            dict(r)
            for r in conn.execute("SELECT * FROM login_events ORDER BY timestamp").fetchall()
        ]
    if not rows:
        return []
    seen_devices: set[str] = set()
    for r in rows:
        dev = r.get("device_fp")
        outcome = r.get("outcome")
        first_seen = str(r.get("device_first_seen_at") or "")
        ts = str(r.get("timestamp") or "")
        predates_window = bool(first_seen) and first_seen < ts
        new_device = dev not in seen_devices and not predates_window and len(seen_devices) > 0
        authenticated = outcome in ("success", "challenge_passed")
        takeover = authenticated and new_device
        if takeover:
            prior = next((p for p in rows if p["device_fp"] in seen_devices), None)
            twofa_passed = int(r.get("two_fa_used") or 0) == 1
            inputs: list[dict] = [
                {"label": "Established device", "value": (prior or {}).get("device_fp", "?")},
                {"label": "New device", "value": str(dev)},
                {"label": "Login IP", "value": f'{r.get("ip")} ({r.get("ip_country", "US")})'},
                {"label": "Session", "value": str(r.get("session_id") or "-")},
            ]
            thresholds: list[dict] = [
                {
                    "label": "Device fingerprint",
                    "actual": "never seen",
                    "bound": "known device",
                    "breached": True,
                },
                {
                    "label": "Network",
                    "actual": str(r.get("ip_type") or "unknown"),
                    "bound": "residential history",
                    "breached": str(r.get("ip_type") or "") in ("datacenter", "hosting"),
                },
                {
                    "label": "2FA on this login",
                    "actual": (
                        "passed - phished OTP, not exculpatory" if twofa_passed else "bypassed"
                    ),
                    "bound": "trusted-device challenge",
                    "breached": not twofa_passed,
                },
            ]
            evidence: list[dict] = [
                {
                    "label": "Geography",
                    "value": (
                        f"{r.get('ip_country') or 'unknown'} {r.get('ip_type') or 'unknown'} exit"
                    ),
                    "entity_ref": r["id"],
                },
                *_kill_chain_evidence(conn, str(r.get("session_id") or "")),
            ]
            return [
                Decision(
                    id=f"decision:{rule['id']}:{r['id']}",
                    rule={
                        "id": rule["id"],
                        "label": rule.get("label", rule["id"]),
                        "kind": rule.get("detector", "login-anomaly"),
                        "sop": rule.get("sop", {}),
                    },
                    subject_path_kind="login",
                    trigger_entity_ids=[r["id"]],
                    inputs=inputs,
                    thresholds=thresholds,
                    verdict=rule.get("verdict", "ACCOUNT TAKEOVER"),
                    decision=rule.get("decision", "STEP-UP"),
                    evidence=evidence,
                    severity=0.9,
                )
            ]
        if dev:
            seen_devices.add(dev)
    return []
