import { it, expect } from 'vitest';
import { mkdtemp, chmod, mkdir, readFile, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { storeAccessCredentials } from '../ops/staging-access-capture.mjs';

const clientId = 'fictionalclientid123456789.access';
const secret = 'fictional-test-value-only-'.repeat(3);
async function isolated(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(resolve(tmpdir(), 'swf-access-fixture-'));
  try {
    await chmod(root, 0o700);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
it('stores fictional values privately and never overwrites an existing service identity', async () => {
  await isolated(async (root) => {
    await storeAccessCredentials(root, clientId, secret);
    const path = resolve(root, 'secrets/staging-access.json');
    const original = await readFile(path, 'utf8');
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(original)).toMatchObject({
      policyOrigin: 'https://admin-staging.sourcewayfinder.org',
      accessClientId: clientId,
      accessClientSecret: secret,
    });
    await expect(storeAccessCredentials(root, clientId, 'a'.repeat(64))).rejects.toThrow(
      'not read or overwritten',
    );
    expect(await readFile(path, 'utf8')).toBe(original);
  });
});
it('rejects invalid values and unsafe directory permissions before saving', async () => {
  await isolated(async (root) => {
    await expect(storeAccessCredentials(root, 'bad', secret)).rejects.toThrow('Nothing was saved');
    await expect(storeAccessCredentials(root, clientId, 'bad')).rejects.toThrow(
      'Nothing was saved',
    );
    await chmod(root, 0o755);
    await expect(storeAccessCredentials(root, clientId, secret)).rejects.toThrow('0700');
  });
});
it('refuses a redirected secrets directory', async () => {
  await isolated(async (root) => {
    await mkdir(resolve(root, 'different'), { mode: 0o700 });
    await symlink(resolve(root, 'different'), resolve(root, 'secrets'));
    await expect(storeAccessCredentials(root, clientId, secret)).rejects.toThrow('Unsafe');
  });
});
