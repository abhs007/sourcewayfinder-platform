PRAGMA foreign_keys = ON;
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, flow_id TEXT NOT NULL,
 bundle_hash TEXT NOT NULL, epoch INTEGER NOT NULL, sequence INTEGER NOT NULL DEFAULT 0,
 answers TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
 last_answer_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_key TEXT
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_idle ON sessions(last_answer_at);
CREATE TABLE submissions (
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 retry_key TEXT NOT NULL, input_hash TEXT NOT NULL, response TEXT NOT NULL,
 PRIMARY KEY(session_id,retry_key)
);
