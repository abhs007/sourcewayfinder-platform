import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { digest, validateBundle } from '../../packages/core/index.ts';

/** Test-only runtime. It accepts no real bundles, credentials, approvals, or deployment targets. */
export async function startFictionalRuntime(options: {
  port: number;
  origin: string;
  localFixtureOnly: true;
}) {
  if (options.localFixtureOnly !== true || !/^http:\/\/127\.0\.0\.1:\d+$/.test(options.origin))
    throw Error('EXPLICIT_LOCAL_FIXTURE_REQUIRED');
  const fixture = validateBundle(
    JSON.parse(await readFile('tests/fixtures/fictional-flow.json', 'utf8')),
  );
  if (fixture.usage !== 'test_fixture') throw Error('ONLY_FICTIONAL_FIXTURE_ALLOWED');
  const hash = await digest(fixture),
    now = new Date(Date.now() - 1000).toISOString();
  await mkdir('private/dev/integration', { recursive: true });
  await Promise.all(
    ['api', 'control'].map((name) =>
      build({
        entryPoints: [`workers/${name}/index.ts`],
        outfile: `private/dev/integration/${name}.mjs`,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        external: ['cloudflare:workers'],
      }),
    ),
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: '127.0.0.1',
      port: options.port,
      workers: [
        {
          name: 'fictional-api',
          modules: true,
          scriptPath: 'private/dev/integration/api.mjs',
          compatibilityDate: '2026-11-21',
          bindings: { ENVIRONMENT: 'local-fixture', PUBLIC_ORIGIN: options.origin },
          d1Databases: { SESSIONS_DB: 'fictional-sessions' },
          serviceBindings: {
            CONTENT: { name: 'fictional-control', entrypoint: 'PublishedContent' },
          },
        },
        {
          name: 'fictional-control',
          modules: true,
          scriptPath: 'private/dev/integration/control.mjs',
          compatibilityDate: '2026-11-21',
          bindings: { ENVIRONMENT: 'local-fixture' },
          d1Databases: { CONTROL_DB: 'fictional-control', EVIDENCE_DB: 'fictional-evidence' },
        },
      ],
    }),
  );
  try {
    const sessions = await mf.getD1Database('SESSIONS_DB', 'fictional-api'),
      control = await mf.getD1Database('CONTROL_DB', 'fictional-control'),
      evidence = await mf.getD1Database('EVIDENCE_DB', 'fictional-control');
    const migrate = async (db: typeof control, file: string) => {
      let sql = '';
      for (const line of (await readFile(file, 'utf8')).split('\n')) {
        if (line.trim().startsWith('--')) continue;
        sql += line + ' ';
        if (line.trim().endsWith(';')) {
          await db.prepare(sql.trim()).run();
          sql = '';
        }
      }
    };
    for (const [db, folder] of [
      [sessions, 'workers/api/migrations'],
      [control, 'workers/control/migrations'],
      [evidence, 'workers/control/evidence-migrations'],
    ] as const)
      for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort())
        await migrate(db, `${folder}/${file}`);
    // These rows are synthetic test setup, not human approval events; this database is ephemeral.
    await control
      .prepare(
        'INSERT INTO flows(id,title,scope,official_url,status,status_epoch,bundle_hash,last_successful_check_at,release_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        fixture.flowId,
        'Fictional test procedure',
        fixture.scope,
        'https://example.org/fictional-guide',
        'active',
        1,
        hash,
        now,
        'fictional-release',
        now,
        now,
      )
      .run();
    await control
      .prepare('INSERT INTO bundles(hash,flow_id,payload,usage,created_at) VALUES(?,?,?,?,?)')
      .bind(hash, fixture.flowId, JSON.stringify(fixture), 'test_fixture', now)
      .run();
    await control
      .prepare(
        'INSERT INTO proposals(id,flow_id,digest,manifest,interpretation,uncertainties,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        'fictional-proposal',
        fixture.flowId,
        hash,
        '{}',
        'Fictional setup only',
        '[]',
        'fixture_only',
        now,
        now,
      )
      .run();
    await control
      .prepare(
        'INSERT INTO releases(id,proposal_id,flow_id,digest,manifest,bundle_hash,expected_status_epoch,environment,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        'fictional-release',
        'fictional-proposal',
        fixture.flowId,
        hash,
        '{}',
        hash,
        1,
        'local-fixture',
        'active',
        now,
      )
      .run();
    await mf.ready;
    return { mf, sessions, control, evidence, fixture, hash };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
