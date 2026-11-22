import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('dist/workers', { recursive: true });
for (const service of ['web', 'api', 'control', 'survey']) {
  await build({
    entryPoints: [`workers/${service}/index.${service === 'survey' ? 'js' : 'ts'}`],
    outfile: `dist/workers/${service}.mjs`,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers'],
    minify: true,
    sourcemap: 'external',
    legalComments: 'external',
  });
}
const artifacts = {};
for (const service of ['web', 'api', 'control', 'survey'])
  artifacts[service] = createHash('sha256')
    .update(await readFile(`dist/workers/${service}.mjs`))
    .digest('hex');
await writeFile('dist/worker-artifacts.json', JSON.stringify(artifacts, null, 2) + '\n');
