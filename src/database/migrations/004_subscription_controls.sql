ALTER TABLE keywords_sub ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1));
ALTER TABLE keywords_sub ADD COLUMN exclude_keywords TEXT NOT NULL DEFAULT '';
