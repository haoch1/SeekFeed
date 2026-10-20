ALTER TABLE posts ADD COLUMN match_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (match_dismissed IN (0, 1));
