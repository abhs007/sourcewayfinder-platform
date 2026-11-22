-- Retain raw fetches separately from stable semantic versions. A dynamic page can
-- change timestamps/IDs without changing the retained policy passage.
CREATE TABLE source_observations(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source_registry(id), source_version_id TEXT NOT NULL REFERENCES source_versions(id), evidence_id TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL, normalized_sha256 TEXT NOT NULL, extractor_version TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE INDEX source_observations_history ON source_observations(source_id,checked_at);
CREATE TRIGGER source_observations_no_update BEFORE UPDATE ON source_observations BEGIN SELECT RAISE(ABORT,'immutable source observation'); END;
CREATE TRIGGER source_observations_no_delete BEFORE DELETE ON source_observations BEGIN SELECT RAISE(ABORT,'retained source observation'); END;
