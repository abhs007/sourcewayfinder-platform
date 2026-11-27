/** Trusted operator entrypoint. Copy reviewed code outside every agent checkout. */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, realpath, stat, readdir, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
export const canonical = (value) =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
          .join(',')}}`;
export const sha = (value) => createHash('sha256').update(value).digest('hex');
const within = (root, path) => {
  const r = relative(root, path);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};
/** @param {string} executable @param {string[]} args @param {{cwd?:string,env?:Record<string,string|undefined>,timeout?:number}} options */
export async function runFixed(executable, args, { cwd, env = {}, timeout = 1800000 } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(executable, args, {
      cwd,
      env: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      fail(Error('Fixed command timed out.'));
    }, timeout);
    p.stdout.on('data', (b) => {
      stdout += b;
      if (stdout.length > 8e6) p.kill('SIGKILL');
    });
    p.stderr.on('data', (b) => {
      stderr += b;
      if (stderr.length > 8e6) p.kill('SIGKILL');
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    p.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = Object.assign(
          Error(`Fixed command failed (${code}). Diagnostic hash: ${sha(stderr)}`),
          { diagnostic: stderr },
        );
        fail(error);
      } else ok(stdout);
    });
  });
}
export async function secret(path, trustedRoot) {
  const actual = await realpath(path),
    info = await stat(actual);
  if (!within(trustedRoot, actual) || (info.mode & 0o077) !== 0 || !info.isFile())
    throw Error('Secrets must be private files inside the trusted operator directory.');
  return (await readFile(actual, 'utf8')).trim();
}
export async function loadOperator(path, script = fileURLToPath(import.meta.url)) {
  if (!path || !isAbsolute(path))
    throw Error('An absolute operator configuration path is required.');
  const configPath = await realpath(path),
    config = JSON.parse(await readFile(configPath, 'utf8'));
  const trustedRoot = await realpath(config.trustedRoot),
    candidateRoot = await realpath(config.candidateRoot);
  if (
    !within(trustedRoot, configPath) ||
    !within(trustedRoot, await realpath(script)) ||
    within(candidateRoot, trustedRoot) ||
    within(trustedRoot, candidateRoot)
  )
    throw Error('Run reviewed tooling/config outside the candidate checkout.');
  if ((await stat(configPath)).mode & 0o077)
    throw Error('Operator configuration must have mode 0600.');
  if (!['staging', 'production'].includes(config.environment))
    throw Error('Explicit staging or production environment required.');
  const origin = new URL(config.policyOrigin);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Exact HTTPS policy origin required.');
  return { ...config, trustedRoot, candidateRoot, policyOrigin: origin.origin };
}
export async function policyRequest(config, credential, path, body) {
  if (!path.startsWith('/internal/v1/')) throw Error('Internal policy route required.');
  const token = await secret(credential, config.trustedRoot),
    headers = { Authorization: `Bearer ${token}` };
  if (config.accessClientIdFile && config.accessClientSecretFile) {
    headers['CF-Access-Client-Id'] = await secret(config.accessClientIdFile, config.trustedRoot);
    headers['CF-Access-Client-Secret'] = await secret(
      config.accessClientSecretFile,
      config.trustedRoot,
    );
  }
  const response = await fetch(config.policyOrigin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok) throw Error(`Policy refused request: ${value.error?.code || response.status}`);
  return value;
}
export async function hashFiles(root, paths) {
  const files = [];
  for (const path of [...paths].sort()) {
    const absolute = await realpath(join(root, path));
    if (!within(root, absolute) || (await stat(absolute)).isFile() === false)
      throw Error('Only files inside the approved tree may be hashed.');
    files.push({ path, sha256: sha(await readFile(absolute)) });
  }
  return sha(canonical({ files }));
}
async function walk(root, dir = '') {
  const files = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error('Artifact symlinks are forbidden.');
    if (entry.isDirectory()) files.push(...(await walk(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
export async function hashDirectory(root) {
  const absolute = await realpath(root);
  return hashFiles(absolute, await walk(absolute));
}
export async function inspectCandidate(root) {
  const git = (args) =>
    runFixed(
      '/usr/bin/git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.attributesfile=/dev/null',
        '-c',
        'protocol.allow=never',
        ...args,
      ],
      {
        cwd: root,
        env: {
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_ATTR_NOSYSTEM: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_NO_LAZY_FETCH: '1',
          GIT_ALLOW_PROTOCOL: '',
        },
      },
    );
  if (
    (await realpath((await git(['rev-parse', '--show-toplevel'])).trim())) !==
    (await realpath(root))
  )
    throw Error('Candidate Git root differs from the reviewed checkout.');
  if ((await git(['ls-files', '--others', '--exclude-standard', '-z'])).length)
    throw Error('Untracked files must be excluded from the candidate before review.');
  const candidateCommit = (await git(['rev-parse', 'HEAD'])).trim(),
    objectFormat = (await git(['rev-parse', '--show-object-format'])).trim();
  if (!['sha1', 'sha256'].includes(objectFormat)) throw Error('Unsupported Git object format.');
  const indexed = (await git(['ls-files', '--stage', '-z'])).split('\0').filter(Boolean),
    tree = (await git(['ls-tree', '-rz', '--full-tree', 'HEAD'])).split('\0').filter(Boolean),
    head = new Map();
  for (const item of tree) {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(item);
    if (!match) throw Error('Submodules and symlinks are not accepted in a trusted candidate.');
    head.set(match[3], `${match[1]}:${match[2]}`);
  }
  const paths = [];
  for (const item of indexed) {
    const match = /^(100644|100755) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(item);
    if (!match || head.get(match[3]) !== `${match[1]}:${match[2]}`)
      throw Error('Candidate index differs from its committed tree.');
    const path = match[3],
      absolute = await realpath(join(root, path));
    if (!within(await realpath(root), absolute))
      throw Error('Candidate file escapes the checkout.');
    const bytes = await readFile(absolute),
      oid = createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (oid !== match[2]) throw Error('Candidate file differs from its committed bytes.');
    paths.push(path);
  }
  if (paths.length !== head.size) throw Error('Candidate index omits committed files.');
  const codeHash = await hashFiles(root, paths),
    migrationHash = await hashFiles(
      root,
      paths.filter((p) => /^workers\/[^/]+\/(?:evidence-)?migrations\/.*\.sql$/.test(p)),
    ),
    workerArtifacts = /** @type {Record<string,string>} */ ({});
  for (const name of ['web', 'api', 'control', 'survey'])
    workerArtifacts[name] = sha(await readFile(join(root, `dist/workers/${name}.mjs`)));
  const webAssetsHash = await hashDirectory(join(root, 'dist/web')),
    adminAssetsHash = await hashDirectory(join(root, 'dist/admin')),
    apiMigrationHash = await hashDirectory(join(root, 'workers/api/migrations'));
  return {
    candidateCommit,
    codeHash,
    migrationHash,
    workerArtifacts,
    webAssetsHash,
    adminAssetsHash,
    apiMigrationHash,
  };
}

async function inside() {
  const require = createRequire('/runner/package.json');
  const packet = JSON.parse(await readFile('/packet/input.json', 'utf8')),
    { Miniflare, convertV4MiniflareOptions } = await import(require.resolve('miniflare')),
    { chromium } = require('playwright'),
    { createServer } = await import('node:http');
  const { bundle, flow, candidateManifest, expectedManifest } = packet,
    origin = 'http://127.0.0.1:8080';
  if (sha(canonical(bundle)) !== candidateManifest.bundleHash)
    throw Error('Bundle digest mismatch.');
  if (
    !Array.isArray(expectedManifest.cases) ||
    !expectedManifest.cases.length ||
    expectedManifest.cases.length > 1000
  )
    throw Error('Approved cases are required.');
  const content = `import {WorkerEntrypoint} from 'cloudflare:workers';const b=${JSON.stringify(bundle)},f=${JSON.stringify(flow)};export class Content extends WorkerEntrypoint {async listFlows(){return [await this.getFlow(f.id)]}async getFlow(id){return id===f.id?{...f,status:'active',bundleHash:${JSON.stringify(candidateManifest.bundleHash)},statusEpoch:1,lastSuccessfulCheckAt:${JSON.stringify(new Date(Date.now() - 1000).toISOString())}}:null}async getBundle(hash){return hash===${JSON.stringify(candidateManifest.bundleHash)}?b:null}async getSources(ids){return b.sources.filter(s=>ids.includes(s.id))}}export default{fetch(){return new Response('Private authorized test authority')}};`;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'api',
          modules: true,
          scriptPath: '/candidate/dist/workers/api.mjs',
          compatibilityDate: '2026-11-21',
          bindings: { ENVIRONMENT: 'authorized-test', PUBLIC_ORIGIN: origin },
          d1Databases: ['SESSIONS_DB'],
          serviceBindings: { CONTENT: { name: 'content', entrypoint: 'Content' } },
        },
        { name: 'content', modules: true, script: content, compatibilityDate: '2026-11-21' },
      ],
    }),
  );
  const db = await mf.getD1Database('SESSIONS_DB', 'api');
  for (const migration of (await readdir('/candidate/workers/api/migrations'))
    .filter((p) => p.endsWith('.sql'))
    .sort())
    for (const sql of (await readFile(`/candidate/workers/api/migrations/${migration}`, 'utf8'))
      .split(';')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', origin);
      if (url.pathname.startsWith('/api/v1/')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const response = await mf.dispatchFetch(url.href, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const path = resolve(
        '/candidate/dist/web',
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (!within('/candidate/dist/web', path)) throw Error('Path rejected');
      const bytes = await readFile(path);
      const mime = path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : path.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(bytes);
    } catch {
      res.writeHead(503);
      res.end('Test service unavailable');
    }
  });
  await new Promise((ok) => server.listen(8080, '127.0.0.1', ok));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const checks = [],
    covered = new Set();
  try {
    for (const test of expectedManifest.cases) {
      if (
        !/^[a-z][a-z0-9_-]{0,63}$/.test(test.id) ||
        !Array.isArray(test.answers) ||
        !test.expectedOutcome
      )
        throw Error('Expected cases require id, answers and the exact expectedOutcome.');
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      let passed = false;
      try {
        await page.goto(origin);
        await page.getByRole('button', { name: flow.title, exact: true }).click();
        let final;
        for (const answer of test.answers) {
          const question = bundle.questions.find((q) => q.id === answer.questionId),
            choice = question?.choices.find((c) => c.id === answer.choiceId);
          if (!choice) throw Error('Approved case references an unknown choice.');
          await page.getByRole('heading', { name: question.prompt, exact: true }).waitFor();
          await page.getByRole('radio', { name: choice.label, exact: true }).check();
          const pending = page.waitForResponse(
            (r) => r.url().includes('/answers') && r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          const response = await pending;
          if (response.status() !== 200)
            throw Error('Real guidance API did not accept the approved case.');
          final = await response.json();
          covered.add(`${answer.questionId}:${answer.choiceId}`);
        }
        if (
          final?.step.type !== 'outcome' ||
          canonical(final.step.outcome) !== canonical(test.expectedOutcome)
        )
          throw Error('API outcome differs from human-approved expected outcome.');
        await page
          .getByRole('heading', { name: test.expectedOutcome.title, exact: true })
          .waitFor();
        await page.getByText(test.expectedOutcome.nextStep, { exact: true }).waitFor();
        for (const id of test.expectedOutcome.sourceRefs) {
          const source = bundle.sources.find((s) => s.id === id);
          if (
            !source ||
            (await page.locator(`a[href=${JSON.stringify(source.url)}]`).count()) === 0
          )
            throw Error('Expected source is not visible.');
        }
        passed = true;
      } catch (error) {
        await writeFile(
          `/results/${test.id}-error.json`,
          JSON.stringify({ message: error instanceof Error ? error.message : 'Case failed' }),
        );
        await page.screenshot({ path: `/results/${test.id}.png`, fullPage: true });
        await context.tracing.stop({ path: `/results/${test.id}.zip` });
      } finally {
        await context.close();
      }
      checks.push({ name: `approved-ui-api:${test.id}`, passed });
    }
    checks.push({
      name: 'every-rule-branch-covered',
      passed: bundle.transitions.every((t) => covered.has(`${t.questionId}:${t.choiceId}`)),
    });
    await writeFile(
      '/results/result.json',
      JSON.stringify({ passed: checks.every((c) => c.passed), checks }) + '\n',
    );
  } finally {
    await browser.close();
    await mf.dispose();
    await new Promise((ok) => server.close(ok));
  }
}
/** Copy only runtime artifacts into Docker volumes; no Mac home/workspace mounts. */
export async function runIsolated(config, input, results, approvedArtifacts) {
  const name = `swf-test-${randomUUID()}`,
    seed = `${name}-seed`,
    volumes = ['candidate', 'packet', 'script', 'results'].map((kind) => `${name}-${kind}`);
  const docker = (args, timeout = 300000) =>
    runFixed(config.dockerPath, ['--context', 'colima-sourcewayfinder', ...args], {
      cwd: config.trustedRoot,
      env: { HOME: process.env.HOME },
      timeout,
    });
  const snapshot = await mkdtemp(join(dirname(input), 'snapshot-'));
  await mkdir(join(snapshot, 'dist/workers'), { recursive: true });
  await mkdir(join(snapshot, 'workers/api'), { recursive: true });
  const fs = await import('node:fs/promises');
  await fs.copyFile(
    join(config.candidateRoot, 'dist/workers/api.mjs'),
    join(snapshot, 'dist/workers/api.mjs'),
  );
  await fs.cp(join(config.candidateRoot, 'dist/web'), join(snapshot, 'dist/web'), {
    recursive: true,
    dereference: false,
  });
  await fs.cp(
    join(config.candidateRoot, 'workers/api/migrations'),
    join(snapshot, 'workers/api/migrations'),
    { recursive: true, dereference: false },
  );
  if (
    approvedArtifacts &&
    (sha(await readFile(join(snapshot, 'dist/workers/api.mjs'))) !==
      approvedArtifacts.workerArtifacts.api ||
      (await hashDirectory(join(snapshot, 'dist/web'))) !== approvedArtifacts.webAssetsHash ||
      (await hashDirectory(join(snapshot, 'workers/api/migrations'))) !==
        approvedArtifacts.apiMigrationHash)
  )
    throw Error('Isolated snapshot differs from approved artifacts.');
  try {
    for (const volume of volumes) await docker(['volume', 'create', volume]);
    await docker([
      'create',
      '--name',
      seed,
      '--network',
      'none',
      '--mount',
      `type=volume,src=${volumes[0]},dst=/candidate`,
      '--mount',
      `type=volume,src=${volumes[1]},dst=/packet`,
      '--mount',
      `type=volume,src=${volumes[2]},dst=/runner-code`,
      config.testImage,
      'node',
      '--version',
    ]);
    await docker(['cp', snapshot + '/.', `${seed}:/candidate`]);
    await docker(['cp', input, `${seed}:/packet/input.json`]);
    await docker([
      'cp',
      fileURLToPath(import.meta.url),
      `${seed}:/runner-code/authorized-tests.mjs`,
    ]);
    await docker([
      'create',
      '--name',
      name,
      '--workdir',
      '/candidate',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '256',
      '--memory',
      '2g',
      '--cpus',
      '2',
      '--user',
      '1000:1000',
      '--tmpfs',
      '/tmp:rw,nosuid,size=512m',
      '--mount',
      `type=volume,src=${volumes[0]},dst=/candidate,readonly`,
      '--mount',
      `type=volume,src=${volumes[1]},dst=/packet,readonly`,
      '--mount',
      `type=volume,src=${volumes[2]},dst=/runner-code,readonly`,
      '--mount',
      `type=volume,src=${volumes[3]},dst=/results`,
      config.testImage,
      'node',
      '/runner-code/authorized-tests.mjs',
      '--inside',
    ]);
    try {
      await docker(['start', '--attach', name], 1800000);
    } finally {
      await docker(['cp', `${name}:/results/.`, results]).catch(() => {});
    }
    const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', name]));
    if (state.ExitCode !== 0) throw Error(`Isolated runner failed (${state.ExitCode}).`);
  } finally {
    for (const container of [name, seed])
      await docker(['rm', '-f', container], 10000).catch(() => {});
    for (const volume of volumes) await docker(['volume', 'rm', volume], 10000).catch(() => {});
    await fs.rm(snapshot, { recursive: true, force: true });
  }
}
async function outside(configPath, proposalId) {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(proposalId || '')) throw Error('Exact proposal ID required.');
  const config = await loadOperator(configPath),
    endpoint = `/internal/v1/proposals/${proposalId}/test-authorization`,
    packet = await policyRequest(config, config.ciCredentialFile, endpoint),
    artifact = await inspectCandidate(config.candidateRoot);
  for (const key of ['candidateCommit', 'codeHash', 'migrationHash'])
    if (artifact[key] !== packet.candidateManifest[key])
      throw Error(`Candidate ${key} changed after review.`);
  if (sha(await readFile(fileURLToPath(import.meta.url))) !== packet.expectedManifest.testCodeHash)
    throw Error('This exact trusted runner was not approved.');
  if (!/^(?:[a-z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(config.testImage || ''))
    throw Error('A prebuilt, trusted test image pinned by digest is required.');
  if (
    !['/opt/homebrew/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker'].includes(
      config.dockerPath,
    )
  )
    throw Error('Use an explicit installed Docker binary.');
  const evidenceRoot = await realpath(config.evidenceRoot);
  if (!within(config.trustedRoot, evidenceRoot))
    throw Error('Test evidence must remain outside agent workspaces.');
  const work = await mkdtemp(join(evidenceRoot, 'test-')),
    input = join(work, 'input.json'),
    results = join(work, 'results');
  await mkdir(results, { mode: 0o777 });
  await writeFile(input, JSON.stringify(packet), { mode: 0o644 });
  const startedAt = new Date().toISOString();
  let failure;
  try {
    await runIsolated(config, input, results, artifact);
  } catch (e) {
    failure = e;
    await writeFile(join(work, 'runner-diagnostic.txt'), e?.diagnostic || String(e), {
      mode: 0o600,
    });
  }

  let result;
  try {
    result = JSON.parse(await readFile(join(results, 'result.json'), 'utf8'));
  } catch {
    result = { passed: false, checks: [{ name: 'isolated-runner-completed', passed: false }] };
  }
  if (failure)
    result = {
      passed: false,
      checks: [...result.checks, { name: 'isolated-runner-exit', passed: false }],
    };
  const current = await policyRequest(config, config.ciCredentialFile, endpoint);
  if (
    current.expectedApprovalId !== packet.expectedApprovalId ||
    current.expectedDigest !== packet.expectedDigest ||
    current.candidateDigest !== packet.candidateDigest
  )
    throw Error('Authorization changed during testing; results retained but not accepted.');
  const currentArtifact = await inspectCandidate(config.candidateRoot);
  if (canonical(currentArtifact) !== canonical(artifact))
    throw Error('Candidate changed during testing.');
  const proof = {
    ...result,
    proposalId,
    testImage: config.testImage,
    runnerHash: sha(await readFile(fileURLToPath(import.meta.url))),
    hostNodeVersion: process.version,
    startedAt,
    completedAt: new Date().toISOString(),
    expectedDigest: packet.expectedDigest,
    candidateDigest: packet.candidateDigest,
    ...artifact,
  };
  const proofPath = join(work, 'proof.json');
  await writeFile(proofPath, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  await policyRequest(config, config.ciCredentialFile, '/internal/v1/test-runs', {
    id: `run_${randomUUID().replaceAll('-', '')}`,
    proposalId,
    expectedDigest: packet.expectedDigest,
    candidateDigest: packet.candidateDigest,
    startedAt,
    completedAt: proof.completedAt,
    passed: result.passed,
    checks: result.checks,
    environment: `isolated-ui-api-d1:${config.testImage}`,
    artifactHash: sha(await readFile(proofPath)),
    artifactRef: proofPath,
    workerArtifacts: artifact.workerArtifacts,
    webAssetsHash: artifact.webAssetsHash,
    adminAssetsHash: artifact.adminAssetsHash,
  });
  console.log(
    JSON.stringify({
      service: 'authorized-tests',
      proposalId,
      passed: result.passed,
      evidence: work,
    }),
  );
  if (!result.passed) process.exitCode = 1;
}
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--inside') await inside();
  else await outside(process.argv[2], process.argv[3]);
}
