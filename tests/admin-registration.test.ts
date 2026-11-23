import { describe, expect, it } from 'vitest';
import { registrationPlan } from '../apps/admin/src/registration-plan';

const flow = {
  id: 'fictional',
  title: 'Fictional flow',
  scope: 'Fixture only',
  officialUrl: 'https://example.org/guide',
};
const source = {
  id: 'fixture-source',
  flowId: flow.id,
  title: 'Fixture guide',
  url: flow.officialUrl,
  approvedOrigin: 'https://example.org',
  approvedPath: '/guide',
};
const packet = { flow, sources: [source] };
const stored = {
  id: source.id,
  flow_id: flow.id,
  title: source.title,
  url: source.url,
  approved_origin: source.approvedOrigin,
  approved_path: source.approvedPath,
  enabled: 1,
};
const dashboard = {
  csrfToken: 'fictional-csrf',
  flows: [{ ...flow, status: 'under_review' }],
  sources: [stored],
};

describe('registration retry reconciliation', () => {
  it('creates only missing registration records, never approval or release actions', () => {
    expect(registrationPlan(packet, { ...dashboard, flows: [], sources: [] })).toEqual([
      { path: '/admin/v1/flows', body: flow },
      { path: '/admin/v1/sources', body: source },
    ]);
    expect(registrationPlan(packet, { ...dashboard, sources: [] })).toEqual([
      { path: '/admin/v1/sources', body: source },
    ]);
    expect(registrationPlan(packet, dashboard)).toEqual([]);
  });
  it.each(['url', 'approved_origin', 'approved_path', 'title', 'flow_id', 'enabled'])(
    'refuses an existing source with changed %s',
    (key) => {
      expect(() =>
        registrationPlan(packet, { ...dashboard, sources: [{ ...stored, [key]: 'different' }] }),
      ).toThrow('different details');
    },
  );
  it('refuses conflicting flow details, incomplete auth state and active flow additions', () => {
    expect(() =>
      registrationPlan(packet, { ...dashboard, flows: [{ ...flow, scope: 'different' }] }),
    ).toThrow('different details');
    expect(() => registrationPlan(packet, { ...dashboard, csrfToken: '' })).toThrow(
      'could not be verified',
    );
    expect(() =>
      registrationPlan(packet, {
        ...dashboard,
        flows: [{ ...flow, status: 'active' }],
        sources: [],
      }),
    ).toThrow('under review');
  });
});
