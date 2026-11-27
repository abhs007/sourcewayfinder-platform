/**
 * Explicit, credential-free validation of the owner's reviewed Verizon journeys.
 * Uses the built public UI, actual API Worker and ephemeral session D1. Published
 * content is a read-only test provider; this does not validate policy authorization,
 * authenticate an owner, produce release proof, or operate a Verizon account.
 * Kept outside the ordinary fictional test suite so real guidance is never run
 * implicitly. The invocation must identify the exact owner-marked document.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { chromium } from '@playwright/test';
import { digest, validateBundle, type Answer, type Outcome } from '../../packages/core/index.ts';
import { hashDirectory } from '../../ops/authorized-tests.mjs';

type Case = { id: string; answers: Answer[]; expectedOutcomeId: string; expectedOutcome: Outcome };
const review = 'docs/validation/verizon-sim-protection';
const domain = 'domains/verizon-sim-protection';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const argument = process.argv.slice(2);
if (argument.length !== 1 || !/^--review-sha256=[a-f0-9]{64}$/.test(argument[0]!))
  throw Error('Supply the exact owner-reviewed document SHA-256; no automatic review selection.');
const requestedHash = argument[0]!.split('=')[1]!;
const initialInputs = new Map<string, string>();
async function input(path: string) {
  const bytes = await readFile(path);
  initialInputs.set(path, sha(bytes));
  return bytes.toString('utf8');
}

const reviewText = await input(`${review}/ALL_CASES_REVIEW.md`);
const receipt = JSON.parse(await input(`${review}/owner-review-evidence.json`));
assert.equal(sha(reviewText), requestedHash, 'Review document changed after owner selection.');
assert.equal(receipt.documentSha256, requestedHash, 'Review evidence identifies another document.');
const bundle = validateBundle(JSON.parse(await input(`${domain}/bundle.draft.json`)));
const packet = JSON.parse(await input(`${domain}/expected-cases.proposed.json`));
const cases: Case[] = packet.cases;
assert.equal(bundle.flowId, 'verizon-sim-protection');
assert.equal(bundle.usage, 'production_candidate');
assert.equal(await digest(bundle), receipt.bundleHash, 'Bundle differs from the reviewed input.');
assert.equal(await digest(packet), receipt.expectedPacketHash, 'Expected packet changed.');
assert.equal(await digest(cases), receipt.casesHash, 'Expected answers changed.');
assert.deepEqual(
  cases.map((c) => c.id),
  receipt.caseIds,
  'Case set changed.',
);
assert.equal(cases.length, 18);
for (const test of cases) {
  const marker = `<a id="case-${test.id}"></a>`;
  assert.equal(reviewText.split(marker).length, 2, `Missing or duplicate review: ${test.id}`);
  const section = reviewText.split(marker)[1]!.split('<a id="case-')[0]!;
  const decisions = [...section.matchAll(/^- \[([^\]]+)\] (.+)$/gm)].filter((m) => m[1]!.trim());
  assert.equal(decisions.length, 1, `Unresolved owner decision: ${test.id}`);
  assert.match(decisions[0]![1]!, /^[*xX]$/);
  assert.equal(decisions[0]![2], 'Keep as written');
  for (const field of [
    test.expectedOutcome.title,
    test.expectedOutcome.nextStep,
    ...(test.expectedOutcome.prerequisites ?? []),
    ...test.expectedOutcome.unresolved,
  ])
    assert.ok(section.includes(field), `Reviewed text differs: ${test.id}`);
}

// Public captures prepared for this review only; never read the private evidence store.
const sources = JSON.parse(await input(`${domain}/source-register.json`));
const captureRoot = resolve('test-results/source-review/verizon-v3');
function within(root: string, path: string) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
for (const source of sources) {
  for (const [path, hash] of [
    [source.rawEvidencePath, source.snapshotSha256],
    [source.normalizedEvidencePath, source.normalizedSha256],
  ]) {
    assert.ok(
      within(captureRoot, resolve(path)),
      'Evidence must be the local public review capture.',
    );
    assert.equal(sha(await input(path)), hash, 'Source capture integrity failed.');
  }
  const citation = bundle.sources.find((s) => s.id === source.id)!;
  assert.ok(citation);
  assert.equal(citation.sourceVersionId, source.sourceVersionId);
  assert.equal(citation.snapshotSha256, source.snapshotSha256);
  assert.ok((await readFile(source.normalizedEvidencePath, 'utf8')).includes(citation.passage));
}
const checkedAt = Math.min(...sources.map((s: any) => Date.parse(s.lastSuccessfulCheckAt)));
assert.ok(
  Number.isFinite(checkedAt) && checkedAt <= Date.now() && Date.now() - checkedAt < 72 * 3600000,
  'Source captures are stale; reacquire and review before real guidance validation.',
);
const artifactHashes = {
  api: sha(await readFile('dist/workers/api.mjs')),
  web: await hashDirectory('dist/web'),
  migrations: await hashDirectory('workers/api/migrations'),
};
const output = `test-results/reviewed-verizon/${new Date().toISOString().replaceAll(':', '-')}`;
await mkdir(output, { recursive: true });
const startedAt = new Date().toISOString();
let mf: Miniflare | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: { caseId: string; width: number; passed: boolean; error?: string }[] = [];
const covered = new Map<number, Set<string>>();
let completionError: string | null = null;
const assetsRoot = resolve('dist/web');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', origin);
    if (url.origin !== origin) throw Error('Origin rejected.');
    if (url.pathname.startsWith('/api/v1/')) {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 8192) throw Error('Request exceeds test transport limit.');
        chunks.push(chunk);
      }
      const response = await mf!.dispatchFetch(url.href, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const path = resolve(
      assetsRoot,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
    );
    if (!within(assetsRoot, path) || !['GET', 'HEAD'].includes(req.method ?? 'GET'))
      throw Error('Asset rejected.');
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(503);
    res.end('Local validation transport unavailable.');
  }
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
try {
  const flow = {
    id: bundle.flowId,
    title: 'Verizon SIM Protection — local review',
    scope: bundle.scope,
    status: 'active',
    statusEpoch: 1,
    bundleHash: receipt.bundleHash,
    lastSuccessfulCheckAt: new Date(checkedAt).toISOString(),
    officialUrl: 'https://www.verizon.com/support/knowledge-base-309294/',
  };
  // Read-only content substitution is a test precondition, not a policy approval or release.
  const provider = `import {WorkerEntrypoint} from 'cloudflare:workers';const b=${JSON.stringify(bundle)},f=${JSON.stringify(flow)};export class Content extends WorkerEntrypoint {async listFlows(){return [f]}async getFlow(id){return id===f.id?f:null}async getBundle(hash){return hash===f.bundleHash?b:null}async getSources(ids){return b.sources.filter(s=>ids.includes(s.id))}}export default {fetch(){return new Response('Local reviewed content provider',{status:403})}};`;
  mf = new Miniflare(
    convertV4MiniflareOptions({
      host: '127.0.0.1',
      workers: [
        {
          name: 'review-api',
          modules: true,
          scriptPath: 'dist/workers/api.mjs',
          compatibilityDate: '2026-11-21',
          bindings: { ENVIRONMENT: 'authorized-test', PUBLIC_ORIGIN: origin },
          d1Databases: ['SESSIONS_DB'],
          serviceBindings: { CONTENT: { name: 'review-content', entrypoint: 'Content' } },
        },
        {
          name: 'review-content',
          modules: true,
          script: provider,
          compatibilityDate: '2026-11-21',
        },
      ],
    }),
  );
  const db = await mf.getD1Database('SESSIONS_DB', 'review-api');
  for (const file of (await readdir('workers/api/migrations'))
    .filter((p) => p.endsWith('.sql'))
    .sort())
    for (const statement of (await readFile(`workers/api/migrations/${file}`, 'utf8'))
      .split(';')
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 1440]) {
    const branches = new Set<string>();
    covered.set(width, branches);
    for (const test of cases) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      const scriptErrors: string[] = [];
      page.on('pageerror', (error) => scriptErrors.push(error.name));
      try {
        await page.goto(origin);
        await page.getByRole('button', { name: flow.title, exact: true }).click();
        let final: any;
        for (const answer of test.answers) {
          const question = bundle.questions.find((q) => q.id === answer.questionId)!;
          const choice = question.choices.find((c) => c.id === answer.choiceId)!;
          await page.getByRole('heading', { name: question.prompt, exact: true }).waitFor();
          await page.getByRole('radio', { name: choice.label, exact: true }).check();
          const pending = page.waitForResponse(
            (r) => r.url().endsWith('/answers') && r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: 'Continue', exact: true }).click();
          const response = await pending;
          assert.equal(response.status(), 200, 'API rejected a reviewed answer.');
          assert.equal(response.headers()['cache-control'], 'no-store');
          final = await response.json();
          branches.add(`${answer.questionId}:${answer.choiceId}`);
        }
        assert.equal(final?.step.type, 'outcome');
        assert.deepEqual(
          final.step.outcome,
          test.expectedOutcome,
          'Complete API outcome differs from owner-reviewed expectation.',
        );
        await page
          .getByRole('heading', { name: test.expectedOutcome.title, exact: true })
          .waitFor();
        await page.getByText(test.expectedOutcome.nextStep, { exact: true }).waitFor();
        for (const line of [
          ...(test.expectedOutcome.prerequisites ?? []),
          ...test.expectedOutcome.unresolved,
        ])
          await page.getByText(line, { exact: true }).waitFor();
        for (const id of test.expectedOutcome.sourceRefs) {
          const source = bundle.sources.find((s) => s.id === id)!;
          assert.ok(
            await page.locator(`a[href=${JSON.stringify(source.url)}]`).count(),
            'Expected official link missing.',
          );
        }
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Horizontal overflow.',
        );
        assert.deepEqual(scriptErrors, [], 'Browser script error.');
        assert.equal(
          await page.evaluate(
            () => Object.keys(localStorage).length + Object.keys(sessionStorage).length,
          ),
          0,
        );
        const row = await db
          .prepare('SELECT token_hash,sequence FROM sessions ORDER BY created_at DESC LIMIT 1')
          .first<{ token_hash: string; sequence: number }>();
        assert.match(row!.token_hash, /^[a-f0-9]{64}$/);
        assert.equal(row!.sequence, test.answers.length);
        if (test.id === 'replace-enabled')
          await page.screenshot({ path: `${output}/${test.id}-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Finish this session', exact: true }).click();
        await page.getByRole('heading', { name: /^Find your next step\./ }).waitFor();
        const until = Date.now() + 5000;
        while (await db.prepare('SELECT count(*) AS n FROM sessions').first<number>('n')) {
          if (Date.now() > until) throw Error('Session deletion did not complete.');
          await new Promise((ok) => setTimeout(ok, 25));
        }
        results.push({ caseId: test.id, width, passed: true });
      } catch (error) {
        results.push({
          caseId: test.id,
          width,
          passed: false,
          error: error instanceof Error ? error.message : 'Case failed.',
        });
        await page
          .screenshot({ path: `${output}/${test.id}-${width}-failure.png`, fullPage: true })
          .catch(() => {});
        throw error;
      } finally {
        await context.close();
      }
    }
    assert.ok(
      bundle.transitions.every((t) => branches.has(`${t.questionId}:${t.choiceId}`)),
      'Incomplete transition coverage.',
    );
  }
  for (const [path, hash] of initialInputs)
    assert.equal(sha(await readFile(path)), hash, 'Input changed during validation.');
  assert.equal(sha(await readFile('dist/workers/api.mjs')), artifactHashes.api);
  assert.equal(await hashDirectory('dist/web'), artifactHashes.web);
  assert.equal(await hashDirectory('workers/api/migrations'), artifactHashes.migrations);
} catch (error) {
  completionError = error instanceof Error ? error.message : 'Validation failed.';
  process.exitCode = 1;
} finally {
  await browser?.close();
  await mf?.dispose();
  server.closeAllConnections();
  await new Promise<void>((ok) => server.close(() => ok()));
  const report = {
    scope: 'Local owner-reviewed browser/API/session-D1 journeys; read-only content test provider.',
    startedAt,
    completedAt: new Date().toISOString(),
    passed: !completionError && results.length === 36,
    ownerDocumentSha256: requestedHash,
    bundleHash: receipt.bundleHash,
    casesHash: receipt.casesHash,
    runnerSha256: sha(await readFile('tests/reviewed/verizon-local.mts')),
    artifactHashes,
    inputSha256: Object.fromEntries(initialInputs),
    results,
    coverage: [...covered].map(([width, branches]) => ({
      width,
      covered: branches.size,
      total: bundle.transitions.length,
    })),
    completionError,
    policyAuthorizationTested: false,
    hostedDeploymentTested: false,
    verizonAccountTransactionTested: false,
  };
  await writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      passed: report.passed,
      journeys: results.length,
      evidence: output,
      coverage: report.coverage,
    }),
  );
}
