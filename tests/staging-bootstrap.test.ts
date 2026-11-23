import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { bootstrapPlan, deploymentArgs, verifyPackage } from '../ops/staging-bootstrap.mjs';

async function fixture(run: (root: string, seal: () => Promise<void>) => Promise<void>) {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'swf-bootstrap-test-')));
  const paths = ['account', 'control', 'api', 'survey', 'web'].map(
    (name) => `infra/cloudflare/staging-${name}.json`,
  );
  paths.push('dist/workers/web.mjs');
  try {
    for (const path of paths) {
      await mkdir(dirname(resolve(root, path)), { recursive: true });
      await writeFile(
        resolve(root, path),
        path.endsWith('.json') ? await readFile(path) : '// fictional artifact',
      );
    }
    const seal = async () => {
      const files = await Promise.all(
        paths.map(async (path) => ({
          path,
          sha256: createHash('sha256')
            .update(await readFile(resolve(root, path)))
            .digest('hex'),
        })),
      );
      await writeFile(
        resolve(root, 'bootstrap-manifest.json'),
        JSON.stringify({ version: 1, agentWorkspaceRoots: [process.cwd()], files }),
      );
    };
    await seal();
    await run(root, seal);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('staging bootstrap boundary', () => {
  it('updates only the admin Worker without reading or replacing its existing secrets', () => {
    const plan = bootstrapPlan('--update-admin');
    expect(plan).toEqual({ migrate: false, controlSecret: false, components: ['control'] });
    expect(deploymentArgs('control', plan, '/fictional/secret')).toEqual([
      'deploy',
      '--no-bundle',
      '--config',
      'infra/cloudflare/staging-control.json',
    ]);
    expect(() => deploymentArgs('web', plan, '')).toThrow('outside deployment plan');
    expect(deploymentArgs('control', bootstrapPlan('--deploy'), '/fictional/secret')).toContain(
      '--secrets-file',
    );
  });
  it('retries only the web Worker without migrations or control-secret access', () => {
    expect(bootstrapPlan('--resume-web')).toEqual({
      migrate: false,
      controlSecret: false,
      components: ['web'],
    });
    expect(() => bootstrapPlan('--production')).toThrow('Unsupported bootstrap mode');
  });
  it('rejects an invalid static redirect before any credential or network operation', async () => {
    await fixture(async (root) => {
      await mkdir(resolve(root, 'dist/web'), { recursive: true });
      await writeFile(
        resolve(root, 'dist/web/_redirects'),
        'https://www.sourcewayfinder.org/* https://sourcewayfinder.org/:splat 301\n',
      );
      await expect(verifyPackage(root)).rejects.toThrow('redirect source must be a relative path');
    });
  });
  it('verifies an intact staging-only package without credentials or network', async () => {
    await fixture(async (root) =>
      expect((await verifyPackage(root)).configs.web.name).toBe('sourcewayfinder-staging-web'),
    );
  });
  it('rejects a changed compiled artifact', async () => {
    await fixture(async (root) => {
      await writeFile(resolve(root, 'dist/workers/web.mjs'), '// changed');
      await expect(verifyPackage(root)).rejects.toThrow('Package changed');
    });
  });
  it('rejects execution within an agent workspace', async () => {
    await fixture(async (root) => {
      const path = resolve(root, 'bootstrap-manifest.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      manifest.agentWorkspaceRoots = [root];
      await writeFile(path, JSON.stringify(manifest));
      await expect(verifyPackage(root)).rejects.toThrow('outside agent workspaces');
    });
  });
  it.each([
    [
      'control',
      (c: any) => {
        c.d1_databases[0].database_id = 'bf62ec0c-1e07-4ec6-a0ef-b105cdf0d6c5';
      },
      'Unexpected database',
    ],
    [
      'api',
      (c: any) => {
        c.routes = [{ pattern: 'api.sourcewayfinder.org', custom_domain: true }];
      },
      'no public route',
    ],
    [
      'web',
      (c: any) => {
        c.assets.run_worker_first = false;
      },
      'Host protection mismatch',
    ],
    [
      'web',
      (c: any) => {
        c.build = { command: 'echo unexpected' };
      },
      'Unsafe staging configuration',
    ],
  ])(
    'rejects unsafe %s settings even if the manifest is resealed',
    async (component, mutate, error) => {
      await fixture(async (root, seal) => {
        const path = resolve(root, `infra/cloudflare/staging-${component}.json`);
        const config = JSON.parse(await readFile(path, 'utf8'));
        mutate(config);
        await writeFile(path, JSON.stringify(config));
        await seal();
        await expect(verifyPackage(root)).rejects.toThrow(error);
      });
    },
  );
});
