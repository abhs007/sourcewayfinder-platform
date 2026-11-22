import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const checks = [];
const add = (name, ok, detail) => checks.push({ name, status: ok ? 'pass' : 'blocked', detail });
add('Node runtime', Number(process.versions.node.split('.')[0]) >= 24, process.versions.node);
for (const file of [
  'package-lock.json',
  'packages/core/generated-validator.cjs',
  'dist/workers/api.mjs',
  'dist/workers/control.mjs',
  'private/baseline/manifest.json',
])
  add(file, existsSync(file), 'Required local artifact');
try {
  const r = await fetch('http://localhost:3100/api/health', { signal: AbortSignal.timeout(3000) });
  const h = await r.json();
  add('Paperclip authenticated', r.ok && h.deploymentMode === 'authenticated', h);
} catch {
  add('Paperclip authenticated', false, 'Start local runtime');
}
const gh = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
add(
  'GitHub authentication',
  gh.status === 0,
  gh.status === 0 ? 'Authenticated' : 'Complete gh auth login',
);
const cfg = existsSync('private/cloudflare.json')
  ? JSON.parse(readFileSync('private/cloudflare.json', 'utf8'))
  : {};
add(
  'Cloudflare Access',
  Boolean(cfg.staging?.adminAud && cfg.staging?.stagingAud),
  'Both admin and staging audiences must be verified',
);
for (const [name, file] of [
  ['Local Codex qualification', 'private/runtime/qualification-report.json'],
  ['Synthetic PostgreSQL restore', 'private/runtime/restore-drill-report.json'],
  ['Release verification', 'private/release-verification.json'],
]) {
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {}
  const ok =
    name === 'Local Codex qualification'
      ? report?.modelRunQualified === true
      : report?.passed === true;
  add(name, ok, 'Observed scoped report required; this is not full production recovery approval');
}
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      checks,
      productionReady: false,
      notice:
        'Doctor is an inventory, not a substitute for human gates and observed acceptance tests.',
    },
    null,
    2,
  ),
);
if (checks.some((x) => x.status === 'blocked')) process.exitCode = 1;
