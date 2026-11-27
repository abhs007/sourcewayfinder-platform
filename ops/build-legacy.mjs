// Rebuild preserved applications locally; never promote or deploy the outputs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const original = fileURLToPath(new URL('../legacy/phone-loss-recovery/', import.meta.url));
for (const script of ['scripts/build.mjs', 'sourcewayfinder/cloudflare/build.mjs']) {
  const result = spawnSync(process.execPath, [script], { cwd: original, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
