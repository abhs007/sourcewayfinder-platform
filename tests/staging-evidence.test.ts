import { it, expect, vi } from 'vitest';
import { stageEvidence } from '../ops/staging-evidence.mts';
const source = {
  id: 'fixture',
  flowId: 'verizon-sim-protection',
  url: 'https://example.org/guide',
  approvedOrigin: 'https://example.org',
  approvedPath: '/guide',
};
const registered = {
  id: source.id,
  flow_id: source.flowId,
  url: source.url,
  approved_origin: source.approvedOrigin,
  approved_path: source.approvedPath,
};
it.each([true, false])(
  'queues an unapproved proposal only when freshly collected text matches (%s)',
  async (same) => {
    const calls: any[] = [];
    const api = async (path: string, method?: string, body?: any) => {
      calls.push({ path, method, body });
      return path.endsWith('/sources')
        ? { sources: [registered] }
        : { id: body.id, digest: 'digest', state: 'interpretation_review' };
    };
    const result = await stageEvidence(
      [source],
      [{ id: source.id, normalizedSha256: 'reviewed', extractorVersion: 'fictional-v1' }],
      { interpretation: 'Fictional fixture' },
      api,
      async () => ({
        normalizedSha256: same ? 'reviewed' : 'changed',
        extractorVersion: 'fictional-v1',
        checkedAt: '2026-11-23',
      }),
      async () => ({
        sourceVersionId: 'fresh-version',
        snapshotSha256: 'raw',
        normalizedSha256: same ? 'reviewed' : 'changed',
      }),
    );
    expect(result.needsSourceReview).toBe(!same);
    expect(calls.map((c) => c.path)).toEqual(
      same ? ['/internal/v1/sources', '/internal/v1/proposals'] : ['/internal/v1/sources'],
    );
    if (same) {
      expect(calls[1].body.sourceVersionIds).toEqual(['fresh-version']);
      expect(result.proposal?.state).toBe('interpretation_review');
    } else expect(result.proposal).toBeNull();
  },
);
it('checks exact human-approved boundaries before fetching or uploading anything', async () => {
  const acquire = vi.fn(),
    upload = vi.fn();
  await expect(
    stageEvidence(
      [source],
      [],
      {},
      async () => ({ sources: [{ ...registered, approved_path: '/different' }] }),
      acquire,
      upload,
    ),
  ).rejects.toThrow('boundary mismatch');
  expect(acquire).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

it('requires review when the extractor version changes even if the text hash matches', async () => {
  const api = vi.fn(async () => ({ sources: [registered] }));
  const result = await stageEvidence(
    [source],
    [{ id: source.id, normalizedSha256: 'same', extractorVersion: 'old' }],
    {},
    api,
    async () => ({ normalizedSha256: 'same', extractorVersion: 'new' }),
    async () => ({ sourceVersionId: 'new-version' }),
  );
  expect(result.needsSourceReview).toBe(true);
  expect(result.proposal).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
});
