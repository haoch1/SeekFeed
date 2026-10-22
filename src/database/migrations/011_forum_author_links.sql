-- Public forum identities, independent of local administrator accounts.
CREATE TABLE forum_post_authors (
    post_id INTEGER PRIMARY KEY,
    creator TEXT NOT NULL,
    author_id INTEGER NOT NULL CHECK(author_id > 0 AND author_id <= 9007199254740991),
    observed_at TEXT NOT NULL
);
CREATE INDEX idx_forum_author_name ON forum_post_authors(creator, author_id);
