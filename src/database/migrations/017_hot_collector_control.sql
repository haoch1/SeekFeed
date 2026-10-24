ALTER TABLE hot_collector_state ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hot_collector_state ADD COLUMN verification_expires_at TEXT;
