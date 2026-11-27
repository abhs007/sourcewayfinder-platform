import { fallbackFlows, type FlowSummary } from './types';

export const topicFilters = [
  { id: 'all', label: 'All topics' },
  { id: 'accounts', label: 'Phones & accounts' },
  { id: 'documents', label: 'Identity documents' },
] as const;
export type TopicFilter = (typeof topicFilters)[number]['id'];
const discovery: Record<string, { category: TopicFilter; aliases: string }> = {
  'verizon-sim-protection': {
    category: 'accounts',
    aliases: 'verizon sim esim phone lost stolen locked number device activation replacement',
  },
  'ssa-replacement-card': {
    category: 'documents',
    aliases: 'ssa social security ssn card lost stolen replacement identity document',
  },
  'google-lost-second-factor': {
    category: 'accounts',
    aliases:
      'google gmail lost stolen broken phone two step 2fa mfa authenticator verification backup code passkey login sign in',
  },
  'google-compromised-account': {
    category: 'accounts',
    aliases:
      'google gmail email hacked compromised suspicious activity password primary account recovery',
  },
};
// Static entries offer discovery and official handoffs only. Policy responses own availability.
export function mergeDirectory(remote: FlowSummary[]): FlowSummary[] {
  const remoteIds = new Set(remote.map((flow) => flow.id));
  return [...remote, ...fallbackFlows.filter((flow) => !remoteIds.has(flow.id))];
}
export function filterTopics(flows: FlowSummary[], query: string, category: TopicFilter) {
  const commonWords = new Set([
    'i',
    'my',
    'me',
    'a',
    'an',
    'the',
    'have',
    'has',
    'was',
    'is',
    'what',
    'to',
    'do',
    'how',
    'can',
    'with',
    'of',
  ]);
  const terms = query
    .toLocaleLowerCase('en-US')
    .trim()
    .split(/\s+/)
    .filter((term) => term && !commonWords.has(term));
  return flows.filter((flow) => {
    const info = discovery[flow.id];
    if (category !== 'all' && info?.category !== category) return false;
    const text = `${flow.title} ${flow.scope} ${info?.aliases ?? ''}`.toLocaleLowerCase('en-US');
    return terms.every((term) => text.includes(term));
  });
}
