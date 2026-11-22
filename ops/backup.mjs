#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = resolve(ROOT, 'private/runtime');
const MAGIC = Buffer.from('SWFBK01\n');
const DOCKER = ['--context', 'colima-sourcewayfinder'];
const BUDGET = 2 * 1024 * 1024 * 1024;
const sha = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

async function command(bin, args, { output, input, env, allowFailure = false } = {}) {
  const child = spawn(bin, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-8000);
  });
  const io = [];
  if (input) io.push(pipeline(createReadStream(input), child.stdin));
  else child.stdin.end();
  if (output)
    io.push(pipeline(child.stdout, createWriteStream(output, { mode: 0o600, flags: 'wx' })));
  else
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 8 * 1024 * 1024) stdout += chunk;
    });
  const code = await new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('close', accept);
  });
  await Promise.all(io);
  if (code !== 0 && !allowFailure) {
    await writeFile(resolve(PRIVATE, 'backup-last-error.log'), stderr, { mode: 0o600 });
    throw Error(`${bin} failed (${code}); inspect private/runtime/backup-last-error.log`);
  }
  return { code, stdout, stderr };
}

async function keyBytes(path) {
  const info = await stat(path);
  if ((info.mode & 0o077) !== 0) throw Error('Recovery key must have mode 600');
  const key = await readFile(path);
  if (key.length !== 32) throw Error('Recovery key must be exactly 32 bytes');
  return key;
}

export async function encryptArchive(input, output, keyPath) {
  const key = await keyBytes(keyPath),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([MAGIC, iv]);
  cipher.setAAD(header);
  const partial = output + '.partial';
  const handle = await open(partial, 'wx', 0o600);
  await handle.write(header);
  await handle.close();
  try {
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(partial, { flags: 'a', mode: 0o600 }),
    );
    const out = await open(partial, 'a');
    await out.write(cipher.getAuthTag());
    await out.sync();
    await out.close();
    // Never overwrite an existing immutable archive.
    try {
      await stat(output);
      throw Error('Archive already exists');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rename(partial, output);
    return { sha256: await sha(output), bytes: (await stat(output)).size };
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  } finally {
    key.fill(0);
  }
}

export async function decryptArchive(input, output, keyPath) {
  const key = await keyBytes(keyPath),
    info = await stat(input);
  if (info.size < MAGIC.length + 12 + 16) throw Error('Truncated encrypted archive');
  const source = await open(input, 'r'),
    header = Buffer.alloc(MAGIC.length + 12),
    tag = Buffer.alloc(16);
  await source.read(header, 0, header.length, 0);
  await source.read(tag, 0, 16, info.size - 16);
  await source.close();
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw Error('Unknown backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const partial = output + '.partial';
  try {
    await pipeline(
      createReadStream(input, { start: header.length, end: info.size - 17 }),
      decipher,
      createWriteStream(partial, { flags: 'wx', mode: 0o600 }),
    );
    await rename(partial, output);
  } catch (error) {
    await rm(partial, { force: true });
    throw Error('Archive authentication failed; no restore attempted', { cause: error });
  } finally {
    key.fill(0);
  }
}

export function retentionKeep(entries) {
  const ordered = entries
    .filter((e) => e.verified)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keep = new Set(),
    days = new Set(),
    weeks = new Set();
  for (const entry of ordered) {
    const date = new Date(entry.createdAt),
      day = entry.createdAt.slice(0, 10);
    const monday = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
      ),
    );
    const week = monday.toISOString().slice(0, 10);
    if ((!days.has(day) && days.size < 7) || (!weeks.has(week) && weeks.size < 4))
      keep.add(entry.file);
    if (days.size < 7) days.add(day);
    if (weeks.size < 4) weeks.add(week);
  }
  if (ordered[0]) keep.add(ordered[0].file);
  return keep;
}

async function recordFiles(directory) {
  const entries = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name);
      if (entry.isSymbolicLink()) throw Error('Backup inputs must not contain symbolic links');
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile())
        entries.push({
          path: relative(directory, file),
          bytes: (await stat(file)).size,
          sha256: await sha(file),
        });
    }
  }
  await walk(directory);
  return entries;
}

async function verifyPlainArchive(archive, destination) {
  const listing = (await command('tar', ['-tzf', archive])).stdout.trim().split('\n');
  if (listing.some((path) => path.startsWith('/') || path.split('/').includes('..')))
    throw Error('Unsafe archive paths');
  const detailed = (await command('tar', ['-tvzf', archive])).stdout.trim().split('\n');
  if (detailed.some((line) => !['-', 'd'].includes(line[0])))
    throw Error('Archive contains links or special files');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await command('tar', ['-xzf', archive, '-C', destination]);
  const manifest = JSON.parse(await readFile(resolve(destination, 'manifest.json'), 'utf8'));
  for (const item of manifest.files) {
    const file = resolve(destination, item.path);
    if (
      !file.startsWith(destination + '/') ||
      (await stat(file)).size !== item.bytes ||
      (await sha(file)) !== item.sha256
    )
      throw Error('Restored artifact digest mismatch');
  }
  return manifest;
}

async function packageArchive(work, key, output, metadata) {
  const files = await recordFiles(work);
  const manifest = { version: 1, createdAt: new Date().toISOString(), ...metadata, files };
  await writeFile(resolve(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    mode: 0o600,
  });
  const tar = output + '.tar.gz';
  await command('tar', ['-czf', tar, '-C', work, '.']);
  try {
    const encrypted = await encryptArchive(tar, output, key);
    const check = output + '.verify.tar.gz';
    await decryptArchive(output, check, key);
    if ((await sha(tar)) !== (await sha(check)))
      throw Error('Encrypted archive round-trip mismatch');
    await rm(check);
    return { ...encrypted, createdAt: manifest.createdAt, file: basename(output), verified: true };
  } finally {
    await rm(tar, { force: true });
  }
}

async function createBackup(config, { localOnly = false, upload = !localOnly } = {}) {
  const out = resolve(config.archiveDirectory ?? resolve(PRIVATE, 'encrypted-backups'));
  const key = resolve(config.keyFile);
  if (key.startsWith(out + '/'))
    throw Error('Recovery key must be outside backup archive directory');
  await keyBytes(key);
  await mkdir(out, { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(resolve(PRIVATE, 'backup-work-'));
  await chmod(scratch, 0o700);
  try {
    const dump = resolve(scratch, 'paperclip.pgdump');
    await command(
      'docker',
      [
        ...DOCKER,
        'exec',
        'sourcewayfinder-db-1',
        'pg_dump',
        '-U',
        'paperclip',
        '-d',
        'paperclip',
        '--format=custom',
      ],
      { output: dump },
    );
    // pg_dump uses a consistent MVCC snapshot. Runtime recovery files are packed
    // separately from volatile logs, node_modules and agent working trees.
    await command(
      'docker',
      [
        ...DOCKER,
        'exec',
        'sourcewayfinder-controller-1',
        'tar',
        '-czf',
        '-',
        '-C',
        '/paperclip',
        '--exclude=*.log',
        '--exclude=logs',
        '--exclude=workspaces',
        '--exclude=agents',
        '--exclude=backups',
        '--exclude=node_modules',
        '--exclude=run-logs',
        'instances',
      ],
      { output: resolve(scratch, 'paperclip-recovery.tar.gz') },
    );
    await copyFile(resolve(PRIVATE, '.env'), resolve(scratch, 'controller.env'));
    await copyFile(resolve(PRIVATE, 'agent_ed25519'), resolve(scratch, 'controller-agent-ssh-key'));
    await copyFile(resolve(PRIVATE, 'known_hosts'), resolve(scratch, 'known_hosts'));
    for (const name of [
      'bootstrap-manifest.json',
      'owner-credentials.json',
      'build-inputs.json',
      'rclone.conf',
    ]) {
      try {
        await copyFile(resolve(PRIVATE, name), resolve(scratch, name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!localOnly && !config.d1?.length)
      throw Error('No D1 databases configured; a full backup cannot omit hosted state');
    for (const db of localOnly ? [] : config.d1) {
      if (!/^[a-z0-9_-]+$/i.test(db.name)) throw Error('Invalid D1 database name');
      const output = resolve(scratch, db.name + '.sql');
      await command(process.execPath, [
        resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
        'd1',
        'export',
        db.name,
        '--remote',
        '--config',
        resolve(ROOT, db.config),
        '--output',
        output,
      ]);
    }
    for (const [index, path] of (config.artifactPaths ?? []).entries()) {
      const full = resolve(ROOT, path);
      if (!full.startsWith(ROOT + '/')) throw Error('Artifact path outside project');
      const target = resolve(scratch, `artifacts-${index}.tar.gz`);
      await command('tar', ['-czf', target, '-C', dirname(full), basename(full)]);
    }
    const total = (await recordFiles(scratch)).reduce((n, f) => n + f.bytes, 0);
    if (total > BUDGET)
      throw Error(
        'Backup inputs exceed 2 GB budget; preserve existing sets and request storage decision',
      );
    const name =
      new Date().toISOString().replaceAll(':', '-') +
      '-' +
      randomBytes(4).toString('hex') +
      '.swfbak';
    const result = await packageArchive(scratch, key, resolve(out, name), {
      scope: localOnly ? 'local-only' : 'full',
      d1: localOnly ? [] : config.d1.map((x) => x.name),
      guidanceRestoreState: 'disabled',
    });
    const indexPath = resolve(out, 'index.json');
    let index = [];
    try {
      index = JSON.parse(await readFile(indexPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    index.push(result);
    if (index.reduce((sum, e) => sum + e.bytes, 0) > BUDGET)
      throw Error(
        'Local backup ceiling exceeded; new verified set retained, no previous set deleted',
      );
    await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', { mode: 0o600 });
    if (upload) {
      const remote = config.driveRemote;
      if (!/^sourcewayfinder-drive:SourceWayfinder Backups(?:\/[^.]*)?$/.test(remote ?? ''))
        throw Error('Dedicated backup folder required');
      const rc = ['--config', resolve(PRIVATE, 'rclone.conf')];
      const size = JSON.parse((await command('rclone', ['size', remote, '--json', ...rc])).stdout);
      const capacity = JSON.parse(
        (await command('rclone', ['about', 'sourcewayfinder-drive:', '--json', ...rc])).stdout,
      );
      if (typeof capacity.free !== 'number' || capacity.free < result.bytes)
        throw Error('Drive capacity cannot accommodate the new archive');
      if (size.bytes + result.bytes > BUDGET)
        throw Error(
          'Off-device 2 GB ceiling would be exceeded; upload paused without deleting backups',
        );
      await command('rclone', [
        'copyto',
        resolve(out, name),
        remote + '/' + name,
        '--immutable',
        ...rc,
      ]);
      const roundTrip = resolve(scratch, 'download.swfbak');
      await command('rclone', ['copyto', remote + '/' + name, roundTrip, ...rc]);
      if ((await sha(roundTrip)) !== result.sha256)
        throw Error('Drive downloaded checksum mismatch');
      result.offDeviceVerified = true;
      await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', { mode: 0o600 });
      // Pruning is permitted only after the new immutable archive has been
      // downloaded and verified. Keep seven daily and four weekly representatives.
      const keep = retentionKeep(index.filter((entry) => entry.offDeviceVerified));
      for (const entry of index.filter(
        (entry) => entry.offDeviceVerified && !keep.has(entry.file),
      )) {
        await command('rclone', ['deletefile', remote + '/' + entry.file, ...rc]);
        await rm(resolve(out, entry.file), { force: true });
        index = index.filter((item) => item.file !== entry.file);
      }
      await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', { mode: 0o600 });
    }
    return result;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function restoreDrill(key) {
  const id = randomBytes(6).toString('hex'),
    source = 'swf_drill_' + id,
    target = 'swf_restore_' + id;
  const work = await mkdtemp(resolve(PRIVATE, 'restore-drill-'));
  const db = (args, opts) =>
    command(
      'docker',
      [...DOCKER, 'exec', ...(opts?.input ? ['-i'] : []), 'sourcewayfinder-db-1', ...args],
      opts,
    );
  try {
    await db(['createdb', '-U', 'paperclip', source]);
    const fixture = resolve(work, 'fixture.sql');
    await writeFile(
      fixture,
      "CREATE TABLE fixture(id integer primary key, value text not null); INSERT INTO fixture VALUES(1,'suspended'),(2,'digest-bound');\n",
    );
    await db(['psql', '-U', 'paperclip', '-d', source, '-v', 'ON_ERROR_STOP=1'], {
      input: fixture,
    });
    await rm(fixture);
    await db(['pg_dump', '-U', 'paperclip', '-d', source, '-Fc'], {
      output: resolve(work, 'fixture.pgdump'),
    });
    const encrypted = resolve(PRIVATE, 'drill-' + id + '.swfbak');
    const result = await packageArchive(work, key, encrypted, { scope: 'synthetic-restore-drill' });
    const plain = resolve(work, 'restore.tar.gz');
    await decryptArchive(encrypted, plain, key);
    const restored = resolve(work, 'verified');
    await verifyPlainArchive(plain, restored);
    await db(['createdb', '-U', 'paperclip', target]);
    await db(['pg_restore', '-U', 'paperclip', '--no-owner', '--exit-on-error', '-d', target], {
      input: resolve(restored, 'fixture.pgdump'),
    });
    const rows = (
      await db([
        'psql',
        '-U',
        'paperclip',
        '-d',
        target,
        '-At',
        '-c',
        'SELECT id,value FROM fixture ORDER BY id',
      ])
    ).stdout.trim();
    if (rows !== '1|suspended\n2|digest-bound') throw Error('Restored fixture differs');
    await rm(encrypted);
    return {
      passed: true,
      checks: [
        'application-consistent pg_dump',
        'AES-256-GCM authentication',
        'archive artifact checksums',
        'isolated PostgreSQL restore',
        'exact fixture values',
      ],
      archiveHash: result.sha256,
    };
  } finally {
    await db(['dropdb', '-U', 'paperclip', '--if-exists', source], { allowFailure: true });
    await db(['dropdb', '-U', 'paperclip', '--if-exists', target], { allowFailure: true });
    await rm(work, { recursive: true, force: true });
  }
}

async function verifyLatestActualBackup(config) {
  const directory = resolve(config.archiveDirectory ?? resolve(PRIVATE, 'encrypted-backups'));
  const index = JSON.parse(await readFile(resolve(directory, 'index.json'), 'utf8'));
  const latest = index
    .filter((e) => e.verified && e.offDeviceVerified)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest || !/^[a-zA-Z0-9_.:-]+\.swfbak$/.test(latest.file))
    throw Error('No verified off-device backup available');
  const work = await mkdtemp(resolve(PRIVATE, 'actual-restore-'));
  await chmod(work, 0o700);
  const target = 'swf_actual_' + randomBytes(6).toString('hex');
  let created = false;
  const db = (args, opts) =>
    command(
      'docker',
      [...DOCKER, 'exec', ...(opts?.input ? ['-i'] : []), 'sourcewayfinder-db-1', ...args],
      opts,
    );
  try {
    const archive = resolve(work, latest.file);
    await command('rclone', [
      'copyto',
      config.driveRemote + '/' + latest.file,
      archive,
      '--config',
      resolve(PRIVATE, 'rclone.conf'),
    ]);
    if ((await sha(archive)) !== latest.sha256)
      throw Error('Downloaded actual backup differs from verified archive');
    const plain = resolve(work, 'restored.tar.gz');
    await decryptArchive(archive, plain, resolve(config.keyFile));
    const extracted = resolve(work, 'extracted');
    const manifest = await verifyPlainArchive(plain, extracted);
    if (manifest.scope !== 'full')
      throw Error('Latest archive is local-only; a complete D1 recovery check requires a full set');
    const expected = (config.d1 ?? []).map((x) => x.name).sort();
    if (JSON.stringify([...manifest.d1].sort()) !== JSON.stringify(expected))
      throw Error('Archived D1 inventory differs from configured inventory');
    await db(['createdb', '-U', 'paperclip', target]);
    created = true;
    await db(
      [
        'pg_restore',
        '-U',
        'paperclip',
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '-d',
        target,
      ],
      { input: resolve(extracted, 'paperclip.pgdump') },
    );
    const queries = {
      tables:
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      agents: 'SELECT count(*) FROM public.agents',
      companies: 'SELECT count(*) FROM public.companies',
    };
    const counts = {};
    for (const [name, query] of Object.entries(queries))
      counts[name] = Number(
        (
          await db([
            'psql',
            '-U',
            'paperclip',
            '-d',
            target,
            '-At',
            '-v',
            'ON_ERROR_STOP=1',
            '-c',
            query,
          ])
        ).stdout.trim(),
      );
    if (counts.tables < 1 || counts.agents < 1 || counts.companies < 1)
      throw Error('Restored application schema or expected records missing');
    await db(['pg_amcheck', '-U', 'paperclip', '-d', target, '--install-missing']);
    const sqliteScript = `import json,pathlib,sqlite3,sys
root=pathlib.Path(sys.argv[1]);names=json.loads(sys.argv[2]);results=[]
for name in names:
 path=root/(name+'.sql');database=root/(name+'.sqlite');connection=sqlite3.connect(database)
 connection.executescript(path.read_text())
 integrity=connection.execute('PRAGMA integrity_check').fetchall()
 if integrity!=[('ok',)]:raise RuntimeError('SQLite integrity check failed')
 foreign=connection.execute('PRAGMA foreign_key_check').fetchall()
 if foreign:raise RuntimeError('SQLite foreign key check failed')
 tables=[row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
 counts={table:connection.execute('SELECT count(*) FROM "'+table.replace('"','""')+'"').fetchone()[0] for table in tables}
 results.append({'database':name,'integrity':'ok','foreignKeyViolations':0,'tableCounts':counts});connection.close()
print(json.dumps(results))
`;
    const d1 = JSON.parse(
      (await command('/usr/bin/python3', ['-c', sqliteScript, extracted, JSON.stringify(expected)]))
        .stdout,
    );
    const report = {
      checkedAt: new Date().toISOString(),
      passed: true,
      archive: latest.file,
      archiveSha256: latest.sha256,
      archiveScope: manifest.scope,
      downloadedFromDrive: true,
      authenticatedDecryption: true,
      allArtifactDigestsVerified: true,
      postgres: { disposableDatabase: target, restore: 'passed', amcheck: 'passed', counts },
      d1,
      limits: [
        'D1 exports restored into local SQLite, not hosted D1',
        'Production databases and survey were not modified',
        'Reactivation of guidance is not authorized by this drill',
      ],
    };
    await writeFile(
      resolve(PRIVATE, 'actual-backup-restore-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
    return {
      passed: true,
      d1Databases: d1.length,
      postgresTables: counts.tables,
      archiveSha256: latest.sha256,
    };
  } finally {
    if (created)
      await db(['dropdb', '-U', 'paperclip', '--if-exists', target], { allowFailure: true });
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  try {
    if (action === 'init-key') {
      const file = resolve(option('--key') ?? resolve(PRIVATE, 'recovery-keys/backup.key'));
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, randomBytes(32), { flag: 'wx', mode: 0o600 });
      console.log(
        'Recovery key created privately. Keep a separate offline copy; never upload it beside archives.',
      );
    } else if (action === 'create') {
      const config = JSON.parse(
        await readFile(
          resolve(option('--config') ?? resolve(PRIVATE, 'backup-config.json')),
          'utf8',
        ),
      );
      console.log(
        JSON.stringify(
          await createBackup(config, {
            localOnly: args.includes('--local-only'),
            upload: args.includes('--upload') || !args.includes('--local-only'),
          }),
        ),
      );
    } else if (action === 'drill') {
      const result = await restoreDrill(
        resolve(option('--key') ?? resolve(PRIVATE, 'recovery-keys/backup.key')),
      );
      await writeFile(
        resolve(PRIVATE, 'restore-drill-report.json'),
        JSON.stringify(result, null, 2) + '\n',
        { mode: 0o600 },
      );
      console.log(JSON.stringify(result));
    } else if (action === 'verify-latest') {
      const config = JSON.parse(
        await readFile(
          resolve(option('--config') ?? resolve(PRIVATE, 'backup-config.json')),
          'utf8',
        ),
      );
      console.log(JSON.stringify(await verifyLatestActualBackup(config)));
    } else
      throw Error(
        'Usage: backup.mjs init-key|create|drill|verify-latest [--key PATH] [--config PATH] [--local-only]',
      );
  } catch (error) {
    console.error(JSON.stringify({ service: 'backup', status: 'failed', message: error.message }));
    process.exitCode = 1;
  }
}
