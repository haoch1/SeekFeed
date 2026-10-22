CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY, source TEXT NOT NULL, started_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL, status TEXT NOT NULL, received INTEGER NOT NULL DEFAULT 0,
    accepted INTEGER NOT NULL DEFAULT 0, inserted INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL DEFAULT 0, invalid INTEGER NOT NULL DEFAULT 0,
    pages INTEGER NOT NULL DEFAULT 0, error_code TEXT, http_status INTEGER
);
CREATE INDEX IF NOT EXISTS idx_collection_runs_time ON collection_runs(started_at);
CREATE TABLE IF NOT EXISTS post_revisions (
    id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL, observed_at TEXT NOT NULL,
    before_json TEXT NOT NULL, after_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_revisions_post ON post_revisions(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_post_revisions_time ON post_revisions(observed_at);
CREATE TABLE IF NOT EXISTS post_observations (
    post_id INTEGER PRIMARY KEY, last_seen_at TEXT NOT NULL,
    changed_at TEXT, revision_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS author_backfill (
    post_id INTEGER PRIMARY KEY, attempted_at TEXT NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS author_backfill_state (
    id INTEGER PRIMARY KEY CHECK(id=1), next_attempt_at TEXT NOT NULL
);
INSERT OR IGNORE INTO author_backfill_state VALUES(1, '1970-01-01T00:00:00.000Z');
CREATE TABLE IF NOT EXISTS hot_metric_hourly (
    post_id INTEGER NOT NULL, bucket TEXT NOT NULL, observed_at TEXT NOT NULL,
    views INTEGER NOT NULL, replies INTEGER NOT NULL,
    PRIMARY KEY(post_id, bucket)
);
CREATE INDEX IF NOT EXISTS idx_hot_metric_hourly_time ON hot_metric_hourly(bucket);
