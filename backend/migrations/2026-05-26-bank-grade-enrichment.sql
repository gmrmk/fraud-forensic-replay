-- Bank-grade enrichment.
-- Additive only: ALTER TABLE ADD COLUMN. Safe to re-run because the
-- migration runner (db.py) catches "duplicate column name" errors per
-- statement - SQLite has no IF NOT EXISTS on ADD COLUMN.

-- Transactions - ISO 8583-style auth fields.
ALTER TABLE transactions ADD COLUMN auth_response_code TEXT NOT NULL DEFAULT '00';
ALTER TABLE transactions ADD COLUMN pos_entry_mode TEXT NOT NULL DEFAULT 'chip';
ALTER TABLE transactions ADD COLUMN network_ref_number TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN terminal_id TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN acquirer TEXT NOT NULL DEFAULT 'Halvard Settlement Services';
ALTER TABLE transactions ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'issuer';
ALTER TABLE transactions ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN is_3ds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';

-- Cards.
ALTER TABLE cards ADD COLUMN product_type TEXT NOT NULL DEFAULT 'Visa Signature Cash Rewards';
ALTER TABLE cards ADD COLUMN funding_type TEXT NOT NULL DEFAULT 'credit';
ALTER TABLE cards ADD COLUMN issued_at TEXT NOT NULL DEFAULT '2023-06-15';
ALTER TABLE cards ADD COLUMN activated_at TEXT NOT NULL DEFAULT '2023-06-17';
ALTER TABLE cards ADD COLUMN card_on_file_count INTEGER NOT NULL DEFAULT 0;

-- Accounts.
ALTER TABLE accounts ADD COLUMN risk_tier TEXT NOT NULL DEFAULT 'low';
ALTER TABLE accounts ADD COLUMN segment TEXT NOT NULL DEFAULT 'basic';

-- Customers.
ALTER TABLE customers ADD COLUMN kyc_level TEXT NOT NULL DEFAULT 'enhanced';
ALTER TABLE customers ADD COLUMN dob_year INTEGER NOT NULL DEFAULT 1988;
ALTER TABLE customers ADD COLUMN customer_since TEXT NOT NULL DEFAULT '2019-03-14';

-- Login events - device intel + network signals.
ALTER TABLE login_events ADD COLUMN session_id TEXT NOT NULL DEFAULT '';
ALTER TABLE login_events ADD COLUMN ip_type TEXT NOT NULL DEFAULT 'residential';
ALTER TABLE login_events ADD COLUMN ip_asn TEXT NOT NULL DEFAULT '';
ALTER TABLE login_events ADD COLUMN ip_reputation INTEGER NOT NULL DEFAULT 100;
ALTER TABLE login_events ADD COLUMN device_first_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE login_events ADD COLUMN device_trust TEXT NOT NULL DEFAULT 'known';
ALTER TABLE login_events ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password';
ALTER TABLE login_events ADD COLUMN challenge_reason TEXT;
