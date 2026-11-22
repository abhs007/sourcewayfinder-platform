/** Run only from the reviewed operator copy, outside every agent checkout. */
import {
  readFile,
  writeFile,
  mkdir,
  realpath,
  copyFile,
  cp,
  open,
  unlink,
  stat,
} from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  sha,
  loadOperator,
  secret,
  runFixed,
  policyRequest,
  inspectCandidate,
  hashDirectory,
} from './authorized-tests.mjs';
const services = ['control', 'api', 'survey', 'web'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};
type Config = Record<string, any>;
async function main() {
  const [command, configPath, entityId] = process.argv.slice(2);
  if (
    !['prepare', 'promote', 'rollback'].includes(command || '') ||
    !/^[a-z][a-z0-9_-]{0,63}$/.test(entityId || '')
  )
    throw Error(
      'Usage: publisher.mts prepare|promote|rollback /absolute/operator.json proposal-or-release-id',
    );
  const config: Config = await loadOperator(configPath, fileURLToPath(import.meta.url));
  if (!/^[a-f0-9]{32}$/.test(config.accountId) || config.migrationStrategy !== 'none')
    throw Error(
      'Verified account and migrationStrategy none required. Schema changes need a separate maintenance release.',
    );
  const wrangler = await realpath(config.wranglerPath);
  if (
    !inside(config.trustedRoot, wrangler) ||
    sha(await readFile(wrangler)) !== config.wranglerSha256
  )
    throw Error('Trusted pinned Wrangler executable changed.');
  const runtimePackage = JSON.parse(
    await readFile(join(config.trustedRoot, 'node_modules/wrangler/package.json'), 'utf8'),
  );
  if (runtimePackage.version !== '4.166.0') throw Error('Reviewed Wrangler 4.166.0 required.');
  const evidenceRoot = await realpath(config.evidenceRoot);
  if (!inside(config.trustedRoot, evidenceRoot))
    throw Error('Evidence must remain in the operator directory.');
  const lockPath = join(config.trustedRoot, 'publisher.lock'),
    lock = await open(lockPath, 'wx', 0o600).catch(() => {
      throw Error('Another release holds the operator lock; reconcile before retry.');
    });
  const token = await secret(config.cloudflareApiTokenFile, config.trustedRoot),
    env = {
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: config.accountId,
      WRANGLER_SEND_METRICS: 'false',
      CI: 'true',
      HOME: config.trustedRoot,
    };
  const configs: Record<string, { path: string; value: any }> = {};
  try {
    for (const service of services) {
      const path = await realpath(config.workerConfigs[service]);
      if (!inside(config.trustedRoot, path))
        throw Error('Worker configuration must be operator-owned.');
      const value = JSON.parse(await readFile(path, 'utf8'));
      const expected =
        service === 'web' && config.environment === 'production'
          ? 'sourcewayfinder'
          : `sourcewayfinder-${config.environment}-${service}`;
      if (
        value.name !== expected ||
        value.account_id !== config.accountId ||
        value.build ||
        value.rules ||
        value.alias ||
        value.define ||
        value.workers_dev !== false ||
        value.preview_urls !== false
      )
        throw Error('Unexpected Worker configuration or executable build hook.');
      configs[service] = { path, value };
    }
    const cf = async (path: string) => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${config.accountId}${path}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        },
      );
      const data: any = await res.json();
      if (!res.ok || !data.success) throw Error(`Cloudflare read failed (${res.status}).`);
      return data.result;
    };
    const activeVersion = async (service: string) => {
      const result = await cf(`/workers/scripts/${configs[service].value.name}/deployments`),
        latest = result.deployments?.[0];
      if (!latest) return null;
      if (latest.versions?.length !== 1 || latest.versions[0].percentage !== 100)
        throw Error('Split traffic requires an explicit reviewed migration plan.');
      return latest.versions[0].version_id as string;
    };
    const cli = (service: string, args: string[]) =>
      runFixed(process.execPath, [wrangler, ...args, '--config', configs[service].path], {
        cwd: config.trustedRoot,
        env,
        timeout: 300000,
      });
    if (command === 'prepare') {
      const input = await policyRequest(
          config,
          config.publisherCredentialFile,
          `/internal/v1/proposals/${entityId}/release-input`,
        ),
        artifact = await inspectCandidate(config.candidateRoot);
      for (const key of ['codeHash', 'candidateCommit', 'migrationHash'] as const)
        if (artifact[key] !== input.candidateManifest[key])
          throw Error('Merged tree differs from the reviewed candidate.');
      if (
        canonical(input.testResult.workerArtifacts) !== canonical(artifact.workerArtifacts) ||
        input.testResult.webAssetsHash !== artifact.webAssetsHash ||
        input.testResult.adminAssetsHash !== artifact.adminAssetsHash
      )
        throw Error('Built artifacts differ from the authorized test run.');
      const releaseId = `release_${Date.now()}`,
        directory = join(evidenceRoot, releaseId);
      await mkdir(directory, { mode: 0o700 });
      const previousWorkerVersions: Record<string, string | null> = {},
        workerVersions: Record<string, string> = {},
        bookmarks: Record<string, string> = {};
      for (const service of services) {
        try {
          previousWorkerVersions[service] = await activeVersion(service);
        } catch (e) {
          if (service === 'web' || config.allowNewWorkers?.[service] !== true) throw e;
          previousWorkerVersions[service] = null;
        }
      }
      if (config.environment === 'production' && !previousWorkerVersions.web)
        throw Error('Existing public website version must be recorded.');
      for (const [kind, service, binding] of [
        ['control', 'control', 'CONTROL_DB'],
        ['evidence', 'control', 'EVIDENCE_DB'],
        ['sessions', 'api', 'SESSIONS_DB'],
        ['survey', 'survey', 'DB'],
      ]) {
        const info: any = JSON.parse(
          await cli(service, ['d1', 'time-travel', 'info', binding, '--json']),
        );
        const bookmark = info.bookmark || info.result?.bookmark;
        if (typeof bookmark !== 'string' || !bookmark) throw Error('D1 recovery bookmark missing.');
        bookmarks[kind] = bookmark;
      }
      // Upload immutable snapshots with no candidate build hooks and no traffic change.
      for (const service of services) {
        const script = join(directory, `${service}.mjs`);
        await copyFile(join(config.candidateRoot, `dist/workers/${service}.mjs`), script);
        if (sha(await readFile(script)) !== artifact.workerArtifacts[service])
          throw Error('Artifact changed during snapshot.');
        const upload = { ...configs[service].value, main: script, no_bundle: true };
        if (upload.assets) {
          const assetPath = join(directory, `${service}-assets`);
          await cp(
            join(config.candidateRoot, service === 'web' ? 'dist/web' : 'dist/admin'),
            assetPath,
            { recursive: true, dereference: false, errorOnExist: true },
          );
          if (
            (await hashDirectory(assetPath)) !==
            (service === 'web' ? artifact.webAssetsHash : artifact.adminAssetsHash)
          )
            throw Error('Asset snapshot changed before upload.');
          upload.assets = { ...upload.assets, directory: assetPath };
        }
        const uploadConfig = join(directory, `${service}.json`);
        await writeFile(uploadConfig, JSON.stringify(upload, null, 2), { mode: 0o600 });
        const output = await runFixed(
          process.execPath,
          [
            wrangler,
            'versions',
            'upload',
            '--no-bundle',
            '--strict',
            '--config',
            uploadConfig,
            '--tag',
            artifact.workerArtifacts[service].slice(0, 32),
            '--message',
            `Prepared ${releaseId}`,
          ],
          { cwd: config.trustedRoot, env, timeout: 300000 },
        );
        const id = /Worker Version ID:\s*([a-f0-9-]{36})/.exec(String(output))?.[1];
        if (!id || !uuid.test(id)) throw Error('Version upload receipt could not be parsed.');
        const version = await cf(`/workers/scripts/${upload.name}/versions/${id}`);
        if (version.id !== id) throw Error('Uploaded version unavailable.');
        workerVersions[service] = id;
      }
      if (canonical(await inspectCandidate(config.candidateRoot)) !== canonical(artifact))
        throw Error('Candidate changed during version preparation.');
      const receipt = {
        id: releaseId,
        proposalId: entityId,
        testRunId: input.testRunId,
        mergedTreeHash: artifact.codeHash,
        workerVersions,
        workerArtifacts: artifact.workerArtifacts,
        webAssetsHash: artifact.webAssetsHash,
        adminAssetsHash: artifact.adminAssetsHash,
        previousWorkerVersions,
        d1RecoveryBookmarks: bookmarks,
        migrationStrategy: 'none',
      };
      const release = await policyRequest(
        config,
        config.publisherCredentialFile,
        '/internal/v1/releases',
        receipt,
      );
      await writeFile(
        join(directory, 'receipt.json'),
        JSON.stringify({ ...receipt, digest: release.digest, manifest: release.manifest }, null, 2),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          service: 'publisher',
          action: 'prepared',
          releaseId,
          digest: release.digest,
          reviewRequired: true,
        }),
      );
      return;
    }
    const authorization = await policyRequest(
        config,
        config.publisherCredentialFile,
        `/internal/v1/releases/${entityId}/${command === 'rollback' ? 'recovery' : 'authorization'}`,
      ),
      manifest = authorization.manifest;
    if (
      manifest.environment !== config.environment ||
      manifest.migrationStrategy !== 'none' ||
      manifest.codeHash !== manifest.mergedTreeHash
    )
      throw Error('Release environment, migration plan or tested tree changed.');
    const receiptPath = join(evidenceRoot, entityId, 'receipt.json'),
      receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (
      receipt.digest !== authorization.digest ||
      canonical(receipt.manifest) !== canonical(manifest) ||
      sha(canonical(manifest)) !== authorization.digest
    )
      throw Error('The operator upload receipt differs from the human-reviewed release.');
    for (const service of services) {
      if (!uuid.test(manifest.workerVersions[service])) throw Error('Exact version UUID required.');
      const version = await cf(
        `/workers/scripts/${configs[service].value.name}/versions/${manifest.workerVersions[service]}`,
      );
      if (version.id !== manifest.workerVersions[service]) throw Error('Reviewed version missing.');
    }
    const suspend = () =>
      policyRequest(
        config,
        config.incidentCredentialFile,
        `/internal/v1/flows/${authorization.flow.id}/status`,
        {
          status: 'under_review',
          reason: `Release ${entityId}: deployment failure or rollback; guidance remains disabled.`,
        },
      );
    const evidence = async (action: string, value: any) =>
      writeFile(
        join(evidenceRoot, entityId, `${action}-${Date.now()}.json`),
        JSON.stringify(value, null, 2),
        { mode: 0o600 },
      );
    if (command === 'rollback') {
      await policyRequest(
        config,
        config.publisherCredentialFile,
        `/internal/v1/releases/${entityId}/suspend-recovery`,
        {},
      );
      await suspend();
      if (
        !manifest.previousWorkerVersions ||
        !services.every((s) => uuid.test(manifest.previousWorkerVersions[s] || ''))
      )
        throw Error(
          'A previous compatible version is missing. Guidance stays suspended; prepare a forward fix.',
        );
      if (manifest.migrationStrategy !== 'none')
        throw Error('Automatic database or incompatible-code rollback is forbidden.');
      for (const service of services) {
        const current = await activeVersion(service);
        if (
          current !== manifest.workerVersions[service] &&
          current !== manifest.previousWorkerVersions[service]
        )
          throw Error('A newer deployment prevents this rollback.');
      }
      for (const service of [...services].reverse())
        await cli(service, [
          'versions',
          'deploy',
          `${manifest.previousWorkerVersions[service]}@100`,
          '--yes',
          '--message',
          `Suspended rollback of ${entityId}`,
        ]);
      for (const service of services)
        if ((await activeVersion(service)) !== manifest.previousWorkerVersions[service])
          throw Error('Rollback version verification failed.');
      await suspend();
      const proof = {
        releaseId: entityId,
        previousWorkerVersions: manifest.previousWorkerVersions,
        guidance: 'under_review',
      };
      await evidence('rollback', proof);
      await policyRequest(
        config,
        config.ciCredentialFile,
        `/internal/v1/releases/${entityId}/recover`,
        {
          digest: authorization.digest,
          restoredRuntimeDigest: manifest.previousRuntimeDigest,
          artifactHash: sha(canonical(proof)),
        },
      );
      console.log(
        JSON.stringify({
          service: 'publisher',
          action: 'rolled_back',
          releaseId: entityId,
          guidance: 'under_review',
        }),
      );
      return;
    }
    if (!['deploy_authorized', 'deploying'].includes(authorization.state))
      throw Error('Release is not awaiting deployment.');
    for (const service of services) {
      const current = await activeVersion(service).catch(() => null);
      if (
        current !== manifest.previousWorkerVersions[service] &&
        current !== manifest.workerVersions[service]
      )
        throw Error('Deployment drift detected before promotion.');
    }
    await policyRequest(
      config,
      config.publisherCredentialFile,
      `/internal/v1/releases/${entityId}/suspend`,
      {},
    );
    try {
      for (const service of services) {
        const current = await policyRequest(
          config,
          config.publisherCredentialFile,
          `/internal/v1/releases/${entityId}/authorization`,
        );
        if (current.digest !== authorization.digest)
          throw Error('Approval changed immediately before promotion.');
        await cli(service, [
          'versions',
          'deploy',
          `${manifest.workerVersions[service]}@100`,
          '--yes',
          '--message',
          `Approved release ${entityId}`,
        ]);
        if ((await activeVersion(service)) !== manifest.workerVersions[service])
          throw Error('Deployed version differs.');
      }
      await policyRequest(
        config,
        config.publisherCredentialFile,
        `/internal/v1/releases/${entityId}/promote`,
        {},
      );
      const origin = new URL(config.publicOrigin);
      if (origin.protocol !== 'https:') throw Error('Public HTTPS origin required.');
      const checks = [],
        smokeHeaders: Record<string, string> = {};
      if (config.environment === 'staging') {
        smokeHeaders['CF-Access-Client-Id'] = await secret(
          config.accessClientIdFile,
          config.trustedRoot,
        );
        smokeHeaders['CF-Access-Client-Secret'] = await secret(
          config.accessClientSecretFile,
          config.trustedRoot,
        );
      }
      for (const path of ['/', `/api/v1/flows/${authorization.flow.id}`, '/api/survey/status']) {
        const response = await fetch(new URL(path, origin), {
          headers: smokeHeaders,
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        });
        let passed = response.status === 200;
        if (path.includes('/flows/')) {
          const flow: any = await response.json();
          passed &&= flow.bundleHash === manifest.bundleHash && flow.status === 'under_review';
        }
        if (path === '/api/survey/status') {
          const survey: any = await response.json();
          passed &&= survey.version === 'needs-v1' && survey.noticeVersion === '2026-11-21-public';
        }
        checks.push({ name: `production-smoke:${path}`, passed });
      }
      const proof = {
        releaseId: entityId,
        digest: authorization.digest,
        checks,
        passed: checks.every((c) => c.passed),
        workerVersions: manifest.workerVersions,
        checkedAt: new Date().toISOString(),
      };
      await evidence('smoke', proof);
      // Independent CI identity performs verification; publisher has no test-write authority.
      await policyRequest(
        config,
        config.ciCredentialFile,
        `/internal/v1/releases/${entityId}/verify`,
        {
          digest: authorization.digest,
          passed: proof.passed,
          checks,
          artifactHash: sha(canonical(proof)),
        },
      );
      if (!proof.passed) throw Error('Production smoke failed.');
      console.log(
        JSON.stringify({
          service: 'publisher',
          action: 'verified',
          releaseId: entityId,
          digest: authorization.digest,
          guidance: 'under_review',
          humanActivationRequired: true,
        }),
      );
    } catch (error) {
      await suspend().catch(() => {});
      await evidence('failure', {
        releaseId: entityId,
        code: 'RELEASE_FAILED',
        guidance: 'under_review',
      });
      throw error;
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
await main().catch((error) => {
  console.error(
    JSON.stringify({
      service: 'publisher',
      code: 'RELEASE_STOPPED',
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
  process.exitCode = 1;
});
