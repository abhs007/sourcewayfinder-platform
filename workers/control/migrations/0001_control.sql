PRAGMA foreign_keys = ON;
CREATE TABLE flows (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, scope TEXT NOT NULL, official_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'under_review' CHECK(status IN ('active','under_review','retired')),
 status_epoch INTEGER NOT NULL DEFAULT 1, bundle_hash TEXT, last_successful_check_at TEXT,
 release_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE source_registry (
 id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(id), url TEXT NOT NULL, title TEXT NOT NULL,
 approved_origin TEXT NOT NULL, approved_path TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
 latest_version_id TEXT, last_successful_check_at TEXT, last_error TEXT,
 reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE source_versions (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source_registry(id), snapshot_sha256 TEXT NOT NULL,
 normalized_sha256 TEXT NOT NULL, retrieved_at TEXT NOT NULL, effective_at TEXT, extractor_version TEXT NOT NULL,
 evidence_id TEXT NOT NULL, normalized_text TEXT NOT NULL, valid INTEGER NOT NULL DEFAULT 1,
 UNIQUE(source_id,snapshot_sha256,normalized_sha256,extractor_version)
);
CREATE TABLE bundles (
 hash TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(id), payload TEXT NOT NULL,
 usage TEXT NOT NULL CHECK(usage IN ('test_fixture','production_candidate')), created_at TEXT NOT NULL
);
CREATE TABLE bundle_sources (
 bundle_hash TEXT NOT NULL REFERENCES bundles(hash), source_version_id TEXT NOT NULL REFERENCES source_versions(id),
 PRIMARY KEY(bundle_hash,source_version_id)
);
CREATE TABLE proposals (
 id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES flows(id), digest TEXT NOT NULL,
 manifest TEXT NOT NULL, interpretation TEXT NOT NULL, uncertainties TEXT NOT NULL,
 candidate_digest TEXT, candidate_manifest TEXT, expected_digest TEXT, expected_manifest TEXT,
 state TEXT NOT NULL DEFAULT 'interpretation_review', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE proposal_sources (
 proposal_id TEXT NOT NULL REFERENCES proposals(id), source_version_id TEXT NOT NULL REFERENCES source_versions(id),
 PRIMARY KEY(proposal_id,source_version_id)
);
CREATE TABLE approvals (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, entity_id TEXT NOT NULL,
 gate TEXT NOT NULL CHECK(gate IN ('interpretation_review','expected_answer_review','merge_review','deployment_review')),
 digest TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approve','reject','revise')),
 principal TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX approvals_lookup ON approvals(entity_id,gate,digest,sequence DESC);
CREATE TABLE test_runs (
 id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES proposals(id), expected_digest TEXT NOT NULL,
 candidate_digest TEXT NOT NULL, runner TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL,
 passed INTEGER NOT NULL CHECK(passed IN (0,1)), artifact_hash TEXT NOT NULL, artifact_ref TEXT NOT NULL,
 result_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE releases (
 id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL REFERENCES proposals(id), flow_id TEXT NOT NULL REFERENCES flows(id),
 digest TEXT NOT NULL, manifest TEXT NOT NULL, bundle_hash TEXT NOT NULL REFERENCES bundles(hash),
 previous_release_id TEXT, expected_status_epoch INTEGER NOT NULL, environment TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'deployment_review', created_at TEXT NOT NULL, promoted_at TEXT
);
CREATE TABLE audit_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, actor_type TEXT NOT NULL,
 actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','complete','failed','waiting_quota')),
 attempts INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until TEXT, not_before TEXT NOT NULL,
 result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX jobs_ready ON jobs(state,not_before,lease_until);
CREATE TABLE notification_outbox (
 id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TRIGGER approvals_no_update BEFORE UPDATE ON approvals BEGIN SELECT RAISE(ABORT,'immutable approval'); END;
CREATE TRIGGER approvals_no_delete BEFORE DELETE ON approvals BEGIN SELECT RAISE(ABORT,'immutable approval'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
CREATE TRIGGER bundles_no_update BEFORE UPDATE ON bundles BEGIN SELECT RAISE(ABORT,'immutable bundle'); END;
CREATE TRIGGER bundles_no_delete BEFORE DELETE ON bundles BEGIN SELECT RAISE(ABORT,'immutable bundle'); END;
CREATE TRIGGER source_versions_immutable BEFORE UPDATE OF source_id,snapshot_sha256,normalized_sha256,retrieved_at,effective_at,extractor_version,evidence_id,normalized_text ON source_versions BEGIN SELECT RAISE(ABORT,'immutable source'); END;
-- Short-lived transaction assertions roll back the entire batch on a lost CAS.
CREATE TABLE atomic_guards(id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TRIGGER test_runs_no_update BEFORE UPDATE ON test_runs BEGIN SELECT RAISE(ABORT,'immutable test evidence'); END;
CREATE TRIGGER test_runs_no_delete BEFORE DELETE ON test_runs BEGIN SELECT RAISE(ABORT,'retained test evidence'); END;
CREATE TRIGGER release_manifest_immutable BEFORE UPDATE OF proposal_id,flow_id,digest,manifest,bundle_hash,previous_release_id,expected_status_epoch,environment,created_at ON releases BEGIN SELECT RAISE(ABORT,'immutable release manifest'); END;
CREATE TRIGGER source_versions_no_delete BEFORE DELETE ON source_versions BEGIN SELECT RAISE(ABORT,'retained source evidence'); END;
CREATE TABLE active_proposals(flow_id TEXT NOT NULL REFERENCES flows(id), revision_hash TEXT NOT NULL, proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id), PRIMARY KEY(flow_id,revision_hash));
