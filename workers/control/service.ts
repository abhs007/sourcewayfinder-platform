import { digest, sha256, validateBundle, type Bundle } from '../../packages/core/index.js';
import { HttpError, requireHuman, requireScope, type Actor } from './auth.js';
import {
  DEFAULT_SOURCE_BYTES,
  GOOGLE_HELP_SOURCE_BYTES,
  sourceDocumentLimit,
} from '../../packages/core/source-policy.js';

export interface ControlEnv {
  CONTROL_DB: D1Database;
  EVIDENCE_DB: D1Database;
  ENVIRONMENT: string;
}
type Row = Record<string, any>;
export const GATES = [
  'interpretation_review',
  'expected_answer_review',
  'merge_review',
  'deployment_review',
] as const;
export type Gate = (typeof GATES)[number];
const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const HASH = /^[0-9a-f]{64}$/;
export function text(value: unknown, name: string, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new HttpError(400, 'INVALID_INPUT', `Invalid ${name}.`);
  return value;
}
function id(value: unknown): string {
  const v = text(value, 'identifier', 64);
  if (!ID.test(v)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid identifier.');
  return v;
}
function hash(value: unknown): string {
  const v = text(value, 'hash', 64);
  if (!HASH.test(v)) throw new HttpError(400, 'INVALID_INPUT', 'Invalid artifact hash.');
  return v;
}
function url(value: unknown): string {
  let u: URL;
  try {
    u = new URL(text(value, 'URL'));
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'Invalid URL.');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash)
    throw new HttpError(
      400,
      'INVALID_INPUT',
      'An HTTPS URL without credentials or fragment is required.',
    );
  return u.href;
}
function json(value: unknown): string {
  return JSON.stringify(value);
}
function parse(row: Row | null, key: string, fallback: unknown = null): any {
  if (!row) return fallback;
  try {
    return JSON.parse(row[key]);
  } catch {
    return fallback;
  }
}
export function summarizeFlow(r: Row, now = Date.now()): Row {
  const fresh =
    r.last_successful_check_at &&
    now - Date.parse(r.last_successful_check_at) < 72 * 3600000 &&
    Date.parse(r.last_successful_check_at) <= now;
  return {
    id: r.id,
    title: r.title,
    scope: r.scope,
    officialUrl: r.official_url,
    status: r.status === 'active' && !fresh ? 'under_review' : r.status,
    statusEpoch: r.status_epoch,
    bundleHash: r.bundle_hash,
    lastSuccessfulCheckAt: r.last_successful_check_at,
    releaseId: r.release_id,
  };
}
export class ControlService {
  constructor(
    public env: ControlEnv,
    public now: () => Date = () => new Date(),
  ) {}
  // Direct D1 operations run at the primary; never replace with unconstrained replica sessions.
  get db() {
    return this.env.CONTROL_DB;
  }
  async batch(statements: D1PreparedStatement[]) {
    try {
      return await this.env.CONTROL_DB.batch(statements);
    } catch (error) {
      if (String(error).includes('CHECK constraint failed: ok=1'))
        throw new HttpError(
          409,
          'CONCURRENT_CHANGE',
          'An authoritative value changed. Reload and review before retrying.',
        );
      throw error;
    }
  }
  stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async one(sql: string, ...args: unknown[]): Promise<Row | null> {
    return this.stmt(sql, ...args).first<Row>();
  }
  async all(sql: string, ...args: unknown[]): Promise<Row[]> {
    return (await this.stmt(sql, ...args).all<Row>()).results;
  }
  audit(actor: Actor, operation: string, entityId: string, details: unknown) {
    return this.stmt(
      'INSERT INTO audit_events(id,actor_type,actor_id,operation,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)',
      crypto.randomUUID(),
      actor.kind,
      actor.id,
      operation,
      entityId,
      json(details),
      this.now().toISOString(),
    );
  }
  guardLastChange() {
    return this.stmt(
      "INSERT OR REPLACE INTO atomic_guards(id,ok) VALUES('last-mutation',CASE WHEN changes()=1 THEN 1 ELSE 0 END)",
    );
  }
  enqueue(kind: string, entityId: string, d: string, payload: unknown) {
    const time = this.now().toISOString();
    return this.stmt(
      'INSERT OR IGNORE INTO jobs(id,kind,dedupe_key,payload,not_before,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      crypto.randomUUID(),
      kind,
      `${kind}:${entityId}:${d}`,
      json(payload),
      time,
      time,
      time,
    );
  }
  notice(kind: string, entityId: string, d: string, payload: unknown) {
    return this.stmt(
      'INSERT OR IGNORE INTO notification_outbox(id,dedupe_key,kind,payload,created_at) VALUES(?,?,?,?,?)',
      crypto.randomUUID(),
      `${kind}:${entityId}:${d}`,
      kind,
      json(payload),
      this.now().toISOString(),
    );
  }
  async flows() {
    return (await this.all('SELECT * FROM flows ORDER BY title')).map((r) =>
      summarizeFlow(r, this.now().getTime()),
    );
  }
  async flow(flowId: string) {
    const r = await this.one('SELECT * FROM flows WHERE id=?', flowId);
    return r ? summarizeFlow(r, this.now().getTime()) : null;
  }
  async bundle(bundleHash: string): Promise<Bundle | null> {
    const r = await this.one(
      "SELECT b.payload FROM bundles b JOIN flows f ON f.bundle_hash=b.hash WHERE b.hash=? AND f.status='active' AND EXISTS(SELECT 1 FROM releases r WHERE r.id=f.release_id AND r.state='active')",
      bundleHash,
    );
    return r ? parse(r, 'payload') : null;
  }
  async sources(ids: string[]) {
    if (!ids.length) return [];
    if (ids.length > 100) throw new HttpError(400, 'INVALID_INPUT', 'Too many source references.');
    const bundles = await this.all(
      'SELECT b.payload FROM bundles b JOIN flows f ON f.bundle_hash=b.hash',
    );
    const result = new Map<string, unknown>();
    for (const b of bundles) {
      for (const s of parse(b, 'payload')?.sources || [])
        if (ids.includes(s.id) || ids.includes(s.sourceVersionId))
          result.set(s.id, { ...s, title: s.url });
    }
    return [...result.values()];
  }
  async dashboard() {
    const proposals = (
      await this.all('SELECT * FROM proposals ORDER BY updated_at DESC LIMIT 100')
    ).map((r) => this.proposalView(r));
    const releases = (
      await this.all('SELECT * FROM releases ORDER BY created_at DESC LIMIT 100')
    ).map((r) => ({
      ...r,
      manifest: parse(r, 'manifest'),
      nextGate: r.state === 'deployment_review' ? 'deployment_review' : null,
    }));
    return {
      flows: await this.flows(),
      proposals,
      releases,
      audit: await this.all('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 100'),
      sources: await this.all('SELECT * FROM source_registry ORDER BY flow_id,id'),
      jobs: await this.all(
        'SELECT id,kind,state,attempts,not_before,lease_until FROM jobs ORDER BY created_at DESC LIMIT 50',
      ),
    };
  }
  proposalView(r: Row): Row {
    return {
      ...r,
      manifest: parse(r, 'manifest'),
      candidateManifest: parse(r, 'candidate_manifest'),
      expectedManifest: parse(r, 'expected_manifest'),
      uncertainties: parse(r, 'uncertainties', []),
      nextGate: ['interpretation_review', 'expected_answer_review', 'merge_review'].includes(
        r.state,
      )
        ? r.state
        : null,
      digest:
        r.state === 'interpretation_review'
          ? r.digest
          : r.state === 'expected_answer_review'
            ? r.expected_digest
            : r.state === 'merge_review'
              ? r.merge_digest
              : r.candidate_digest,
    };
  }
  async proposal(proposalId: string): Promise<Row> {
    const r = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Proposal not found.');
    return {
      ...this.proposalView(r),
      interpretationDigest: r.digest,
      sourceVersions: await this.all(
        'SELECT v.*,s.url,s.title FROM source_versions v JOIN source_registry s ON s.id=v.source_id JOIN proposal_sources p ON p.source_version_id=v.id WHERE p.proposal_id=?',
        proposalId,
      ),
      approvals: await this.all(
        'SELECT * FROM approvals WHERE entity_id=? ORDER BY sequence',
        proposalId,
      ),
      testRuns: await this.all(
        'SELECT * FROM test_runs WHERE proposal_id=? ORDER BY completed_at DESC',
        proposalId,
      ),
    };
  }
  async createFlow(actor: Actor, body: Row) {
    requireHuman(actor);
    const flowId = id(body.id),
      time = this.now().toISOString();
    await this.batch([
      this.stmt(
        'INSERT INTO flows(id,title,scope,official_url,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        flowId,
        text(body.title, 'title', 200),
        text(body.scope, 'scope'),
        url(body.officialUrl),
        time,
        time,
      ),
      this.audit(actor, 'flow.created', flowId, { scope: body.scope }),
    ]);
    return this.flow(flowId);
  }
  async registerSource(actor: Actor, body: Row) {
    requireHuman(actor);
    const sourceId = id(body.id),
      flowId = id(body.flowId),
      sourceUrl = url(body.url);
    const origin = new URL(url(body.approvedOrigin)).origin;
    const path = text(body.approvedPath, 'approved path', 2000);
    const parsed = new URL(sourceUrl);
    if (
      parsed.origin !== origin ||
      !path.startsWith('/') ||
      !(
        parsed.pathname === path ||
        parsed.pathname.startsWith(path.endsWith('/') ? path : `${path}/`)
      )
    )
      throw new HttpError(400, 'SOURCE_SCOPE', 'The source URL is outside the approved boundary.');
    await this.batch([
      this.stmt(
        'INSERT INTO source_registry(id,flow_id,url,title,approved_origin,approved_path,enabled,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,1,?,?)',
        sourceId,
        flowId,
        sourceUrl,
        text(body.title, 'title', 200),
        origin,
        path,
        actor.id,
        this.now().toISOString(),
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=?",
        this.now().toISOString(),
        flowId,
      ),
      this.audit(actor, 'source.approved', sourceId, { url: sourceUrl, origin, path }),
    ]);
    return { id: sourceId };
  }
  async revalidateSource(actor: Actor, sourceId: string, b: Row) {
    requireHuman(actor);
    const versionId = id(b.sourceVersionId),
      reason = text(b.reason, 'review reason'),
      time = this.now().toISOString(),
      cutoff = new Date(this.now().getTime() - 72 * 3600000).toISOString();
    const result = await this.batch([
      this.stmt(
        'UPDATE source_versions SET valid=1 WHERE id=? AND source_id=? AND EXISTS(SELECT 1 FROM source_registry WHERE id=? AND latest_version_id=? AND last_error IS NULL AND last_successful_check_at>? AND last_successful_check_at<=?)',
        versionId,
        sourceId,
        sourceId,
        versionId,
        cutoff,
        time,
      ),
      this.guardLastChange(),
      this.audit(actor, 'source.revalidated', sourceId, { versionId, reason }),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(
        409,
        'SOURCE_INVALID',
        'A fresh successful check of the exact source version is required.',
      );
    return { sourceId, sourceVersionId: versionId, guidance: 'under_review' };
  }
  async reserveEvidence(actor: Actor, b: Row) {
    requireScope(actor, 'source:write');
    const eid = id(b.id),
      h = hash(b.rawSha256),
      bytes = Number(b.bytes),
      chunks = Number(b.chunks);
    let limit = DEFAULT_SOURCE_BYTES;
    if (
      bytes > DEFAULT_SOURCE_BYTES &&
      bytes <= GOOGLE_HELP_SOURCE_BYTES &&
      typeof b.sourceId === 'string'
    ) {
      const source = await this.one(
        'SELECT * FROM source_registry WHERE id=? AND enabled=1',
        id(b.sourceId),
      );
      if (source)
        limit = sourceDocumentLimit({
          url: source.url,
          approvedOrigin: source.approved_origin,
          approvedPath: source.approved_path,
        });
    }
    if (
      !Number.isInteger(bytes) ||
      bytes < 1 ||
      bytes > limit ||
      !Number.isInteger(chunks) ||
      chunks < 1 ||
      chunks > 16 ||
      chunks !== Math.ceil(bytes / 131072)
    )
      throw new HttpError(
        400,
        'EVIDENCE_SIZE',
        'Evidence must fit its registered source profile and use 128 KiB chunks.',
      );
    const db = this.env.EVIDENCE_DB;
    const existing = await db.prepare('SELECT * FROM evidence WHERE id=?').bind(eid).first<Row>();
    if (existing) {
      if (existing.raw_sha256 !== h || existing.bytes !== bytes || existing.chunks !== chunks)
        throw new HttpError(409, 'EVIDENCE_CONFLICT', 'Evidence ID already names different bytes.');
      return { id: eid, complete: !!existing.complete };
    }
    try {
      await db.batch([
        db
          .prepare(
            'UPDATE evidence_reservations SET bytes=bytes+? WHERE singleton=1 AND NOT EXISTS(SELECT 1 FROM evidence WHERE id=?)',
          )
          .bind(bytes + 4096 * (chunks + 1), eid),
        db
          .prepare(
            'INSERT OR IGNORE INTO evidence(id,raw_sha256,bytes,chunks,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(eid, h, bytes, chunks, this.now().toISOString()),
      ]);
    } catch {
      throw new HttpError(
        507,
        'EVIDENCE_CAPACITY',
        'Evidence capacity reached. Retain the local snapshot and request review.',
      );
    }
    return { id: eid, complete: false };
  }
  async evidenceChunk(actor: Actor, eid: string, ordinal: number, b: Row) {
    requireScope(actor, 'source:write');
    const db = this.env.EVIDENCE_DB,
      r = await db.prepare('SELECT * FROM evidence WHERE id=?').bind(id(eid)).first<Row>();
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Evidence reservation not found.');
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= r.chunks)
      throw new HttpError(400, 'INVALID_INPUT', 'Invalid chunk ordinal.');
    const raw = text(b.base64, 'base64', 174764);
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    } catch {
      throw new HttpError(400, 'INVALID_INPUT', 'Invalid base64.');
    }
    const wanted = ordinal === r.chunks - 1 ? r.bytes - 131072 * ordinal : 131072;
    if (bytes.length !== wanted)
      throw new HttpError(400, 'EVIDENCE_SIZE', 'Chunk length does not match its reservation.');
    const prior = await db
      .prepare('SELECT payload FROM evidence_chunks WHERE evidence_id=? AND ordinal=?')
      .bind(eid, ordinal)
      .first<Row>();
    if (prior) {
      if ((await sha256(new Uint8Array(prior.payload))) !== (await sha256(bytes)))
        throw new HttpError(409, 'EVIDENCE_CONFLICT', 'Immutable evidence chunk differs.');
      return { stored: true };
    }
    if (r.complete) throw new HttpError(409, 'EVIDENCE_COMPLETE', 'Evidence is already complete.');
    await db
      .prepare('INSERT INTO evidence_chunks(evidence_id,ordinal,payload) VALUES(?,?,?)')
      .bind(eid, ordinal, bytes)
      .run();
    return { stored: true };
  }
  async completeEvidence(actor: Actor, eid: string) {
    requireScope(actor, 'source:write');
    const db = this.env.EVIDENCE_DB,
      r = await db.prepare('SELECT * FROM evidence WHERE id=?').bind(id(eid)).first<Row>();
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Evidence not found.');
    const chunks = (
      await db
        .prepare('SELECT ordinal,payload FROM evidence_chunks WHERE evidence_id=? ORDER BY ordinal')
        .bind(eid)
        .all<Row>()
    ).results;
    if (chunks.length !== r.chunks)
      throw new HttpError(409, 'EVIDENCE_INCOMPLETE', 'All chunks must be retained.');
    const bytes = new Uint8Array(r.bytes);
    let offset = 0;
    for (const c of chunks) {
      const value = new Uint8Array(c.payload);
      bytes.set(value, offset);
      offset += value.length;
    }
    if (offset !== r.bytes || (await sha256(bytes)) !== r.raw_sha256)
      throw new HttpError(409, 'EVIDENCE_HASH', 'Evidence hash mismatch.');
    await db.prepare('UPDATE evidence SET complete=1 WHERE id=?').bind(eid).run();
    return { id: eid, complete: true };
  }
  async sourceCheck(actor: Actor, b: Row) {
    requireScope(actor, 'source:write');
    const sourceId = id(b.sourceId),
      source = await this.one('SELECT * FROM source_registry WHERE id=? AND enabled=1', sourceId);
    if (!source)
      throw new HttpError(404, 'SOURCE_NOT_APPROVED', 'Source is not registered and approved.');
    const time = this.now().toISOString();
    if (b.error) {
      const error = text(b.error, 'error', 1000),
        critical =
          /^(?:SOURCE_HTTP_(?:404|410)|EXTRACTION_|INCOMPLETE_|UNSUPPORTED_CONTENT|SOURCE_SCOPE|NON_PUBLIC_DESTINATION|IP_LITERAL_FORBIDDEN|SOURCE_TOO_LARGE|REDIRECT_WITHOUT_LOCATION|TOO_MANY_REDIRECTS)/.test(
            error,
          );
      await this.batch([
        this.stmt('UPDATE source_registry SET last_error=? WHERE id=?', error, sourceId),
        ...(critical
          ? [
              this.stmt(
                "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=? AND status<>'retired'",
                time,
                source.flow_id,
              ),
              this.stmt('UPDATE source_versions SET valid=0 WHERE id=?', source.latest_version_id),
              this.stmt(
                'INSERT OR IGNORE INTO notification_outbox(id,dedupe_key,kind,payload,created_at) VALUES(?,?,?,?,?)',
                crypto.randomUUID(),
                `source-failure:${sourceId}:${source.latest_version_id}:${error}`,
                'source_invalid',
                json({ flowId: source.flow_id, sourceId, error }),
                time,
              ),
            ]
          : []),
        this.audit(actor, 'source.check_failed', sourceId, { error, critical }),
      ]);
      return { checked: false, suspended: critical };
    }
    const versionId = id(b.sourceVersionId),
      rawHash = hash(b.snapshotSha256),
      normalizedHash = hash(b.normalizedSha256),
      normalized = text(b.normalizedText, 'normalized source', 131072),
      extractor = text(b.extractorVersion, 'extractor version', 100),
      evidenceId = id(b.evidenceId);
    if ((await sha256(normalized)) !== normalizedHash)
      throw new HttpError(400, 'SOURCE_HASH', 'Normalized source hash mismatch.');
    const evidence = await this.env.EVIDENCE_DB.prepare(
      'SELECT * FROM evidence WHERE id=? AND complete=1',
    )
      .bind(evidenceId)
      .first<Row>();
    if (
      !evidence ||
      evidence.raw_sha256 !== rawHash ||
      evidence.bytes >
        sourceDocumentLimit({
          url: source.url,
          approvedOrigin: source.approved_origin,
          approvedPath: source.approved_path,
        })
    )
      throw new HttpError(
        409,
        'EVIDENCE_MISSING',
        'Complete raw evidence with the matching hash is required.',
      );
    const stable = await this.one(
      'SELECT * FROM source_versions WHERE id=? AND source_id=? AND normalized_sha256=? AND extractor_version=? AND valid=1',
      source.latest_version_id,
      sourceId,
      normalizedHash,
      extractor,
    );
    const existing =
      stable ||
      (await this.one(
        'SELECT * FROM source_versions WHERE source_id=? AND snapshot_sha256=? AND normalized_sha256=? AND extractor_version=?',
        sourceId,
        rawHash,
        normalizedHash,
        extractor,
      ));
    const chosen = existing?.id || versionId;
    const changed = !!source.latest_version_id && source.latest_version_id !== chosen;
    const guard = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.stmt(
        'INSERT INTO atomic_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM source_registry WHERE id=? AND latest_version_id IS ?) THEN 1 ELSE 0 END',
        guard,
        sourceId,
        source.latest_version_id,
      ),
    ];
    if (!existing)
      statements.push(
        this.stmt(
          'INSERT INTO source_versions(id,source_id,snapshot_sha256,normalized_sha256,retrieved_at,effective_at,extractor_version,evidence_id,normalized_text) VALUES(?,?,?,?,?,?,?,?,?)',
          versionId,
          sourceId,
          rawHash,
          normalizedHash,
          time,
          b.effectiveAt ? text(b.effectiveAt, 'effective date', 40) : null,
          extractor,
          evidenceId,
          normalized,
        ),
      );
    statements.push(
      this.stmt(
        'INSERT INTO source_observations(id,source_id,source_version_id,evidence_id,snapshot_sha256,normalized_sha256,extractor_version,checked_at) VALUES(?,?,?,?,?,?,?,?)',
        crypto.randomUUID(),
        sourceId,
        chosen,
        evidenceId,
        rawHash,
        normalizedHash,
        extractor,
        time,
      ),
    );
    statements.push(
      this.stmt(
        'UPDATE source_registry SET latest_version_id=?,last_successful_check_at=?,last_error=NULL WHERE id=?',
        chosen,
        time,
        sourceId,
      ),
    );
    if (changed || !source.latest_version_id) {
      statements.push(
        this.stmt(
          "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=?",
          time,
          source.flow_id,
        ),
      );
      const dedupe = `source:${sourceId}:${chosen}:${time}`;
      statements.push(
        this.stmt(
          'INSERT OR IGNORE INTO jobs(id,kind,dedupe_key,payload,not_before,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          'source_change',
          dedupe,
          json({
            sourceId,
            flowId: source.flow_id,
            sourceVersionId: chosen,
            previousVersionId: source.latest_version_id,
          }),
          time,
          time,
          time,
        ),
      );
      statements.push(
        this.stmt(
          'INSERT OR IGNORE INTO notification_outbox(id,dedupe_key,kind,payload,created_at) VALUES(?,?,?,?,?)',
          crypto.randomUUID(),
          dedupe,
          'source_change',
          json({ flowId: source.flow_id, sourceId, sourceVersionId: chosen }),
          time,
        ),
      );
    }
    statements.push(
      this.stmt(
        'UPDATE flows SET last_successful_check_at=(SELECT MIN(last_successful_check_at) FROM source_registry WHERE flow_id=? AND enabled=1),updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM source_registry WHERE flow_id=? AND enabled=1 AND last_successful_check_at IS NULL)',
        source.flow_id,
        time,
        source.flow_id,
        source.flow_id,
      ),
    );
    statements.push(
      this.audit(actor, changed ? 'source.changed' : 'source.checked', sourceId, {
        versionId: chosen,
        rawHash,
        normalizedHash,
        evidenceId,
      }),
    );
    statements.push(this.stmt('DELETE FROM atomic_guards WHERE id=?', guard));
    await this.batch(statements);
    return {
      checked: true,
      changed,
      sourceVersionId: chosen,
      snapshotSha256: existing?.snapshot_sha256 || rawHash,
      normalizedSha256: normalizedHash,
      evidenceId: existing?.evidence_id || evidenceId,
    };
  }
  async validateCurrentSources(ids: string[], flowId: string) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || new Set(ids).size !== ids.length)
      throw new HttpError(400, 'SOURCE_SET', 'A unique source-version set is required.');
    const registered = await this.all(
      'SELECT latest_version_id FROM source_registry WHERE flow_id=? AND enabled=1',
      flowId,
    );
    if (
      registered.length !== ids.length ||
      registered.some((source) => !ids.includes(source.latest_version_id))
    )
      throw new HttpError(
        409,
        'SOURCE_SET_INCOMPLETE',
        'The proposal must include every enabled current source for this flow.',
      );
    for (const sourceVersionId of ids) {
      const r = await this.one(
        'SELECT v.id,s.last_successful_check_at FROM source_versions v JOIN source_registry s ON s.id=v.source_id WHERE v.id=? AND v.valid=1 AND s.enabled=1 AND s.latest_version_id=v.id AND s.flow_id=?',
        id(sourceVersionId),
        flowId,
      );
      if (
        !r ||
        !r.last_successful_check_at ||
        this.now().getTime() - Date.parse(r.last_successful_check_at) >= 72 * 3600000 ||
        Date.parse(r.last_successful_check_at) > this.now().getTime()
      )
        throw new HttpError(
          409,
          'SOURCE_INVALID',
          'Source versions are stale, superseded, or outside this flow.',
        );
    }
  }
  async createProposal(actor: Actor, b: Row) {
    requireScope(actor, 'proposal:write');
    const proposalId = id(b.id),
      flowId = id(b.flowId);
    const versionIds = b.sourceVersionIds as string[];
    await this.validateCurrentSources(versionIds, flowId);
    const manifest = {
      flowId,
      sourceVersionIds: [...versionIds].sort(),
      interpretation: text(b.interpretation, 'interpretation', 20000),
      uncertainties: b.uncertainties || [],
      changes: b.changes || {},
      policyVersion: '1',
    };
    if (
      !Array.isArray(manifest.uncertainties) ||
      manifest.uncertainties.some((x: unknown) => typeof x !== 'string')
    )
      throw new HttpError(400, 'INVALID_INPUT', 'Invalid uncertainties.');
    const d = await digest(manifest),
      revisionHash = await digest([...versionIds].sort()),
      time = this.now().toISOString();
    const existing = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (existing) {
      if (existing.digest !== d)
        throw new HttpError(
          409,
          'PROPOSAL_IMMUTABLE',
          'Create a new proposal ID for revised interpretation.',
        );
      return this.proposal(proposalId);
    }
    const active = await this.one(
      'SELECT proposal_id FROM active_proposals WHERE flow_id=? AND revision_hash=?',
      flowId,
      revisionHash,
    );
    if (active)
      throw new HttpError(
        409,
        'PROPOSAL_EXISTS',
        'An active proposal already covers this source revision. Review or revise it before creating another.',
      );
    await this.batch([
      this.stmt(
        'INSERT INTO proposals(id,flow_id,digest,manifest,interpretation,uncertainties,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        proposalId,
        flowId,
        d,
        json(manifest),
        manifest.interpretation,
        json(manifest.uncertainties),
        time,
        time,
      ),
      this.stmt(
        'INSERT INTO active_proposals(flow_id,revision_hash,proposal_id) VALUES(?,?,?)',
        flowId,
        revisionHash,
        proposalId,
      ),
      ...versionIds.map((v) =>
        this.stmt(
          'INSERT INTO proposal_sources(proposal_id,source_version_id) VALUES(?,?)',
          proposalId,
          v,
        ),
      ),
      this.notice('review_requested', proposalId, d, {
        proposalId,
        gate: 'interpretation_review',
        digest: d,
      }),
      this.audit(actor, 'proposal.created', proposalId, { digest: d }),
    ]);
    return this.proposal(proposalId);
  }
  async approved(entityId: string, gate: Gate, d: string): Promise<Row | null> {
    return this.one(
      "SELECT * FROM approvals WHERE sequence=(SELECT MAX(sequence) FROM approvals WHERE entity_id=? AND gate=? AND digest=?) AND decision='approve'",
      entityId,
      gate,
      d,
    );
  }
  async requireApproval(entityId: string, gate: Gate, d: string) {
    const r = await this.approved(entityId, gate, d);
    if (!r)
      throw new HttpError(
        409,
        'APPROVAL_REQUIRED',
        `Human ${gate} approval is required for this artifact.`,
      );
    return r;
  }
  async sourceIds(proposalId: string): Promise<string[]> {
    return (
      await this.all(
        'SELECT source_version_id FROM proposal_sources WHERE proposal_id=?',
        proposalId,
      )
    ).map((r) => r.source_version_id);
  }
  async currentCandidate(p: Row) {
    const approval = await this.requireApproval(p.id, 'interpretation_review', p.digest);
    if (
      !p.candidate_manifest ||
      parse(p, 'candidate_manifest').interpretationApprovalId !== approval.id
    )
      throw new HttpError(
        409,
        'CANDIDATE_APPROVAL_CHANGED',
        'The candidate must be reviewed against the current source-interpretation approval.',
      );
    return approval;
  }
  async candidate(actor: Actor, proposalId: string, b: Row) {
    requireScope(actor, 'proposal:write');
    const p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Proposal not found.');
    const interpretationApproval = await this.requireApproval(
      proposalId,
      'interpretation_review',
      p.digest,
    );
    await this.validateCurrentSources(await this.sourceIds(proposalId), p.flow_id);
    let bundle: Bundle;
    try {
      bundle = validateBundle(b.bundle);
    } catch {
      throw new HttpError(
        400,
        'BUNDLE_INVALID',
        'Candidate bundle failed schema or graph validation.',
      );
    }
    if (bundle.flowId !== p.flow_id)
      throw new HttpError(400, 'BUNDLE_SCOPE', 'Candidate flow differs.');
    if (this.env.ENVIRONMENT === 'production' && bundle.usage !== 'production_candidate')
      throw new HttpError(400, 'FIXTURE_REJECTED', 'Fictional fixtures cannot enter production.');
    const versions = new Set(await this.sourceIds(proposalId));
    for (const s of bundle.sources) {
      if (!versions.has(s.sourceVersionId))
        throw new HttpError(
          409,
          'SOURCE_SET',
          'Bundle source is outside the approved interpretation.',
        );
      const v = await this.one(
        'SELECT v.*,s.url FROM source_versions v JOIN source_registry s ON s.id=v.source_id WHERE v.id=?',
        s.sourceVersionId,
      );
      if (
        !v ||
        v.snapshot_sha256 !== s.snapshotSha256 ||
        v.url !== s.url ||
        !v.normalized_text.includes(s.passage)
      )
        throw new HttpError(
          409,
          'PASSAGE_INVALID',
          'Bundle citation does not match retained evidence.',
        );
    }
    const bundleHash = await digest(bundle),
      manifest = {
        interpretationApprovalId: interpretationApproval.id,
        proposalDigest: p.digest,
        bundleHash,
        candidateCommit: text(b.candidateCommit, 'candidate commit', 64),
        migrationHash: hash(b.migrationHash),
        codeHash: hash(b.codeHash),
        policyVersion: '1',
      };
    if (!/^[0-9a-f]{40,64}$/.test(manifest.candidateCommit))
      throw new HttpError(400, 'COMMIT_INVALID', 'An immutable full commit hash is required.');
    const d = await digest(manifest),
      time = this.now().toISOString();
    if (p.candidate_digest === d) return this.proposal(proposalId);
    await this.batch([
      this.stmt(
        'INSERT OR IGNORE INTO bundles(hash,flow_id,payload,usage,created_at) VALUES(?,?,?,?,?)',
        bundleHash,
        p.flow_id,
        json(bundle),
        bundle.usage,
        time,
      ),
      ...bundle.sources.map((s) =>
        this.stmt(
          'INSERT OR IGNORE INTO bundle_sources(bundle_hash,source_version_id) VALUES(?,?)',
          bundleHash,
          s.sourceVersionId,
        ),
      ),
      this.stmt(
        "UPDATE proposals SET candidate_digest=?,candidate_manifest=?,expected_digest=NULL,expected_manifest=NULL,merge_digest=NULL,state='expectations_preparation',updated_at=? WHERE id=? AND digest=?",
        d,
        json(manifest),
        time,
        proposalId,
        p.digest,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active' AND release_id IN(SELECT id FROM releases WHERE proposal_id=?)",
        time,
        proposalId,
      ),
      this.enqueue('draft_expectations', proposalId, d, {
        proposalId,
        flowId: p.flow_id,
        candidateDigest: d,
      }),
      this.audit(actor, 'candidate.created', proposalId, { digest: d, bundleHash }),
    ]);
    return this.proposal(proposalId);
  }
  async expectations(actor: Actor, proposalId: string, b: Row) {
    requireScope(actor, 'proposal:write');
    const p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p?.candidate_digest)
      throw new HttpError(409, 'CANDIDATE_REQUIRED', 'Candidate implementation is required.');
    await this.currentCandidate(p);
    const cases = b.cases;
    if (!Array.isArray(cases) || !cases.length || cases.length > 1000)
      throw new HttpError(400, 'EXPECTED_CASES', 'Expected cases are required.');
    const manifest = {
      candidateDigest: p.candidate_digest,
      cases,
      testCodeHash: hash(b.testCodeHash),
      sourceVersionIds: (await this.sourceIds(proposalId)).sort(),
      policyVersion: '1',
    };
    const d = await digest(manifest);
    if (p.expected_digest === d && p.state !== 'expectations_preparation')
      return this.proposal(proposalId);
    await this.batch([
      this.stmt(
        "UPDATE proposals SET expected_digest=?,expected_manifest=?,merge_digest=NULL,state='expected_answer_review',updated_at=? WHERE id=? AND candidate_digest=?",
        d,
        json(manifest),
        this.now().toISOString(),
        proposalId,
        p.candidate_digest,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active' AND release_id IN(SELECT id FROM releases WHERE proposal_id=?)",
        this.now().toISOString(),
        proposalId,
      ),
      this.notice('review_requested', proposalId, d, {
        proposalId,
        gate: 'expected_answer_review',
        digest: d,
      }),
      this.audit(actor, 'expectations.created', proposalId, { digest: d }),
    ]);
    return this.proposal(proposalId);
  }
  async decision(actor: Actor, entityId: string, b: Row, release = false) {
    requireHuman(actor);
    const gate = text(b.gate, 'gate', 40) as Gate,
      decision = text(b.decision, 'decision', 10),
      d = hash(b.digest),
      reason = text(b.reason, 'review reason', 4000);
    if (
      !GATES.includes(gate) ||
      !['approve', 'reject', 'revise'].includes(decision) ||
      release !== (gate === 'deployment_review')
    )
      throw new HttpError(400, 'INVALID_GATE', 'Invalid decision gate.');
    const r = await this.one(
      `SELECT * FROM ${release ? 'releases' : 'proposals'} WHERE id=?`,
      entityId,
    );
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Review artifact not found.');
    const expected =
      release || gate === 'interpretation_review'
        ? r.digest
        : gate === 'expected_answer_review'
          ? r.expected_digest
          : r.merge_digest;
    if (expected !== d)
      throw new HttpError(409, 'STALE_REVIEW', 'The reviewed artifact has changed.');
    const proposalId = release ? r.proposal_id : entityId;
    const p = release ? await this.one('SELECT * FROM proposals WHERE id=?', proposalId) : r;
    const latest = await this.one(
      'SELECT * FROM approvals WHERE entity_id=? AND gate=? AND digest=? ORDER BY sequence DESC LIMIT 1',
      entityId,
      gate,
      d,
    );
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Proposal not found.');
    if (decision === 'approve') {
      await this.validateCurrentSources(await this.sourceIds(proposalId), p.flow_id);
      if (gate !== 'interpretation_review') await this.currentCandidate(p);
      if (gate === 'merge_review' || gate === 'deployment_review') {
        await this.requireApproval(proposalId, 'expected_answer_review', p.expected_digest);
        await this.mergeRun(
          p,
          gate === 'deployment_review' ? parse(r, 'manifest').testRunId : undefined,
        );
      }
      if (gate === 'deployment_review') {
        const merge = await this.requireApproval(proposalId, 'merge_review', p.merge_digest);
        if (parse(r, 'manifest').mergeApprovalId !== merge.id)
          throw new HttpError(
            409,
            'MERGE_APPROVAL_CHANGED',
            'Prepare a new release under the current merge approval.',
          );
      }
    }
    if (latest?.decision === decision)
      return { id: latest.id, gate, decision, digest: d, state: r.state };
    const table = release ? 'releases' : 'proposals',
      column =
        release || gate === 'interpretation_review'
          ? 'digest'
          : gate === 'expected_answer_review'
            ? 'expected_digest'
            : 'merge_digest';
    const newState =
      decision !== 'approve'
        ? release
          ? 'deployment_review'
          : gate === 'interpretation_review'
            ? 'interpretation_review'
            : gate === 'expected_answer_review'
              ? 'expectations_preparation'
              : 'implementation_authorized'
        : gate === 'interpretation_review'
          ? 'implementation_authorized'
          : gate === 'expected_answer_review'
            ? 'test_authorized'
            : gate === 'merge_review'
              ? 'merge_authorized'
              : 'deploy_authorized';
    const approvalId = crypto.randomUUID(),
      time = this.now().toISOString();
    const results = await this.batch([
      this.stmt(
        `INSERT INTO approvals(id,entity_id,gate,digest,decision,principal,reason,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=? AND ${column}=?)`,
        approvalId,
        entityId,
        gate,
        d,
        decision,
        actor.id,
        reason,
        time,
        entityId,
        d,
      ),
      this.guardLastChange(),
      this.stmt(
        `UPDATE ${table} SET state=? WHERE id=? AND ${column}=? AND EXISTS(SELECT 1 FROM approvals WHERE id=?)`,
        newState,
        entityId,
        d,
        approvalId,
      ),
      ...(gate === 'interpretation_review' && decision !== 'approve'
        ? [this.stmt('DELETE FROM active_proposals WHERE proposal_id=?', proposalId)]
        : []),
      ...(decision === 'approve'
        ? []
        : [
            this.stmt(
              "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=?",
              time,
              p!.flow_id,
            ),
          ]),
      ...(decision === 'approve' && gate === 'interpretation_review'
        ? [
            this.enqueue('implement_guidance', proposalId, `${d}:${approvalId}`, {
              proposalId,
              flowId: p!.flow_id,
              interpretationDigest: d,
              interpretationApprovalId: approvalId,
            }),
          ]
        : []),
      ...(decision === 'revise' && gate === 'expected_answer_review'
        ? [
            this.enqueue('draft_expectations', proposalId, `${p!.candidate_digest}:${approvalId}`, {
              proposalId,
              flowId: p!.flow_id,
              candidateDigest: p!.candidate_digest,
              revisionAfter: approvalId,
            }),
          ]
        : []),
      ...(decision === 'approve' && gate === 'expected_answer_review'
        ? [
            this.enqueue('authorized_tests', proposalId, `${d}:${approvalId}`, {
              proposalId,
              flowId: p!.flow_id,
              candidateDigest: p!.candidate_digest,
              expectedDigest: d,
              expectedApprovalId: approvalId,
            }),
          ]
        : []),
      this.audit(actor, 'review.decided', entityId, { gate, digest: d, decision, reason }),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(409, 'STALE_REVIEW', 'The reviewed artifact changed during submission.');
    return { id: approvalId, gate, decision, digest: d, state: newState };
  }
  async recordTest(actor: Actor, b: Row) {
    requireScope(actor, 'test:write');
    const proposalId = id(b.proposalId),
      runId = id(b.id),
      expected = hash(b.expectedDigest),
      candidate = hash(b.candidateDigest);
    const p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p || p.expected_digest !== expected || p.candidate_digest !== candidate)
      throw new HttpError(
        409,
        'STALE_TEST',
        'The test no longer matches the candidate and expected answers.',
      );
    const approval = await this.requireApproval(proposalId, 'expected_answer_review', expected);
    await this.currentCandidate(p);
    const started = text(b.startedAt, 'start time', 40),
      completed = text(b.completedAt, 'completion time', 40);
    if (
      !Number.isFinite(Date.parse(started)) ||
      !Number.isFinite(Date.parse(completed)) ||
      Date.parse(started) < Date.parse(approval.created_at) ||
      Date.parse(completed) < Date.parse(started) ||
      Date.parse(completed) > this.now().getTime() + 60000
    )
      throw new HttpError(
        400,
        'TEST_TIME',
        'Tests must start after their expected-answer approval and have valid timestamps.',
      );
    if (
      typeof b.passed !== 'boolean' ||
      !Array.isArray(b.checks) ||
      !b.checks.length ||
      b.checks.some((c: any) => typeof c.name !== 'string' || typeof c.passed !== 'boolean') ||
      b.passed !== b.checks.every((c: any) => c.passed)
    )
      throw new HttpError(400, 'TEST_RESULT', 'A consistent named-check result is required.');
    const result = {
        expectedApprovalId: approval.id,
        workerArtifacts: b.workerArtifacts || null,
        webAssetsHash: b.webAssetsHash || null,
        adminAssetsHash: b.adminAssetsHash || null,
        checks: b.checks,
        environment: text(b.environment, 'test environment', 100),
      },
      artifactHash = hash(b.artifactHash),
      artifactRef = text(b.artifactRef, 'artifact reference', 1000),
      time = this.now().toISOString(),
      mergeDigest = b.passed
        ? await digest({
            candidateDigest: candidate,
            expectedDigest: expected,
            expectedApprovalId: approval.id,
            testRunId: runId,
            testArtifactHash: artifactHash,
            result,
          })
        : null;
    await this.batch([
      this.stmt(
        'INSERT INTO test_runs(id,proposal_id,expected_digest,candidate_digest,runner,started_at,completed_at,passed,artifact_hash,artifact_ref,result_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM proposals WHERE id=? AND expected_digest=? AND candidate_digest=?)',
        runId,
        proposalId,
        expected,
        candidate,
        actor.id,
        started,
        completed,
        b.passed ? 1 : 0,
        artifactHash,
        artifactRef,
        json({ ...result, mergeDigest }),
        time,
        proposalId,
        expected,
        candidate,
      ),
      this.guardLastChange(),
      this.stmt(
        'UPDATE proposals SET state=?,merge_digest=?,updated_at=? WHERE id=? AND expected_digest=? AND candidate_digest=?',
        b.passed ? 'merge_review' : 'test_failed',
        mergeDigest,
        time,
        proposalId,
        expected,
        candidate,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active' AND release_id IN(SELECT id FROM releases WHERE proposal_id=?)",
        time,
        proposalId,
      ),
      this.notice(b.passed ? 'review_requested' : 'test_failed', proposalId, artifactHash, {
        proposalId,
        gate: 'merge_review',
        passed: b.passed,
      }),
      this.audit(actor, 'test.recorded', runId, { proposalId, passed: b.passed, artifactHash }),
    ]);
    return { id: runId, passed: b.passed };
  }
  async mergeRun(p: Row, runId?: string): Promise<Row> {
    const approval = await this.requireApproval(p.id, 'expected_answer_review', p.expected_digest);
    const run = runId
      ? await this.one('SELECT * FROM test_runs WHERE id=?', runId)
      : await this.one(
          "SELECT * FROM test_runs WHERE proposal_id=? AND candidate_digest=? AND expected_digest=? AND passed=1 AND json_extract(result_json,'$.mergeDigest')=? LIMIT 1",
          p.id,
          p.candidate_digest,
          p.expected_digest,
          p.merge_digest,
        );
    const stored = parse(run, 'result_json');
    if (
      !run ||
      run.proposal_id !== p.id ||
      run.passed !== 1 ||
      run.candidate_digest !== p.candidate_digest ||
      run.expected_digest !== p.expected_digest ||
      !stored ||
      stored.expectedApprovalId !== approval.id ||
      stored.mergeDigest !== p.merge_digest
    ) {
      throw new HttpError(
        409,
        'TEST_REQUIRED',
        'The exact passing test result selected by the merge review is required.',
      );
    }
    const { mergeDigest: _recordedDigest, ...result } = stored;
    const recomputed = await digest({
      candidateDigest: run.candidate_digest,
      expectedDigest: run.expected_digest,
      expectedApprovalId: stored.expectedApprovalId,
      testRunId: run.id,
      testArtifactHash: run.artifact_hash,
      result,
    });
    if (recomputed !== p.merge_digest) {
      throw new HttpError(
        409,
        'TEST_REQUIRED',
        'The retained test proof does not match the approved merge digest.',
      );
    }
    return run;
  }
  async createRelease(actor: Actor, b: Row) {
    requireScope(actor, 'release:prepare');
    const releaseId = id(b.id),
      proposalId = id(b.proposalId),
      p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p?.candidate_digest || !p.expected_digest)
      throw new HttpError(409, 'CANDIDATE_REQUIRED', 'Complete reviewed candidate required.');
    await this.currentCandidate(p);
    await this.requireApproval(proposalId, 'expected_answer_review', p.expected_digest);
    const mergeApproval = await this.requireApproval(proposalId, 'merge_review', p.merge_digest);
    await this.validateCurrentSources(await this.sourceIds(proposalId), p.flow_id);
    const run = await this.mergeRun(p, id(b.testRunId));
    const candidate = parse(p, 'candidate_manifest'),
      flow = await this.one('SELECT * FROM flows WHERE id=?', p.flow_id);
    if (!flow) throw new HttpError(404, 'NOT_FOUND', 'Flow not found.');
    const runtime = await this.one('SELECT * FROM platform_runtime WHERE singleton=1');
    const runtimeDigest = await digest({
      workerArtifacts: b.workerArtifacts || null,
      webAssetsHash: b.webAssetsHash || null,
      adminAssetsHash: b.adminAssetsHash || null,
      migrationHash: candidate.migrationHash,
    });
    const manifest = {
      mergeDigest: p.merge_digest,
      mergeApprovalId: mergeApproval.id,
      runtimeDigest,
      previousRuntimeDigest: runtime?.current_digest || null,
      proposalId,
      proposalDigest: p.digest,
      candidateDigest: p.candidate_digest,
      expectedDigest: p.expected_digest,
      bundleHash: candidate.bundleHash,
      candidateCommit: candidate.candidateCommit,
      mergedTreeHash: hash(b.mergedTreeHash),
      codeHash: candidate.codeHash,
      migrationHash: candidate.migrationHash,
      workerVersions: b.workerVersions,
      workerArtifacts: b.workerArtifacts || null,
      webAssetsHash: b.webAssetsHash || null,
      adminAssetsHash: b.adminAssetsHash || null,
      previousWorkerVersions: b.previousWorkerVersions || null,
      d1RecoveryBookmarks: b.d1RecoveryBookmarks || null,
      migrationStrategy: b.migrationStrategy || 'none',
      testRunId: run.id,
      testArtifactHash: run.artifact_hash,
      sourceVersionIds: (await this.sourceIds(proposalId)).sort(),
      previousReleaseId: flow.release_id,
      expectedStatusEpoch: flow.status_epoch,
      environment: this.env.ENVIRONMENT,
      policyVersion: '1',
    };
    if (manifest.mergedTreeHash !== candidate.codeHash)
      throw new HttpError(
        409,
        'MERGED_TREE_CHANGED',
        'Merged code differs from tested code. Rebuild and obtain new approvals.',
      );
    if (
      !manifest.workerVersions ||
      typeof manifest.workerVersions !== 'object' ||
      Array.isArray(manifest.workerVersions) ||
      !['web', 'api', 'control', 'survey'].every(
        (k) =>
          typeof manifest.workerVersions[k] === 'string' && manifest.workerVersions[k].length > 0,
      )
    )
      throw new HttpError(
        400,
        'WORKER_VERSIONS',
        'Exact web, API, control and survey version identifiers are required.',
      );
    if (this.env.ENVIRONMENT === 'production') {
      const services = ['web', 'api', 'control', 'survey'];
      if (
        !manifest.workerArtifacts ||
        !services.every((k) => HASH.test(manifest.workerArtifacts[k] || '')) ||
        !HASH.test(manifest.webAssetsHash || '') ||
        !HASH.test(manifest.adminAssetsHash || '') ||
        !manifest.previousWorkerVersions ||
        typeof manifest.previousWorkerVersions.web !== 'string' ||
        !services.every((k) => Object.hasOwn(manifest.previousWorkerVersions, k)) ||
        !manifest.d1RecoveryBookmarks ||
        !['control', 'evidence', 'sessions', 'survey'].every(
          (k) =>
            typeof manifest.d1RecoveryBookmarks[k] === 'string' &&
            manifest.d1RecoveryBookmarks[k].length > 0,
        )
      )
        throw new HttpError(
          400,
          'RELEASE_RECOVERY_REQUIRED',
          'Production requires exact Worker/asset hashes, previous versions, and D1 recovery bookmarks.',
        );
      const proof = parse(run, 'result_json');
      if (
        (await digest(proof?.workerArtifacts)) !== (await digest(manifest.workerArtifacts)) ||
        proof?.webAssetsHash !== manifest.webAssetsHash ||
        proof?.adminAssetsHash !== manifest.adminAssetsHash
      )
        throw new HttpError(
          409,
          'ARTIFACTS_CHANGED',
          'Production artifacts differ from the authorized test run.',
        );
      if (manifest.migrationStrategy !== 'none')
        throw new HttpError(
          409,
          'MIGRATION_REVIEW_REQUIRED',
          'Schema changes require a separately reviewed maintenance release before this publisher can proceed.',
        );
    }
    const d = await digest(manifest),
      time = this.now().toISOString();
    const existing = await this.one('SELECT digest FROM releases WHERE id=?', releaseId);
    if (existing) {
      if (existing.digest !== d)
        throw new HttpError(
          409,
          'RELEASE_IMMUTABLE',
          'Release ID already identifies another manifest.',
        );
      return { id: releaseId, digest: d, manifest };
    }
    await this.batch([
      this.stmt(
        'INSERT INTO releases(id,proposal_id,flow_id,digest,manifest,bundle_hash,previous_release_id,expected_status_epoch,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        releaseId,
        proposalId,
        p.flow_id,
        d,
        json(manifest),
        candidate.bundleHash,
        flow.release_id,
        flow.status_epoch,
        this.env.ENVIRONMENT,
        time,
      ),
      this.notice('review_requested', releaseId, d, {
        releaseId,
        gate: 'deployment_review',
        digest: d,
      }),
      this.audit(actor, 'release.prepared', releaseId, { digest: d }),
    ]);
    return {
      id: releaseId,
      digest: d,
      manifest,
      state: 'deployment_review',
      nextGate: 'deployment_review',
    };
  }
  async testAuthorization(actor: Actor, proposalId: string) {
    requireScope(actor, 'test:write');
    const p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p?.expected_digest || !p.candidate_digest)
      throw new HttpError(
        409,
        'CANDIDATE_REQUIRED',
        'An exact candidate and expectations are required.',
      );
    await this.currentCandidate(p);
    const approval = await this.requireApproval(p.id, 'expected_answer_review', p.expected_digest);
    await this.validateCurrentSources(await this.sourceIds(p.id), p.flow_id);
    const candidate = parse(p, 'candidate_manifest'),
      bundle = await this.one('SELECT payload FROM bundles WHERE hash=?', candidate.bundleHash);
    return {
      proposalId: p.id,
      flow: await this.flow(p.flow_id),
      candidateDigest: p.candidate_digest,
      expectedDigest: p.expected_digest,
      candidateManifest: candidate,
      expectedManifest: parse(p, 'expected_manifest'),
      expectedApprovalId: approval.id,
      expectedApprovedAt: approval.created_at,
      bundle: parse(bundle, 'payload'),
    };
  }
  async releaseInput(actor: Actor, proposalId: string) {
    requireScope(actor, 'release:prepare');
    const p = await this.one('SELECT * FROM proposals WHERE id=?', proposalId);
    if (!p?.candidate_digest || !p.expected_digest)
      throw new HttpError(409, 'CANDIDATE_REQUIRED', 'Reviewed candidate required.');
    await this.currentCandidate(p);
    const expected = await this.requireApproval(p.id, 'expected_answer_review', p.expected_digest);
    await this.requireApproval(p.id, 'merge_review', p.merge_digest);
    await this.validateCurrentSources(await this.sourceIds(p.id), p.flow_id);
    const run = await this.mergeRun(p);
    return {
      proposalId: p.id,
      candidateManifest: parse(p, 'candidate_manifest'),
      testRunId: run.id,
      testResult: parse(run, 'result_json'),
      flow: await this.flow(p.flow_id),
    };
  }
  async releaseAuthorization(actor: Actor, releaseId: string) {
    if (
      actor.kind !== 'service' ||
      !actor.scopes.some((scope) => ['release:prepare', 'release:promote'].includes(scope))
    )
      throw new HttpError(403, 'SCOPE_REJECTED', 'Publisher credential required.');
    const r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Release not found.');
    const m = parse(r, 'manifest'),
      p = await this.one('SELECT * FROM proposals WHERE id=?', r.proposal_id);
    if (
      !p ||
      p.digest !== m.proposalDigest ||
      p.candidate_digest !== m.candidateDigest ||
      p.expected_digest !== m.expectedDigest ||
      p.merge_digest !== m.mergeDigest
    )
      throw new HttpError(409, 'STALE_RELEASE', 'Release artifacts changed.');
    await this.currentCandidate(p);
    const expected = await this.requireApproval(p.id, 'expected_answer_review', p.expected_digest);
    const merge = await this.requireApproval(p.id, 'merge_review', p.merge_digest);
    if (merge.id !== m.mergeApprovalId)
      throw new HttpError(
        409,
        'MERGE_APPROVAL_CHANGED',
        'Release belongs to a different merge approval.',
      );
    await this.requireApproval(r.id, 'deployment_review', r.digest);
    await this.validateCurrentSources(m.sourceVersionIds, r.flow_id);
    const run = await this.mergeRun(p, m.testRunId);
    return {
      id: r.id,
      digest: r.digest,
      state: r.state,
      manifest: m,
      flow: await this.flow(r.flow_id),
      testResult: parse(run, 'result_json'),
    };
  }
  async releaseRecovery(actor: Actor, releaseId: string) {
    requireScope(actor, 'release:promote');
    const r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Release not found.');
    await this.requireApproval(r.id, 'deployment_review', r.digest);
    return {
      id: r.id,
      digest: r.digest,
      state: r.state,
      manifest: parse(r, 'manifest'),
      flow: await this.flow(r.flow_id),
    };
  }
  async suspendForRelease(actor: Actor, releaseId: string) {
    requireScope(actor, 'release:promote');
    const authorized = await this.releaseAuthorization(actor, releaseId),
      m = authorized.manifest;
    if (!['deploy_authorized', 'deploying'].includes(authorized.state))
      throw new HttpError(409, 'RELEASE_STATE', 'Release is not authorized for deployment.');
    const runtime = await this.one('SELECT * FROM platform_runtime WHERE singleton=1');
    if (
      !runtime ||
      (runtime.pending_release_id && runtime.pending_release_id !== releaseId) ||
      ![m.previousRuntimeDigest, m.runtimeDigest].includes(runtime.current_digest)
    )
      throw new HttpError(
        409,
        'RUNTIME_CONFLICT',
        'Another platform release requires reconciliation.',
      );
    const time = this.now().toISOString(),
      guard = crypto.randomUUID();
    await this.batch([
      this.stmt(
        'INSERT INTO atomic_guards(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM platform_runtime WHERE singleton=1 AND current_digest IS ? AND (pending_release_id IS NULL OR pending_release_id=?)) AND EXISTS(SELECT 1 FROM flows WHERE id=? AND status_epoch=? AND release_id IS ?) THEN 1 ELSE 0 END',
        guard,
        runtime.current_digest,
        releaseId,
        authorized.flow!.id,
        m.expectedStatusEpoch,
        m.previousReleaseId,
      ),
      this.stmt(
        'UPDATE platform_runtime SET pending_release_id=?,pending_runtime_digest=?,updated_at=? WHERE singleton=1',
        releaseId,
        m.runtimeDigest,
        time,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id<>? AND status='active' AND EXISTS(SELECT 1 FROM platform_runtime WHERE singleton=1 AND current_digest IS NOT pending_runtime_digest)",
        time,
        authorized.flow!.id,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',updated_at=? WHERE id=?",
        time,
        authorized.flow!.id,
      ),
      this.stmt("UPDATE releases SET state='deploying' WHERE id=?", releaseId),
      this.audit(actor, 'release.suspended_for_deployment', releaseId, {
        digest: authorized.digest,
        runtimeChanged: runtime.current_digest !== m.runtimeDigest,
      }),
      this.stmt('DELETE FROM atomic_guards WHERE id=?', guard),
    ]);
    return {
      id: releaseId,
      state: 'deploying',
      guidance: 'under_review',
      runtimeChanged: runtime.current_digest !== m.runtimeDigest,
    };
  }
  async suspendForRecovery(actor: Actor, releaseId: string) {
    const r = await this.releaseRecovery(actor, releaseId),
      m = r.manifest,
      runtime = await this.one('SELECT * FROM platform_runtime WHERE singleton=1');
    if (
      !runtime ||
      (runtime.pending_release_id && runtime.pending_release_id !== releaseId) ||
      ![m.runtimeDigest, m.previousRuntimeDigest].includes(runtime.current_digest)
    )
      throw new HttpError(409, 'RUNTIME_CONFLICT', 'Another runtime owns the platform.');
    const time = this.now().toISOString();
    await this.batch([
      this.stmt(
        'UPDATE platform_runtime SET pending_release_id=?,pending_runtime_digest=?,updated_at=? WHERE singleton=1 AND current_digest IS ? AND pending_release_id IS ?',
        releaseId,
        m.previousRuntimeDigest,
        time,
        runtime.current_digest,
        runtime.pending_release_id,
      ),
      this.guardLastChange(),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active'",
        time,
      ),
      this.audit(actor, 'runtime.suspended_for_recovery', releaseId, {
        runtimeDigest: m.previousRuntimeDigest,
      }),
    ]);
    return { guidance: 'under_review' };
  }
  async recoverRuntime(actor: Actor, releaseId: string, b: Row) {
    requireScope(actor, 'test:write');
    const r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r || b.digest !== r.digest)
      throw new HttpError(409, 'STALE_RELEASE', 'Exact recovery release required.');
    await this.requireApproval(r.id, 'deployment_review', r.digest);
    const m = parse(r, 'manifest');
    if (b.restoredRuntimeDigest !== m.previousRuntimeDigest)
      throw new HttpError(
        409,
        'RECOVERY_RUNTIME',
        'Recovery must restore the reviewed previous runtime.',
      );
    const proof = hash(b.artifactHash),
      time = this.now().toISOString(),
      runtime = await this.one('SELECT * FROM platform_runtime WHERE singleton=1');
    if (
      !runtime ||
      (runtime.pending_release_id && runtime.pending_release_id !== releaseId) ||
      ![m.runtimeDigest, m.previousRuntimeDigest].includes(runtime.current_digest)
    )
      throw new HttpError(409, 'RUNTIME_CONFLICT', 'A different release now owns the platform.');
    await this.batch([
      this.stmt(
        'UPDATE platform_runtime SET current_digest=?,pending_release_id=NULL,pending_runtime_digest=NULL,updated_at=? WHERE singleton=1 AND current_digest IS ? AND pending_release_id IS ?',
        m.previousRuntimeDigest,
        time,
        runtime.current_digest,
        runtime.pending_release_id,
      ),
      this.guardLastChange(),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active'",
        time,
      ),
      this.audit(actor, 'runtime.recovered_suspended', releaseId, {
        proof,
        runtimeDigest: m.previousRuntimeDigest,
      }),
    ]);
    return { guidance: 'under_review' };
  }
  async abandonRuntime(actor: Actor, releaseId: string, b: Row) {
    requireHuman(actor);
    const reason = text(b.reason, 'reason'),
      r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r || b.digest !== r.digest)
      throw new HttpError(409, 'STALE_RELEASE', 'Exact failed release digest required.');
    const result = await this.batch([
      this.stmt(
        'UPDATE platform_runtime SET current_digest=NULL,pending_release_id=NULL,pending_runtime_digest=NULL,updated_at=? WHERE singleton=1 AND pending_release_id=?',
        this.now().toISOString(),
        releaseId,
      ),
      this.guardLastChange(),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status<>'retired'",
        this.now().toISOString(),
      ),
      this.audit(actor, 'runtime.abandoned_disabled', releaseId, { reason, digest: r.digest }),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(409, 'RUNTIME_CONFLICT', 'This release does not hold the runtime lease.');
    return { guidance: 'under_review', requiresNewReviewedRelease: true };
  }
  async promote(actor: Actor, releaseId: string) {
    requireScope(actor, 'release:promote');
    const r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r) throw new HttpError(404, 'NOT_FOUND', 'Release not found.');
    const m = parse(r, 'manifest');
    await this.requireApproval(releaseId, 'deployment_review', r.digest);
    const p = await this.one('SELECT * FROM proposals WHERE id=?', r.proposal_id);
    if (
      !p ||
      p.digest !== m.proposalDigest ||
      p.candidate_digest !== m.candidateDigest ||
      p.expected_digest !== m.expectedDigest ||
      p.merge_digest !== m.mergeDigest
    )
      throw new HttpError(409, 'STALE_RELEASE', 'The proposal has changed since release review.');
    await this.mergeRun(p, m.testRunId);
    await this.validateCurrentSources(m.sourceVersionIds, r.flow_id);
    const bundle = await this.one('SELECT usage FROM bundles WHERE hash=?', r.bundle_hash);
    if (
      !bundle ||
      (this.env.ENVIRONMENT === 'production' && bundle.usage !== 'production_candidate')
    )
      throw new HttpError(409, 'FIXTURE_REJECTED', 'This bundle cannot be published.');
    const time = this.now().toISOString(),
      cutoff = new Date(this.now().getTime() - 72 * 3600000).toISOString();
    const approvalCondition = (entity: string, gate: string, digestExpression: string) =>
      `EXISTS(SELECT 1 FROM approvals a WHERE a.sequence=(SELECT MAX(a2.sequence) FROM approvals a2 WHERE a2.entity_id=${entity} AND a2.gate='${gate}' AND a2.digest=${digestExpression}) AND a.decision='approve')`;
    const results = await this.batch([
      this.stmt(
        `UPDATE flows SET bundle_hash=?,release_id=?,status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=? AND status_epoch=? AND release_id IS ? AND EXISTS(SELECT 1 FROM releases r JOIN proposals p ON p.id=r.proposal_id JOIN test_runs t ON t.id=json_extract(r.manifest,'$.testRunId') WHERE r.id=? AND r.state IN('deploy_authorized','deploying') AND r.environment=? AND EXISTS(SELECT 1 FROM platform_runtime pr WHERE pr.singleton=1 AND pr.pending_release_id=r.id AND pr.pending_runtime_digest=json_extract(r.manifest,'$.runtimeDigest') AND (pr.current_digest IS json_extract(r.manifest,'$.previousRuntimeDigest') OR pr.current_digest=json_extract(r.manifest,'$.runtimeDigest'))) AND json_extract(p.candidate_manifest,'$.interpretationApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='interpretation_review' AND a.digest=p.digest ORDER BY a.sequence DESC LIMIT 1) AND json_extract(r.manifest,'$.mergeApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='merge_review' AND a.digest=p.merge_digest ORDER BY a.sequence DESC LIMIT 1) AND p.digest=json_extract(r.manifest,'$.proposalDigest') AND p.merge_digest=json_extract(r.manifest,'$.mergeDigest') AND p.candidate_digest=json_extract(r.manifest,'$.candidateDigest') AND p.expected_digest=json_extract(r.manifest,'$.expectedDigest') AND json_extract(p.candidate_manifest,'$.interpretationApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='interpretation_review' AND a.digest=p.digest ORDER BY a.sequence DESC LIMIT 1) AND json_extract(r.manifest,'$.mergeApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='merge_review' AND a.digest=p.merge_digest ORDER BY a.sequence DESC LIMIT 1) AND t.passed=1 AND t.proposal_id=p.id AND t.artifact_hash=json_extract(r.manifest,'$.testArtifactHash') AND json_extract(t.result_json,'$.mergeDigest')=p.merge_digest AND t.expected_digest=p.expected_digest AND t.candidate_digest=p.candidate_digest AND json_extract(t.result_json,'$.expectedApprovalId')=(SELECT id FROM approvals WHERE entity_id=p.id AND gate='expected_answer_review' AND digest=p.expected_digest ORDER BY sequence DESC LIMIT 1) AND ${approvalCondition('r.id', 'deployment_review', 'r.digest')} AND ${approvalCondition('p.id', 'interpretation_review', 'p.digest')} AND ${approvalCondition('p.id', 'expected_answer_review', 'p.expected_digest')} AND ${approvalCondition('p.id', 'merge_review', 'p.merge_digest')} AND NOT EXISTS(SELECT 1 FROM proposal_sources ps JOIN source_versions sv ON sv.id=ps.source_version_id JOIN source_registry s ON s.id=sv.source_id WHERE ps.proposal_id=p.id AND (sv.valid<>1 OR s.enabled<>1 OR s.latest_version_id<>sv.id OR s.last_successful_check_at IS NULL OR s.last_successful_check_at<=? OR s.last_successful_check_at>?)))`,
        r.bundle_hash,
        r.id,
        time,
        r.flow_id,
        r.expected_status_epoch,
        r.previous_release_id,
        r.id,
        this.env.ENVIRONMENT,
        cutoff,
        time,
      ),
      this.guardLastChange(),
      this.stmt(
        "UPDATE releases SET state='verifying',promoted_at=? WHERE id=? AND state IN('deploy_authorized','deploying') AND EXISTS(SELECT 1 FROM flows WHERE id=? AND release_id=? AND status_epoch=?)",
        time,
        r.id,
        r.flow_id,
        r.id,
        r.expected_status_epoch + 1,
      ),
      this.stmt(
        "UPDATE platform_runtime SET current_digest=?,updated_at=? WHERE singleton=1 AND pending_release_id=? AND EXISTS(SELECT 1 FROM releases WHERE id=? AND state='verifying')",
        m.runtimeDigest,
        time,
        r.id,
        r.id,
      ),
      this.stmt(
        "INSERT INTO audit_events(id,actor_type,actor_id,operation,entity_id,details,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM releases WHERE id=? AND state='verifying')",
        crypto.randomUUID(),
        actor.kind,
        actor.id,
        'release.promoted',
        r.id,
        json({ digest: r.digest }),
        time,
        r.id,
      ),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(
        409,
        'PROMOTION_CONFLICT',
        'Approval, source validity, or the previous release changed. Nothing was promoted.',
      );
    return { id: r.id, state: 'verifying', guidance: 'under_review' };
  }
  async verifyRelease(actor: Actor, releaseId: string, b: Row) {
    requireScope(actor, 'test:write');
    const r = await this.one('SELECT * FROM releases WHERE id=?', releaseId);
    if (!r || r.state !== 'verifying')
      throw new HttpError(409, 'RELEASE_STATE', 'Release is not awaiting verification.');
    if (
      hash(b.digest) !== r.digest ||
      typeof b.passed !== 'boolean' ||
      !Array.isArray(b.checks) ||
      !b.checks.length ||
      b.checks.some((c: any) => typeof c.name !== 'string' || typeof c.passed !== 'boolean') ||
      b.passed !== b.checks.every((c: any) => c.passed)
    )
      throw new HttpError(
        400,
        'VERIFICATION_INVALID',
        'Exact release digest and consistent smoke results are required.',
      );
    await this.batch([
      this.stmt(
        "UPDATE releases SET state=? WHERE id=? AND state='verifying'",
        b.passed ? 'verified' : 'failed',
        releaseId,
      ),
      this.guardLastChange(),
      ...(b.passed
        ? [
            this.stmt(
              'UPDATE platform_runtime SET pending_release_id=NULL,pending_runtime_digest=NULL,updated_at=? WHERE singleton=1 AND pending_release_id=? AND current_digest=?',
              this.now().toISOString(),
              releaseId,
              parse(r, 'manifest').runtimeDigest,
            ),
          ]
        : []),
      this.notice(b.passed ? 'release_verified' : 'release_failed', releaseId, r.digest, {
        releaseId,
        passed: b.passed,
        guidance: 'under_review',
      }),
      this.audit(actor, 'release.verified', releaseId, {
        passed: b.passed,
        checks: b.checks,
        artifactHash: hash(b.artifactHash),
      }),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE id=? AND release_id=?",
        this.now().toISOString(),
        r.flow_id,
        releaseId,
      ),
    ]);
    return { id: releaseId, state: b.passed ? 'verified' : 'failed', guidance: 'under_review' };
  }
  async setStatus(actor: Actor, flowId: string, b: Row) {
    const status = text(b.status, 'status', 20),
      reason = text(b.reason, 'reason', 4000);
    if (!['active', 'under_review', 'retired'].includes(status))
      throw new HttpError(400, 'INVALID_INPUT', 'Invalid flow status.');
    if (actor.kind === 'service') {
      requireScope(actor, 'flow:suspend');
      if (status !== 'under_review')
        throw new HttpError(403, 'HUMAN_REQUIRED', 'Services may suspend guidance only.');
    } else requireHuman(actor);
    const f = await this.one('SELECT * FROM flows WHERE id=?', flowId);
    if (!f) throw new HttpError(404, 'NOT_FOUND', 'Flow not found.');
    let eligibility = '',
      params: unknown[] = [];
    if (status === 'active') {
      if (
        b.releaseId !== f.release_id ||
        b.bundleHash !== f.bundle_hash ||
        b.statusEpoch !== f.status_epoch
      )
        throw new HttpError(
          409,
          'STALE_ACTIVATION',
          'Reload the exact release and bundle before activating.',
        );
      const r = await this.one(
        "SELECT * FROM releases WHERE id=? AND state IN('verified','active')",
        f.release_id,
      );
      if (!r)
        throw new HttpError(
          409,
          'VERIFIED_RELEASE_REQUIRED',
          'A reviewed, deployed and verified release is required.',
        );
      const manifest = parse(r, 'manifest'),
        runtime = await this.one('SELECT * FROM platform_runtime WHERE singleton=1');
      if (
        !runtime ||
        runtime.pending_release_id ||
        runtime.current_digest !== manifest.runtimeDigest
      )
        throw new HttpError(
          409,
          'RUNTIME_CONFLICT',
          'This flow was not tested against the current shared runtime.',
        );
      await this.requireApproval(r.id, 'deployment_review', r.digest);
      await this.requireApproval(r.proposal_id, 'interpretation_review', manifest.proposalDigest);
      await this.requireApproval(r.proposal_id, 'expected_answer_review', manifest.expectedDigest);
      await this.requireApproval(r.proposal_id, 'merge_review', manifest.mergeDigest);
      const proposal = await this.one('SELECT * FROM proposals WHERE id=?', r.proposal_id);
      if (!proposal) throw new HttpError(409, 'STALE_RELEASE', 'The reviewed proposal is missing.');
      await this.mergeRun(proposal, manifest.testRunId);
      await this.validateCurrentSources(manifest.sourceVersionIds, flowId);
      const approval = (entity: string, gate: string, d: string) =>
        `EXISTS(SELECT 1 FROM approvals a WHERE a.sequence=(SELECT MAX(a2.sequence) FROM approvals a2 WHERE a2.entity_id=${entity} AND a2.gate='${gate}' AND a2.digest=${d}) AND a.decision='approve')`;
      eligibility = ` AND EXISTS(SELECT 1 FROM releases r JOIN proposals p ON p.id=r.proposal_id WHERE r.id=flows.release_id AND r.state IN('verified','active') AND EXISTS(SELECT 1 FROM platform_runtime pr WHERE pr.singleton=1 AND pr.pending_release_id IS NULL AND pr.current_digest=json_extract(r.manifest,'$.runtimeDigest')) AND EXISTS(SELECT 1 FROM test_runs t WHERE t.id=json_extract(r.manifest,'$.testRunId') AND t.passed=1 AND t.proposal_id=p.id AND t.artifact_hash=json_extract(r.manifest,'$.testArtifactHash') AND json_extract(t.result_json,'$.mergeDigest')=p.merge_digest AND t.candidate_digest=p.candidate_digest AND t.expected_digest=p.expected_digest AND json_extract(t.result_json,'$.expectedApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='expected_answer_review' AND a.digest=p.expected_digest ORDER BY a.sequence DESC LIMIT 1)) AND json_extract(p.candidate_manifest,'$.interpretationApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='interpretation_review' AND a.digest=p.digest ORDER BY a.sequence DESC LIMIT 1) AND json_extract(r.manifest,'$.mergeApprovalId')=(SELECT id FROM approvals a WHERE a.entity_id=p.id AND a.gate='merge_review' AND a.digest=p.merge_digest ORDER BY a.sequence DESC LIMIT 1) AND p.digest=json_extract(r.manifest,'$.proposalDigest') AND p.merge_digest=json_extract(r.manifest,'$.mergeDigest') AND p.candidate_digest=json_extract(r.manifest,'$.candidateDigest') AND p.expected_digest=json_extract(r.manifest,'$.expectedDigest') AND ${approval('r.id', 'deployment_review', 'r.digest')} AND ${approval('p.id', 'interpretation_review', 'p.digest')} AND ${approval('p.id', 'expected_answer_review', 'p.expected_digest')} AND ${approval('p.id', 'merge_review', 'p.merge_digest')} AND NOT EXISTS(SELECT 1 FROM proposal_sources ps JOIN source_versions sv ON sv.id=ps.source_version_id JOIN source_registry sr ON sr.id=sv.source_id WHERE ps.proposal_id=p.id AND (sv.valid<>1 OR sr.enabled<>1 OR sr.latest_version_id<>sv.id OR sr.last_successful_check_at IS NULL OR sr.last_successful_check_at<=? OR sr.last_successful_check_at>?)))`;
      params = [
        new Date(this.now().getTime() - 72 * 3600000).toISOString(),
        this.now().toISOString(),
      ];
    }
    const time = this.now().toISOString(),
      results = await this.batch([
        this.stmt(
          `UPDATE flows SET status=?,status_epoch=status_epoch+1,updated_at=? WHERE id=? AND status_epoch=?${eligibility}`,
          status,
          time,
          flowId,
          f.status_epoch,
          ...params,
        ),
        this.guardLastChange(),
        ...(status === 'active'
          ? [
              this.stmt(
                "UPDATE releases SET state='active' WHERE id=? AND EXISTS(SELECT 1 FROM flows WHERE id=? AND status='active' AND status_epoch=?)",
                f.release_id,
                flowId,
                f.status_epoch + 1,
              ),
            ]
          : []),
        this.audit(actor, 'flow.status_changed', flowId, {
          status,
          reason,
          previousEpoch: f.status_epoch,
        }),
      ]);
    if (!results[0].meta.changes)
      throw new HttpError(
        409,
        'STATUS_CONFLICT',
        'Flow status or authorization changed. Review again.',
      );
    return this.flow(flowId);
  }
  async claimJob(actor: Actor, b: Row): Promise<{ job: Row | null }> {
    requireScope(actor, 'job:claim');
    const time = this.now().toISOString(),
      until = new Date(this.now().getTime() + 2400000).toISOString();
    const job = await this.one(
      "UPDATE jobs SET state='leased',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=(SELECT id FROM jobs WHERE ((state='queued' AND not_before<=?) OR (state='leased' AND lease_until<?)) AND attempts<3 AND NOT EXISTS(SELECT 1 FROM jobs active WHERE active.state='leased' AND active.lease_until>=?) ORDER BY created_at LIMIT 1) RETURNING *",
      actor.id,
      until,
      time,
      time,
      time,
      time,
    );
    if (!job) return { job: null };
    const payload = parse(job, 'payload');
    if (payload?.flowId) {
      const sources = await this.all(
        'SELECT s.id AS sourceId,v.id AS sourceVersionId,v.snapshot_sha256 AS snapshotSha256,v.normalized_sha256 AS normalizedSha256,v.normalized_text AS normalizedText,s.last_successful_check_at AS lastSuccessfulCheckAt,s.url,s.title FROM source_registry s JOIN source_versions v ON v.id=s.latest_version_id WHERE s.flow_id=? AND s.enabled=1 AND v.valid=1 ORDER BY s.id',
        payload.flowId,
      );
      const count = await this.one(
        'SELECT COUNT(*) AS count FROM source_registry WHERE flow_id=? AND enabled=1',
        payload.flowId,
      );
      if (
        !sources.length ||
        sources.length !== count?.count ||
        sources.some(
          (source) =>
            !source.lastSuccessfulCheckAt ||
            Date.parse(source.lastSuccessfulCheckAt) > this.now().getTime() ||
            this.now().getTime() - Date.parse(source.lastSuccessfulCheckAt) >= 72 * 3600000,
        )
      ) {
        await this.stmt(
          "UPDATE jobs SET state='queued',attempts=MAX(0,attempts-1),not_before=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_owner=?",
          new Date(this.now().getTime() + 3600000).toISOString(),
          time,
          job.id,
          actor.id,
        ).run();
        return { job: null };
      }
      payload.sourceVersionIds = sources.map((v) => v.sourceVersionId);
      payload.sources = sources;
      payload.sourceVersionId =
        sources.find((v) => v.sourceId === payload.sourceId)?.sourceVersionId ||
        payload.sourceVersionId;
      const revision = await digest([...payload.sourceVersionIds].sort()),
        active = await this.one(
          'SELECT proposal_id FROM active_proposals WHERE flow_id=? AND revision_hash=?',
          payload.flowId,
          revision,
        );
      if (active && job.kind === 'source_change') {
        await this.stmt(
          "UPDATE jobs SET state='complete',lease_owner=NULL,lease_until=NULL,result=?,updated_at=? WHERE id=? AND lease_owner=?",
          json({ proposalId: active.proposal_id, alreadyProposed: true }),
          time,
          job.id,
          actor.id,
        ).run();
        return { job: null };
      }
    }
    if (payload?.proposalId) {
      const p = await this.one('SELECT * FROM proposals WHERE id=?', payload.proposalId),
        wanted =
          job.kind === 'implement_guidance'
            ? p?.digest
            : job.kind === 'draft_expectations'
              ? p?.candidate_digest
              : p?.expected_digest,
        offered = payload.interpretationDigest || payload.expectedDigest || payload.candidateDigest;
      const interpretation = p
          ? await this.approved(p.id, 'interpretation_review', p.digest)
          : null,
        expectedApproval = p?.expected_digest
          ? await this.approved(p.id, 'expected_answer_review', p.expected_digest)
          : null;
      const stale =
        !p ||
        wanted !== offered ||
        !interpretation ||
        JSON.stringify((await this.sourceIds(p.id)).sort()) !==
          JSON.stringify([...payload.sourceVersionIds].sort()) ||
        (job.kind === 'implement_guidance' &&
          (payload.interpretationApprovalId !== interpretation.id ||
            parse(p, 'candidate_manifest')?.interpretationApprovalId === interpretation.id)) ||
        (job.kind === 'draft_expectations' &&
          p.expected_digest &&
          p.state !== 'expectations_preparation') ||
        (job.kind === 'authorized_tests' && expectedApproval?.id !== payload.expectedApprovalId);
      if (stale) {
        await this.stmt(
          "UPDATE jobs SET state='complete',lease_owner=NULL,lease_until=NULL,result=?,updated_at=? WHERE id=? AND lease_owner=?",
          json({ skipped: 'superseded_artifact' }),
          time,
          job.id,
          actor.id,
        ).run();
        return { job: null };
      }
      payload.proposal = {
        id: p.id,
        interpretation: p.interpretation,
        interpretationDigest: p.digest,
        candidateDigest: p.candidate_digest,
        expectedDigest: p.expected_digest,
        candidateManifest: parse(p, 'candidate_manifest'),
        expectedManifest: parse(p, 'expected_manifest'),
      };
      if (p.candidate_manifest) {
        const candidate = parse(p, 'candidate_manifest'),
          bundle = await this.one('SELECT payload FROM bundles WHERE hash=?', candidate.bundleHash);
        payload.bundle = parse(bundle, 'payload');
      }
    }
    return { job: { ...job, payload } };
  }
  async finishJob(actor: Actor, jobId: string, b: Row) {
    requireScope(actor, 'job:claim');
    if (!['complete', 'failed', 'waiting_quota'].includes(b.state))
      throw new HttpError(400, 'JOB_STATE', 'Invalid job completion state.');
    const resume =
      b.state === 'waiting_quota' ? text(b.notBefore, 'quota reset', 40) : this.now().toISOString();
    if (
      !Number.isFinite(Date.parse(resume)) ||
      (b.state === 'waiting_quota' && Date.parse(resume) <= this.now().getTime())
    )
      throw new HttpError(400, 'JOB_TIME', 'A valid resumption time is required.');
    const result = await this.stmt(
      "UPDATE jobs SET state=?,result=?,not_before=?,attempts=CASE WHEN ?='waiting_quota' THEN MAX(0,attempts-1) ELSE attempts END,lease_until=NULL,updated_at=? WHERE id=? AND state='leased' AND lease_owner=? AND lease_until>?",
      b.state,
      json(b.result || {}),
      resume,
      b.state,
      this.now().toISOString(),
      jobId,
      actor.id,
      this.now().toISOString(),
    ).run();
    if (!result.meta.changes) {
      const prior = await this.one(
        'SELECT state,result,lease_owner,not_before FROM jobs WHERE id=?',
        jobId,
      );
      if (
        prior &&
        prior.state === b.state &&
        prior.lease_owner === actor.id &&
        (await digest(parse(prior, 'result', {}))) === (await digest(b.result || {}))
      )
        return { id: jobId, state: prior.state, notBefore: prior.not_before, idempotent: true };
      throw new HttpError(
        409,
        'LEASE_CONFLICT',
        'The job lease expired or belongs to another worker.',
      );
    }
    return { id: jobId, state: b.state };
  }
  async maintenance() {
    const now = this.now().toISOString(),
      warning = new Date(this.now().getTime() - 24 * 3600000).toISOString(),
      cutoff = new Date(this.now().getTime() - 72 * 3600000).toISOString();
    const stale = await this.all(
      'SELECT id,last_successful_check_at,status FROM flows WHERE last_successful_check_at IS NULL OR last_successful_check_at<=?',
      warning,
    );
    const system: Actor = { kind: 'service', id: 'scheduled-policy', scopes: [] };
    await this.batch([
      this.stmt(
        "UPDATE jobs SET state='queued',updated_at=? WHERE state='waiting_quota' AND not_before<=?",
        now,
        now,
      ),
      this.stmt(
        "UPDATE jobs SET state='failed',lease_owner=NULL,lease_until=NULL,updated_at=? WHERE state='leased' AND lease_until<? AND attempts>=3",
        now,
        now,
      ),
      this.stmt(
        "UPDATE flows SET status='under_review',status_epoch=status_epoch+1,updated_at=? WHERE status='active' AND (last_successful_check_at IS NULL OR last_successful_check_at<=? OR last_successful_check_at>?)",
        now,
        cutoff,
        now,
      ),
      ...stale.flatMap((f) => [
        this.stmt(
          'INSERT OR IGNORE INTO notification_outbox(id,dedupe_key,kind,payload,created_at) VALUES(?,?,?,?,?)',
          crypto.randomUUID(),
          `freshness:${f.id}:${f.last_successful_check_at || 'never'}`,
          f.last_successful_check_at && f.last_successful_check_at > cutoff
            ? 'source_check_overdue'
            : 'guidance_stale',
          json({ flowId: f.id, lastSuccessfulCheckAt: f.last_successful_check_at }),
          now,
        ),
        ...(f.status === 'active' &&
        (!f.last_successful_check_at || f.last_successful_check_at <= cutoff)
          ? [
              this.audit(system, 'flow.freshness_suspended', f.id, {
                lastSuccessfulCheckAt: f.last_successful_check_at,
              }),
            ]
          : []),
      ]),
    ]);
    return { checkedAt: now };
  }
}
