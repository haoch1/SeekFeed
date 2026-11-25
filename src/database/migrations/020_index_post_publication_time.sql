-- Use the same date expression as analytics so older timestamp formats still work.
CREATE INDEX IF NOT EXISTS idx_posts_publication_time ON posts(julianday(pub_date));
