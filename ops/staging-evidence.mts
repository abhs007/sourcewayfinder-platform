import { readFile, writeFile, lstat, realpath, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fetchSource, retain, upload, type SourceConfig } from './collector.mts';
import { verifyPackage } from './staging-bootstrap.mjs';
const origin = 'https://admin-staging.sourcewayfinder.org';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export async function stageEvidence(
  sources: any[],
  baseline: any[],
  packet: any,
  api: any,
  acquire: any,
  sendEvidence: any,
) {
  const registered = (await api('/internal/v1/sources')).sources;
  for (const s of sources)
    if (
      !registered?.some(
        (r: any) =>
          r.id === s.id &&
          r.flow_id === s.flowId &&
          r.url === s.url &&
          r.approved_origin === s.approvedOrigin &&
          r.approved_path === s.approvedPath,
      )
    )
      throw Error('Registered source boundary mismatch. No source collection started.');
  const results = [];
  for (const source of sources) {
    const snapshot = await acquire(source);
    const remote = await sendEvidence(snapshot);
    results.push({
      sourceId: source.id,
      sourceVersionId: remote.sourceVersionId,
      snapshotSha256: remote.snapshotSha256,
      normalizedSha256: remote.normalizedSha256,
      extractorVersion: snapshot.extractorVersion,
      checkedAt: snapshot.checkedAt,
      changedFromReview:
        baseline.find((b: any) => b.id === source.id)?.normalizedSha256 !==
          snapshot.normalizedSha256 ||
        baseline.find((b: any) => b.id === source.id)?.extractorVersion !==
          snapshot.extractorVersion,
    });
  }
  if (results.some((r) => r.changedFromReview))
    return { sources: results, needsSourceReview: true, proposal: null };
  const body = {
    flowId: 'verizon-sim-protection',
    sourceVersionIds: results.map((r) => r.sourceVersionId),
    ...packet,
  };
  const id = 'verizon-initial-' + hash(JSON.stringify(body)).slice(0, 20);
  const proposal = await api('/internal/v1/proposals', 'POST', { id, ...body });
  return {
    sources: results,
    needsSourceReview: false,
    proposal: { id: proposal.id, digest: proposal.digest, state: proposal.state },
  };
}
async function privateJson(path: string) {
  if (
    (await realpath(path)) !== path ||
    !(await lstat(path)).isFile() ||
    (await lstat(path)).mode & 0o077
  )
    throw Error('Unsafe operator file.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function main() {
  const root = (await verifyPackage(resolve(dirname(fileURLToPath(import.meta.url)), '..'))).root;
  const lockPath = resolve(root, 'evidence-upload.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const access = await privateJson(resolve(root, 'secrets/staging-access.json'));
    const roles = await privateJson(resolve(root, 'secrets/staging-services.json'));
    if (access.policyOrigin !== origin) throw Error('Wrong staging origin.');
    for (const scope of ['source:write', 'proposal:write'])
      if (
        !roles.some(
          (r: any) =>
            r.scopes?.length === 1 && r.scopes[0] === scope && Date.parse(r.expiresAt) > Date.now(),
        )
      )
        throw Error('Missing or expired service role.');
    const api = async (path: string, method = 'GET', body?: unknown) => {
      if (
        !/^\/internal\/v1\/(sources|source-checks|proposals|evidence(?:\/[a-z0-9_-]+\/(?:complete|chunks\/\d+))?)$/.test(
          path,
        )
      )
        throw Error('Unexpected evidence route.');
      const scope = path === '/internal/v1/proposals' ? 'proposal:write' : 'source:write';
      const role = roles.find((r: any) => r.scopes?.length === 1 && r.scopes[0] === scope);
      const res = await fetch(origin + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${role.token}`,
          'CF-Access-Client-Id': access.accessClientId,
          'CF-Access-Client-Secret': access.accessClientSecret,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let result;
      try {
        result = (await res.json()) as any;
      } catch {
        throw Error('Policy response unreadable.');
      }
      if (!res.ok)
        throw Error(
          `Policy refused evidence step (${res.status}; ${result.error?.code || 'unknown'}).`,
        );
      return result;
    };
    const sources = (
      JSON.parse(await readFile(resolve(root, 'domains/sources.json'), 'utf8')) as SourceConfig[]
    ).filter((s) => s.flowId === 'verizon-sim-protection');
    if (sources.length !== 3) throw Error('Expected exactly three Verizon sources.');
    const baseline = JSON.parse(
      await readFile(
        resolve(root, 'domains/verizon-sim-protection/collection-baseline.v4.json'),
        'utf8',
      ),
    );
    const packet = JSON.parse(
      await readFile(
        resolve(root, 'domains/verizon-sim-protection/interpretation.proposed.json'),
        'utf8',
      ),
    );
    const directory = resolve(root, 'evidence/verizon');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const result = await stageEvidence(
      sources,
      baseline,
      packet,
      api,
      async (s: SourceConfig) => retain(s, await fetchSource(s), directory),
      async (s: any) => upload(s, directory, api),
    );
    await writeFile(
      resolve(root, `evidence-upload-receipt-${Date.now()}.json`),
      JSON.stringify(
        { completedAt: new Date().toISOString(), ...result, contentApproved: false },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      result.needsSourceReview
        ? 'Evidence uploaded. Official text differs from the reviewed baseline; interpretation submission stopped for review.'
        : 'Evidence uploaded and interpretation proposal queued. Open the admin dashboard to review it. Nothing approved or published.',
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
