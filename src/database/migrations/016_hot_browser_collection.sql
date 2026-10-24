-- Successful expanded scans, rather than process restarts, determine the next page-2 scan.
ALTER TABLE hot_collector_state ADD COLUMN last_full_at TEXT;
ALTER TABLE hot_collector_state ADD COLUMN verification_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hot_collector_state ADD COLUMN retry_after_at TEXT;
