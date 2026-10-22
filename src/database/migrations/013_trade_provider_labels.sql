CREATE TABLE IF NOT EXISTS trade_annotations (
    post_id INTEGER PRIMARY KEY,
    labels_json TEXT NOT NULL,
    source_title TEXT NOT NULL,
    source_memo TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_label_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    post_id INTEGER,
    labels_json TEXT NOT NULL,
    source_title TEXT NOT NULL DEFAULT '',
    source_memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_provider_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_providers (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
);
