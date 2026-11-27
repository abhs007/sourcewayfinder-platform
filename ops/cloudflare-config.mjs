// Generates separate deployment files only after real account/database/Access identifiers exist.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw Error('Usage: node ops/cloudflare-config.mjs private/cloudflare.json');
const input = JSON.parse(await readFile(path, 'utf8'));
if (input.workersPlan !== 'free' || input.d1DatabaseCount > 10)
  throw Error('Verified free plan and <=10 total D1 databases required');
const id = /^[a-f0-9-]{36}$/;
const account = /^[a-f0-9]{32}$/;
if (!account.test(input.accountId)) throw Error('Account ID required');
for (const stage of ['staging', 'production']) {
  const e = input[stage];
  if (!e) continue;
  for (const key of ['control', 'evidence', 'sessions', 'survey'])
    if (!id.test(e.databases?.[key])) throw Error(`Missing ${stage} ${key} database`);
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(e.accessTeamDomain) ||
    !e.adminAud ||
    !e.stagingAud
  )
    throw Error('Access policies must be configured before generating deployment');
  const base = {
    account_id: input.accountId,
    compatibility_date: '2026-11-21',
    workers_dev: false,
    preview_urls: false,
    observability: { enabled: true, head_sampling_rate: 0.1 },
  };
  const origin =
    stage === 'production' ? 'https://sourcewayfinder.org' : 'https://staging.sourcewayfinder.org';
  const admin =
    stage === 'production'
      ? 'https://admin.sourcewayfinder.org'
      : 'https://admin-staging.sourcewayfinder.org';
  const prefix = `sourcewayfinder-${stage}`;
  const db = (name, binding, dir) => ({
    binding,
    database_name: `${prefix}-${name}`,
    database_id: e.databases[name],
    migrations_dir: `../../workers/${dir}`,
  });
  const vars = {
    ENVIRONMENT: stage,
    ACCESS_TEAM_DOMAIN: e.accessTeamDomain,
    ACCESS_AUD: e.adminAud,
    ADMIN_EMAIL: input.adminEmail,
    ADMIN_ORIGIN: admin,
  };
  const configs = {
    control: {
      ...base,
      name: `${prefix}-control`,
      main: '../../dist/workers/control.mjs',
      vars,
      assets: { directory: '../../dist/admin', binding: 'ASSETS', run_worker_first: true },
      routes: [{ pattern: new URL(admin).host, custom_domain: true }],
      d1_databases: [
        db('control', 'CONTROL_DB', 'control/migrations'),
        db('evidence', 'EVIDENCE_DB', 'control/evidence-migrations'),
      ],
      triggers: { crons: stage === 'production' ? ['*/15 * * * *'] : [] },
    },
    api: {
      ...base,
      name: `${prefix}-api`,
      main: '../../dist/workers/api.mjs',
      vars: { ENVIRONMENT: stage, PUBLIC_ORIGIN: origin },
      services: [
        { binding: 'CONTENT', service: `${prefix}-control`, entrypoint: 'PublishedContent' },
      ],
      d1_databases: [db('sessions', 'SESSIONS_DB', 'api/migrations')],
      ratelimits: [
        {
          name: 'GUIDANCE_LIMITER',
          namespace_id: stage === 'production' ? '7391122' : '7391123',
          simple: { limit: 60, period: 60 },
        },
      ],
      triggers: { crons: stage === 'production' ? ['*/30 * * * *'] : [] },
    },
    survey: {
      ...base,
      name: `${prefix}-survey`,
      main: '../../dist/workers/survey.mjs',
      vars: { ENVIRONMENT: stage },
      d1_databases: [db('survey', 'DB', 'survey/migrations')],
      ratelimits: [
        {
          name: 'SURVEY_LIMITER',
          namespace_id: stage === 'production' ? '7391121' : '7391124',
          simple: { limit: 6, period: 60 },
        },
      ],
      triggers: { crons: stage === 'production' ? ['15 4 * * *'] : [] },
      observability: { enabled: true, head_sampling_rate: 0.1 },
    },
    web: {
      ...base,
      name: stage === 'production' ? 'sourcewayfinder' : `${prefix}-web`,
      main: '../../dist/workers/web.mjs',
      vars: {
        ...vars,
        ACCESS_AUD: e.stagingAud,
        STAGING_CHECK_CLIENT_ID: e.stagingCheckClientId ?? '',
      },
      assets: {
        directory: '../../dist/web',
        binding: 'ASSETS',
        html_handling: 'auto-trailing-slash',
        not_found_handling: 'single-page-application',
        // The Worker authenticates staging and redirects the production www host.
        run_worker_first: true,
      },
      services: [
        { binding: 'GUIDANCE', service: `${prefix}-api` },
        { binding: 'SURVEY', service: `${prefix}-survey` },
      ],
      routes: [
        { pattern: new URL(origin).host, custom_domain: true },
        ...(stage === 'production'
          ? [{ pattern: 'www.sourcewayfinder.org', custom_domain: true }]
          : []),
      ],
    },
  };
  await mkdir(`infra/cloudflare`, { recursive: true });
  for (const [name, c] of Object.entries(configs))
    await writeFile(`infra/cloudflare/${stage}-${name}.json`, JSON.stringify(c, null, 2) + '\n');
}
