-- Remove the retired analysis metadata; forum posts and subscription state are retained.
DROP TABLE IF EXISTS trade_annotations;
DROP TABLE IF EXISTS trade_label_events;
DROP TABLE IF EXISTS trade_provider_aliases;
DROP TABLE IF EXISTS trade_providers;
