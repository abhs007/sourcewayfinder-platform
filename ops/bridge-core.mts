import { DatabaseSync } from 'node:sqlite';
import { parseStrictJSON } from '../packages/core/index.ts';
export type Job = {
  id: string;
  kind: 'source_change' | 'implement_guidance' | 'draft_expectations' | 'authorized_tests';
  payload: any;
};
export const phases = {
  source_change: { agent: 'source', fence: 'proposal', fresh: false },
  implement_guidance: { agent: 'backend', fence: 'candidate', fresh: false },
  draft_expectations: { agent: 'qa', fence: 'expectations', fresh: true },
  authorized_tests: { agent: null, fence: null, fresh: true },
} as const;
export function phaseFor(job: Job) {
  const phase = phases[job.kind];
  if (!phase) throw Error('UNSUPPORTED_JOB_KIND');
  return phase;
}
export function disabledRuntime(runtime: any = {}) {
  return {
    ...runtime,
    heartbeat: {
      ...runtime.heartbeat,
      enabled: false,
      intervalSec: 0,
      wakeOnAssignment: false,
      wakeOnDemand: false,
      maxConcurrentRuns: 1,
    },
  };
}
// A supplied idempotency key is not a general uniqueness guarantee in pinned Paperclip.
// Never repeat an ambiguous invoke. Reconcile its durable issue and start marker instead.
export function reconcileDispatch(
  runs: any[],
  work: { issue_id: string; agent_id: string; dispatch_at: string },
) {
  const start = Date.parse(work.dispatch_at);
  if (!Number.isFinite(start)) throw Error('DISPATCH_TIME_REQUIRED');
  const matches = runs.filter(
    (r) =>
      r.agentId === work.agent_id &&
      (r.issueId ?? r.contextSnapshot?.issueId) === work.issue_id &&
      Date.parse(r.createdAt ?? r.startedAt) >= start - 2000,
  );
  if (matches.length > 1) throw Error('AMBIGUOUS_DISPATCH_REQUIRES_OWNER');
  return matches[0] ?? null;
}
export function scopedPacket(job: Job) {
  phaseFor(job);
  const p = job.payload;
  if (
    !p ||
    typeof p.flowId !== 'string' ||
    !Array.isArray(p.sourceVersionIds) ||
    !Array.isArray(p.sources)
  )
    throw Error('INVALID_JOB_PACKET');
  // QA receives source evidence and the candidate, never previous expected answers.
  const proposal = p.proposal
    ? {
        id: p.proposal.id,
        interpretation: p.proposal.interpretation,
        interpretationDigest: p.proposal.interpretationDigest,
        candidateDigest: p.proposal.candidateDigest,
        candidateManifest: p.proposal.candidateManifest,
      }
    : undefined;
  return boundedPacket({
    jobId: job.id,
    kind: job.kind,
    flowId: p.flowId,
    sourceVersionIds: p.sourceVersionIds,
    sources: p.sources,
    proposal,
    ...(job.kind === 'draft_expectations' ? { bundle: p.bundle } : {}),
    sourceId: p.sourceId,
    sourceVersionId: p.sourceVersionId,
    previousVersionId: p.previousVersionId,
  });
}
export function outputFromRun(
  comments: any[],
  run: { agentId: string; startedAt: string; id: string },
  fence: string,
) {
  const since = Date.parse(run.startedAt);
  if (!Number.isFinite(since)) throw Error('RUN_START_TIME_REQUIRED');
  const current = comments.filter(
    (x) =>
      x.authorAgentId === run.agentId &&
      Date.parse(x.createdAt) >= since &&
      (!x.runId || x.runId === run.id),
  );
  const packets = current.flatMap((x) =>
    [
      ...String(x.body).matchAll(
        new RegExp('```sourcewayfinder-' + fence + '\\s*\\n([\\s\\S]*?)\\n```', 'g'),
      ),
    ].map((m) => m[1]),
  );
  if (packets.length !== 1) throw Error('Exactly one current-run proposal packet is required');
  if (Buffer.byteLength(packets[0]) > 131072) throw Error('OUTPUT_PACKET_TOO_LARGE');
  const value = parseStrictJSON(packets[0]);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_OUTPUT_PACKET');
  return value as any;
}
export function submission(job: Job, comments: any[], run: any, testCodeHash?: string) {
  const phase = phaseFor(job);
  if (!phase.fence) throw Error('DETERMINISTIC_JOB_HAS_NO_MODEL_OUTPUT');
  const value = outputFromRun(comments, run, phase.fence),
    p = job.payload;
  if (job.kind === 'source_change') {
    if (
      value.flowId !== p.flowId ||
      !Array.isArray(value.sourceVersionIds) ||
      JSON.stringify([...value.sourceVersionIds].sort()) !==
        JSON.stringify([...p.sourceVersionIds].sort()) ||
      typeof value.interpretation !== 'string'
    )
      throw Error('SOURCE_OUTPUT_MISMATCH');
    return {
      path: '/internal/v1/proposals',
      body: {
        id: 'proposal_' + job.id.replace(/[^a-z0-9]/g, '').slice(0, 48),
        flowId: p.flowId,
        sourceVersionIds: p.sourceVersionIds,
        interpretation: value.interpretation,
        uncertainties: value.uncertainties ?? [],
        changes: value.changes ?? [],
      },
    };
  }
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(p.proposalId)) throw Error('INVALID_PROPOSAL_ID');
  if (job.kind === 'implement_guidance') {
    if (
      !value.bundle ||
      value.bundle.flowId !== p.flowId ||
      !/^[a-f0-9]{40}$/.test(value.candidateCommit) ||
      !/^[a-f0-9]{64}$/.test(value.codeHash) ||
      !/^[a-f0-9]{64}$/.test(value.migrationHash)
    )
      throw Error('INVALID_CANDIDATE_OUTPUT');
    return {
      path: `/internal/v1/proposals/${p.proposalId}/candidate`,
      body: {
        bundle: value.bundle,
        candidateCommit: value.candidateCommit,
        codeHash: value.codeHash,
        migrationHash: value.migrationHash,
      },
    };
  }
  if (
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    !testCodeHash ||
    !/^[a-f0-9]{64}$/.test(testCodeHash)
  )
    throw Error('INVALID_EXPECTATIONS_OUTPUT');
  return {
    path: `/internal/v1/proposals/${p.proposalId}/expectations`,
    body: { cases: value.cases, testCodeHash },
  };
}
export function acquireLease(db: DatabaseSync, owner: string, now: number, ttl = 60000) {
  db.prepare(
    'INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until=excluded.until WHERE lease.until<? OR lease.owner=?',
  ).run(owner, now + ttl, now, owner);
  return (db.prepare('SELECT owner FROM lease').get() as { owner: string })?.owner === owner;
}
export function boundedPacket(payload: unknown, limit = 48000) {
  const text = JSON.stringify(payload);
  if (Buffer.byteLength(text) > limit)
    throw Error(
      'SOURCE_PACKET_REQUIRES_SCOPING: exceeds 48KB; prepare relevant passages and a diff, never silently truncate',
    );
  return text;
}
export function proposalFromRun(
  comments: any[],
  run: { agentId: string; startedAt: string; id: string },
) {
  const value = outputFromRun(comments, run, 'proposal');
  if (
    typeof value.id !== 'string' ||
    typeof value.flowId !== 'string' ||
    !Array.isArray(value.sourceVersionIds) ||
    typeof value.interpretation !== 'string'
  )
    throw Error('Invalid proposal packet');
  return value;
}
