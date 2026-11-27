// Run inside controller via its tsx loader. No provider calls or real auth data.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp = await mkdtemp(join(tmpdir(), 'swf-auth-gate-'));
process.env.PAPERCLIP_HOME = join(temp, 'paperclip');
process.env.CODEX_HOME = join(temp, 'empty-auth');
delete process.env.OPENAI_API_KEY;
await mkdir(process.env.CODEX_HOME);
const { resolveExecutionRunAdapterConfig } =
  await import('/app/server/src/services/heartbeat/run-preparation.ts');
const companyId = 'fictional-company',
  agentId = 'fictional-agent';
const managedHome = join(
  process.env.PAPERCLIP_HOME,
  'instances/default/companies',
  companyId,
  'agents',
  agentId,
  'codex-home',
);
const config = { command: 'codex', env: { CODEX_HOME: managedHome, OPENAI_API_KEY: '' } };
const base = {
  companyId,
  agentId,
  adapterType: 'codex_local',
  executionRunConfig: config,
  projectEnv: null,
  secretsSvc: {
    resolveAdapterConfigForRuntime: async () => ({ config, secretKeys: new Set(), manifest: [] }),
    resolveEnvBindings: async () => ({ env: {}, secretKeys: new Set(), manifest: [] }),
    collectMissingRuntimeBindings: async () => [],
  },
};
try {
  await resolveExecutionRunAdapterConfig({
    ...base,
    environmentDriver: 'ssh',
    environmentUseHostAuth: true,
  });
  for (const options of [
    { environmentDriver: 'ssh', environmentUseHostAuth: false },
    { environmentDriver: 'ssh' },
    { environmentDriver: 'local', environmentUseHostAuth: true },
    {},
  ]) {
    await assert.rejects(
      resolveExecutionRunAdapterConfig({ ...base, ...options }),
      (error) =>
        error.code === 'configuration_incomplete' && error.message.includes('no Codex credentials'),
    );
  }
  console.log(
    JSON.stringify({
      sshGuestAuthDefersToRemoteAdapter: true,
      missingControllerCredentialsRejectedForOtherModes: 4,
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
