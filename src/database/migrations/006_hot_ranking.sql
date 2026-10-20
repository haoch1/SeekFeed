CREATE TABLE hot_posts (
  post_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  views INTEGER NOT NULL CHECK(views >= 0),
  replies INTEGER NOT NULL CHECK(replies >= 0),
  last_active_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_hot_observed ON hot_posts(observed_at);
CREATE TABLE hot_collector_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  pages INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 0
);
INSERT INTO hot_collector_state(id) VALUES(1);
