import { describe, expect, it } from 'vitest';
import { fallbackFlows, isFlow, isSession, isStep, safeLink } from './types';

const question = {
  type: 'question',
  question: {
    id: 'fixture',
    prompt: 'A fictional question',
    choices: [{ id: 'unknown', label: 'I am not sure' }],
  },
};
const session = {
  sessionId: 'fixture-session',
  token: 'opaque-capability',
  sequence: 0,
  bundleHash: 'a'.repeat(64),
  statusEpoch: 1,
  flowId: 'fictional',
  step: question,
  sources: [],
  officialUrl: 'https://example.org/help',
};

describe('untrusted public API responses', () => {
  it('rejects active URLs, embedded credentials, and malformed links', () => {
    for (const input of [
      'javascript:alert(1)',
      'http://example.org',
      'https://user:secret@example.org',
      'data:text/html,test',
      null,
    ])
      expect(safeLink(input)).toBeUndefined();
    expect(safeLink('https://example.org/help')).toBe('https://example.org/help');
  });
  it('leaves static topics under review and validates availability timestamps', () => {
    expect(fallbackFlows.every((f) => f.status === 'under_review' && isFlow(f))).toBe(true);
    expect(isFlow({ ...fallbackFlows[0], lastSuccessfulCheckAt: 'not-a-date' })).toBe(false);
    expect(isFlow({ ...fallbackFlows[0], statusEpoch: -1 })).toBe(false);
  });
  it('rejects malformed choices and renderer values without throwing', () => {
    expect(isStep(question)).toBe(true);
    expect(isStep({ type: 'question', question: { ...question.question, choices: [null] } })).toBe(
      false,
    );
    expect(
      isStep({
        type: 'question',
        question: {
          ...question.question,
          choices: [question.question.choices[0], question.question.choices[0]],
        },
      }),
    ).toBe(false);
    expect(
      isStep({
        type: 'outcome',
        outcome: {
          id: 'end',
          title: 'End',
          nextStep: 'Read the source',
          prerequisites: [{}],
          unresolved: [],
          sourceRefs: [],
        },
      }),
    ).toBe(false);
  });
  it('rejects sessions without capabilities and invalid source objects', () => {
    expect(isSession(session)).toBe(true);
    expect(isSession({ ...session, token: '' })).toBe(false);
    expect(isSession({ ...session, sequence: -1 })).toBe(false);
    expect(isSession({ ...session, sources: [null] })).toBe(false);
  });
});
