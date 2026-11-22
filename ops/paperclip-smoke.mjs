#!/usr/bin/env node
// One bounded fictional task. This requires signed-in owner + qualified guest.
import { readFile, writeFile, chmod, open, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  privateDir = resolve(root, 'private/runtime');
const manifest = JSON.parse(await readFile(resolve(privateDir, 'bootstrap-manifest.json'), 'utf8'));
const cookie = (await readFile(resolve(privateDir, 'owner-cookie.txt'), 'utf8')).trim();
const api = async (method, path, body) => {
  const res = await fetch('http://localhost:3100/api' + path, {
    method,
    headers: { cookie, origin: 'http://localhost:3100', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await res.json();
  if (!res.ok) throw Error(`${method} ${path}: ${res.status} ${result.error ?? ''}`);
  return result;
};
const agent = manifest.agents.find((a) => a.key === 'backend');
const lockPath = resolve(privateDir, 'qualification.lock');
const lock = await open(lockPath, 'wx', 0o600);
await lock.close();
let run;
try {
  const retry = process.argv.includes('--retry')
    ? JSON.parse(await readFile(resolve(privateDir, 'smoke-result.json'), 'utf8'))
    : null;
  if (retry && retry.status !== 'failed')
    throw Error('Retry requires an observed failed qualification run');
  const live = await api('GET', `/companies/${manifest.companyId}/live-runs`);
  if ((Array.isArray(live) ? live : (live.items ?? [])).length)
    throw Error('An active run already exists; qualification cannot overlap');
  const others = await api('GET', `/companies/${manifest.companyId}/agents`);
  if (others.some((a) => a.status !== 'paused'))
    throw Error('All agents must be paused before this isolated qualification');
  const issue = await api('POST', `/companies/${manifest.companyId}/issues`, {
    projectId: manifest.projects.find((p) => p.name === 'platform-delivery').id,
    title: '[Fictional fixture] Isolated Codex runtime qualification',
    status: 'todo',
    priority: 'high',
    assigneeAgentId: agent.id,
    description:
      'This is a fictional infrastructure fixture, not public guidance. Create runtime-smoke.json in the current isolated task workspace with exactly {"fictional":true,"result":"isolated-codex-ready"}. Use a local deterministic command to read and assert both values. Report the observed result and file SHA-256. Do not change any other file, contact external services, create agents, delegate, publish, or run real source-dependent guidance tests. Finish after this one file and check. Task completion does not approve a source, release or merge.',
  });
  await api('PATCH', '/agents/' + agent.id, {
    runtimeConfig: {
      ...agent.runtimeConfig,
      heartbeat: { ...agent.runtimeConfig.heartbeat, wakeOnDemand: true },
    },
    status: 'idle',
  });
  run = await api(
    'POST',
    '/agents/' + agent.id + '/wakeup',
    retry
      ? { failedRunId: retry.id, reason: 'retry_failed_run' }
      : {
          source: 'on_demand',
          triggerDetail: 'manual',
          reason: 'fictional_runtime_qualification',
          forceFreshSession: true,
          idempotencyKey: 'swf-qualification-' + issue.id,
          payload: { issueId: issue.id, taskId: issue.id },
        },
  );
  // Closing ordinary demand admission does not pause/cancel the claimed task.
  await api('PATCH', '/agents/' + agent.id, { runtimeConfig: agent.runtimeConfig });
  await writeFile(
    resolve(privateDir, 'smoke-dispatch.json'),
    JSON.stringify({ agentId: agent.id, issueId: issue.id, run }, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: 'fictional_task_dispatched',
      issueId: issue.id,
      runId: run.id ?? null,
      status: run.status,
    }),
  );
  if (!run.id) throw Error('Manual owner wake was skipped; inspect dispatch report');
  for (let attempt = 0; attempt < 80; attempt++) {
    const status = await api('GET', '/heartbeat-runs/' + run.id);
    if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(status.status)) {
      await writeFile(
        resolve(privateDir, 'smoke-result.json'),
        JSON.stringify(status, null, 2) + '\n',
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          event: 'fictional_task_finished',
          status: status.status,
          runId: run.id,
          errorCode: status.errorCode ?? null,
        }),
      );
      if (status.status !== 'succeeded')
        throw Error('Fictional task did not succeed; inspect private/runtime/smoke-result.json');
      break;
    }
    if (attempt === 79)
      throw Error('Qualification exceeded four minutes; pause stops further admission');
    await new Promise((r) => setTimeout(r, 3000));
  }
} finally {
  await api('PATCH', '/agents/' + agent.id, {
    runtimeConfig: agent.runtimeConfig,
    status: 'paused',
  }).catch(() => {});
  await rm(lockPath, { force: true });
}
