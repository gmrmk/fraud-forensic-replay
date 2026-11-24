-- manager.segments() GROUP BY was an unindexed full
-- scan: 345k rows on population.db took ~seconds-to-tens-of-seconds and, gated
-- in the manager Promise.all with rings/cohorts, blocked the whole manager
-- aggregate render.
--
-- One COVERING index per _SEGMENT_DIMS column in backend/manager.py
-- (manager.segments / manager.members allow-list): (dim, card_id, amount,
-- is_fraud) -- every column segments()/members() reads besides account_id/
-- risk_score. Measured on a real 345k-row population.db copy (backend/.venv
-- python, EXPLAIN QUERY PLAN + timeit, three runs):
--   naive single-column index (dim) alone:      SCAN ... USING INDEX  -- ~1.44s
--     (WORSE than no index: forces a table lookup per row in index order,
--     which loses to one sequential scan for a query that visits every row)
--   no index (original defect):                  SCAN transactions     -- ~0.35s
--   covering index (dim, card_id, amount,
--     is_fraud):                        SCAN ... USING COVERING INDEX  -- ~0.08s
-- The covering index lets SQLite answer the whole GROUP BY from the index
-- b-tree with zero table lookups. members()'s `WHERE dim = ?` gets the same
-- index as an indexed SEARCH (equality seek) instead of a table scan.
--
-- Additive only, idempotent (CREATE INDEX IF NOT EXISTS) -- safe to re-run,
-- matches the migration-runner contract in db.py.

CREATE INDEX IF NOT EXISTS idx_tx_merchant_name_covering ON transactions(merchant_name, card_id, amount, is_fraud);
CREATE INDEX IF NOT EXISTS idx_tx_mcc_covering ON transactions(mcc, card_id, amount, is_fraud);
CREATE INDEX IF NOT EXISTS idx_tx_category_covering ON transactions(category, card_id, amount, is_fraud);
CREATE INDEX IF NOT EXISTS idx_tx_acquirer_covering ON transactions(acquirer, card_id, amount, is_fraud);
CREATE INDEX IF NOT EXISTS idx_tx_pos_entry_mode_covering ON transactions(pos_entry_mode, card_id, amount, is_fraud);
