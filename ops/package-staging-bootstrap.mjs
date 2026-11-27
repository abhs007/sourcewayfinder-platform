// Credential-free packaging. This program never reads private/ or deploys anything.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, lstat, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyPackage } from './staging-bootstrap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(
  root,
  'test-results/staging-bootstrap',
  new Date().toISOString().replaceAll(':', '-'),
);
await mkdir(output, { recursive: true, mode: 0o700 });
const paths = [
  'ops/staging-bootstrap.mjs',
  'ops/staging-access-capture.mjs',
  'ops/staging-service-provision.mjs',
  'ops/staging-evidence.mts',
  'ops/staging-candidate.mjs',
  'ops/authorized-tests.mjs',
  'ops/submit-staging-candidate.command',
  'ops/collector.mts',
  'packages/core/source-policy.ts',
  'ops/upload-staging-evidence.command',
  'domains/sources.json',
  'domains/verizon-sim-protection/source-register.json',
  'domains/verizon-sim-protection/collection-baseline.v4.json',
  'domains/verizon-sim-protection/interpretation.proposed.json',
  'ops/provision-staging-services.command',
  'ops/capture-staging-access.command',
  'ops/validate-assets.mjs',
  'package-lock.json',
  'infra/cloudflare/staging-account.json',
  'docs/STAGING_BOOTSTRAP.md',
  ...['control', 'api', 'survey', 'web'].flatMap((c) => [
    `infra/cloudflare/staging-${c}.json`,
    `dist/workers/${c}.mjs`,
  ]),
];
async function collect(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) paths.push(path);
    else throw Error(`Refusing special file: ${path}`);
  }
}
for (const dir of [
  'dist/web',
  'dist/admin',
  'workers/control/migrations',
  'workers/control/evidence-migrations',
  'workers/api/migrations',
  'workers/survey/migrations',
])
  await collect(dir);
for (const path of paths) {
  if (!(await lstat(resolve(root, path))).isFile()) throw Error('Regular files required');
  await mkdir(dirname(resolve(output, path)), { recursive: true });
  await copyFile(resolve(root, path), resolve(output, path));
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
delete pkg.scripts;
await writeFile(resolve(output, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
paths.push('package.json');
if (process.argv.includes('--candidate-packet')) {
  await mkdir(resolve(output, 'packets'));
  await copyFile(
    resolve(root, 'test-results/staging-candidate/packet.json'),
    resolve(output, 'packets/verizon-candidate.json'),
  );
  paths.push('packets/verizon-candidate.json');
}
const files = [];
for (const path of paths.sort())
  files.push({
    path,
    sha256: createHash('sha256')
      .update(await readFile(resolve(output, path)))
      .digest('hex'),
  });
await writeFile(
  resolve(output, 'bootstrap-manifest.json'),
  JSON.stringify(
    {
      version: 1,
      createdAt: new Date().toISOString(),
      purpose: 'Protected staging operator package; deployment bootstrap remains empty-only',
      agentWorkspaceRoots: [
        '/Users/abhishekvaishnav/EB2-NIW',
        '/Users/abhishekvaishnav/.codex/visualizations/2026/11/19/01a1f22f-0739-7602-8902-632c0f34ea4a',
      ],
      files,
    },
    null,
    2,
  ) + '\n',
);
await verifyPackage(output, { requireOperator: false });
const archive = `${output}.tar.gz`;
const result = spawnSync('tar', ['-czf', archive, '-C', output, '.'], { stdio: 'inherit' });
if (result.status !== 0) throw Error('Packaging failed');
const sha256 = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(`${archive}.sha256`, `${sha256}  ${archive}\n`);
const ownerArchive = resolve(root, 'test-results/staging-bootstrap/owner-bootstrap.tar.gz');
await copyFile(archive, ownerArchive);
await writeFile(`${ownerArchive}.sha256`, `${sha256}  ${ownerArchive}\n`);
console.log(JSON.stringify({ archive, sha256, files: files.length }, null, 2));
