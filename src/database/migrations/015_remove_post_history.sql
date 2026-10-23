-- Retain hot_samples for live heat calculation; retire only optional history metadata.
DROP TABLE IF EXISTS hot_metric_hourly;
DROP TABLE IF EXISTS post_revisions;
DROP TABLE IF EXISTS post_observations;
