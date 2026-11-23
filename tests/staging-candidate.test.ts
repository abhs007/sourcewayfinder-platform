import { it, expect, vi } from 'vitest';
import { submitCandidate } from '../ops/staging-candidate.mjs';
import { canonical, sha } from '../ops/authorized-tests.mjs';

function fixture() {
  const artifact = {
    candidateCommit: 'a'.repeat(40),
    codeHash: 'b'.repeat(64),
    migrationHash: 'c'.repeat(64),
  };
  const packet = {
    environment: 'staging',
    proposalId: 'verizon-initial-ce98b9b5ec88cab60455',
    interpretationApprovalId: 'fictional-approval',
    proposalDigest: 'd'.repeat(64),
    artifact,
    testCodeHash: 'e'.repeat(64),
    bundle: { usage: 'test_fixture', sources: [{ sourceVersionId: 'fictional-v1' }] },
    cases: [{ id: 'fictional-case' }],
  };
  const manifest = {
    interpretationApprovalId: packet.interpretationApprovalId,
    proposalDigest: packet.proposalDigest,
    bundleHash: sha(canonical(packet.bundle)),
    ...artifact,
    policyVersion: '1',
  };
  const expectedManifest = {
    candidateDigest: sha(canonical(manifest)),
    cases: packet.cases,
    testCodeHash: packet.testCodeHash,
    sourceVersionIds: ['fictional-v1'],
    policyVersion: '1',
  };
  return { artifact, packet, manifest, expectedManifest };
}
it('submits only a candidate and expected cases and preserves the exact bound manifests', async () => {
  const f = fixture();
  const api = vi.fn(async (path: string) =>
    path.endsWith('/candidate')
      ? { candidateManifest: f.manifest }
      : { expectedManifest: f.expectedManifest, state: 'expected_answer_review' },
  );
  const result = await submitCandidate(f.packet, f.artifact, f.packet.testCodeHash, api);
  expect(api.mock.calls.map(([path]) => path.split('/').at(-1))).toEqual([
    'candidate',
    'expectations',
  ]);
  expect(result).toMatchObject({
    testsExecuted: false,
    decisionsSubmitted: false,
    deployed: false,
    cases: 1,
    state: 'expected_answer_review',
  });
});
it.each(['artifact', 'runner', 'environment'])(
  'refuses changed %s before sending any request',
  async (change) => {
    const f = fixture(),
      api = vi.fn();
    if (change === 'environment') f.packet.environment = 'production';
    await expect(
      submitCandidate(
        f.packet,
        change === 'artifact' ? { ...f.artifact, codeHash: 'f'.repeat(64) } : f.artifact,
        change === 'runner' ? 'f'.repeat(64) : f.packet.testCodeHash,
        api,
      ),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
  },
);
it('stops before expectations if the current interpretation approval differs', async () => {
  const f = fixture(),
    api = vi.fn(async () => ({
      candidateManifest: { ...f.manifest, interpretationApprovalId: 'changed' },
    }));
  await expect(submitCandidate(f.packet, f.artifact, f.packet.testCodeHash, api)).rejects.toThrow(
    'interpretation',
  );
  expect(api).toHaveBeenCalledTimes(1);
});
it('does not claim success when the returned expected cases differ', async () => {
  const f = fixture(),
    api = vi.fn(async (path: string) =>
      path.endsWith('/candidate')
        ? { candidateManifest: f.manifest }
        : { expectedManifest: { ...f.expectedManifest, cases: [] } },
    );
  await expect(submitCandidate(f.packet, f.artifact, f.packet.testCodeHash, api)).rejects.toThrow(
    'Expected-case response',
  );
});
