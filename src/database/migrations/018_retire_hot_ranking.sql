-- Hot ranking is archived on codex/archive-hot-ranking. This removal is intentional.
-- Keep migration history so upgrades never replay legacy table creation.
PRAGMA secure_delete = ON;
DROP TABLE IF EXISTS hot_samples;
DROP TABLE IF EXISTS hot_posts;
DROP TABLE IF EXISTS hot_collector_state;
DROP TABLE IF EXISTS hot_metric_hourly;
DROP TABLE IF EXISTS author_backfill;
DROP TABLE IF EXISTS author_backfill_state;
DELETE FROM collection_runs WHERE source IN ('hot', 'identity');
-- These numeric identities were collected by the retired collector, not RSS.
-- Retain the shared schema used by optional profile links, but purge its data.
DELETE FROM forum_post_authors;
