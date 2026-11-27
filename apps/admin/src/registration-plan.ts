export type RegistrationPacket = {
  flow: { id: string; title: string; scope: string; officialUrl: string };
  sources: {
    id: string;
    flowId: string;
    title: string;
    url: string;
    approvedOrigin: string;
    approvedPath: string;
  }[];
};
type Row = Record<string, unknown>;
export type RegistrationDashboard = { csrfToken: string; flows: Row[]; sources: Row[] };

// Reconcile exact records after every attempt, including an ambiguous network failure.
// A matching ID alone must never be treated as approval of the proposed boundary.
export function registrationPlan(packet: RegistrationPacket, dashboard: RegistrationDashboard) {
  if (!dashboard.csrfToken || !Array.isArray(dashboard.flows) || !Array.isArray(dashboard.sources))
    throw Error('The current registration state could not be verified. Refresh and sign in again.');
  const flow = dashboard.flows.find((row) => row.id === packet.flow.id);
  if (flow && Object.entries(packet.flow).some(([key, value]) => flow[key] !== value))
    throw Error('This flow ID already has different details. No records were changed.');
  const pending = packet.sources.filter((source) => {
    const row = dashboard.sources.find((entry) => entry.id === source.id);
    if (!row) return true;
    const expected = {
      id: source.id,
      flow_id: source.flowId,
      title: source.title,
      url: source.url,
      approved_origin: source.approvedOrigin,
      approved_path: source.approvedPath,
      enabled: 1,
    };
    if (Object.entries(expected).some(([key, value]) => row[key] !== value))
      throw Error(
        `Source ${source.id} already has different details or is disabled. No records were changed.`,
      );
    return false;
  });
  if (flow && pending.length && flow.status !== 'under_review')
    throw Error('This flow must be under review before its registration can continue.');
  return [
    ...(!flow ? [{ path: '/admin/v1/flows', body: packet.flow }] : []),
    ...pending.map((body) => ({ path: '/admin/v1/sources', body })),
  ];
}
