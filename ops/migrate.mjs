import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const stage = process.argv[2] || 'local';
if (stage !== 'staging')
  throw Error(
    'This command applies staging migrations only. Production belongs to the approved publisher.',
  );
for (const component of ['control', 'api', 'survey']) {
  const config = `infra/cloudflare/${stage}-${component}.json`,
    data = JSON.parse(readFileSync(config, 'utf8'));
  for (const db of data.d1_databases) {
    const r = spawnSync(
      'node_modules/.bin/wrangler',
      ['d1', 'migrations', 'apply', db.binding, '--remote', '--config', config],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) process.exit(r.status || 1);
  }
}
