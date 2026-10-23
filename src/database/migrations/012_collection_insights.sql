CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY, source TEXT NOT NULL, started_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL, status TEXT NOT NULL, received INTEGER NOT NULL DEFAULT 0,
    accepted INTEGER NOT NULL DEFAULT 0, inserted INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0, invalid INTEGER NOT NULL DEFAULT 0,
    pages INTEGER NOT NULL DEFAULT 0, error_code TEXT, http_status INTEGER
);
CREATE INDEX IF NOT EXISTS idx_collection_runs_time ON collection_runs(started_at);
CREATE TABLE IF NOT EXISTS author_backfill (
    post_id INTEGER PRIMARY KEY, attempted_at TEXT NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS author_backfill_state (
    id INTEGER PRIMARY KEY CHECK(id=1), next_attempt_at TEXT NOT NULL
);
INSERT OR IGNORE INTO author_backfill_state VALUES(1, '1970-01-01T00:00:00.000Z');
