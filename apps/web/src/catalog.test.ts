import { describe, expect, it } from 'vitest';
import { filterTopics, mergeDirectory } from './catalog';
import { fallbackFlows } from './types';
describe('topic discovery never grants publication authority', () => {
  it('keeps source handoffs visible when the registry is empty', () => {
    expect(mergeDirectory([])).toEqual(fallbackFlows);
    expect(mergeDirectory([]).every((f) => f.status === 'under_review')).toBe(true);
  });
  it('preserves the server record for matching active or retired topics without duplicates', () => {
    for (const status of ['active', 'retired'] as const) {
      const remote = { ...fallbackFlows[0], status, statusEpoch: 9, title: 'Policy-owned title' };
      const matches = mergeDirectory([remote]).filter((f) => f.id === remote.id);
      expect(matches).toEqual([remote]);
    }
  });
  it('finds vocabulary people use, and combines filters with all search terms', () => {
    expect(filterTopics(fallbackFlows, 'I lost my phone', 'accounts').map((f) => f.id)).toContain(
      'google-lost-second-factor',
    );
    expect(filterTopics(fallbackFlows, '  LOST  2FA ', 'accounts').map((f) => f.id)).toEqual([
      'google-lost-second-factor',
    ]);
    expect(filterTopics(fallbackFlows, 'ssn', 'documents').map((f) => f.id)).toEqual([
      'ssa-replacement-card',
    ]);
    expect(filterTopics(fallbackFlows, 'Gmail', 'documents')).toEqual([]);
    expect(filterTopics(fallbackFlows, '<script>', 'all')).toEqual([]);
  });
});
