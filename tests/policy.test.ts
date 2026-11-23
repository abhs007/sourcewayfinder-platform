import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { ControlService, summarizeFlow } from '../workers/control/service.js';
import { sha256 } from '../packages/core/index.js';
import { normalizeHtml, EXTRACTOR_VERSION } from '../ops/collector.mts';
import {
  csrfToken,
  verifyCsrf,
  authenticateHuman,
  authenticateService,
  type Actor,
  type SecurityEnv,
} from '../workers/control/auth.js';
const human: Actor = { kind: 'human', id: 'owner-test-only', scopes: [] };
const bridge: Actor = {
  kind: 'service',
  id: 'bridge-test-only',
  scopes: ['proposal:write', 'job:claim'],
};
const collector: Actor = { kind: 'service', id: 'collector-test-only', scopes: ['source:write'] };
const ci: Actor = { kind: 'service', id: 'ci-test-only', scopes: ['test:write'] };
const publisher: Actor = {
  kind: 'service',
  id: 'publisher-test-only',
  scopes: ['release:prepare', 'release:promote'],
};
const h = 'a'.repeat(64);
let now = new Date('2026-11-22T12:00:00Z');
let mf: Miniflare, s: ControlService;
async function source(
  version = 'version_one',
  passage = 'Fictional test guidance. This is not real public advice.',
) {
  const hash = await sha256(passage),
    eid = `evidence_${version}`;
  await s.reserveEvidence(collector, {
    id: eid,
    rawSha256: hash,
    bytes: new TextEncoder().encode(passage).length,
    chunks: 1,
  });
  await s.evidenceChunk(collector, eid, 0, { base64: btoa(passage) });
  await s.completeEvidence(collector, eid);
  return s.sourceCheck(collector, {
    sourceId: 'official_test',
    sourceVersionId: version,
    snapshotSha256: hash,
    normalizedSha256: hash,
    normalizedText: passage,
    extractorVersion: 'test-v1',
    evidenceId: eid,
  });
}
async function initialize() {
  await s.createFlow(human, {
    id: 'fictional',
    title: 'Fictional test',
    scope: 'Synthetic test only',
    officialUrl: 'https://example.org/test',
  });
  await s.registerSource(human, {
    id: 'official_test',
    flowId: 'fictional',
    title: 'Fictional source',
    url: 'https://example.org/test',
    approvedOrigin: 'https://example.org',
    approvedPath: '/test',
  });
  await source();
  await s.stmt('DELETE FROM jobs').run();
}
async function approve(proposal: any, gate: string, digest: string, release = false) {
  if (gate === 'merge_review') digest = (await s.proposal(proposal.id)).merge_digest;
  return s.decision(
    human,
    proposal.id,
    {
      gate,
      digest,
      decision: 'approve',
      reason: 'Synthetic test approval, never a real source approval.',
    },
    release,
  );
}
async function candidate() {
  const p = await s.createProposal(bridge, {
    id: 'proposal_one',
    flowId: 'fictional',
    sourceVersionIds: ['version_one'],
    interpretation: 'Synthetic test interpretation',
    uncertainties: [],
  });
  await approve(p, 'interpretation_review', p.interpretationDigest || p.digest);
  const passage = 'Fictional test guidance. This is not real public advice.';
  const bundle = {
    schemaVersion: '1.0',
    usage: 'test_fixture',
    flowId: 'fictional',
    scope: 'Synthetic only',
    entryQuestionId: 'ready',
    questions: [
      {
        id: 'ready',
        prompt: 'Ready?',
        choices: [
          { id: 'yes', label: 'Yes' },
          { id: 'unknown', label: 'Unknown' },
        ],
      },
    ],
    transitions: [
      { questionId: 'ready', choiceId: 'yes', targetType: 'outcome', targetId: 'done' },
      { questionId: 'ready', choiceId: 'unknown', targetType: 'outcome', targetId: 'done' },
    ],
    outcomes: [
      {
        id: 'done',
        title: 'Test result',
        nextStep: 'Read the test source.',
        unresolved: [],
        sourceRefs: ['test_ref'],
      },
    ],
    sources: [
      {
        id: 'test_ref',
        sourceVersionId: 'version_one',
        snapshotSha256: await sha256(passage),
        url: 'https://example.org/test',
        passage,
      },
    ],
  };
  return s.candidate(bridge, p.id, {
    bundle,
    candidateCommit: 'a'.repeat(40),
    migrationHash: h,
    codeHash: h,
  });
}
async function expected() {
  const p = await candidate();
  return s.expectations(bridge, p.id, {
    cases: [{ id: 'yes', expectedOutcome: 'done' }],
    testCodeHash: h,
  });
}
async function release() {
  const p = await expected();
  await approve(p, 'expected_answer_review', p.expected_digest);
  await s.recordTest(ci, {
    id: 'run_one',
    proposalId: p.id,
    expectedDigest: p.expected_digest,
    candidateDigest: p.candidate_digest,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    passed: true,
    checks: [{ name: 'synthetic only', passed: true }],
    environment: 'test',
    artifactHash: h,
    artifactRef: 'local:test',
  });
  await approve(p, 'merge_review', p.candidate_digest);
  const r = await s.createRelease(publisher, {
    id: 'release_one',
    proposalId: p.id,
    testRunId: 'run_one',
    mergedTreeHash: h,
    workerVersions: {
      web: 'test-web',
      api: 'test-api',
      control: 'test-control',
      survey: 'test-survey',
    },
  });
  await approve(r, 'deployment_review', r.digest, true);
  await s.suspendForRelease(publisher, r.id);
  return r;
}
async function secondRelease(changed = false) {
  const flowId = 'second_flow',
    passage = 'Fictional test guidance. This is not real public advice.',
    rawHash = await sha256(passage);
  await s.createFlow(human, {
    id: flowId,
    title: 'Second fictional flow',
    scope: 'Synthetic only',
    officialUrl: 'https://example.org/test',
  });
  await s.registerSource(human, {
    id: 'second_source',
    flowId,
    title: 'Second fictional source',
    url: 'https://example.org/test',
    approvedOrigin: 'https://example.org',
    approvedPath: '/test',
  });
  await s.sourceCheck(collector, {
    sourceId: 'second_source',
    sourceVersionId: 'second_version',
    snapshotSha256: rawHash,
    normalizedSha256: rawHash,
    normalizedText: passage,
    extractorVersion: 'test-v1',
    evidenceId: 'evidence_version_one',
  });
  let p = await s.createProposal(bridge, {
    id: 'second_proposal',
    flowId,
    sourceVersionIds: ['second_version'],
    interpretation: 'Synthetic second interpretation',
  });
  await approve(p, 'interpretation_review', p.digest);
  const first = await s.one('SELECT payload FROM bundles LIMIT 1'),
    bundle = JSON.parse(first!.payload);
  bundle.flowId = flowId;
  bundle.sources[0].sourceVersionId = 'second_version';
  p = await s.candidate(bridge, p.id, {
    bundle,
    candidateCommit: 'a'.repeat(40),
    codeHash: h,
    migrationHash: h,
  });
  p = await s.expectations(bridge, p.id, {
    cases: [{ id: 'synthetic', expectedOutcome: 'done' }],
    testCodeHash: h,
  });
  await approve(p, 'expected_answer_review', p.expected_digest);
  const artifacts = changed
    ? Object.fromEntries(['web', 'api', 'control', 'survey'].map((key) => [key, 'b'.repeat(64)]))
    : null;
  await s.recordTest(ci, {
    id: 'second_run',
    proposalId: p.id,
    expectedDigest: p.expected_digest,
    candidateDigest: p.candidate_digest,
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    passed: true,
    checks: [{ name: 'synthetic', passed: true }],
    environment: 'test',
    artifactHash: h,
    artifactRef: 'local:test',
    workerArtifacts: artifacts,
  });
  await approve(p, 'merge_review', p.candidate_digest);
  const r = await s.createRelease(publisher, {
    id: 'second_release',
    proposalId: p.id,
    testRunId: 'second_run',
    mergedTreeHash: h,
    workerVersions: {
      web: 'test-web',
      api: 'test-api',
      control: 'test-control',
      survey: 'test-survey',
    },
    workerArtifacts: artifacts,
  });
  await approve(r, 'deployment_review', r.digest, true);
  return r;
}
async function migrate(db: any, path: string) {
  let statement = '';
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    if (line.trim().startsWith('--')) continue;
    statement += line + ' ';
    if (line.trim().endsWith(';')) {
      await db.prepare(statement.trim()).run();
      statement = '';
    }
  }
}
beforeEach(async () => {
  now = new Date('2026-11-22T12:00:00Z');
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'policy-test',
          modules: true,
          script: 'export default {fetch(){return new Response("test")}}',
          compatibilityDate: '2026-11-01',
          d1Databases: { CONTROL_DB: 'control', EVIDENCE_DB: 'evidence' },
        },
      ],
    }),
  );
  const control = await mf.getD1Database('CONTROL_DB'),
    evidence = await mf.getD1Database('EVIDENCE_DB');
  await migrate(control, 'workers/control/migrations/0001_control.sql');
  await migrate(control, 'workers/control/migrations/0002_source_observations.sql');
  await migrate(control, 'workers/control/migrations/0003_platform_runtime.sql');
  await migrate(control, 'workers/control/migrations/0004_merge_review_digest.sql');
  await migrate(evidence, 'workers/control/evidence-migrations/0001_evidence.sql');
  s = new ControlService(
    {
      CONTROL_DB: control as unknown as D1Database,
      EVIDENCE_DB: evidence as unknown as D1Database,
      ENVIRONMENT: 'staging',
    },
    () => now,
  );
  await initialize();
});
afterEach(async () => {
  await mf?.dispose();
});
describe('policy gates against actual local D1', () => {
  it('blocks service approval and unauthorized source write', async () => {
    await expect(s.createFlow(bridge, {})).rejects.toMatchObject({ code: 'HUMAN_REQUIRED' });
    await expect(s.sourceCheck(bridge, {})).rejects.toMatchObject({ code: 'SCOPE_REJECTED' });
    await expect(s.decision(bridge, 'any', {})).rejects.toMatchObject({ code: 'HUMAN_REQUIRED' });
  });
  it('requires approved expected answers before CI evidence', async () => {
    const p = await expected();
    await expect(
      s.recordTest(ci, {
        id: 'run',
        proposalId: p.id,
        expectedDigest: p.expected_digest,
        candidateDigest: p.candidate_digest,
      }),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
  it('promotes exactly once, remains suspended for verification, and requires human activation', async () => {
    const r = await release();
    const results = await Promise.allSettled([
      s.promote(publisher, r.id),
      s.promote(publisher, r.id),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await s.flow('fictional'))?.status).toBe('under_review');
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await expect(
      s.setStatus(publisher, 'fictional', {
        ...(await s.flow('fictional')),
        status: 'active',
        reason: 'test',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE_REJECTED' });
    await s.setStatus(human, 'fictional', {
      ...(await s.flow('fictional')),
      status: 'active',
      reason: 'Synthetic activation',
    });
    expect((await s.flow('fictional'))?.status).toBe('active');
  });
  it('rejects release after an expected-answer revision', async () => {
    const r = await release();
    await s.expectations(bridge, 'proposal_one', {
      cases: [{ id: 'changed', expectedOutcome: 'done' }],
      testCodeHash: h,
    });
    await expect(s.promote(publisher, r.id)).rejects.toMatchObject({ code: 'STALE_RELEASE' });
  });
  it('suspends changed sources and deduplicates the maintenance job', async () => {
    await source('version_two', 'Changed fictional instructions.');
    await source('version_two', 'Changed fictional instructions.');
    expect((await s.flow('fictional'))?.status).toBe('under_review');
    expect(await s.all('SELECT * FROM jobs')).toHaveLength(1);
    const claim = await s.claimJob(bridge, {});
    expect(claim.job).toBeTruthy();
    expect((await s.claimJob({ ...bridge, id: 'second' }, {})).job).toBeNull();
  });
  it.each(['link', 'form', 'extractor'] as const)(
    'invalidates prior review when the collector detects a %s change',
    async (change) => {
      const ingest = async (revision: string, changed: boolean) => {
        const passage = 'Fictional test guidance. This is not real public advice. '.repeat(3);
        const raw = `<html><main><p>${passage}</p><a href="/${change === 'link' && changed ? 'new' : 'old'}">Apply</a><form><p>${change === 'form' && changed ? 'Adults and children' : 'Adults only'}</p></form></main></html>`;
        const normalized = normalizeHtml(Buffer.from(raw), ['Fictional test guidance']);
        const rawHash = await sha256(raw),
          evidenceId = `evidence_${revision}`;
        await s.reserveEvidence(collector, {
          id: evidenceId,
          rawSha256: rawHash,
          bytes: Buffer.byteLength(raw),
          chunks: 1,
        });
        await s.evidenceChunk(collector, evidenceId, 0, {
          base64: Buffer.from(raw).toString('base64'),
        });
        await s.completeEvidence(collector, evidenceId);
        return s.sourceCheck(collector, {
          sourceId: 'official_test',
          sourceVersionId: revision,
          snapshotSha256: rawHash,
          normalizedSha256: await sha256(normalized),
          normalizedText: normalized,
          extractorVersion:
            change === 'extractor' && !changed ? 'previous-extractor' : EXTRACTOR_VERSION,
          evidenceId,
        });
      };
      await ingest('collector_before', false);
      const proposal = await s.createProposal(bridge, {
        id: 'collector_proposal',
        flowId: 'fictional',
        sourceVersionIds: ['collector_before'],
        interpretation: 'Fictional interpretation only.',
        uncertainties: [],
      });
      await approve(proposal, 'interpretation_review', proposal.digest);
      const before = await s.flow('fictional');
      await ingest('collector_after', true);
      const after = await s.flow('fictional');
      expect(after?.status).toBe('under_review');
      expect(after?.statusEpoch).toBeGreaterThan(before!.statusEpoch);
      await expect(
        s.validateCurrentSources(['collector_before'], 'fictional'),
      ).rejects.toMatchObject({ status: 409 });
      const proposalView = await s.proposal(proposal.id);
      await expect(
        approve(proposalView, 'interpretation_review', proposal.digest),
      ).rejects.toMatchObject({ status: 409 });
      const jobsBeforeRetry = await s.all('SELECT id FROM jobs');
      await ingest('collector_after_retry', true);
      expect(await s.all('SELECT id FROM jobs')).toHaveLength(jobsBeforeRetry.length);
    },
  );
  it('never accepts incomplete or oversized evidence', async () => {
    await expect(
      s.reserveEvidence(collector, { id: 'large', rawSha256: h, bytes: 1048577, chunks: 9 }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_SIZE' });
    await s.reserveEvidence(collector, { id: 'missing', rawSha256: h, bytes: 1, chunks: 1 });
    await expect(s.completeEvidence(collector, 'missing')).rejects.toMatchObject({
      code: 'EVIDENCE_INCOMPLETE',
    });
  });
  it('rejects fixtures in production and fails closed after 72 hours', async () => {
    s.env.ENVIRONMENT = 'production';
    await expect(candidate()).rejects.toMatchObject({ code: 'FIXTURE_REJECTED' });
    const row = { id: 'x', status: 'active', last_successful_check_at: now.toISOString() };
    expect(summarizeFlow(row, now.getTime() + 72 * 3600000).status).toBe('under_review');
    expect(
      summarizeFlow(
        { ...row, last_successful_check_at: new Date(now.getTime() + 1).toISOString() },
        now.getTime(),
      ).status,
    ).toBe('under_review');
  });
  it('revocation suspends active guidance and cannot be bypassed by activating again', async () => {
    const r = await release();
    await s.promote(publisher, r.id);
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await s.setStatus(human, 'fictional', {
      ...(await s.flow('fictional')),
      status: 'active',
      reason: 'Synthetic activation',
    });
    const p = await s.proposal('proposal_one');
    await s.decision(human, p.id, {
      gate: 'interpretation_review',
      digest: p.interpretationDigest,
      decision: 'reject',
      reason: 'Withdraw this synthetic interpretation.',
    });
    expect((await s.flow('fictional'))?.status).toBe('under_review');
    await expect(
      s.setStatus(human, 'fictional', {
        ...(await s.flow('fictional')),
        status: 'active',
        reason: 'Attempt to reactivate',
      }),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
  it('requires a new test after expected-answer approval is withdrawn and approved again', async () => {
    const r = await release();
    const p = await s.proposal('proposal_one');
    await s.decision(human, p.id, {
      gate: 'expected_answer_review',
      digest: p.expected_digest,
      decision: 'reject',
      reason: 'Withdraw synthetic test approval.',
    });
    await approve(p, 'expected_answer_review', p.expected_digest);
    await expect(s.promote(publisher, r.id)).rejects.toMatchObject({ status: 409 });
    await expect(approve(p, 'merge_review', p.candidate_digest)).rejects.toMatchObject({
      code: 'TEST_REQUIRED',
    });
  });
  it('pauses jobs until their quota reset without consuming repair attempts', async () => {
    await source('version_two', 'Changed fictional instructions.');
    const { job } = await s.claimJob(bridge, {});
    if (!job) throw Error('Expected lease');
    await s.finishJob(bridge, job.id, {
      state: 'waiting_quota',
      notBefore: new Date(now.getTime() + 600000).toISOString(),
    });
    expect((await s.claimJob(bridge, {})).job).toBeNull();
    now = new Date(now.getTime() + 600001);
    await s.maintenance();
    const resumed = (await s.claimJob(bridge, {})).job;
    expect(resumed?.id).toBe(job.id);
    expect(resumed?.attempts).toBe(1);
  });
  it('admits one proposal per flow/source revision, with human revision releasing the slot', async () => {
    const body = {
      flowId: 'fictional',
      sourceVersionIds: ['version_one'],
      interpretation: 'Synthetic interpretation',
      uncertainties: [],
    };
    const p = await s.createProposal(bridge, { ...body, id: 'first_proposal' });
    await expect(
      s.createProposal(bridge, { ...body, id: 'second_proposal' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_EXISTS' });
    await s.decision(human, p.id, {
      gate: 'interpretation_review',
      digest: p.digest,
      decision: 'revise',
      reason: 'Please revise this synthetic interpretation.',
    });
    expect(
      (
        await s.createProposal(bridge, {
          ...body,
          id: 'second_proposal',
          interpretation: 'Revised synthetic interpretation',
        })
      ).id,
    ).toBe('second_proposal');
  });
  it('retains volatile raw observations without invalidating unchanged normalized guidance', async () => {
    const before = await s.flow('fictional'),
      normalized = 'Fictional test guidance. This is not real public advice.',
      raw = '<html>render-token-2 ' + normalized + '</html>',
      rawHash = await sha256(raw);
    await s.reserveEvidence(collector, {
      id: 'volatile_raw',
      rawSha256: rawHash,
      bytes: raw.length,
      chunks: 1,
    });
    await s.evidenceChunk(collector, 'volatile_raw', 0, { base64: btoa(raw) });
    await s.completeEvidence(collector, 'volatile_raw');
    const checked = await s.sourceCheck(collector, {
      sourceId: 'official_test',
      sourceVersionId: 'version_volatile',
      snapshotSha256: rawHash,
      normalizedSha256: await sha256(normalized),
      normalizedText: normalized,
      extractorVersion: 'test-v1',
      evidenceId: 'volatile_raw',
    });
    expect(checked).toMatchObject({
      changed: false,
      sourceVersionId: 'version_one',
      snapshotSha256: await sha256(normalized),
      evidenceId: 'evidence_version_one',
    });
    expect((await s.flow('fictional'))?.statusEpoch).toBe(before?.statusEpoch);
    expect(await s.all('SELECT * FROM source_observations')).toHaveLength(2);
    expect(await s.all('SELECT * FROM jobs')).toHaveLength(0);
  });
  it('suspends missing passages immediately and requires human revalidation after recovery', async () => {
    const r = await release();
    await s.promote(publisher, r.id);
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await s.setStatus(human, 'fictional', {
      ...(await s.flow('fictional')),
      status: 'active',
      reason: 'Synthetic activation',
    });
    await s.sourceCheck(collector, { sourceId: 'official_test', error: 'SOURCE_TIMEOUT' });
    expect((await s.flow('fictional'))?.status).toBe('active');
    await s.sourceCheck(collector, {
      sourceId: 'official_test',
      error: 'EXTRACTION_REQUIRED_PASSAGE_MISSING',
    });
    expect((await s.flow('fictional'))?.status).toBe('under_review');
    await source();
    await expect(
      s.setStatus(human, 'fictional', {
        ...(await s.flow('fictional')),
        status: 'active',
        reason: 'Try before review',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
    await s.revalidateSource(human, 'official_test', {
      sourceVersionId: 'version_one',
      reason: 'Reviewed recovered fictional evidence.',
    });
    expect((await s.flow('fictional'))?.status).toBe('under_review');
  });
  it('requires every registered source and suppresses duplicate maintenance dispatch', async () => {
    await source('version_two', 'Changed fictional instructions.');
    await s.createProposal(bridge, {
      id: 'already_proposed',
      flowId: 'fictional',
      sourceVersionIds: ['version_two'],
      interpretation: 'Synthetic changed interpretation',
    });
    expect((await s.claimJob(bridge, {})).job).toBeNull();
    expect((await s.all('SELECT state FROM jobs'))[0].state).toBe('complete');
    await s.registerSource(human, {
      id: 'second_source',
      flowId: 'fictional',
      url: 'https://example.org/second',
      title: 'Second evidence',
      approvedOrigin: 'https://example.org',
      approvedPath: '/second',
    });
    await expect(
      s.createProposal(bridge, {
        id: 'omitted_source',
        flowId: 'fictional',
        sourceVersionIds: ['version_two'],
        interpretation: 'Omitted source',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_SET_INCOMPLETE' });
  });
  it('suspends before code promotion without invalidating the reviewed status epoch', async () => {
    const r = await release(),
      before = await s.flow('fictional');
    await s.suspendForRelease(publisher, r.id);
    expect((await s.flow('fictional'))?.statusEpoch).toBe(before?.statusEpoch);
    expect((await s.releaseAuthorization(publisher, r.id)).state).toBe('deploying');
    await s.promote(publisher, r.id);
    expect((await s.flow('fictional'))?.statusEpoch).toBe(before!.statusEpoch + 1);
  });
  it('suspends every other active flow before shared runtime changes and rejects its old activation', async () => {
    const r = await release();
    await s.promote(publisher, r.id);
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await s.setStatus(human, 'fictional', {
      ...(await s.flow('fictional')),
      status: 'active',
      reason: 'Synthetic activation',
    });
    const before = await s.flow('fictional'),
      second = await secondRelease(true);
    await s.suspendForRelease(publisher, second.id);
    expect((await s.flow('fictional'))?.status).toBe('under_review');
    expect((await s.flow('fictional'))?.statusEpoch).toBe(before!.statusEpoch + 1);
    await s.promote(publisher, second.id);
    await s.verifyRelease(ci, second.id, {
      digest: second.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await expect(
      s.setStatus(human, 'fictional', {
        ...(await s.flow('fictional')),
        status: 'active',
        reason: 'Old runtime attempt',
      }),
    ).rejects.toMatchObject({ code: 'RUNTIME_CONFLICT' });
  });
  it('keeps other flows active for a data-only release using the exact same shared runtime', async () => {
    const r = await release();
    await s.promote(publisher, r.id);
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await s.setStatus(human, 'fictional', {
      ...(await s.flow('fictional')),
      status: 'active',
      reason: 'Synthetic activation',
    });
    const before = await s.flow('fictional'),
      second = await secondRelease(false);
    expect(second.manifest.runtimeDigest).toBe(r.manifest.runtimeDigest);
    await s.suspendForRelease(publisher, second.id);
    expect((await s.flow('fictional'))?.status).toBe('active');
    await s.promote(publisher, second.id);
    expect((await s.flow('fictional'))?.statusEpoch).toBe(before!.statusEpoch);
    expect((await s.flow('fictional'))?.status).toBe('active');
  });
  it('rejects stale dashboard activation and reapproved expectations without new CI proof', async () => {
    const r = await release();
    await s.promote(publisher, r.id);
    await s.verifyRelease(ci, r.id, {
      digest: r.digest,
      passed: true,
      checks: [{ name: 'smoke', passed: true }],
      artifactHash: h,
    });
    await expect(
      s.setStatus(human, 'fictional', {
        status: 'active',
        reason: 'Missing exact reviewed pointer',
      }),
    ).rejects.toMatchObject({ code: 'STALE_ACTIVATION' });
    const p = await s.proposal('proposal_one');
    await s.decision(human, p.id, {
      gate: 'expected_answer_review',
      digest: p.expected_digest,
      decision: 'reject',
      reason: 'Withdraw synthetic expectations',
    });
    await approve(p, 'expected_answer_review', p.expected_digest);
    await expect(
      s.setStatus(human, 'fictional', {
        ...(await s.flow('fictional')),
        status: 'active',
        reason: 'Old test proof',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('queues one implementation, QA draft, and deterministic test job at the appropriate human gates', async () => {
    let p = await s.createProposal(bridge, {
      id: 'proposal_one',
      flowId: 'fictional',
      sourceVersionIds: ['version_one'],
      interpretation: 'Synthetic test interpretation',
      uncertainties: [],
    });
    const first = await approve(p, 'interpretation_review', p.digest),
      again = await approve(p, 'interpretation_review', p.digest);
    expect(again.id).toBe(first.id);
    expect(await s.all("SELECT * FROM jobs WHERE kind='implement_guidance'")).toHaveLength(1);
    let job = (await s.claimJob(bridge, {})).job!;
    expect(job.kind).toBe('implement_guidance');
    expect(job.payload.proposal.id).toBe(p.id);
    expect(job.payload.sourceVersionIds).toEqual(['version_one']);
    await s.finishJob(bridge, job.id, { state: 'complete' });
    p = await candidate();
    job = (await s.claimJob(bridge, {})).job!;
    expect(job.kind).toBe('draft_expectations');
    expect(job.payload.bundle.flowId).toBe('fictional');
    await s.finishJob(bridge, job.id, { state: 'complete' });
    p = await s.expectations(bridge, p.id, {
      cases: [{ id: 'yes', expectedOutcome: 'done' }],
      testCodeHash: h,
    });
    const approved = await approve(p, 'expected_answer_review', p.expected_digest);
    await approve(p, 'expected_answer_review', p.expected_digest);
    expect(await s.all("SELECT * FROM jobs WHERE kind='authorized_tests'")).toHaveLength(1);
    job = (await s.claimJob(bridge, {})).job!;
    expect(job.kind).toBe('authorized_tests');
    expect(job.payload.expectedApprovalId).toBe(approved.id);
  });
  it('invalidates dependent candidates when the same interpretation is withdrawn and reapproved', async () => {
    const p = await expected();
    await s.decision(human, p.id, {
      gate: 'interpretation_review',
      digest: p.interpretationDigest,
      decision: 'reject',
      reason: 'Withdraw interpretation',
    });
    await approve(p, 'interpretation_review', p.interpretationDigest);
    await expect(approve(p, 'expected_answer_review', p.expected_digest)).rejects.toMatchObject({
      code: 'CANDIDATE_APPROVAL_CHANGED',
    });
  });
  it('binds merge review to the exact CI evidence and release review to the exact merge decision', async () => {
    const r = await release(),
      p = await s.proposal('proposal_one');
    await s.decision(human, p.id, {
      gate: 'merge_review',
      digest: p.merge_digest,
      decision: 'reject',
      reason: 'Withdraw merge approval',
    });
    await approve(p, 'merge_review', p.merge_digest);
    await expect(s.releaseAuthorization(publisher, r.id)).rejects.toMatchObject({
      code: 'MERGE_APPROVAL_CHANGED',
    });
    await s.recordTest(ci, {
      id: 'new_run',
      proposalId: p.id,
      expectedDigest: p.expected_digest,
      candidateDigest: p.candidate_digest,
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      passed: true,
      checks: [{ name: 'fresh proof', passed: true }],
      environment: 'test',
      artifactHash: 'b'.repeat(64),
      artifactRef: 'local:new-proof',
    });
    const updated = await s.proposal(p.id);
    expect(updated.merge_digest).not.toBe(p.merge_digest);
    await expect(
      s.createRelease(publisher, {
        id: 'changed_proof_release',
        proposalId: p.id,
        testRunId: 'new_run',
        mergedTreeHash: h,
        workerVersions: { web: 'w', api: 'a', control: 'c', survey: 's' },
      }),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });
  it('acknowledges an exact job-finish retry after a bridge crash without granting another worker authority', async () => {
    await source('version_two', 'Changed fictional instructions.');
    const job = (await s.claimJob(bridge, {})).job!;
    await s.finishJob(bridge, job.id, { state: 'complete', result: { proposalId: 'synthetic' } });
    expect(
      await s.finishJob(bridge, job.id, { state: 'complete', result: { proposalId: 'synthetic' } }),
    ).toMatchObject({ state: 'complete', idempotent: true });
    await expect(
      s.finishJob({ ...bridge, id: 'another-service' }, job.id, {
        state: 'complete',
        result: { proposalId: 'synthetic' },
      }),
    ).rejects.toMatchObject({ code: 'LEASE_CONFLICT' });
  });
  it('rejects a different passing test run than the exact one the owner approved for merge', async () => {
    const p = await expected();
    await approve(p, 'expected_answer_review', p.expected_digest);
    const common = {
      proposalId: p.id,
      expectedDigest: p.expected_digest,
      candidateDigest: p.candidate_digest,
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      passed: true,
      checks: [{ name: 'synthetic evidence', passed: true }],
      environment: 'test',
      artifactRef: 'local:test',
    };
    // The first proof has a later completion timestamp, but the second proof is the reviewed one.
    await s.recordTest(ci, {
      ...common,
      id: 'first_proof',
      artifactHash: h,
      completedAt: new Date(now.getTime() + 500).toISOString(),
    });
    await s.recordTest(ci, { ...common, id: 'reviewed_proof', artifactHash: 'b'.repeat(64) });
    await approve(p, 'merge_review', (await s.proposal(p.id)).merge_digest);
    expect((await s.releaseInput(publisher, p.id)).testRunId).toBe('reviewed_proof');
    const input = {
      id: 'selected_proof_release',
      proposalId: p.id,
      mergedTreeHash: h,
      workerVersions: {
        web: 'test-web',
        api: 'test-api',
        control: 'test-control',
        survey: 'test-survey',
      },
    };
    await expect(
      s.createRelease(publisher, { ...input, testRunId: 'first_proof' }),
    ).rejects.toMatchObject({ code: 'TEST_REQUIRED' });
    const reviewed = await s.createRelease(publisher, { ...input, testRunId: 'reviewed_proof' });
    expect(reviewed.manifest.testRunId).toBe('reviewed_proof');
    await approve(reviewed, 'deployment_review', reviewed.digest, true);
    expect((await s.releaseAuthorization(publisher, reviewed.id)).manifest.testRunId).toBe(
      'reviewed_proof',
    );
    await s.suspendForRelease(publisher, reviewed.id);
    expect(await s.promote(publisher, reviewed.id)).toMatchObject({ state: 'verifying' });
  });
  it('enforces the evidence operational ceiling atomically', async () => {
    await s.env.EVIDENCE_DB.prepare(
      'UPDATE evidence_reservations SET bytes=367001600 WHERE singleton=1',
    ).run();
    await expect(
      s.reserveEvidence(collector, { id: 'full', rawSha256: h, bytes: 1, chunks: 1 }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_CAPACITY' });
    expect(
      await s.env.EVIDENCE_DB.prepare('SELECT id FROM evidence WHERE id=?').bind('full').first(),
    ).toBeNull();
  });
});
