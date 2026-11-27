# Backup and recovery

The backup tool creates a consistent Paperclip PostgreSQL dump, captures runtime recovery keys/configuration and selected artifacts, exports each configured D1 database, encrypts the archive with AES-256-GCM, and uploads an immutable object to **SourceWayfinder Backups** in Google Drive. It downloads the uploaded object and compares SHA-256 before treating the off-device copy as verified.

On November 22, 2026, an initial local-runtime backup and a subsequent backup containing all five actual D1 stores passed upload/download checksum verification. The five stores are staging control, evidence, sessions and survey, plus the preserved existing production survey. The latter archive was 566,074 bytes, with SHA-256 `e5b9e6a86cb50ab474b900b366f9497b6f7340256f50b3b5b080a9c6b94e5234`. Drive reported approximately 12.7 GB free. Both a synthetic PostgreSQL restore drill and recovery of the actual archived data passed. The actual recovery downloaded that exact Drive object again, authenticated and decrypted it, checked every artifact hash, restored 342 public PostgreSQL tables into a disposable database and passed `pg_amcheck`. All five D1 exports restored into disposable local SQLite databases with successful integrity and foreign-key checks. No production database was modified or survey response contents printed. These checks do not establish the platform's complete production recovery gate or a restore into hosted D1.

## Configuration

Private configuration is `private/runtime/backup-config.json`. It names the key, archive directory, exact D1 database/config pairs, artifact paths and the dedicated Drive remote. Example D1 entry after deployment:

```json
{ "name": "sourcewayfinder-policy-production", "config": "workers/policy/wrangler.jsonc" }
```

Use actual deployed names. The current private `d1-backup.json` was generated from a real account database inventory and includes all five stores. A full backup refuses to run without a D1 inventory; `--local-only` explicitly records the limited scope. Update the inventory when production databases are provisioned. Independent D1 exports do not constitute a transaction across databases, so every restore starts with guidance disabled and requires reconciliation.

The 32-byte recovery key is `private/runtime/recovery-keys/backup.key`, mode 600, outside the archive directory and excluded from uploads. **Keep a separate offline copy before depending on these backups.** Losing both the Mac and this key makes encrypted archives unusable. Agents have no mounted access to this key or the rclone OAuth configuration.

The Drive connection uses `drive.file` scope and a private `private/runtime/rclone.conf`. Initial OAuth succeeded with rclone's shared client, but rclone 1.76 warns that client is being retired during 2026. Durable operation requires a user-owned Google OAuth Desktop client with Drive API enabled and a fresh normal authorization. Do not report the shared client as a long-term reliability guarantee.

## Commands

```sh
# Once only; fails rather than replacing an existing recovery key.
node ops/backup.mjs init-key

# Local runtime backup and verified off-device upload; explicitly excludes D1.
node ops/backup.mjs create --local-only --upload

# Full backup after every deployed D1 database is configured.
node ops/backup.mjs create

# Real encrypted restore drill in disposable PostgreSQL databases.
node ops/backup.mjs drill

# Download and restore the latest verified actual archive into disposable stores.
node ops/backup.mjs verify-latest

# Crypto-integrity and retention tests.
node --test ops/backup.test.mjs
```

`python3 ops/paperclip-runtime.py backup-local` is an emergency private `pg_dump` only. It is not encrypted and does not satisfy off-device recovery; use the Node backup command for normal operation.

Do not rotate Paperclip recovery keys while a backup is being captured. Logs and agent worktrees are omitted from the runtime archive; add selected diagnostic evidence and release artifacts through the reviewed `artifactPaths` list. Preserve source versions referenced by approvals in the appropriate evidence exports or artifact directories.

## Retention and failed backups

The initial budget is 2 GB. Retain representatives for seven daily and four weekly sets. Pruning occurs only after the new object is downloaded and its checksum verified. Failed dumps, exports, encryption, uploads or downloads never trigger pruning. The newest verified set is always retained. If a new set cannot fit, stop and request a storage decision; never auto-upgrade or delete the last good backup to make room.

The local index records hash, size, creation time and verification status. Archives have unique timestamp/random names and uploads use `--immutable`. Review `private/runtime/backup-last-error.log` for private command diagnostics; public errors do not print credentials. A failed process may leave a retained new archive for inspection, but it never promotes unauthenticated plaintext as a restore result.

## Recovery sequence

1. Suspend all guidance and stop agent admission. Retain the incident and active content status outside the failed runtime.
2. Recover the offline encryption key, download a known verified archive, and authenticate/decrypt it. Validate every recorded artifact hash before using it. `drill` exercises these operations against a synthetic fixture; `verify-latest` exercises the actual verified Drive archive and writes a private report without printing stored response contents.
3. Restore PostgreSQL into a fresh isolated database with `pg_restore --no-owner --exit-on-error`; restore matching Paperclip master/decision keys and controller configuration. Do not overwrite the only surviving database while testing recovery.
4. Restore hosted databases through the trusted operator using the appropriate D1 export or Time Travel bookmark. Preserve survey data and consent records. Reconcile policy approvals, source versions, active pointers and session invalidation.
5. Reauthenticate Codex if its isolated guest login was lost. Qualify SSH, model access and denied operations before resuming queued work.
6. Verify official sources and obtain the required human reactivation/release authorization. An old application image or restored database cannot reactivate stale guidance.

Run recovery verification monthly and perform a full application recovery rehearsal before production launch. Both commands create and drop only uniquely named temporary PostgreSQL databases; actual D1 exports are restored into temporary local SQLite files. They leave the real Paperclip and hosted databases intact. The private `actual-backup-restore-report.json` records schema counts, integrity results and the recovered archive hash. Local SQLite verification does not prove hosted D1 restore permissions or atomic recovery across databases. Test ciphertext tampering as well as the successful path: AES-GCM verification must fail before any restore command receives plaintext.
