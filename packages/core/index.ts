import checkSchema from './generated-validator.cjs';

export type Source = {
  id: string;
  sourceVersionId: string;
  snapshotSha256: string;
  url: string;
  passage: string;
  title?: string;
};
export type Question = {
  id: string;
  prompt: string;
  help?: string;
  choices: { id: string; label: string }[];
};
export type Outcome = {
  id: string;
  title: string;
  nextStep: string;
  prerequisites?: string[];
  unresolved: string[];
  sourceRefs: string[];
};
export type Bundle = {
  schemaVersion: '1.0';
  usage: 'test_fixture' | 'production_candidate';
  flowId: string;
  scope: string;
  entryQuestionId: string;
  questions: Question[];
  transitions: {
    questionId: string;
    choiceId: string;
    targetType: 'question' | 'outcome';
    targetId: string;
  }[];
  outcomes: Outcome[];
  sources: Source[];
};
export type Answer = { questionId: string; choiceId: string };
export type Step = { type: 'question'; question: Question } | { type: 'outcome'; outcome: Outcome };
export type FlowSummary = {
  id: string;
  title: string;
  scope: string;
  status: 'active' | 'under_review' | 'retired';
  officialUrl: string;
  statusEpoch: number;
  bundleHash: string | null;
  lastSuccessfulCheckAt: string | null;
};

export function validateBundle(value: unknown): Bundle {
  if (!checkSchema(value)) throw new Error('Invalid bundle schema');
  const b = value as Bundle;
  const unique = (items: { id: string }[], kind: string) => {
    const ids = new Set(items.map((x) => x.id));
    if (ids.size !== items.length) throw Error(`Duplicate ${kind} ID`);
    return ids;
  };
  const qs = unique(b.questions, 'question'),
    os = unique(b.outcomes, 'outcome'),
    ss = unique(b.sources, 'source');
  if (!qs.has(b.entryQuestionId)) throw Error('Unknown entry question');
  const edges = new Map<string, Bundle['transitions'][number]>();
  for (const t of b.transitions) {
    const q = b.questions.find((x) => x.id === t.questionId);
    if (!q || !q.choices.some((c) => c.id === t.choiceId))
      throw Error('Transition references an unknown question or choice');
    const key = `${t.questionId}:${t.choiceId}`;
    if (edges.has(key)) throw Error('Duplicate transition');
    if (!(t.targetType === 'question' ? qs : os).has(t.targetId))
      throw Error('Unknown transition target');
    edges.set(key, t);
  }
  for (const q of b.questions) {
    unique(q.choices, 'choice');
    if (!q.choices.some((c) => c.id === 'unknown'))
      throw Error('Every question requires an explicit unknown choice');
    if (q.choices.some((c) => !edges.has(`${q.id}:${c.id}`)))
      throw Error('Incomplete question branches');
  }
  for (const o of b.outcomes)
    if (!o.sourceRefs.length || o.sourceRefs.some((id) => !ss.has(id)))
      throw Error('Outcome requires valid source references');
  for (const s of b.sources) {
    const url = new URL(s.url);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw Error('Source requires a plain HTTPS URL');
  }
  const visiting = new Set<string>(),
    seen = new Set<string>(),
    terminals = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw Error('Cycle in decision graph');
    if (seen.has(id)) return;
    visiting.add(id);
    for (const t of b.transitions.filter((x) => x.questionId === id)) {
      if (t.targetType === 'question') visit(t.targetId);
      else terminals.add(t.targetId);
    }
    visiting.delete(id);
    seen.add(id);
  };
  visit(b.entryQuestionId);
  if (seen.size !== qs.size || terminals.size !== os.size)
    throw Error('Unreachable decision nodes');
  return b;
}

export function evaluate(b: Bundle, answers: Answer[]): Step {
  if (answers.length > b.questions.length) throw Error('Too many answers');
  let type: 'question' | 'outcome' = 'question',
    id = b.entryQuestionId;
  for (const a of answers) {
    if (type !== 'question' || a.questionId !== id)
      throw Error('Answer does not match current question');
    const edge = b.transitions.find((t) => t.questionId === id && t.choiceId === a.choiceId);
    if (!edge) throw Error('Unknown choice');
    type = edge.targetType;
    id = edge.targetId;
  }
  if (type === 'question') {
    const question = b.questions.find((q) => q.id === id);
    if (!question) throw Error('Missing question');
    return { type, question };
  }
  const outcome = b.outcomes.find((o) => o.id === id);
  if (!outcome) throw Error('Missing outcome');
  return { type, outcome };
}

export const FRESHNESS_MS = 72 * 60 * 60 * 1000;
export function effectiveStatus(
  flow: Pick<FlowSummary, 'status' | 'lastSuccessfulCheckAt'>,
  now = Date.now(),
): FlowSummary['status'] {
  if (flow.status !== 'active') return flow.status;
  const checked = Date.parse(flow.lastSuccessfulCheckAt ?? '');
  return Number.isFinite(checked) && checked <= now && now - checked < FRESHNESS_MS
    ? 'active'
    : 'under_review';
}

// Canonical JSON: finite JSON values only, object keys sorted by UTF-16 code unit.
// Set-like arrays are normalized by each manifest constructor before hashing.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(object[k])}`)
      .join(',')}}`;
  }
  throw Error('Non-JSON value cannot be hashed');
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const digest = (value: unknown) => sha256(canonical(value));
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

// JSON.parse accepts duplicate keys; approvals must not. Parse a bounded JSON
// document while recording object keys, then delegate value decoding to JSON.parse.
export function parseStrictJSON(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
  };
  const string = () => {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '\\') i++;
      else if (c === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    throw Error('Unterminated string');
  };
  const value = (depth = 0): void => {
    if (depth > 64) throw Error('JSON nesting limit');
    ws();
    if (text[i] === '{') {
      i++;
      ws();
      const keys = new Set<string>();
      if (text[i] === '}') {
        i++;
        return;
      }
      while (true) {
        ws();
        if (text[i] !== '"') throw Error('Object key required');
        const key = string();
        if (keys.has(key)) throw Error('Duplicate JSON key');
        keys.add(key);
        ws();
        if (text[i++] !== ':') throw Error('Colon required');
        value(depth + 1);
        ws();
        const c = text[i++];
        if (c === '}') return;
        if (c !== ',') throw Error('Comma required');
      }
    }
    if (text[i] === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      while (true) {
        value(depth + 1);
        ws();
        const c = text[i++];
        if (c === ']') return;
        if (c !== ',') throw Error('Comma required');
      }
    }
    if (text[i] === '"') {
      string();
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(i),
    );
    if (!match) throw Error('Invalid JSON');
    i += match[0].length;
  };
  value();
  ws();
  if (i !== text.length) throw Error('Trailing JSON content');
  return JSON.parse(text);
}
