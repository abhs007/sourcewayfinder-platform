import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { credentialPlan, registry } from '../ops/staging-service-provision.mjs';
it('creates independent short-lived evidence and proposal identities with no approval or release scopes', () => {
  const now = Date.now(),
    records = credentialPlan(now),
    hashed = registry(records);
  expect(records[0].token).not.toBe(records[1].token);
  expect(hashed.map((r: any) => r.scopes)).toEqual([['source:write'], ['proposal:write']]);
  expect(
    hashed.every(
      (r: any) =>
        !('token' in r) && r.sha256.length === 64 && Date.parse(r.expiresAt) === now + 7 * 86400000,
    ),
  ).toBe(true);
  expect(() => registry([{ ...records[0], scopes: ['human:review'] }, records[1]])).toThrow();
  expect(() => registry(credentialPlan(now - 8 * 86400000))).toThrow();
});

import { mkdtemp, readFile, mkdir, writeFile, rm, chmod, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { main } from '../ops/staging-service-provision.mjs';
it.each([false, true])(
  'provisions only an absent registry and refuses existing unrelated credentials (%s)',
  async (existing) => {
    const root = await mkdtemp(resolve(tmpdir(), 'swf-service-setup-'));
    const previous = process.env.CLOUDFLARE_API_TOKEN;
    try {
      const files = [];
      await mkdir(resolve(root, 'infra/cloudflare'), { recursive: true });
      for (const name of ['account', 'control', 'api', 'survey', 'web']) {
        const path = `infra/cloudflare/staging-${name}.json`,
          bytes = await readFile(path);
        await writeFile(resolve(root, path), bytes);
        files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
      await writeFile(
        resolve(root, 'bootstrap-manifest.json'),
        JSON.stringify({ version: 1, agentWorkspaceRoots: [process.cwd()], files }),
      );
      await chmod(root, 0o700);
      await mkdir(resolve(root, 'secrets'), { mode: 0o700 });
      await writeFile(
        resolve(root, 'secrets/staging-access.json'),
        JSON.stringify({
          policyOrigin: 'https://admin-staging.sourcewayfinder.org',
          accessClientId: 'fixture.access',
          accessClientSecret: 'fictional',
        }),
        { mode: 0o600 },
      );
      process.env.CLOUDFLARE_API_TOKEN = 'fictional-only';
      let sourceRequests = 0,
        writes = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: any) => {
          if (url.includes('api.cloudflare.com')) {
            expect(url).toBe(
              'https://api.cloudflare.com/client/v4/accounts/a03d9f71f863eed1dc764ca7d4e34c49/workers/scripts/sourcewayfinder-staging-control/secrets',
            );
            if (init.method === 'PUT') {
              writes++;
              const body = JSON.parse(init.body);
              expect(body.name).toBe('WORKER_CREDENTIALS_JSON');
              expect(JSON.parse(body.text).map((r: any) => r.scopes)).toEqual([
                ['source:write'],
                ['proposal:write'],
              ]);
            }
            return Response.json({
              success: true,
              result: existing ? [{ name: 'WORKER_CREDENTIALS_JSON' }] : [],
            });
          }
          expect(url).toBe('https://admin-staging.sourcewayfinder.org/internal/v1/sources');
          sourceRequests++;
          return sourceRequests === 1
            ? Response.json({ error: { code: 'SERVICE_AUTH_REQUIRED' } }, { status: 401 })
            : sourceRequests === 2
              ? Response.json({
                  sources: [
                    'verizon-sim-web',
                    'verizon-account-access',
                    'verizon-account-roles',
                  ].map((id) => ({ id })),
                })
              : Response.json({ error: { code: 'SCOPE_REJECTED' } }, { status: 403 });
        }),
      );
      if (existing) {
        await expect(main(root)).rejects.toThrow('nothing overwritten');
        expect(writes).toBe(0);
      } else {
        await main(root);
        expect(writes).toBe(1);
        expect(sourceRequests).toBe(3);
        expect((await readdir(root)).some((x) => x.startsWith('service-setup-receipt-'))).toBe(
          true,
        );
      }
    } finally {
      vi.unstubAllGlobals();
      if (previous === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previous;
      await rm(root, { recursive: true, force: true });
    }
  },
);
