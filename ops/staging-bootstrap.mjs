// Copy with the reviewed bootstrap package to an owner-controlled operator directory.
// Never run --deploy from the candidate checkout or another agent workspace.
import { createHash, randomBytes } from 'node:crypto';
import { readFile, realpath, lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateAssetRedirects } from './validate-assets.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const components = ['control', 'api', 'survey', 'web'];
const within = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export async function verifyPackage(root, { requireOperator = true } = {}) {
  root = await realpath(root);
  const manifest = JSON.parse(await readFile(resolve(root, 'bootstrap-manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw Error('Invalid manifest');
  if (requireOperator) {
    for (const forbidden of manifest.agentWorkspaceRoots) {
      if (within(await realpath(forbidden), root))
        throw Error('Use an operator directory outside agent workspaces');
    }
    if (((await lstat(root)).mode & 0o077) !== 0)
      throw Error('Operator directory must have mode 0700');
  }
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (!within(root, path) || file.path === 'bootstrap-manifest.json')
      throw Error('Invalid manifest path');
    if (!(await lstat(path)).isFile() || (await realpath(path)) !== path)
      throw Error(`Unsafe file: ${file.path}`);
    if (hash(await readFile(path)) !== file.sha256) throw Error(`Package changed: ${file.path}`);
  }
  const account = JSON.parse(
    await readFile(resolve(root, 'infra/cloudflare/staging-account.json'), 'utf8'),
  );
  /** @type {Record<string, any>} */
  const configs = {};
  for (const component of components) {
    const config = JSON.parse(
      await readFile(resolve(root, `infra/cloudflare/staging-${component}.json`), 'utf8'),
    );
    const expectedHost =
      component === 'control' ? 'admin-staging.sourcewayfinder.org' : 'staging.sourcewayfinder.org';
    if (
      config.name !== `sourcewayfinder-staging-${component}` ||
      config.account_id !== account.accountId ||
      config.vars?.ENVIRONMENT !== 'staging' ||
      config.workers_dev !== false ||
      config.preview_urls !== false ||
      config.build ||
      config.env ||
      config.main !== `../../dist/workers/${component}.mjs`
    )
      throw Error('Unsafe staging configuration');
    if (['control', 'web'].includes(component)) {
      if (
        config.routes?.length !== 1 ||
        config.routes[0].pattern !== expectedHost ||
        config.routes[0].custom_domain !== true ||
        config.assets?.run_worker_first !== true ||
        config.vars.ACCESS_TEAM_DOMAIN !== account.staging.accessTeamDomain ||
        config.vars.ADMIN_EMAIL !== account.adminEmail ||
        config.vars.ACCESS_AUD !==
          account.staging[component === 'control' ? 'adminAud' : 'stagingAud']
      )
        throw Error('Host protection mismatch');
    } else if (config.routes?.length || config.route)
      throw Error('Internal Worker must have no public route');
    for (const db of config.d1_databases || []) {
      const key = db.database_name?.replace('sourcewayfinder-staging-', '');
      if (account.staging.databases[key] !== db.database_id) throw Error('Unexpected database');
    }
    for (const binding of config.services || []) {
      if (!components.some((name) => binding.service === `sourcewayfinder-staging-${name}`))
        throw Error('Unexpected service');
    }
    configs[component] = config;
  }
  await validateAssetRedirects(root);
  return { root, manifest, account, configs };
}

export function bootstrapPlan(mode) {
  if (mode === '--deploy') return { migrate: true, controlSecret: true, components };
  if (mode === '--resume-web') return { migrate: false, controlSecret: false, components: ['web'] };
  if (mode === '--update-admin')
    return { migrate: false, controlSecret: false, components: ['control'] };
  throw Error('Unsupported bootstrap mode');
}

export function deploymentArgs(component, plan, secretsPath) {
  if (!plan.components.includes(component)) throw Error('Component outside deployment plan');
  return [
    'deploy',
    '--no-bundle',
    '--config',
    `infra/cloudflare/staging-${component}.json`,
    ...(component === 'control' && plan.controlSecret ? ['--secrets-file', secretsPath] : []),
  ];
}

async function deploy(verified, mode) {
  const { root, account, configs } = verified;
  const plan = bootstrapPlan(mode);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw Error('Supply the dedicated Cloudflare API token in the operator terminal');
  async function query(sql) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/d1/database/${account.staging.databases.control}/query`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      },
    );
    if (!response.ok)
      throw Error(
        `Staging database preflight failed (${response.status}); no deployment attempted`,
      );
    const data = await response.json();
    if (!data.success || data.result?.[0]?.success !== true)
      throw Error('Staging database preflight failed');
    return data.result[0].results;
  }
  // Inspect only control-table names/counts; never read survey or evidence content.
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table'");
  for (const name of ['flows', 'proposals', 'approvals', 'releases', 'bundles']) {
    if (!tables.some((row) => row.name === name)) continue;
    const rows = await query(`SELECT COUNT(*) AS count FROM ${name}`);
    if (rows[0]?.count !== 0)
      throw Error(
        'Staging already contains policy/content records; use the reviewed release process',
      );
  }
  if (mode === '--resume-web' || mode === '--update-admin') {
    for (const component of mode === '--update-admin' ? components : ['control', 'api', 'survey']) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/workers/scripts/${configs[component].name}/deployments`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok)
        throw Error(
          `Cannot verify existing staging ${component} deployment (${response.status}); update stopped`,
        );
      const data = await response.json();
      if (!data.success || !data.result?.deployments?.length)
        throw Error(`No existing staging ${component} deployment; update stopped`);
    }
  }
  const env = {
    ...process.env,
    WRANGLER_SEND_METRICS: 'false',
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
  };
  function wrangler(args) {
    const result = spawnSync(
      process.execPath,
      [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), ...args],
      { cwd: root, env, stdio: 'inherit' },
    );
    if (result.status !== 0)
      throw Error('Wrangler stopped; retain its error and do not bypass the failed step');
  }
  for (const component of plan.migrate ? components : []) {
    for (const db of configs[component].d1_databases || []) {
      wrangler([
        'd1',
        'migrations',
        'apply',
        db.binding,
        '--remote',
        '--config',
        `infra/cloudflare/staging-${component}.json`,
      ]);
    }
  }
  const secretsPath = resolve(root, 'secrets/control-bootstrap.json');
  if (plan.controlSecret) {
    await mkdir(resolve(root, 'secrets'), { mode: 0o700, recursive: true });
    // Only a CSRF key is created here. Automation identities remain disabled.
    try {
      await writeFile(
        secretsPath,
        JSON.stringify({ CSRF_SECRET: randomBytes(48).toString('base64url') }),
        { flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (
        !(await lstat(secretsPath)).isFile() ||
        (await realpath(secretsPath)) !== secretsPath ||
        ((await lstat(secretsPath)).mode & 0o077) !== 0
      )
        throw Error('Unsafe operator secret file');
    }
  }
  for (const component of plan.components) {
    wrangler(deploymentArgs(component, plan, secretsPath));
  }
  await writeFile(
    resolve(root, `bootstrap-receipt-${new Date().toISOString().replaceAll(':', '-')}.json`),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        manifestSha256: hash(await readFile(resolve(root, 'bootstrap-manifest.json'))),
        environment: 'staging',
        mode,
        workers: plan.components.map((c) => configs[c].name),
        contentApproved: false,
        hostedValidationPassed: false,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Bootstrap completed. Google/MFA sign-in, policy approvals, and hosted journeys still require validation.',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    if (!['--verify', '--deploy', '--resume-web', '--update-admin'].includes(process.argv[2]))
      throw Error(
        'Usage: node ops/staging-bootstrap.mjs --verify|--deploy|--resume-web|--update-admin',
      );
    const verified = await verifyPackage(root);
    console.log(`Verified ${verified.manifest.files.length} package files and staging targets.`);
    if (process.argv[2] !== '--verify') await deploy(verified, process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
