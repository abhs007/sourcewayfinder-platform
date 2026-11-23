// Owner-run submission only. Never approves, tests, merges, or deploys guidance.
import { readFile, writeFile, realpath, lstat, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, sha, inspectCandidate } from './authorized-tests.mjs';
import { verifyPackage } from './staging-bootstrap.mjs';

const origin = 'https://admin-staging.sourcewayfinder.org';
const proposalId = 'verizon-initial-ce98b9b5ec88cab60455';
const candidateRoot = '/Users/abhishekvaishnav/EB2-NIW/sourcewayfinder-platform';
const packetDirectory = 'docs/validation/verizon-sim-protection/staging-v4';

export async function submitCandidate(packet, observed, runnerHash, api) {
  if (packet.proposalId !== proposalId || packet.environment !== 'staging')
    throw Error('Wrong staging proposal.');
  if (canonical(packet.artifact) !== canonical(observed) || packet.testCodeHash !== runnerHash)
    throw Error('Candidate bytes or trusted runner changed. Prepare a new reviewed packet.');
  const manifest = {
    interpretationApprovalId: packet.interpretationApprovalId,
    proposalDigest: packet.proposalDigest,
    bundleHash: sha(canonical(packet.bundle)),
    candidateCommit: observed.candidateCommit,
    migrationHash: observed.migrationHash,
    codeHash: observed.codeHash,
    policyVersion: '1',
  };
  const candidate = await api(`/internal/v1/proposals/${proposalId}/candidate`, {
    bundle: packet.bundle,
    candidateCommit: observed.candidateCommit,
    migrationHash: observed.migrationHash,
    codeHash: observed.codeHash,
  });
  if (canonical(candidate.candidateManifest) !== canonical(manifest))
    throw Error(
      'Candidate response differs from the prepared interpretation or artifact. Stop for review.',
    );
  const expectedManifest = {
    candidateDigest: sha(canonical(manifest)),
    cases: packet.cases,
    testCodeHash: runnerHash,
    sourceVersionIds: packet.bundle.sources.map((s) => s.sourceVersionId).sort(),
    policyVersion: '1',
  };
  const expectations = await api(`/internal/v1/proposals/${proposalId}/expectations`, {
    cases: packet.cases,
    testCodeHash: runnerHash,
  });
  if (canonical(expectations.expectedManifest) !== canonical(expectedManifest))
    throw Error('Expected-case response differs from the submitted packet. Stop for review.');
  return {
    proposalId,
    candidateDigest: expectedManifest.candidateDigest,
    expectedDigest: sha(canonical(expectedManifest)),
    state: expectations.state,
    cases: packet.cases.length,
    candidateCommit: observed.candidateCommit,
    testsExecuted: false,
    decisionsSubmitted: false,
    deployed: false,
  };
}

async function privateJson(path) {
  const info = await lstat(path);
  if ((await realpath(path)) !== path || !info.isFile() || info.mode & 0o077)
    throw Error('Unsafe operator file.');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const root = (await verifyPackage(resolve(dirname(fileURLToPath(import.meta.url)), '..'))).root;
  const lockPath = resolve(root, 'candidate-submit.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    const packet = JSON.parse(
      await readFile(resolve(root, 'packets/verizon-candidate.json'), 'utf8'),
    );
    const observed = await inspectCandidate(candidateRoot);
    const runnerHash = sha(await readFile(resolve(root, 'ops/authorized-tests.mjs')));
    const bundle = JSON.parse(
      await readFile(resolve(candidateRoot, packetDirectory, 'bundle.proposed.json'), 'utf8'),
    );
    const cases = JSON.parse(
      await readFile(
        resolve(candidateRoot, packetDirectory, 'expected-cases.proposed.json'),
        'utf8',
      ),
    ).cases;
    if (
      canonical(bundle) !== canonical(packet.bundle) ||
      canonical(cases) !== canonical(packet.cases)
    )
      throw Error('Submission content differs from the committed candidate.');
    // Read credentials only after the reviewed package and clean candidate have been checked.
    const access = await privateJson(resolve(root, 'secrets/staging-access.json'));
    const roles = await privateJson(resolve(root, 'secrets/staging-services.json'));
    const role = roles.find(
      (r) =>
        r.scopes?.length === 1 &&
        r.scopes[0] === 'proposal:write' &&
        Date.parse(r.expiresAt) > Date.now(),
    );
    if (access.policyOrigin !== origin || !role)
      throw Error('Missing current staging proposal identity.');
    const api = async (path, body) => {
      if (
        ![
          `${'/internal/v1/proposals/'}${proposalId}/candidate`,
          `${'/internal/v1/proposals/'}${proposalId}/expectations`,
        ].includes(path)
      )
        throw Error('Unexpected submission route.');
      const response = await fetch(origin + path, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${role.token}`,
          'CF-Access-Client-Id': access.accessClientId,
          'CF-Access-Client-Secret': access.accessClientSecret,
        },
        body: JSON.stringify(body),
      });
      const value = await response.json().catch(() => null);
      if (!response.ok || !value)
        throw Error(
          `Submission refused (${response.status}; ${value?.error?.code || 'unreadable'}).`,
        );
      return value;
    };
    const result = await submitCandidate(packet, observed, runnerHash, api);
    await writeFile(
      resolve(root, `candidate-submit-receipt-${Date.now()}.json`),
      JSON.stringify({ completedAt: new Date().toISOString(), ...result }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      `Candidate and ${result.cases} expected cases submitted. State: ${result.state}. Open the admin dashboard. No tests run or guidance deployed.`,
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
