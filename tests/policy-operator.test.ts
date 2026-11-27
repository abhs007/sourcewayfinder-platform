import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, rm, realpath, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonical,
  sha,
  loadOperator,
  secret,
  hashFiles,
  runFixed,
  inspectCandidate,
} from '../ops/authorized-tests.mjs';
const roots: string[] = [];
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'swf-operator-test-')));
  roots.push(root);
  const trusted = join(root, 'trusted'),
    candidate = join(root, 'candidate');
  await mkdir(trusted);
  await mkdir(candidate);
  const script = join(trusted, 'authorized-tests.mjs'),
    configPath = join(trusted, 'operator.json');
  await writeFile(script, '// reviewed test-only tool');
  const config = {
    trustedRoot: trusted,
    candidateRoot: candidate,
    environment: 'staging',
    policyOrigin: 'https://admin-staging.example.test',
  };
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  return { root, trusted, candidate, script, configPath, config };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe('trusted operator boundary', () => {
  it('rejects tools executed from the candidate checkout', async () => {
    const x = await setup(),
      candidateScript = join(x.candidate, 'agent-copy.mjs');
    await writeFile(candidateScript, '// untrusted');
    await expect(loadOperator(x.configPath, candidateScript)).rejects.toThrow(
      'outside the candidate',
    );
    expect((await loadOperator(x.configPath, x.script)).environment).toBe('staging');
  });
  it('rejects exposed credentials and credentials outside the trusted directory', async () => {
    const x = await setup(),
      path = join(x.trusted, 'ci.token');
    await writeFile(path, 'synthetic-token', { mode: 0o600 });
    expect(await secret(path, x.trusted)).toBe('synthetic-token');
    await chmod(path, 0o644);
    await expect(secret(path, x.trusted)).rejects.toThrow('private files');
    const outside = join(x.candidate, 'token');
    await writeFile(outside, 'synthetic-token', { mode: 0o600 });
    await expect(secret(outside, x.trusted)).rejects.toThrow('private files');
  });
  it('hashes artifacts deterministically and refuses traversal outside the tree', async () => {
    const x = await setup();
    await writeFile(join(x.candidate, 'a'), 'first');
    await writeFile(join(x.candidate, 'b'), 'second');
    expect(await hashFiles(x.candidate, ['b', 'a'])).toBe(await hashFiles(x.candidate, ['a', 'b']));
    await expect(hashFiles(x.candidate, ['../trusted/authorized-tests.mjs'])).rejects.toThrow(
      'inside the approved tree',
    );
    expect(sha(canonical({ b: 2, a: 1 }))).toBe(sha(canonical({ a: 1, b: 2 })));
  });
  it('does not execute repository-configured fsmonitor commands', async () => {
    const x = await setup(),
      marker = join(x.trusted, 'executed-marker'),
      monitor = join(x.candidate, '.git', 'monitor');
    await runFixed('/usr/bin/git', ['init', '--quiet', x.candidate], {});
    await writeFile(monitor, `#!/bin/sh\nprintf bad > '${marker}'\n`, { mode: 0o700 });
    await runFixed('/usr/bin/git', ['-C', x.candidate, 'config', 'core.fsmonitor', monitor], {});
    await expect(inspectCandidate(x.candidate)).rejects.toThrow();
    await expect(access(marker)).rejects.toThrow();
  });
  it('passes command arguments literally without a shell', async () => {
    const literal = '$(printf unintended-shell-command)';
    expect(
      await runFixed(
        process.execPath,
        ['-e', 'process.stdout.write(process.argv[1])', literal],
        {},
      ),
    ).toBe(literal);
  });
});

it('refuses a partial-clone fetch while inspecting an incomplete candidate', async () => {
  const x = await setup();
  const git = (args: string[]) => runFixed('/usr/bin/git', ['-C', x.candidate, ...args], {});
  await git(['init', '--quiet']);
  await writeFile(join(x.candidate, 'fixture.txt'), 'Disposable test fixture');
  await git(['add', 'fixture.txt']);
  await git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const tree = (await git(['rev-parse', 'HEAD^{tree}'])).trim();
  // Remove only a disposable fixture object. Inspection must fail without repairing it.
  await rm(join(x.candidate, '.git', 'objects', tree.slice(0, 2), tree.slice(2)));
  const marker = join(x.trusted, 'transport-started');
  const hook = join(x.candidate, '.git', 'fixture-uploadpack');
  await writeFile(hook, `#!/bin/sh\nprintf invoked > '${marker}'\nexit 1\n`, { mode: 0o700 });
  for (const [key, value] of [
    ['extensions.partialClone', 'origin'],
    ['remote.origin.promisor', 'true'],
    ['remote.origin.url', x.candidate],
    ['remote.origin.uploadpack', hook],
  ])
    await git(['config', key!, value!]);
  await expect(inspectCandidate(x.candidate)).rejects.toThrow();
  await expect(access(marker)).rejects.toThrow();
});
