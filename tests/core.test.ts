import { describe, it, expect } from 'vitest';
import fixture from './fixtures/fictional-flow.json';
import {
  validateBundle,
  evaluate,
  canonical,
  digest,
  effectiveStatus,
  parseStrictJSON,
} from '../packages/core';
describe('reviewed deterministic graph contract', () => {
  it('covers every reachable fictional choice including unknown', () => {
    const b = validateBundle(fixture);
    expect(evaluate(b, []).type).toBe('question');
    for (const choiceId of ['yes', 'no', 'unknown'])
      expect(evaluate(b, [{ questionId: b.entryQuestionId, choiceId }]).type).toBe('outcome');
  });
  it('rejects missing branches, cycles, unreachable nodes, bad sources and missing unknown', () => {
    const mutations = [
      (b: any) => b.transitions.pop(),
      (b: any) =>
        Object.assign(b.transitions[0], { targetType: 'question', targetId: b.entryQuestionId }),
      (b: any) => b.questions.push({ ...b.questions[0], id: 'unreachable' }),
      (b: any) => (b.sources[0].url = 'http://example.org'),
      (b: any) => b.questions[0].choices.pop(),
      (b: any) => (b.outcomes[0].sourceRefs = ['absent']),
      (b: any) => b.questions[0].choices.push(b.questions[0].choices[0]),
    ];
    for (const mutate of mutations) {
      const b = structuredClone(fixture);
      mutate(b);
      expect(() => validateBundle(b)).toThrow();
    }
  });
  it('rejects wrong question, unsupported choice, and answers after terminal', () => {
    const b = validateBundle(fixture);
    for (const a of [
      [{ questionId: 'other', choiceId: 'yes' }],
      [{ questionId: b.entryQuestionId, choiceId: 'bad' }],
      [
        { questionId: b.entryQuestionId, choiceId: 'yes' },
        { questionId: b.entryQuestionId, choiceId: 'no' },
      ],
    ])
      expect(() => evaluate(b, a)).toThrow();
  });
  it('canonically hashes JSON and rejects ambiguous values', async () => {
    expect(await digest({ b: 2, a: 1 })).toBe(await digest({ a: 1, b: 2 }));
    expect(() => canonical({ a: undefined })).toThrow();
    expect(() => canonical(Infinity)).toThrow();
    expect(() => parseStrictJSON('{"a":1,"a":2}')).toThrow();
    expect(() => parseStrictJSON('{"a":1,"\\u0061":2}')).toThrow();
    expect(parseStrictJSON('{"a":[true,null,"quoted\\\""]}')).toEqual({
      a: [true, null, 'quoted"'],
    });
  });
  it('fails closed after exactly 72 hours without requiring a scheduler', () => {
    const now = Date.now(),
      f = {
        status: 'active' as const,
        lastSuccessfulCheckAt: new Date(now - 72 * 3600000).toISOString(),
      };
    expect(effectiveStatus(f, now)).toBe('under_review');
    expect(
      effectiveStatus({ ...f, lastSuccessfulCheckAt: new Date(now + 1000).toISOString() }, now),
    ).toBe('under_review');
    expect(
      effectiveStatus({ ...f, lastSuccessfulCheckAt: new Date(now - 1000).toISOString() }, now),
    ).toBe('active');
  });
});
