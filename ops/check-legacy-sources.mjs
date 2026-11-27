// Preserve the historical availability monitor; this does not approve or update rules.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../legacy/phone-loss-recovery/', import.meta.url));
const result = spawnSync(process.execPath, ['scripts/check-sources.mjs'], {
  cwd,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
