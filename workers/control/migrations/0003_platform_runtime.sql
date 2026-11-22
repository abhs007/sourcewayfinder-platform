-- Worker code and asset versions are shared by every flow. A platform lease
-- prevents reactivation during deployment and binds activation to tested code.
CREATE TABLE platform_runtime(singleton INTEGER PRIMARY KEY CHECK(singleton=1), current_digest TEXT, pending_release_id TEXT, pending_runtime_digest TEXT, updated_at TEXT NOT NULL);
INSERT INTO platform_runtime(singleton,updated_at) VALUES(1,'1970-01-01T00:00:00.000Z');
