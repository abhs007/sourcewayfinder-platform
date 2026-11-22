CREATE TABLE evidence (
 id TEXT PRIMARY KEY, raw_sha256 TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes >= 0),
 chunks INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0 CHECK(complete IN(0,1)), created_at TEXT NOT NULL
);
CREATE TABLE evidence_chunks (
 evidence_id TEXT NOT NULL REFERENCES evidence(id), ordinal INTEGER NOT NULL, payload BLOB NOT NULL,
 PRIMARY KEY(evidence_id,ordinal)
);
CREATE TABLE evidence_reservations (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0 AND bytes<=367001600)
);
INSERT INTO evidence_reservations(singleton,bytes) VALUES(1,0);
CREATE TRIGGER evidence_chunks_immutable BEFORE UPDATE ON evidence_chunks BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER evidence_chunks_retained BEFORE DELETE ON evidence_chunks BEGIN SELECT RAISE(ABORT,'retained evidence'); END;
CREATE TRIGGER evidence_metadata_immutable BEFORE UPDATE OF id,raw_sha256,bytes,chunks,created_at ON evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
