// One wake reconciles due deterministic work once. Never calls an LLM itself.
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname),
  path = resolve(root, 'private/scheduler.json');
if ((await stat(path)).mode & 0o077) throw Error('Scheduler config must be mode600');
const config = JSON.parse(await readFile(path, 'utf8'));
if (!config.enabled) process.exit(0);
await mkdir(resolve(root, 'private/logs'), { recursive: true });
let state = { lastBackup: 0, lastCollector: 0 };
try {
  state = JSON.parse(await readFile(resolve(root, 'private/scheduler-state.json'), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const allowed = ['collect', 'bridge', 'backup', 'monitor'];
async function run(name, args, env = {}) {
  if (!allowed.includes(name)) throw Error('Unknown job');
  const logs = resolve(root, `private/logs/${name}.log`);
  try {
    if ((await stat(logs)).size > 5 * 1024 * 1024) {
      await rename(logs, logs + '.1');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const { open } = await import('node:fs/promises');
  const file = await open(logs, 'a', 0o600);
  try {
    const status = await new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        env: { ...process.env, ...env },
        stdio: ['ignore', file.fd, file.fd],
      });
      const timer = setTimeout(() => child.kill('SIGTERM'), 1800000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(1);
      });
    });
    return status === 0;
  } finally {
    await file.close();
  }
}
const now = Date.now();
if (config.monitorConfig)
  await run('monitor', ['--import', 'tsx', 'ops/monitor.mts', config.monitorConfig]);
if (config.collectorConfig && now - state.lastCollector > 3600000) {
  if (
    await run('collect', ['--import', 'tsx', 'ops/collector.mts', '--browser'], {
      SWF_COLLECTOR_CONFIG: config.collectorConfig,
    })
  )
    state.lastCollector = now;
}
if (config.bridgeConfig)
  await run('bridge', ['--import', 'tsx', 'ops/bridge.mts', config.bridgeConfig, '--once']);
if (config.backupConfig && now - state.lastBackup > 86400000) {
  if (
    await run('backup', ['ops/backup.mjs', 'create', '--upload', '--config', config.backupConfig])
  )
    state.lastBackup = now;
}
await writeFile(resolve(root, 'private/scheduler-state.json.tmp'), JSON.stringify(state), {
  mode: 0o600,
});
await rename(
  resolve(root, 'private/scheduler-state.json.tmp'),
  resolve(root, 'private/scheduler-state.json'),
);
