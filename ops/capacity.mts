import { writeFile, mkdir } from 'node:fs/promises';
const origin = new URL(process.argv[2] || 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', 'staging.sourcewayfinder.org'].includes(origin.hostname))
  throw Error('Capacity testing is restricted to local or staging targets');
if (origin.hostname === 'staging.sourcewayfinder.org' && !process.env.CAPACITY_FREE_QUOTA_VERIFIED)
  throw Error('Verify account free quota headroom before bounded staging load');
const samples: { duration: number; status: number }[] = [];
let outstanding = 0;
async function phase(rate: number, seconds: number) {
  const count = rate * seconds,
    start = performance.now();
  for (let i = 0; i < count; i++) {
    const delay = start + (i * 1000) / rate - performance.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    outstanding++;
    const began = performance.now();
    void fetch(new URL('/api/v1/domains', origin), {
      headers: process.env.CF_ACCESS_CLIENT_ID
        ? {
            'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
            'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
          }
        : {},
      signal: AbortSignal.timeout(5000),
    })
      .then(async (r) => {
        await r.arrayBuffer();
        samples.push({ duration: performance.now() - began, status: r.status });
      })
      .catch(() => samples.push({ duration: performance.now() - began, status: 0 }))
      .finally(() => outstanding--);
    if (outstanding > 200) throw Error('Bounded outstanding request ceiling hit');
  }
  while (outstanding) await new Promise((r) => setTimeout(r, 100));
}
await phase(20, 300);
await phase(100, 5);
const sorted = samples.map((x) => x.duration).sort((a, b) => a - b);
const report = {
  at: new Date().toISOString(),
  target: origin.origin,
  workload: 'flow discovery only; session/answer load remains separately required',
  requests: samples.length,
  p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  errors: samples.filter((x) => x.status !== 200).length,
  warning: 'Local wall-clock latency does not prove hosted CPU/D1 quotas or production capacity.',
};
await mkdir('test-results', { recursive: true });
await writeFile('test-results/capacity.json', JSON.stringify(report, null, 2));
console.log(report);
