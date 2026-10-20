CREATE TABLE hot_samples (
    post_id INTEGER NOT NULL REFERENCES hot_posts(post_id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    views INTEGER NOT NULL CHECK(views >= 0),
    replies INTEGER NOT NULL CHECK(replies >= 0),
    PRIMARY KEY (post_id, observed_at)
);
CREATE INDEX idx_hot_samples_time ON hot_samples(observed_at);
-- Keep the previous observation as a baseline during an upgrade.
INSERT INTO hot_samples SELECT post_id, observed_at, views, replies FROM hot_posts;
