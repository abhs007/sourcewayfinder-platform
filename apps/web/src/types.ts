export type FlowSummary = {
  id: string;
  title: string;
  scope: string;
  status: 'active' | 'under_review' | 'retired';
  officialUrl: string;
  lastSuccessfulCheckAt: string | null;
  statusEpoch: number;
};
export type Source = { id: string; title: string; url: string };
export type Step =
  | {
      type: 'question';
      question: {
        id: string;
        prompt: string;
        help?: string;
        choices: { id: string; label: string }[];
      };
    }
  | {
      type: 'outcome';
      outcome: {
        id: string;
        title: string;
        nextStep: string;
        prerequisites?: string[];
        unresolved: string[];
        sourceRefs: string[];
      };
    };
export type GuidanceSession = {
  sessionId: string;
  token: string;
  sequence: number;
  bundleHash: string;
  statusEpoch: number;
  flowId: string;
  step: Step;
  sources: Source[];
  officialUrl: string;
};
export type ApiError = { code: string; message: string; requestId?: string; officialUrl?: string };
export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((x) => typeof x === 'string');
const nonnegativeInteger = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function isFlow(value: unknown): value is FlowSummary {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.scope === 'string' &&
    ['active', 'under_review', 'retired'].includes(String(value.status)) &&
    !!safeLink(value.officialUrl) &&
    nonnegativeInteger(value.statusEpoch) &&
    (value.lastSuccessfulCheckAt === null ||
      (typeof value.lastSuccessfulCheckAt === 'string' &&
        Number.isFinite(Date.parse(value.lastSuccessfulCheckAt))))
  );
}
export function isStep(value: unknown): value is Step {
  if (!record(value)) return false;
  if (value.type === 'question') {
    const q = value.question;
    return (
      record(q) &&
      typeof q.id === 'string' &&
      typeof q.prompt === 'string' &&
      (q.help === undefined || typeof q.help === 'string') &&
      Array.isArray(q.choices) &&
      q.choices.length > 0 &&
      q.choices.every(
        (c) => record(c) && typeof c.id === 'string' && typeof c.label === 'string',
      ) &&
      new Set(q.choices.map((c) => c.id)).size === q.choices.length
    );
  }
  if (value.type === 'outcome') {
    const o = value.outcome;
    return (
      record(o) &&
      typeof o.id === 'string' &&
      typeof o.title === 'string' &&
      typeof o.nextStep === 'string' &&
      (o.prerequisites === undefined || strings(o.prerequisites)) &&
      strings(o.unresolved) &&
      strings(o.sourceRefs)
    );
  }
  return false;
}
export function isSession(value: unknown): value is GuidanceSession {
  if (!record(value)) return false;
  return (
    typeof value.sessionId === 'string' &&
    typeof value.token === 'string' &&
    value.token.length > 0 &&
    nonnegativeInteger(value.sequence) &&
    nonnegativeInteger(value.statusEpoch) &&
    typeof value.bundleHash === 'string' &&
    typeof value.flowId === 'string' &&
    !!safeLink(value.officialUrl) &&
    isStep(value.step) &&
    Array.isArray(value.sources) &&
    value.sources.every(
      (x) =>
        record(x) && typeof x.id === 'string' && typeof x.title === 'string' && !!safeLink(x.url),
    )
  );
}
export const fallbackFlows: FlowSummary[] = [
  {
    id: 'google-lost-second-factor',
    title: 'Lost phone or Google verification access',
    scope:
      'Personal Google accounts. Find the official options when your usual second step is unavailable.',
    status: 'under_review',
    officialUrl: 'https://support.google.com/accounts/answer/185834?hl=en',
    lastSuccessfulCheckAt: null,
    statusEpoch: 0,
  },
  {
    id: 'google-compromised-account',
    title: 'Secure a Google account after suspicious activity',
    scope:
      'Personal Google accounts and Gmail. Different routes for people who can and cannot sign in.',
    status: 'under_review',
    officialUrl: 'https://support.google.com/accounts/answer/6294825?hl=en',
    lastSuccessfulCheckAt: null,
    statusEpoch: 0,
  },
  {
    id: 'verizon-sim-protection',
    title: 'Phone and account access',
    scope: 'Verizon consumer postpaid accounts. SIM Protection and access to your account.',
    status: 'under_review',
    officialUrl: 'https://www.verizon.com/support/knowledge-base-309294/',
    lastSuccessfulCheckAt: null,
    statusEpoch: 0,
  },
  {
    id: 'ssa-replacement-card',
    title: 'Replace a Social Security card',
    scope: 'A replacement card with no changes to your personal details.',
    status: 'under_review',
    officialUrl: 'https://www.ssa.gov/number-card/replace-card',
    lastSuccessfulCheckAt: null,
    statusEpoch: 0,
  },
];
