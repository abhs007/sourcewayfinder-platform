CREATE TABLE IF NOT EXISTS responses (
 id TEXT PRIMARY KEY,
 received_at TEXT NOT NULL,
 version TEXT NOT NULL,
 notice_version TEXT NOT NULL,
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS responses_received_at ON responses(received_at);
