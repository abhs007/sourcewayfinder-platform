// Owner-operated credential capture. Copy with the reviewed package outside agent workspaces.
// This file never creates Access policies, reads existing credentials, or sends network requests.
import { mkdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPackage } from './staging-bootstrap.mjs';

export async function storeAccessCredentials(root, clientId, clientSecret) {
  if (
    typeof clientId !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}\.access$/.test(clientId) ||
    typeof clientSecret !== 'string' ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(clientSecret)
  )
    throw Error('The service-token values have an unexpected format. Nothing was saved.');
  root = await realpath(root);
  if ((await lstat(root)).mode & 0o077) throw Error('Operator directory must have mode 0700.');
  const secrets = resolve(root, 'secrets');
  await mkdir(secrets, { recursive: true, mode: 0o700 });
  if (
    (await realpath(secrets)) !== secrets ||
    !(await lstat(secrets)).isDirectory() ||
    (await lstat(secrets)).mode & 0o077
  )
    throw Error('Unsafe operator secrets directory.');
  try {
    await writeFile(
      resolve(secrets, 'staging-access.json'),
      JSON.stringify({
        policyOrigin: 'https://admin-staging.sourcewayfinder.org',
        accessClientId: clientId,
        accessClientSecret: clientSecret,
        savedAt: new Date().toISOString(),
        intendedTokenDurationHours: 168,
      }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (error) {
    if (error.code === 'EEXIST')
      throw Error('A saved service identity already exists. It was not read or overwritten.');
    throw Error('The service identity could not be saved.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    await verifyPackage(root);
    if (process.argv[2] !== '--capture')
      throw Error('Usage: node ops/staging-access-capture.mjs --capture');
    await storeAccessCredentials(
      root,
      process.env.SWF_ACCESS_CAPTURE_ID,
      process.env.SWF_ACCESS_CAPTURE_SECRET,
    );
    console.log(
      'Service identity saved privately. No access policy or Worker credential was enabled.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    delete process.env.SWF_ACCESS_CAPTURE_ID;
    delete process.env.SWF_ACCESS_CAPTURE_SECRET;
  }
}
