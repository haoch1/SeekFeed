-- Persist pacing across restarts and manual refreshes, including upstream Retry-After.
ALTER TABLE hot_collector_state ADD COLUMN next_attempt_at TEXT;
