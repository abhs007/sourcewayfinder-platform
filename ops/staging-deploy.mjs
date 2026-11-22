import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const c = JSON.parse(await readFile('private/cloudflare.json', 'utf8'));
if (c.workersPlan !== 'free' || !c.staging?.adminAud || !c.staging?.stagingAud)
  throw Error(
    'Verified free plan and full-host Access policies required before staging deployment.',
  );
if (!process.env.CLOUDFLARE_API_TOKEN)
  throw Error(
    'Use the dedicated staging identity. Owner OAuth and production credentials are not admitted by unattended staging.',
  );
for (const component of ['control', 'api', 'survey', 'web']) {
  const config = `infra/cloudflare/staging-${component}.json`;
  const parsed = JSON.parse(await readFile(config, 'utf8'));
  if (
    !parsed.name.startsWith('sourcewayfinder-staging-') ||
    parsed.workers_dev !== false ||
    parsed.preview_urls !== false
  )
    throw Error('Unsafe staging target');
  const r = spawnSync('node_modules/.bin/wrangler', ['deploy', '--config', config], {
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('Staging deployed; Access denial and authenticated smoke checks still required.');
