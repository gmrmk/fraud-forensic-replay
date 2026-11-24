-- Fraud Forensic Replay - canonical schema.
-- Core tables: customers, accounts, cards, transactions, plus rules_fired,
-- biometric_events, alerts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  home_city       TEXT NOT NULL,
  home_lat        REAL NOT NULL,
  home_lng        REAL NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id                     TEXT PRIMARY KEY,
  customer_id            TEXT NOT NULL REFERENCES customers(id),
  type                   TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card')),
  account_number_last4   TEXT NOT NULL,
  opening_balance        REAL NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active',
  opened_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  bin             TEXT NOT NULL,
  last_four       TEXT NOT NULL,
  network         TEXT NOT NULL,
  issuer_country  TEXT NOT NULL DEFAULT 'US',
  status          TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT PRIMARY KEY,
  card_id            TEXT NOT NULL REFERENCES cards(id),
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  timestamp          TEXT NOT NULL,
  amount             REAL NOT NULL,
  merchant_name      TEXT NOT NULL,
  merchant_lat       REAL NOT NULL,
  merchant_lng       REAL NOT NULL,
  merchant_country   TEXT NOT NULL DEFAULT 'US',
  mcc                TEXT NOT NULL,
  category           TEXT NOT NULL,
  is_card_present    INTEGER NOT NULL DEFAULT 1,
  is_fraud           INTEGER NOT NULL DEFAULT 0,
  balance_after      REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_card_time ON transactions(card_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_time ON transactions(timestamp);

-- Login events - the second signal layer. Marcus's baseline is a Houston
-- ISP, handset + laptop devices, ~2-3/day, mostly clean. Priya's
-- compromised chain (Newark VPN exit, 2FA bypass) is where logins carry
-- the entire fraud story.
--
-- `outcome` legal values:
--   success - clean credential + device, in
--   challenge_required - needs additional auth (2FA challenge issued)
--   challenge_passed - 2FA challenge resolved successfully
--   challenge_failed - 2FA challenge failed; access denied
--   failed - wrong password / locked out / blocked
CREATE TABLE IF NOT EXISTS login_events (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  timestamp       TEXT NOT NULL,
  ip              TEXT NOT NULL,
  ip_country      TEXT NOT NULL DEFAULT 'US',
  ip_lat          REAL NOT NULL,
  ip_lng          REAL NOT NULL,
  device_fp       TEXT NOT NULL,
  user_agent      TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN (
                    'success',
                    'challenge_required',
                    'challenge_passed',
                    'challenge_failed',
                    'failed'
                  )),
  two_fa_used     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_account_time ON login_events(account_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_login_time ON login_events(timestamp);

-- Account events - profile/beneficiary changes, the ATO kill-chain layer
-- (2026-06-10 realism program). Behavioral: no coordinates by design; the
-- globe deliberately shows nothing for Case B (PROFILES Customer B).
CREATE TABLE IF NOT EXISTS account_events (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  timestamp    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('profile_change','payee_add')),
  field        TEXT,           -- profile_change: email|phone|password
  old_value    TEXT,
  new_value    TEXT,
  payee_id     TEXT,           -- payee_add: the payees row this created
  session_id   TEXT NOT NULL DEFAULT '',
  is_fraud     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ae_account_time ON account_events(account_id, timestamp);

-- Payees/beneficiaries. first_seen_at is the red-flag substrate: "beneficiary
-- with no prior payment history" is only computable when payees are rows.
CREATE TABLE IF NOT EXISTS payees (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  name               TEXT NOT NULL,
  bank_name          TEXT NOT NULL,
  account_ref_last4  TEXT NOT NULL,
  risk_flag          TEXT NOT NULL DEFAULT 'none' CHECK (risk_flag IN ('none','elevated_risk')),
  first_seen_at      TEXT NOT NULL
);

-- Transfers - P2P/wire money movement. A velocity-blocked wire ships as
-- authored data (status=blocked + decline_reason), replayed, not recomputed.
CREATE TABLE IF NOT EXISTS transfers (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  timestamp       TEXT NOT NULL,
  amount          REAL NOT NULL,
  payee_id        TEXT NOT NULL REFERENCES payees(id),
  rail            TEXT NOT NULL CHECK (rail IN ('tamsinmere','wire')),
  status          TEXT NOT NULL CHECK (status IN ('sent','blocked')),
  decline_reason  TEXT,
  session_id      TEXT NOT NULL DEFAULT '',
  is_fraud        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tr_account_time ON transfers(account_id, timestamp);

-- Model scores (2026-06-10 real-ML integration). Batch-written at TRAIN time by
-- ml/train.py over the population corpus - a separate surface from the seeded
-- risk_score column ON PURPOSE: two provenances, never conflated. Keyed by
-- model_version so retrained models coexist instead of silently overwriting.
CREATE TABLE IF NOT EXISTS ml_scores (
  entity_id        TEXT NOT NULL,
  entity_kind      TEXT NOT NULL,
  model_version    TEXT NOT NULL,
  score            REAL NOT NULL,
  score_percentile REAL NOT NULL,
  PRIMARY KEY (entity_id, model_version)
);

-- Impossible-travel arcs. Baked at seed time from the detected
-- transaction pairs, with TRUE WGS84 great-circle geometry precomputed in
-- Python (backend/arcs.py via pyproj) so the frontend renders authoritative
-- geodesics rather than a client-side linear approximation. points_json is a
-- JSON array of [lng, lat] pairs (deck/maplibre order). The live API reads
-- this table directly - no geodesic dependency at request time.
CREATE TABLE IF NOT EXISTS arcs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  severity     REAL NOT NULL,
  is_hero      INTEGER NOT NULL DEFAULT 0,
  points_json  TEXT NOT NULL
);
