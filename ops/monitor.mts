import { readFile, writeFile, rename, mkdir, lstat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const DEFAULT_LIMITS = {
  workerRequests: 100000,
  workerCpuP99Us: 10000,
  d1RowsRead: 5000000,
  d1RowsWritten: 100000,
  d1DatabaseBytes: 500 * 1024 * 1024,
  d1AccountBytes: 5 * 1024 ** 3,
  evidenceBytes: 350 * 1024 * 1024,
  backupBytes: 2 * 1024 ** 3,
};
export type Metric = {
  id: string;
  used: number | null;
  limit: number | null;
  observedAt: string;
  required: boolean;
  period: 'utc_day' | 'current' | 'month';
  source: string;
};
export type Level = 'ok' | 'warning' | 'restricted' | 'exhausted' | 'unknown';
export type Assessment = {
  id: string;
  level: Level;
  used: number | null;
  limit: number | null;
  fraction: number | null;
  reason: string;
};
export type MonitorReport = {
  version: 1;
  observedAt: string;
  expiresAt: string;
  runId: string;
  metrics: Metric[];
  assessments: Assessment[];
  nonessentialWorkAllowed: boolean;
  publicGuidanceBudgetKnown: boolean;
  warnings: string[];
};
export type Config = {
  accountId: string;
  apiToken?: string;
  wranglerCredentialFile?: string;
  backupDirectory: string;
  stateFile: string;
  evidenceDatabaseIds?: string[];
  supplementalMetricsFile?: string;
  externalUptimeStatusFile?: string;
  limits?: Partial<typeof DEFAULT_LIMITS>;
};
const CF = 'https://api.cloudflare.com/client/v4';
export const USAGE_QUERY = `query AccountUsage($accountTag:string!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){
 workers:workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){dimensions{scriptName} sum{requests errors cpuTimeUs} quantiles{cpuTimeP99}}
 d1:d1AnalyticsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{rowsRead rowsWritten}}
 storage:d1StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){dimensions{databaseId} max{databaseSizeBytes}}
}}}`;
export function assess(metric: Metric, now = Date.now(), maxAgeMs = 15 * 60000): Assessment {
  const stamp = Date.parse(metric.observedAt),
    day = new Date(now).toISOString().slice(0, 10);
  const invalid =
    typeof metric.used !== 'number' ||
    !Number.isFinite(metric.used) ||
    metric.used < 0 ||
    typeof metric.limit !== 'number' ||
    !Number.isFinite(metric.limit) ||
    metric.limit <= 0 ||
    !Number.isFinite(stamp) ||
    stamp > now ||
    now - stamp > maxAgeMs ||
    (metric.period === 'utc_day' && metric.observedAt.slice(0, 10) !== day);
  if (invalid)
    return {
      id: metric.id,
      level: 'unknown',
      used: metric.used,
      limit: metric.limit,
      fraction: null,
      reason: 'Missing, stale, invalid, or wrong-window telemetry',
    };
  const fraction = metric.used! / metric.limit!,
    level: Level =
      fraction >= 1
        ? 'exhausted'
        : fraction >= 0.8
          ? 'restricted'
          : fraction >= 0.6
            ? 'warning'
            : 'ok';
  return {
    id: metric.id,
    level,
    used: metric.used,
    limit: metric.limit,
    fraction,
    reason:
      level === 'ok'
        ? 'Within observed allowance'
        : level === 'warning'
          ? 'At least 60% of allowance'
          : level === 'restricted'
            ? 'At least 80%; pause nonessential work'
            : 'Allowance reached; require operator action',
  };
}
export function evaluateMetrics(
  metrics: Metric[],
  now = Date.now(),
  runId: string = randomUUID(),
): MonitorReport {
  const assessments = metrics.map((m) => assess(m, now));
  const blocked = assessments.some(
    (a, i) => metrics[i]!.required && ['unknown', 'restricted', 'exhausted'].includes(a.level),
  );
  const hosted = assessments.filter((a) => /^(workers\.|d1\.|evidence\.)/.test(a.id));
  return {
    version: 1,
    observedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60000).toISOString(),
    runId,
    metrics,
    assessments,
    nonessentialWorkAllowed: metrics.length > 0 && !blocked,
    publicGuidanceBudgetKnown:
      hosted.length > 0 && hosted.every((a) => !['unknown', 'exhausted'].includes(a.level)),
    warnings: assessments.filter((a) => a.level !== 'ok').map((a) => `${a.id}:${a.level}`),
  };
}
export function admissionAllowed(report: unknown, now = Date.now()): boolean {
  if (!report || typeof report !== 'object') return false;
  const r = report as MonitorReport;
  return (
    r.version === 1 &&
    r.nonessentialWorkAllowed === true &&
    Array.isArray(r.metrics) &&
    r.metrics.length > 0 &&
    Number.isFinite(Date.parse(r.expiresAt)) &&
    Date.parse(r.expiresAt) > now &&
    Date.parse(r.observedAt) <= now &&
    evaluateMetrics(r.metrics, now, r.runId).nonessentialWorkAllowed
  );
}
export async function readAdmission(path: string, now = Date.now()) {
  try {
    return admissionAllowed(JSON.parse(await readFile(path, 'utf8')), now);
  } catch {
    return false;
  }
}
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /token|cookie|authorization|secret|password|ssn|account.?number|answer|survey/i.test(key)
          ? '[REDACTED]'
          : redact(v),
      ]),
    );
  if (typeof value === 'string')
    return value
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED]');
  return value;
}
async function privateJson(path: string) {
  const st = await lstat(path);
  if (
    !st.isFile() ||
    (st.mode & 0o777) !== 0o600 ||
    (process.getuid && st.uid !== process.getuid())
  )
    throw Error('PRIVATE_CONFIG_PERMISSIONS');
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw Error('PRIVATE_CONFIG_INVALID');
  }
}
async function credentials(config: Config): Promise<string> {
  if (typeof config.apiToken === 'string' && config.apiToken) return config.apiToken;
  if (!config.wranglerCredentialFile) throw Error('MONITOR_CREDENTIALS_MISSING');
  const st = await lstat(config.wranglerCredentialFile);
  if (!st.isFile() || st.mode & 0o077 || (process.getuid && st.uid !== process.getuid()))
    throw Error('CREDENTIAL_FILE_PERMISSIONS');
  const text = await readFile(config.wranglerCredentialFile, 'utf8'),
    token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  if (!token) throw Error('MONITOR_CREDENTIALS_MISSING');
  return token;
}
async function boundedJson(response: Response) {
  if (!response.ok) throw Error(`CLOUDFLARE_HTTP_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw Error('METRICS_EMPTY_BODY');
  let bytes = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.length;
    if (bytes > 2 * 1024 * 1024) {
      await reader.cancel();
      throw Error('METRICS_RESPONSE_TOO_LARGE');
    }
    parts.push(next.value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw Error('METRICS_INVALID_JSON');
  }
}
export async function fetchCloudflare(
  config: Config,
  now = new Date(),
  fetcher: typeof fetch = fetch,
) {
  if (!/^[a-f0-9]{32}$/.test(config.accountId)) throw Error('ACCOUNT_ID_INVALID');
  const token = await credentials(config),
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const gql = await boundedJson(
    await fetcher(`${CF}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: USAGE_QUERY,
        variables: {
          accountTag: config.accountId,
          start: start.toISOString(),
          end: now.toISOString(),
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    }),
  );
  if (gql.errors?.length) throw Error('METRICS_GRAPHQL_REJECTED');
  const accounts = gql.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) throw Error('METRICS_ACCOUNT_MISSING');
  const account = accounts[0];
  for (const key of ['workers', 'd1', 'storage'])
    if (!Array.isArray(account[key]) || account[key].length >= 1000)
      throw Error('METRICS_INCOMPLETE');
  const databases: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = await boundedJson(
      await fetcher(`${CF}/accounts/${config.accountId}/d1/database?per_page=100&page=${page}`, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      }),
    );
    if (data.success !== true || !Array.isArray(data.result))
      throw Error('DATABASE_INVENTORY_MISSING');
    databases.push(...data.result);
    if (data.result_info?.total_pages && page < data.result_info.total_pages) continue;
    if (data.result.length < 100 || data.result_info?.total_pages === page) break;
    if (page === 100) throw Error('DATABASE_INVENTORY_INCOMPLETE');
  }
  return { account, databases, observedAt: now.toISOString() };
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function cloudflareMetrics(
  raw: { account: any; databases: any[]; observedAt: string },
  limits = DEFAULT_LIMITS,
  evidenceIds: string[] = [],
): Metric[] {
  const { account, databases, observedAt } = raw;
  const metric = (
    id: string,
    used: number | null,
    limit: number,
    period: Metric['period'] = 'utc_day',
    source = 'cloudflare_graphql_account_aggregate',
  ): Metric => ({ id, used, limit, observedAt, period, source, required: true });
  const sum = (rows: any[], key: string) =>
    rows.every((r) => finite(r.sum?.[key])) ? rows.reduce((n, r) => n + r.sum[key], 0) : null;
  const workers = Array.isArray(account.workers) ? account.workers : [],
    d1 = Array.isArray(account.d1) ? account.d1 : [];
  const cpu =
    workers.length && workers.every((r: any) => finite(r.quantiles?.cpuTimeP99))
      ? Math.max(...workers.map((r: any) => r.quantiles.cpuTimeP99))
      : workers.length === 0
        ? 0
        : null;
  const metrics = [
    metric(
      'workers.requests',
      Array.isArray(account.workers) ? sum(workers, 'requests') : null,
      limits.workerRequests,
    ),
    metric('workers.cpu_p99_us', cpu, limits.workerCpuP99Us),
    metric(
      'd1.rows_read',
      Array.isArray(account.d1) ? sum(d1, 'rowsRead') : null,
      limits.d1RowsRead,
    ),
    metric(
      'd1.rows_written',
      Array.isArray(account.d1) ? sum(d1, 'rowsWritten') : null,
      limits.d1RowsWritten,
    ),
  ];
  let accountBytes = 0,
    allStorageKnown = true;
  for (const db of databases) {
    const value = finite(db.file_size) ? db.file_size : null;
    if (value === null) allStorageKnown = false;
    else accountBytes += value;
    const suffix = String(db.uuid ?? 'unknown');
    metrics.push(
      metric(
        `d1.database.${suffix}`,
        value,
        limits.d1DatabaseBytes,
        'current',
        'cloudflare_d1_inventory',
      ),
    );
    if (evidenceIds.includes(suffix) || String(db.name).includes('-evidence'))
      metrics.push(
        metric(
          `evidence.database.${suffix}`,
          value,
          limits.evidenceBytes,
          'current',
          'cloudflare_d1_inventory',
        ),
      );
  }
  metrics.push(
    metric(
      'd1.account_storage',
      allStorageKnown ? accountBytes : null,
      limits.d1AccountBytes,
      'current',
      'cloudflare_d1_inventory',
    ),
  );
  return metrics;
}
export async function directoryBytes(directory: string): Promise<number> {
  let total = 0;
  const walk = async (path: string) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isSymbolicLink()) throw Error('BACKUP_SYMLINK_REJECTED');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) total += (await lstat(full)).size;
      else throw Error('BACKUP_SPECIAL_FILE_REJECTED');
    }
  };
  await walk(directory);
  return total;
}
const SUPPLEMENTAL_GROUPS = [
  ['logging.ingested_bytes', 'logging.events'],
  ['ci.compute_usd', 'ci.minutes'],
  ['drive.account_bytes'],
  ['drive.backup_bytes'],
];
export function supplementalReadings(
  readings: Metric[],
  stamp: string,
  backupLimit: number,
): Metric[] {
  return SUPPLEMENTAL_GROUPS.map((ids) => {
    const matches = readings.filter((m) => ids.includes(m.id));
    const m = matches.length === 1 ? matches[0] : undefined;
    const id = ids[0]!;
    return m && ['provider_api', 'owner_verified'].includes(m.source)
      ? { ...m, required: true }
      : {
          id,
          used: null,
          limit: id === 'drive.backup_bytes' ? backupLimit : null,
          observedAt: stamp,
          required: true,
          period: id.startsWith('logging.')
            ? 'utc_day'
            : id.startsWith('ci.')
              ? 'month'
              : 'current',
          source: 'not_connected',
        };
  });
}
export async function runMonitor(config: Config, now = Date.now()): Promise<MonitorReport> {
  const stamp = new Date(now).toISOString(),
    limits = { ...DEFAULT_LIMITS, ...config.limits };
  let metrics: Metric[];
  const warnings: string[] = [];
  try {
    metrics = cloudflareMetrics(
      await fetchCloudflare(config, new Date(now)),
      limits,
      config.evidenceDatabaseIds,
    );
  } catch (error) {
    warnings.push(safeCode(error));
    metrics = [
      'workers.requests',
      'workers.cpu_p99_us',
      'd1.rows_read',
      'd1.rows_written',
      'd1.account_storage',
    ].map((id) => ({
      id,
      used: null,
      limit: null,
      observedAt: stamp,
      required: true,
      period: 'utc_day',
      source: 'provider_unavailable',
    }));
  }
  let backupBytes: number | null = null;
  try {
    backupBytes = await directoryBytes(config.backupDirectory);
  } catch {
    warnings.push('BACKUP_INVENTORY_UNAVAILABLE');
  }
  metrics.push({
    id: 'backup.local_bytes',
    used: backupBytes,
    limit: limits.backupBytes,
    observedAt: stamp,
    required: true,
    period: 'current',
    source: 'local_filesystem',
  });
  let supplemental: Metric[] = [];
  if (config.supplementalMetricsFile) {
    try {
      const data = await privateJson(config.supplementalMetricsFile);
      if (Array.isArray(data.metrics)) supplemental = data.metrics;
    } catch {
      warnings.push('SUPPLEMENTAL_TELEMETRY_UNAVAILABLE');
    }
  }
  metrics.push(...supplementalReadings(supplemental, stamp, limits.backupBytes));
  const report = evaluateMetrics(metrics, now);
  report.warnings.push(
    ...warnings,
    'CLOUDFLARE_ANALYTICS_IS_DELAYED_AND_NOT_AN_EXACT_BILLING_METER',
  );
  let externalHealthy = false;
  if (config.externalUptimeStatusFile) {
    try {
      const status = await privateJson(config.externalUptimeStatusFile);
      externalHealthy =
        status.providerOutsideCloudflare === true &&
        status.plan === 'free' &&
        Array.isArray(status.monitors) &&
        status.monitors.length >= 2 &&
        status.monitors.every(
          (m: any) =>
            m.state === 'active' &&
            m.healthy === true &&
            Number.isFinite(Date.parse(m.checkedAt)) &&
            now - Date.parse(m.checkedAt) <= 10 * 60000 &&
            Date.parse(m.checkedAt) <= now,
        );
    } catch {}
  }
  if (!externalHealthy) report.warnings.push('EXTERNAL_UPTIME_NOT_VERIFIED');
  return report;
}
function safeCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z_0-9]+$/.test(message) ? message : 'MONITOR_FAILED';
}
export async function main() {
  const path = process.argv[2];
  if (!path) throw Error('MONITOR_CONFIG_REQUIRED');
  const config = (await privateJson(path)) as Config;
  const report = await runMonitor(config);
  const target = resolve(config.stateFile);
  await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
  await writeFile(`${target}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 });
  await rename(`${target}.tmp`, target);
  console.log(
    JSON.stringify(
      redact({
        service: 'quota-monitor',
        requestId: report.runId,
        traceId: report.runId,
        runId: report.runId,
        environment: 'local-controller',
        observedAt: report.observedAt,
        nonessentialWorkAllowed: report.nonessentialWorkAllowed,
        publicGuidanceBudgetKnown: report.publicGuidanceBudgetKnown,
        assessments: report.assessments,
        warnings: report.warnings,
      }),
    ),
  );
  if (!report.nonessentialWorkAllowed) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(JSON.stringify({ service: 'quota-monitor', code: safeCode(error) }));
    process.exitCode = 1;
  });
