#!/usr/bin/env node
// Pinned API-only bootstrap. The owner signs in normally; never modify PostgreSQL.
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.PAPERCLIP_URL ?? 'http://localhost:3100';
if (!['http://localhost:3100', 'http://127.0.0.1:3100'].includes(base))
  throw Error('Bootstrap is loopback only');
const cookiePath = process.env.PAPERCLIP_OWNER_COOKIE_FILE;
if (!cookiePath)
  throw Error(
    'Set PAPERCLIP_OWNER_COOKIE_FILE to a private file containing the signed-in owner Cookie header',
  );
const cookie = (await readFile(cookiePath, 'utf8')).trim();
if (!cookie || /[\r\n]/.test(cookie)) throw Error('Invalid owner cookie file');
const manifest = JSON.parse(await readFile(resolve(root, 'infra/paperclip/agents.json'), 'utf8'));
const api = async (method, path, body) => {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const file = resolve(root, 'private/runtime/bootstrap-error.json');
    await writeFile(
      file,
      JSON.stringify({ method, path, status: response.status, detail }, null, 2),
    );
    await chmod(file, 0o600);
    throw Error(
      `${method} ${path}: HTTP ${response.status}; inspect private/runtime/bootstrap-error.json`,
    );
  }
  return response.status === 204 ? null : response.json();
};
const rows = (value) => (Array.isArray(value) ? value : (value.items ?? value.results ?? []));
const unique = (all, name) => {
  const matches = rows(all).filter((item) => item.name === name);
  if (matches.length > 1)
    throw Error('Duplicate named resources; owner reconciliation required: ' + name);
  return matches[0];
};
let company = unique(await api('GET', '/companies'), 'SourceWayfinder');
if (!company)
  company = await api('POST', '/companies', {
    name: 'SourceWayfinder',
    description: 'Deterministic official-source guidance; human-approved delivery and maintenance.',
    budgetMonthlyCents: 0,
  });
await api('PATCH', '/companies/' + company.id, { feedbackDataSharingEnabled: false });
const cp = '/companies/' + company.id;
let environment = unique(await api('GET', cp + '/environments'), 'Isolated local Codex');
const privateKey = await readFile(resolve(root, 'private/runtime/agent_ed25519'), 'utf8');
const knownHosts = await readFile(resolve(root, 'private/runtime/known_hosts'), 'utf8');
const environmentConfig = {
  host: 'egress',
  port: 2222,
  username: 'agent',
  remoteWorkspacePath: '/workspaces/sourcewayfinder',
  privateKey,
  knownHosts,
  strictHostKeyChecking: true,
  useHostAuth: true,
};
if (!environment)
  environment = await api('POST', cp + '/environments', {
    name: 'Isolated local Codex',
    driver: 'ssh',
    config: environmentConfig,
  });
// Avoid replacing an existing encrypted secret with a redacted value or rotating keys silently.
const projects = [];
for (const name of ['platform-delivery', 'guidance-maintenance']) {
  let project = unique(await api('GET', cp + '/projects'), name);
  const policy = {
    enabled: true,
    environmentId: environment.id,
    defaultMode: 'isolated_workspace',
    sharedWorkspaceConcurrency: 'serialize',
    allowIssueOverride: false,
    workspaceStrategy: {
      type: 'git_worktree',
      baseRef: 'main',
      worktreeParentDir: '/paperclip/workspaces/tasks',
    },
  };
  if (!project)
    project = await api('POST', cp + '/projects', {
      name,
      status: 'planned',
      environmentId: environment.id,
      workspace: {
        name: 'Sanitized source',
        sourceType: 'local_path',
        cwd: '/paperclip/workspaces/sourcewayfinder',
      },
      executionWorkspacePolicy: policy,
    });
  else {
    await api('PATCH', '/projects/' + project.id, { executionWorkspacePolicy: policy });
    const detail = await api('GET', '/projects/' + project.id);
    const candidates = detail.workspaces.filter(
      (w) =>
        w.cwd === '/paperclip/workspaces/sourcewayfinder' ||
        /^\/paperclip\/workspaces\/sourcewayfinder-revisions\/[0-9a-f]{40}$/.test(w.cwd ?? '') ||
        w.name === 'Sanitized source',
    );
    if (candidates.length > 1) throw Error('Ambiguous sanitized project source');
    const workspace = candidates[0];
    if (!workspace) throw Error('Missing sanitized project workspace; reconcile explicitly');
    await api('PATCH', `/projects/${project.id}/workspaces/${workspace.id}`, {
      sourceType: 'local_path',
      cwd: /^\/paperclip\/workspaces\/sourcewayfinder-revisions\/[0-9a-f]{40}$/.test(
        workspace.cwd ?? '',
      )
        ? workspace.cwd
        : '/paperclip/workspaces/sourcewayfinder',
      remoteWorkspaceRef: null,
    });
  }
  projects.push(project);
}
const permissions = {
  canCreateAgents: false,
  canCreateSkills: false,
  canAssignTasks: false,
  trustPreset: 'standard',
};
const exported = [];
for (const role of manifest.agents) {
  const instructions = await readFile(
    resolve(root, 'infra/paperclip', role.instructionFile),
    'utf8',
  );
  const adapterConfig = {
    engine: 'cli',
    model: role.model,
    modelReasoningEffort: role.effort,
    cwd: '/workspaces/sourcewayfinder',
    fastMode: false,
    search: false,
    dangerouslyBypassApprovalsAndSandbox: false,
    timeoutSec: 1800,
    graceSec: 30,
    extraArgs: [
      '-c',
      'approval_policy="never"',
      '-c',
      'sandbox_mode="workspace-write"',
      '-c',
      'mcp_servers.paperclip-projects.enabled=false',
      '-c',
      'mcp_servers.paperclip-connections.enabled=false',
    ],
    env: {
      PAPERCLIP_API_URL: 'http://egress:8081',
      HTTP_PROXY: 'http://egress:8080',
      HTTPS_PROXY: 'http://egress:8080',
      NO_PROXY: 'egress,localhost,127.0.0.1',
    },
  };
  const runtimeConfig = {
    heartbeat: {
      enabled: false,
      intervalSec: 0,
      wakeOnDemand: false,
      wakeOnAssignment: false,
      maxConcurrentRuns: 1,
    },
  };
  let agent = unique(await api('GET', cp + '/agents'), role.name);
  const input = {
    name: role.name,
    role: role.role,
    title: role.title,
    adapterType: 'codex_local',
    runner: 'legacy',
    adapterConfig,
    runtimeConfig,
    defaultEnvironmentId: environment.id,
    budgetMonthlyCents: 0,
    desiredSkills: [],
  };
  if (!agent) {
    // The owner explicitly authorized these seven roles. Temporarily permit this
    // board-authenticated direct create, then restore the hiring gate even on error.
    await api('PATCH', '/companies/' + company.id, { requireBoardApprovalForNewAgents: false });
    try {
      agent = await api('POST', cp + '/agents', {
        ...input,
        permissions,
        instructionsBundle: { entryFile: 'AGENTS.md', files: { 'AGENTS.md': instructions } },
      });
    } finally {
      await api('PATCH', '/companies/' + company.id, { requireBoardApprovalForNewAgents: true });
    }
  } else {
    const { desiredSkills, ...configuration } = input;
    await api('PATCH', '/agents/' + agent.id, { ...configuration, status: 'paused' });
    await api('PATCH', '/agents/' + agent.id + '/permissions', permissions);
    const current = await api(
      'GET',
      '/agents/' + agent.id + '/instructions-bundle/file?path=AGENTS.md',
    );
    if (current.content !== instructions)
      await api('PUT', '/agents/' + agent.id + '/instructions-bundle/file', {
        path: 'AGENTS.md',
        content: instructions,
        baseRevisionId: current.revisionId ?? null,
        baseHash: current.hash ?? null,
      });
  }
  // Keep every new/reconciled role paused until isolated adapter/auth checks and bridge admission qualify.
  await api('PATCH', '/agents/' + agent.id, { status: 'paused' });
  const saved = await api('GET', '/agents/' + agent.id);
  if (
    saved.adapterType !== 'codex_local' ||
    saved.adapterConfig?.engine !== 'cli' ||
    saved.adapterConfig?.dangerouslyBypassApprovalsAndSandbox !== false
  )
    throw Error('Unsafe adapter readback for ' + role.name);
  for (const flag of ['canCreateAgents', 'canCreateSkills', 'canAssignTasks'])
    if (saved.permissions?.[flag] !== false)
      throw Error('Unsafe permission readback: ' + role.name + ' ' + flag);
  exported.push({
    id: agent.id,
    ...role,
    instructionsHash: createHash('sha256').update(instructions).digest('hex'),
    adapterConfig,
    runtimeConfig,
    permissions,
    status: 'paused',
  });
  console.log('Reconciled ' + role.name + ' (paused)');
}
const milestones = [
  [
    '0. Preserve and qualify',
    'Existing work preserved; sanitized Git baseline and account quota inventory; runtime versions pinned.',
  ],
  [
    '1. Paperclip integration',
    'Isolated signed-in agent completes fictional task; denied access observed; restart, expired login and quota pause recover.',
  ],
  [
    '2. Contracts and vertical slice',
    'Fictional flow works through real API and UI; invalid graphs rejected; production rejects fixtures.',
  ],
  [
    '3. Policy and administration',
    'Human approvals bind hashes; edits invalidate approvals; agent credentials cannot approve.',
  ],
  [
    '4. Verizon flow',
    'Human-approved official source interpretation and expected answers; every branch passes real UI and API.',
  ],
  [
    '5. Maintenance cycle',
    'Simulated source change suspends dependent guidance and creates one deduplicated proposal.',
  ],
  [
    '6. SSA flow',
    'Reviewed SSA flow added as data without evaluator or renderer edits; approved cases pass.',
  ],
  [
    '7. Delivery and recovery',
    'Exact release approved; smoke, suspension-preserving rollback, backup restore, Mac-off and quota tests observed.',
  ],
];
let previous;
const tasks = [];
for (const [title, criteria] of milestones) {
  let issue = rows(await api('GET', cp + '/issues?limit=100')).find(
    (x) => x.title === title && x.projectId === projects[0].id,
  );
  if (!issue)
    issue = await api('POST', cp + '/issues', {
      projectId: projects[0].id,
      title,
      description:
        'Acceptance: ' +
        criteria +
        '\nHuman review gates remain mandatory; do not mark done without evidence.',
      status: 'backlog',
      priority: 'high',
      ...(previous ? { blockedByIssueIds: [previous] } : {}),
    });
  previous = issue.id;
  tasks.push({ id: issue.id, title });
}
const output = {
  version: 1,
  sourceCommit: manifest.paperclipCommit,
  companyId: company.id,
  environmentId: environment.id,
  projects: projects.map(({ id, name }) => ({ id, name })),
  agents: exported,
  tasks,
  qualification: 'pending-auth-and-adapter-tests',
};
const out = resolve(root, 'private/runtime/bootstrap-manifest.json');
await writeFile(out, JSON.stringify(output, null, 2) + '\n');
await chmod(out, 0o600);
console.log('Credential-free configuration manifest saved; all agents remain paused.');
if (process.argv.includes('--test-environments')) {
  const qualified = new Map();
  for (const agent of exported) {
    const combination = agent.model + ':' + agent.effort;
    if (qualified.has(combination)) {
      console.log(agent.name + ': shares qualified ' + qualified.get(combination));
      continue;
    }
    const result = await api('POST', cp + '/adapters/codex_local/test-environment', {
      runner: 'legacy',
      agentId: agent.id,
      environmentId: environment.id,
      adapterConfig: agent.adapterConfig,
    });
    const file = resolve(root, `private/runtime/adapter-${agent.key}.json`);
    await writeFile(file, JSON.stringify(result, null, 2) + '\n');
    await chmod(file, 0o600);
    console.log(agent.name + ': ' + result.status);
    if (result.status !== 'pass')
      throw Error(
        'Adapter qualification incomplete; warnings, including missing authentication, block agent activation',
      );
    qualified.set(combination, agent.name);
  }
}
