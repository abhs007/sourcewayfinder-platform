// Source and contract checks only. No credentials, network, responses, or deployments.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'legacy/import-manifest.json'), 'utf8'));
assert.equal(manifest.import_root, 'legacy/phone-loss-recovery');
assert.equal(manifest.source_commit, '5c1c0086e9343adcca5cae86f619f3e15d5fb893');
const imported = resolve(root, manifest.import_root);
const seen = new Set();
for (const entry of manifest.files) {
  assert(!seen.has(entry.path), `Duplicate import: ${entry.path}`);
  seen.add(entry.path);
  const path = resolve(imported, entry.path);
  assert(path.startsWith(imported + sep), 'Import path must remain in the legacy source tree');
  assert((await lstat(path)).isFile(), `Regular file required: ${entry.path}`);
  const bytes = await readFile(path);
  assert.equal(bytes.byteLength, entry.bytes, `Import size mismatch: ${entry.path}`);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    `Import hash mismatch: ${entry.path}`,
  );
}
const legacySite = resolve(imported, 'sourcewayfinder');
const legacySchema = JSON.parse(
  await readFile(resolve(legacySite, 'Product_Design/survey-schema.json'), 'utf8'),
);
const platformSchema = JSON.parse(
  await readFile(resolve(root, 'workers/survey/schema.json'), 'utf8'),
);
assert.deepEqual(
  platformSchema,
  legacySchema,
  'Survey instrument and consent version must be preserved',
);
assert.equal(
  await readFile(resolve(root, 'workers/survey/migrations/0001_responses.sql'), 'utf8'),
  await readFile(resolve(legacySite, 'cloudflare/migrations/0001_responses.sql'), 'utf8'),
  'Survey database schema must be preserved',
);
console.log(
  `Verified ${seen.size} imported source files, survey instrument, and database schema. No production access.`,
);
