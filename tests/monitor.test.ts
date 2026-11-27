import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assess,
  evaluateMetrics,
  admissionAllowed,
  redact,
  cloudflareMetrics,
  directoryBytes,
  fetchCloudflare,
  DEFAULT_LIMITS,
  USAGE_QUERY,
  type Metric,
} from '../ops/monitor.mts';
const now = Date.parse('2026-11-22T12:00:00Z');
const metric = (used: number | null, extra: Partial<Metric> = {}): Metric => ({
  id: 'workers.requests',
  used,
  limit: 100,
  observedAt: new Date(now).toISOString(),
  required: true,
  period: 'utc_day',
  source: 'provider_api',
  ...extra,
});
describe('deterministic budget admission', () => {
  it('warns at60%, restricts at80%, stops at100%', () => {
    expect(assess(metric(59), now).level).toBe('ok');
    expect(assess(metric(60), now).level).toBe('warning');
    expect(assess(metric(80), now).level).toBe('restricted');
    expect(assess(metric(100), now).level).toBe('exhausted');
    expect(evaluateMetrics([metric(80)], now).nonessentialWorkAllowed).toBe(false);
  });
  it('fails closed on missing, invalid, stale, future and wrong UTC-day measurements', () => {
    for (const m of [
      metric(null),
      metric(NaN),
      metric(-1),
      metric(1, { limit: 0 }),
      metric(1, { observedAt: new Date(now - 16 * 60000).toISOString() }),
      metric(1, { observedAt: new Date(now + 1000).toISOString() }),
      metric(1, { observedAt: '2026-11-21T23:59:59Z' }),
    ]) {
      expect(assess(m, now).level).toBe('unknown');
      expect(evaluateMetrics([m], now).nonessentialWorkAllowed).toBe(false);
    }
  });
  it('expires admission and recomputes it rather than trusting a boolean', () => {
    const report = evaluateMetrics([metric(10)], now);
    expect(admissionAllowed(report, now)).toBe(true);
    expect(admissionAllowed(report, now + 16 * 60000)).toBe(false);
    expect(admissionAllowed({ ...report, metrics: [metric(90)] }, now)).toBe(false);
    expect(admissionAllowed({ ...report, metrics: [] }, now)).toBe(false);
  });
  it('includes other projects and each evidence database in account-wide totals', () => {
    const metrics = cloudflareMetrics({
      observedAt: new Date(now).toISOString(),
      account: {
        workers: [
          { sum: { requests: 100 }, quantiles: { cpuTimeP99: 1000 } },
          { sum: { requests: 200 }, quantiles: { cpuTimeP99: 9000 } },
        ],
        d1: [{ sum: { rowsRead: 500, rowsWritten: 12 } }],
      },
      databases: [
        { uuid: 'one', name: 'another-project', file_size: 1000 },
        { uuid: 'two', name: 'sourcewayfinder-production-evidence', file_size: 350 * 1024 * 1024 },
      ],
    });
    expect(metrics.find((m) => m.id === 'workers.requests')?.used).toBe(300);
    expect(metrics.find((m) => m.id === 'workers.cpu_p99_us')?.used).toBe(9000);
    expect(metrics.find((m) => m.id === 'd1.account_storage')?.used).toBe(350 * 1024 * 1024 + 1000);
    expect(
      assess(
        metrics.find((m) => m.id === 'evidence.database.two')!,
        now,
      ).level,
    ).toBe('exhausted');
    expect(USAGE_QUERY).not.toMatch(/scriptName\s*:/);
    expect(USAGE_QUERY).not.toMatch(/databaseId\s*:/);
  });
  it('never calls unknown database storage zero', () => {
    const metrics = cloudflareMetrics({
      observedAt: new Date(now).toISOString(),
      account: { workers: [], d1: [] },
      databases: [{ uuid: 'unknown', file_size: null }],
    });
    expect(metrics.find((m) => m.id === 'd1.account_storage')?.used).toBeNull();
  });
  it('rejects partial GraphQL errors even with some metric data', async () => {
    const fake = async () =>
      new Response(
        JSON.stringify({
          data: { viewer: { accounts: [{}] } },
          errors: [{ message: 'Denied dataset' }],
        }),
      );
    await expect(
      fetchCloudflare(
        {
          accountId: 'a'.repeat(32),
          apiToken: 'test-only',
          backupDirectory: '/unused',
          stateFile: '/unused',
        },
        new Date(now),
        fake as typeof fetch,
      ),
    ).rejects.toThrow('METRICS_GRAPHQL_REJECTED');
  });
  it('redacts nested credentials and public-answer payload fields', () => {
    const raw = {
      authorization: 'Bearer private',
      nested: {
        accessClientSecret: 'secret',
        answers: ['private'],
        surveyResponse: 'private',
        message: 'Bearer hidden 123-45-6789',
      },
      safe: 'request-identifier',
    };
    const output = JSON.stringify(redact(raw));
    expect(output).not.toContain('private');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('hidden');
    expect(output).not.toContain('123-45-6789');
    expect(output).toContain('request-identifier');
  });
  it('measures backup bytes and refuses a symlink outside the archive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'swf-monitor-'));
    try {
      await writeFile(join(dir, 'backup'), '12345');
      expect(await directoryBytes(dir)).toBe(5);
      await symlink('/etc/hosts', join(dir, 'escape'));
      await expect(directoryBytes(dir)).rejects.toThrow('BACKUP_SYMLINK_REJECTED');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('keeps evidence and backup ceilings aligned to enforced byte budgets', () => {
    expect(DEFAULT_LIMITS.evidenceBytes).toBe(367001600);
    expect(DEFAULT_LIMITS.backupBytes).toBe(2147483648);
  });
});

it('retains observed billing units and rejects ambiguous supplemental readings', async () => {
  const { supplementalReadings } = await import('../ops/monitor.mts');
  const stamp = new Date().toISOString();
  const base = {
    observedAt: stamp,
    required: true,
    period: 'month' as const,
    source: 'provider_api',
  };
  const one = supplementalReadings(
    [{ ...base, id: 'ci.compute_usd', used: 0.02, limit: 12 }],
    stamp,
    100,
  );
  expect(one.find((m) => m.id === 'ci.compute_usd')?.used).toBe(0.02);
  const ambiguous = supplementalReadings(
    [
      { ...base, id: 'ci.compute_usd', used: 0.02, limit: 12 },
      { ...base, id: 'ci.minutes', used: 10, limit: 2000 },
    ],
    stamp,
    100,
  );
  expect(ambiguous.find((m) => m.id === 'ci.compute_usd')?.used).toBeNull();
});
