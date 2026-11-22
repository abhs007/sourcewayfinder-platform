import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encryptArchive, decryptArchive, retentionKeep } from './backup.mjs';

test('AES-GCM round trip rejects tampering and never publishes unauthenticated plaintext', async () => {
  const root = await mkdtemp(join(tmpdir(), 'swf-backup-test-'));
  try {
    const key = join(root, 'key'),
      plain = join(root, 'plain'),
      encrypted = join(root, 'archive'),
      restored = join(root, 'restored');
    await writeFile(key, randomBytes(32), { mode: 0o600 });
    await writeFile(plain, 'sourcewayfinder synthetic fixture');
    await encryptArchive(plain, encrypted, key);
    await decryptArchive(encrypted, restored, key);
    assert.equal(await readFile(restored, 'utf8'), 'sourcewayfinder synthetic fixture');
    const bytes = await readFile(encrypted);
    bytes[25] ^= 1;
    await writeFile(join(root, 'tampered'), bytes);
    await assert.rejects(
      decryptArchive(join(root, 'tampered'), join(root, 'bad-output'), key),
      /authentication failed/,
    );
    await assert.rejects(stat(join(root, 'bad-output')), { code: 'ENOENT' });
    await assert.rejects(stat(join(root, 'bad-output.partial')), { code: 'ENOENT' });
    await assert.rejects(encryptArchive(plain, encrypted, key), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('retention keeps latest known-good, seven days and four weeks, excluding failures', () => {
  const entries = Array.from({ length: 35 }, (_, i) => ({
    file: `${i}.swfbak`,
    verified: true,
    createdAt: new Date(Date.UTC(2026, 10, 22 - i)).toISOString(),
  }));
  entries.unshift({ file: 'failed', verified: false, createdAt: '2026-11-23T00:00:00.000Z' });
  const keep = retentionKeep(entries);
  assert.ok(keep.has('0.swfbak'));
  assert.ok(keep.has('6.swfbak'));
  assert.ok(!keep.has('failed'));
  assert.ok(keep.size >= 7 && keep.size <= 11);
  assert.ok(!keep.has('34.swfbak'));
});
