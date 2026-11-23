// Reviewed owner-only setup: fixed staging target; never run from the candidate workspace.
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPackage } from './staging-bootstrap.mjs';
const account = 'a03d9f71f863eed1dc764ca7d4e34c49';
const worker = 'sourcewayfinder-staging-control';
const origin = 'https://admin-staging.sourcewayfinder.org';
export function credentialPlan(now = Date.now()) {
  const expiresAt = new Date(now + 7 * 86400000).toISOString();
  return ['source:write', 'proposal:write'].map((scope, i) => ({
    id: i ? 'staging-proposal-writer' : 'staging-source-collector',
    token: randomBytes(48).toString('base64url'),
    scopes: [scope],
    expiresAt,
  }));
}
export function registry(records) {
  if (
    records.length !== 2 ||
    records.some(
      (r, i) =>
        r.scopes.length !== 1 ||
        r.scopes[0] !== ['source:write', 'proposal:write'][i] ||
        !/^[A-Za-z0-9_-]{64}$/.test(r.token) ||
        Date.parse(r.expiresAt) <= Date.now(),
    )
  )
    throw Error('Invalid or expired local service identities. No changes made.');
  return records.map(({ token, ...r }) => ({
    ...r,
    enabled: true,
    sha256: createHash('sha256').update(token).digest('hex'),
  }));
}
async function privateJson(path) {
  if (
    (await realpath(path)) !== path ||
    !(await lstat(path)).isFile() ||
    (await lstat(path)).mode & 0o077
  )
    throw Error('Unsafe operator file.');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function main(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  root = (await verifyPackage(root)).root;
  const access = await privateJson(resolve(root, 'secrets/staging-access.json'));
  if (access.policyOrigin !== origin || !access.accessClientId || !access.accessClientSecret)
    throw Error('Staging Access identity missing.');
  const accessHeaders = {
    'CF-Access-Client-Id': access.accessClientId,
    'CF-Access-Client-Secret': access.accessClientSecret,
  };
  async function service(token) {
    return fetch(origin + '/internal/v1/sources', {
      headers: { ...accessHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  }
  // Confirm the exact Access path reaches the Worker, without a bearer, before changing anything.
  const probe = await service();
  let denial;
  try {
    denial = await probe.json();
  } catch {
    throw Error('Access is not reaching the staging Worker.');
  }
  if (probe.status !== 401 || denial.error?.code !== 'SERVICE_AUTH_REQUIRED')
    throw Error('Staging Access preflight failed.');
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) throw Error('Cloudflare deployment API token required.');
  async function cf(method, body) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/secrets`,
      {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    let data;
    try {
      data = await res.json();
    } catch {
      throw Error('Cloudflare returned an unreadable response.');
    }
    if (!res.ok || !data.success)
      throw Error(`Cloudflare secret operation failed (${res.status}).`);
    return data.result;
  }
  const secretNames = await cf('GET');
  if (!Array.isArray(secretNames)) throw Error('Could not inspect secret names.');
  const identityPath = resolve(root, 'secrets/staging-services.json');
  let records;
  try {
    records = await privateJson(identityPath);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    if (secretNames.some((s) => s.name === 'WORKER_CREDENTIALS_JSON'))
      throw Error(
        'Existing remote service credentials require reconciliation; nothing overwritten.',
      );
    records = credentialPlan();
    await writeFile(identityPath, JSON.stringify(records) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const hashed = registry(records);
  if (!secretNames.some((s) => s.name === 'WORKER_CREDENTIALS_JSON'))
    await cf('PUT', {
      name: 'WORKER_CREDENTIALS_JSON',
      type: 'secret_text',
      text: JSON.stringify(hashed),
    });
  // An interrupted previous upload is reconciled by authentication, never by blind replacement.
  const accepted = await service(records[0].token);
  if (!accepted.ok)
    throw Error(
      'Collector authentication not yet verified; retry after propagation. Existing secrets retained.',
    );
  const sources = (await accepted.json()).sources;
  const expected = ['verizon-sim-web', 'verizon-account-access', 'verizon-account-roles'];
  if (!Array.isArray(sources) || expected.some((id) => !sources.some((s) => s.id === id)))
    throw Error('The registered source inventory is incomplete.');
  const wrongScope = await service(records[1].token);
  let refused;
  try {
    refused = await wrongScope.json();
  } catch {
    throw Error('Scope check unreadable.');
  }
  if (wrongScope.status !== 403 || refused.error?.code !== 'SCOPE_REJECTED')
    throw Error('Service-scope isolation failed.');
  const receipt = {
    completedAt: new Date().toISOString(),
    worker,
    environment: 'staging',
    accessVerified: true,
    collectorAuthenticated: true,
    proposalCannotCollect: true,
    sourceIds: expected,
    scopes: hashed.map((r) => ({ id: r.id, scopes: r.scopes, expiresAt: r.expiresAt })),
    contentApproved: false,
  };
  await writeFile(
    resolve(root, `service-setup-receipt-${Date.now()}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    'Staging service setup verified. Collector access works; proposal identity cannot collect. No guidance approved or published.',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => {
      delete process.env.CLOUDFLARE_API_TOKEN;
    });
}
