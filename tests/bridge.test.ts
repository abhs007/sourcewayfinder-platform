import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { acquireLease, boundedPacket, proposalFromRun } from '../ops/bridge-core.mts';
describe('bounded orchestration admission', () => {
  it('only one owner can dispatch and recovery requires lease expiry', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE lease(id INTEGER PRIMARY KEY,owner TEXT,until INTEGER)');
    expect(acquireLease(db, 'one', 100)).toBe(true);
    expect(acquireLease(db, 'two', 101)).toBe(false);
    expect(acquireLease(db, 'two', 60101)).toBe(true);
    expect(acquireLease(db, 'one', 60102)).toBe(false);
    db.close();
  });
  it('escalates oversized packets without silent truncation', () => {
    expect(() => boundedPacket({ passage: 'x'.repeat(48001) })).toThrow('REQUIRES_SCOPING');
    expect(boundedPacket({ source: 'official' })).toBe('{"source":"official"}');
  });
  it('rejects stale or ambiguous proposal comments', () => {
    const run = { id: 'run', agentId: 'analyst', startedAt: '2026-11-22T12:00:00Z' },
      body =
        '```sourcewayfinder-proposal\n' +
        JSON.stringify({
          id: 'proposal',
          flowId: 'fictional',
          sourceVersionIds: ['one'],
          interpretation: 'Fictional',
        }) +
        '\n```';
    const current = { authorAgentId: 'analyst', createdAt: '2026-11-22T12:01:00Z', body };
    expect(proposalFromRun([current], run).id).toBe('proposal');
    expect(() =>
      proposalFromRun([{ ...current, createdAt: '2026-11-22T11:00:00Z' }], run),
    ).toThrow();
    expect(() => proposalFromRun([current, current], run)).toThrow();
    expect(() => proposalFromRun([{ ...current, runId: 'other' }], run)).toThrow();
  });
});

import {
  disabledRuntime,
  phaseFor,
  reconcileDispatch,
  scopedPacket,
  submission,
  outputFromRun,
  type Job,
} from '../ops/bridge-core.mts';
const base = {
  flowId: 'fictional',
  sourceVersionIds: ['source_v1'],
  sources: [{ sourceVersionId: 'source_v1', normalizedText: 'Official fictional passage' }],
  proposalId: 'proposal_one',
  proposal: {
    id: 'proposal_one',
    interpretation: 'Owner reviewed fictional interpretation',
    candidateManifest: { bundleHash: 'b'.repeat(64) },
    expectedManifest: { cases: ['OLD_ANSWERS_MUST_NOT_LEAK'] },
  },
};
const job = (kind: Job['kind']): Job => ({
  id: 'job_one',
  kind,
  payload: { ...base, bundle: { flowId: 'fictional' } },
});
const run = { id: 'run_one', agentId: 'agent_one', startedAt: '2026-11-22T12:00:00Z' };
const comment = (fence: string, value: unknown) => [
  {
    authorAgentId: run.agentId,
    runId: run.id,
    createdAt: '2026-11-22T12:01:00Z',
    body: '```sourcewayfinder-' + fence + '\n' + JSON.stringify(value) + '\n```',
  },
];
describe('maintenance phase boundaries and restart recovery', () => {
  it('routes each model phase and keeps authorized tests outside models', () => {
    expect(phaseFor(job('implement_guidance')).agent).toBe('backend');
    expect(phaseFor(job('draft_expectations'))).toMatchObject({ agent: 'qa', fresh: true });
    expect(phaseFor(job('authorized_tests')).agent).toBeNull();
    expect(() => submission(job('authorized_tests'), [], run)).toThrow('DETERMINISTIC');
  });
  it('fresh QA receives passages and candidate without prior answers', () => {
    const text = scopedPacket(job('draft_expectations'));
    expect(text).toContain('Official fictional passage');
    expect(JSON.parse(text).bundle.flowId).toBe('fictional');
    expect(text).not.toContain('OLD_ANSWERS');
  });
  it('rejects oversized current evidence instead of silently cutting it', () => {
    const j = job('implement_guidance');
    j.payload.sources = [{ normalizedText: 'x'.repeat(48001) }];
    expect(() => scopedPacket(j)).toThrow('REQUIRES_SCOPING');
  });
  it('disables accidental wakes while preserving unrelated runtime configuration', () => {
    expect(
      disabledRuntime({
        workspace: 'keep',
        heartbeat: {
          enabled: true,
          wakeOnDemand: true,
          wakeOnAssignment: true,
          intervalSec: 10,
          maxConcurrentRuns: 8,
        },
      }),
    ).toEqual({
      workspace: 'keep',
      heartbeat: {
        enabled: false,
        wakeOnDemand: false,
        wakeOnAssignment: false,
        intervalSec: 0,
        maxConcurrentRuns: 1,
      },
    });
  });
  it('recovers accepted invokes by exact issue, agent and persisted start time', () => {
    const work = { issue_id: 'issue_one', agent_id: 'agent_one', dispatch_at: run.startedAt };
    const valid = { ...run, issueId: 'issue_one', createdAt: '2026-11-22T12:00:01Z' };
    expect(
      reconcileDispatch(
        [
          { ...valid, agentId: 'other' },
          { ...valid, issueId: 'other' },
          { ...valid, createdAt: '2026-11-21T12:00:00Z' },
          valid,
        ],
        work,
      ),
    ).toBe(valid);
    expect(reconcileDispatch([], work)).toBeNull();
    expect(() => reconcileDispatch([valid, valid], work)).toThrow('AMBIGUOUS');
  });
  it('binds source output to claimed versions and overwrites agent-selected proposal identity', () => {
    const output = {
      id: 'chosen_by_agent',
      flowId: 'fictional',
      sourceVersionIds: ['source_v1'],
      interpretation: 'Fictional explanation',
    };
    expect(submission(job('source_change'), comment('proposal', output), run).body.id).toBe(
      'proposal_jobone',
    );
    expect(() =>
      submission(
        job('source_change'),
        comment('proposal', { ...output, sourceVersionIds: ['unclaimed'] }),
        run,
      ),
    ).toThrow('MISMATCH');
  });
  it('submits only candidate fields and refuses wrong flow or malformed hashes', () => {
    const output = {
      bundle: { flowId: 'fictional' },
      candidateCommit: 'a'.repeat(40),
      codeHash: 'b'.repeat(64),
      migrationHash: 'c'.repeat(64),
      approve: true,
      command: 'dangerous',
    };
    const result = submission(job('implement_guidance'), comment('candidate', output), run);
    expect(result.path).toBe('/internal/v1/proposals/proposal_one/candidate');
    expect(result.body).not.toHaveProperty('approve');
    expect(result.body).not.toHaveProperty('command');
    expect(() =>
      submission(
        job('implement_guidance'),
        comment('candidate', { ...output, bundle: { flowId: 'other' } }),
        run,
      ),
    ).toThrow();
  });
  it('binds expectations to the trusted runner hash rather than a model-provided hash', () => {
    const result = submission(
      job('draft_expectations'),
      comment('expectations', {
        cases: [{ id: 'case_one', expectedOutcome: { id: 'outcome' } }],
        testCodeHash: 'untrusted',
      }),
      run,
      'a'.repeat(64),
    );
    expect(result.body.testCodeHash).toBe('a'.repeat(64));
    expect(() =>
      submission(job('draft_expectations'), comment('expectations', { cases: [{}] }), run),
    ).toThrow();
  });
  it('rejects duplicate JSON keys and more than one current result', () => {
    const items = comment('candidate', {});
    items[0].body = '```sourcewayfinder-candidate\n{"bundle":{},"bundle":{}}\n```';
    expect(() => outputFromRun(items, run, 'candidate')).toThrow('Duplicate');
    const valid = comment('expectations', { cases: [] });
    expect(() => outputFromRun([...valid, ...valid], run, 'expectations')).toThrow('Exactly one');
  });
});
