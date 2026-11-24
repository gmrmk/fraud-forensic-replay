"""Shared seed helpers and rule constants for the detector test suite.

Imported by the per-detector test modules (geo-velocity, login-anomaly,
card-testing/skimmer-signature, account-change-velocity) and the dispatch/
endpoint tests. Not a test module itself (no ``test_`` prefix, so pytest skips
collection); imported as a sibling via the prepend path (``pythonpath = .``).
"""

from __future__ import annotations

from db import connect, init_db

# --- geo-velocity (impossible-travel) ---

_GEO_RULE = {
    "id": "impossible-travel",
    "label": "impossible-travel",
    "detector": "geo-velocity",
    "verdict": "IMPOSSIBLE TRAVEL",
    "decision": "DECLINE",
}


def _seed_impossible_pair(dbfile, card_id="c1", account_id="ac1"):
    """Cobstead Grocers Houston CP swipe (auth) then a Lagos CP chip-fallback hit (fraud)
    ~9.8h later - Houston->Lagos is ~6,500 mi, so implied speed > 600 mph.
    card_id is parameterized because the endpoint test runs against the REAL
    card-fraud manifest, whose focal scopes the detector to Marcus's card
    (FIX-2026-06-10-geo-velocity-overflow-population-db)."""
    init_db(dbfile)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")  # skip the card/account FK chain
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud) VALUES "
            f"('grocery','{card_id}','{account_id}','2026-05-26T19:32:00Z',82.0,"
            "'Cobstead Grocers Bunker Hill',"
            "29.78,-95.46,'5411','grocery',900.0,'US',1,0)"
        )
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, pos_entry_mode, auth_source, "
            "risk_score, currency) VALUES "
            f"('lag1','{card_id}','{account_id}','2026-05-27T05:18:00Z',300.0,"
            "'Tidewater Trust Bank ATM Lekki',"
            "6.45,3.47,'6011','atm',600.0,'NG',1,1,'chip_fallback_swipe','stip',942,'NGN')"
        )
        conn.commit()
    finally:
        conn.close()


def _seed_full_signature(dbfile, card_id="c1", account_id="ac1"):
    """The pair plus the rest of the Lagos cluster + a $1 CNP precursor, so the
    evidence chain (chip-fallback x3, STIP, risk scores, currency, precursor) fills."""
    _seed_impossible_pair(dbfile, card_id=card_id, account_id=account_id)
    conn = connect(dbfile)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        # precursor: $1 CNP micro-test at Ladleton Pay (fraud, card-not-present), before the leap
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, pos_entry_mode, risk_score) VALUES "
            f"('micro','{card_id}','{account_id}','2026-05-27T05:07:00Z',1.0,'Ladleton Pay',"
            "6.45,3.47,'5734',"
            "'digital',899.0,'NG',0,1,'cnp_token',720)"
        )
        # two more Lagos chip-fallback hits (fraud)
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, pos_entry_mode, risk_score, currency) "
            f"VALUES ('lag2','{card_id}','{account_id}','2026-05-27T05:21:00Z',420.0,"
            "'Garrmere Shopping Mall',"
            "6.46,3.48,'5311','retail',180.0,'NG',1,1,'chip_fallback_swipe',967,'NGN')"
        )
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, mcc, category, balance_after, "
            "merchant_country, is_card_present, is_fraud, pos_entry_mode, risk_score, currency) "
            f"VALUES ('lag3','{card_id}','{account_id}','2026-05-27T05:23:00Z',150.0,"
            "'Heskford Lekki',"
            "6.44,3.46,'5411','grocery',30.0,'NG',1,1,'chip_fallback_swipe',981,'NGN')"
        )
        conn.commit()
    finally:
        conn.close()


# --- login-anomaly (account-takeover) ---

_LOGIN_RULE = {
    "id": "account-takeover",
    "label": "account-takeover",
    "detector": "login-anomaly",
    "verdict": "ACCOUNT TAKEOVER",
    "decision": "STEP-UP",
    "sop": {
        "what": "New device + bypassed 2FA on an established account.",
        "why": "A never-seen device authenticating without the 2FA the account "
        "always uses is the account-takeover signature.",
    },
}


def _seed_login_takeover(dbfile):
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")
    rows = [
        (
            "l1",
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
            "l2",
            "acct-1",
            "2026-05-02T08:00:00-05:00",
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
            "l3",
            "acct-1",
            "2026-05-03T03:14:00-05:00",
            "203.0.113.9",
            "US",
            38.0,
            -97.0,
            "Handset-New-XYZ",
            "ua",
            "success",
            0,
        ),
    ]
    conn.executemany(
        "INSERT INTO login_events (id, account_id, timestamp, ip, ip_country, ip_lat, ip_lng, "
        "device_fp, user_agent, outcome, two_fa_used) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.commit()
    return conn


# --- card-testing + skimmer-signature (2026-06-11 detector slice) ---

_CT_RULE = {
    "id": "card-testing",
    "label": "card-testing",
    "detector": "card-testing",
    "verdict": "CARD TESTING",
    "decision": "FLAG",
}

_SK_RULE = {
    "id": "skimmer-signature",
    "label": "skimmer-signature",
    "detector": "skimmer-signature",
    "verdict": "SKIMMER SIGNATURE",
    "decision": "REVIEW",
}


def _insert_tx(conn, rows):
    """rows: (id, ts, amount, is_card_present, is_fraud, pos_entry_mode, risk)."""
    for rid, ts, amount, cp, fraud, pem, risk in rows:
        conn.execute(
            "INSERT INTO transactions (id, card_id, account_id, timestamp, amount, "
            "merchant_name, merchant_lat, merchant_lng, merchant_country, mcc, category, "
            "balance_after, is_card_present, is_fraud, pos_entry_mode, risk_score) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                rid,
                "c1",
                "ac1",
                ts,
                amount,
                "M",
                29.76,
                -95.36,
                "US",
                "5411",
                "g",
                0.0,
                cp,
                fraud,
                pem,
                risk,
            ),
        )
    conn.commit()


# --- account-change-velocity (2026-06-15 detector slice) ---

_ACV_RULE = {
    "id": "compromise-velocity",
    "label": "compromise-velocity",
    "detector": "account-change-velocity",
    "verdict": "COMPROMISE VELOCITY",
    "decision": "STEP-UP",
    "sop": {
        "what": "A rapid burst of account-profile changes in one session.",
        "why": "An attacker who holds the session locks the victim out by rewriting "
        "the recovery channels (email, phone, password) and adding a payee, all at "
        "once. The velocity of the changes is the tell.",
    },
}


def _seed_account_change_burst(dbfile, changes, session="sess-takeover", account_id="acct-1"):
    """changes: list of (id, ts, kind, field, old_value, new_value)."""
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")  # skip the accounts FK chain
    conn.executemany(
        "INSERT INTO account_events (id, account_id, timestamp, kind, field, old_value, "
        "new_value, session_id) VALUES (?,?,?,?,?,?,?,?)",
        [
            (cid, account_id, ts, kind, fld, old, new, session)
            for cid, ts, kind, fld, old, new in changes
        ],
    )
    conn.commit()
    return conn


def _seed_account_events_with_sessions(dbfile, rows, account_id="acct-1"):
    """rows: list of (id, ts, kind, field, old_value, new_value, session_id).
    Unlike _seed_account_change_burst, each row carries its OWN session_id so a
    burst can be split across sessions."""
    init_db(dbfile)
    conn = connect(dbfile)
    conn.execute("PRAGMA foreign_keys = OFF")  # skip the accounts FK chain
    conn.executemany(
        "INSERT INTO account_events (id, account_id, timestamp, kind, field, old_value, "
        "new_value, session_id) VALUES (?,?,?,?,?,?,?,?)",
        [
            (cid, account_id, ts, kind, fld, old, new, session)
            for cid, ts, kind, fld, old, new, session in rows
        ],
    )
    conn.commit()
    return conn
