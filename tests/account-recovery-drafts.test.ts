import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateBundle } from '../packages/core';
// Structural/provenance checks only. Do not evaluate the proposed real-world expected answers.
describe('unapproved account recovery proposals', () => {
  for (const id of ['google-lost-second-factor', 'google-compromised-account']) {
    it(`${id} is structurally valid and remains unapproved`, () => {
      const bundle = validateBundle(
        JSON.parse(readFileSync(`domains/${id}/bundle.draft.json`, 'utf8')),
      );
      const review = JSON.parse(readFileSync(`domains/${id}/review-packet.json`, 'utf8'));
      const cases = JSON.parse(readFileSync(`domains/${id}/expected-cases.proposed.json`, 'utf8'));
      expect(bundle.flowId).toBe(id);
      expect(review.approvals).toEqual([]);
      expect(review.semanticTestsRun).toBe(false);
      expect(review.releaseReady).toBe(false);
      expect(new Set(cases.map((c: any) => c.id)).size).toBe(cases.length);
      expect(bundle.sources.every((s) => s.sourceVersionId.startsWith('draft_'))).toBe(true);
      expect(
        new Set(
          cases.flatMap((c: any) => c.answers.map((a: any) => `${a.questionId}:${a.choiceId}`)),
        ).size,
      ).toBe(bundle.transitions.length);
    });
  }
  it('publishes source identities without representing research hashes as policy approval', () => {
    const rows = JSON.parse(
      readFileSync('domains/research/account-recovery-2026-11-26/capture-register.json', 'utf8'),
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.sourceVersionId).toMatch(/^draft_[a-f0-9]+$/);
      expect(row.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(row.url).toMatch(/^https:\/\/support\.google\.com\//);
      expect(row.productionCollectorCompatible).toBe(false);
      expect(row.rawBytes).toBeGreaterThan(1024 * 1024);
    }
  });
  // Full research captures are not redistributed in the public Git repository.
  const captureRows = JSON.parse(
    readFileSync('domains/research/account-recovery-2026-11-26/capture-register.json', 'utf8'),
  );
  it.skipIf(!captureRows.every((row: any) => existsSync(row.rawFile) && existsSync(row.textFile)))(
    'retains the local research bytes and minimal trace passages named in the register',
    () => {
      const rows = JSON.parse(
        readFileSync('domains/research/account-recovery-2026-11-26/capture-register.json', 'utf8'),
      );
      for (const row of rows) {
        expect(createHash('sha256').update(readFileSync(row.rawFile)).digest('hex')).toBe(
          row.snapshotSha256,
        );
        expect(readFileSync(row.textFile, 'utf8')).toContain(row.passage);
        expect(row.httpStatus).toBe(200);
      }
    },
  );
});
