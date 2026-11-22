/** Local fictional integration capacity evidence. No production or real source-dependent cases. */
import { startFictionalRuntime } from '../tests/e2e/fictional-runtime.mts';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:8795';
const { mf, sessions } = await startFictionalRuntime({
  port: 8795,
  origin,
  localFixtureOnly: true,
});
const samples: {
  phase: string;
  method: string;
  status: number;
  duration: number;
  valid: boolean;
}[] = [];
const pending = new Set<Promise<void>>();
async function request(
  phase: string,
  path: string,
  method: string,
  expected: number,
  body?: unknown,
  token?: string,
) {
  const start = performance.now();
  let status = 0,
    value: any;
  try {
    const response = await fetch(origin + path, {
      method,
      headers: {
        origin,
        'content-type': 'application/json',
        ...(token
          ? { authorization: `Bearer ${token}`, 'idempotency-key': crypto.randomUUID() }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    status = response.status;
    value = await response.json();
  } catch {}
  samples.push({
    phase,
    method,
    status,
    duration: performance.now() - start,
    valid: status === expected,
  });
  return value;
}
async function journey(phase: string, index: number) {
  const created = await request(phase, '/api/v1/sessions', 'POST', 201, {
    flowId: 'fictional-token-review',
    locale: 'en',
  });
  if (!created?.token || !created.sessionId) return;
  try {
    const answer = await request(
      phase,
      `/api/v1/sessions/${created.sessionId}/answers`,
      'POST',
      200,
      {
        questionId: 'has-confirmation',
        choiceId: ['yes', 'no', 'unknown'][index % 3],
        sequence: 0,
      },
      created.token,
    );
    if (answer?.step?.type !== 'outcome') samples[samples.length - 1]!.valid = false;
  } finally {
    await request(
      phase,
      `/api/v1/sessions/${created.sessionId}`,
      'DELETE',
      200,
      undefined,
      created.token,
    );
  }
}
async function phase(name: string, rate: number, seconds: number) {
  // Each scheduled journey performs exactly three requests when successful.
  const count = Math.floor((rate * seconds) / 3),
    start = performance.now();
  for (let i = 0; i < count; i++) {
    const delay = start + (i * 3000) / rate - performance.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    if (pending.size >= 70) throw Error('OUTSTANDING_JOURNEY_LIMIT');
    const job = journey(name, i);
    pending.add(job);
    void job.finally(() => pending.delete(job));
  }
  await Promise.all(pending);
}
try {
  await phase('baseline', 20, 300);
  await phase('burst', 100, 5);
  const report = {
    at: new Date().toISOString(),
    target: origin,
    workload:
      'fictional session creation, all three answer choices, deletion; actual API, PublishedContent and local D1',
    phases: ['baseline', 'burst'].map((phase) => {
      const rows = samples.filter((s) => s.phase === phase),
        times = rows.map((s) => s.duration).sort((a, b) => a - b);
      return {
        phase,
        requests: rows.length,
        errors: rows.filter((r) => !r.valid).length,
        p95Ms: times[Math.floor(times.length * 0.95)],
      };
    }),
    remainingSessions: (
      await sessions.prepare('SELECT COUNT(*) AS total FROM sessions').first<{ total: number }>()
    )?.total,
    limitations:
      'Local latency only. Hosted CPU, D1 billing, regional latency, Access overhead and production rate limits remain unqualified.',
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/capacity-sessions.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (report.phases.some((p) => p.errors)) process.exitCode = 1;
} finally {
  await mf.dispose();
}
