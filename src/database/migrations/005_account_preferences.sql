ALTER TABLE base_config ADD COLUMN session_expiry_hours INTEGER NOT NULL DEFAULT 168 CHECK (session_expiry_hours BETWEEN 1 AND 720);
