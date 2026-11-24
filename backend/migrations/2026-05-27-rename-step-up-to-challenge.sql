-- Rename step_up_* enum values + step_up_reason column to challenge_*.
-- Idempotent for row UPDATEs (no-op if already renamed).
-- Column rename only applies to existing DBs that still have the old
-- step_up_reason column; the enrichment migration was updated to add
-- challenge_reason directly, so fresh DBs never have step_up_reason.
--
-- NOTE: This migration is named 2026-05-27 so it sorts AFTER the
-- 2026-05-26-bank-grade-enrichment migration. init_db applies migrations
-- in sorted order; challenge_reason must exist before this runs.

PRAGMA foreign_keys=OFF;

UPDATE login_events SET outcome = 'challenge_required' WHERE outcome = 'step_up_required';
UPDATE login_events SET outcome = 'challenge_passed'   WHERE outcome = 'step_up_passed';
UPDATE login_events SET outcome = 'challenge_failed'   WHERE outcome = 'step_up_failed';

PRAGMA foreign_keys=ON;
