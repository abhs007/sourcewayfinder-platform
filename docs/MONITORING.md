# Monitoring and budget admission

The deterministic monitor reads account-wide usage, measures the local backup directory, evaluates the configured ceilings, and writes a private admission report. It does not call a model, purchase a plan, delete evidence, change a release, or claim that unavailable telemetry is zero.

Run:

```sh
node --import tsx ops/monitor.mts private/runtime/monitor-config.json
```

Exit `0` means all required observed budgets permit nonessential work. Exit `2` means at least one required budget is unknown, at or above 80%, or exhausted. Exit `1` means configuration or monitor execution failed. Consumers must reject a missing or unreadable report as well as an expired one; do not interpret an absent file as permission.

## Live qualification

On November 22, the existing Cloudflare OAuth session successfully queried the actual account schema and today's account-wide metrics. The schema type is lowercase `account`. The live query and credential-free response are retained in `private/cloudflare-usage-live.json`; the initial monitor result is in `private/runtime/monitor-state.json`.

The implemented query uses these verified fields:

| Dataset                      | Fields                                                                                         | Scope                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `workersInvocationsAdaptive` | `sum.requests`, `sum.errors`, `sum.cpuTimeUs`, `quantiles.cpuTimeP99`, `dimensions.scriptName` | All scripts in the account, from UTC midnight to query time |
| `d1AnalyticsAdaptiveGroups`  | `sum.rowsRead`, `sum.rowsWritten`                                                              | All databases in the account, same UTC window               |
| `d1StorageAdaptiveGroups`    | `max.databaseSizeBytes`, `dimensions.databaseId`                                               | Storage analytics cross-check                               |
| D1 REST inventory            | `uuid`, `name`, `file_size`                                                                    | Current storage for every enumerated database               |

The CPU field's authenticated schema description explicitly identifies microseconds. The monitor takes the highest per-script CPU p99, rather than hiding a slow script inside an account average. This is a workload warning, not proof that every invocation fits the CPU limit.

Cloudflare documents delayed aggregation and describes its GraphQL datasets as analytics rather than an exact billing meter. Maintain headroom and retain the platform's own runtime limits. D1 analytics also omit requests that fail before reaching SQL execution. [Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/), [GraphQL limitations](https://developers.cloudflare.com/analytics/graphql-api/), [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)

## Thresholds and missing telemetry

- Below 60%: normal admission.
- At least 60%: warning.
- At least 80%: pause nonessential jobs and new agent runs.
- At or above the limit: exhausted; require operator action.
- Missing, invalid, future-dated, partial, stale, or wrong-UTC-day measurements: unknown; deny new nonessential work.

Reports expire after 15 minutes. A previously measured value remains usable only within that freshness window. A failed current query produces an unknown assessment; it does not extend the old timestamp. An account GraphQL error, truncated result set, or incomplete database inventory cannot yield a healthy report.

The deployed evidence reservation constraint is 367,001,600 bytes (350 MiB). The local/off-device backup budget is 2,147,483,648 bytes (2 GiB). These exact byte values match the implementation. Do not raise them silently. Budget restriction never permits deleting an approval-referenced source or the last known-good backup.

Import `readAdmission(path)` from `ops/monitor.mts` before starting nonessential background work. It re-evaluates measurements and expiry instead of trusting a stored boolean. The report is an operational admission signal, not release authority. Source freshness checks and incident handling remain essential operations; guidance still enforces its authoritative source/status checks on every request.

## Private configuration

The configuration must be an owner-owned regular file with mode `0600`. Keep it outside agent-mounted workspaces:

```json
{
  "accountId": "YOUR_VERIFIED_ACCOUNT_ID",
  "apiToken": "READ_ONLY_ACCOUNT_ANALYTICS_AND_D1_TOKEN",
  "backupDirectory": "/absolute/private/encrypted-backups",
  "stateFile": "/absolute/private/monitor-state.json",
  "evidenceDatabaseIds": ["YOUR_EVIDENCE_DATABASE_ID"],
  "supplementalMetricsFile": "/absolute/private/supplemental-metrics.json",
  "externalUptimeStatusFile": "/absolute/private/external-uptime-status.json"
}
```

Instead of `apiToken`, a private `wranglerCredentialFile` can point to an already authenticated Wrangler TOML file. This was used for the live qualification. Expired OAuth is a failure, not a reason to retry indefinitely or add another credential. Use a dedicated read-only identity for unattended operation and qualify its renewal or replacement process.

The monitor contacts only Cloudflare's fixed API origin. Authenticated requests reject redirects, have a 20-second timeout, and cap response bodies at 2 MiB. It prints assessment values and fixed error codes, not credentials or raw provider errors. Structured logs include request, trace and run IDs. Backup inventory rejects symlinks and special files.

## Remaining integrations are explicit

The live Cloudflare metrics and local backup count are measured. Logging ingestion allowance/usage, GitHub CI compute allowance, Drive account capacity, and off-device backup bytes still require provider integrations or fresh owner-verified records. They currently appear as **unknown** and keep nonessential admission closed. No usage value or free allowance has been invented for them.

A mode-0600 supplemental file can carry verified provider readings:

```json
{
  "metrics": [
    {
      "id": "ci.minutes",
      "used": 12,
      "limit": 2000,
      "observedAt": "REPLACE_WITH_ACTUAL_OBSERVATION_TIME",
      "required": true,
      "period": "month",
      "source": "provider_api"
    }
  ]
}
```

The numbers above demonstrate the format only; they are not this account's quota. Required groups are logging (`logging.ingested_bytes` or `logging.events`), CI (`ci.compute_usd` or `ci.minutes`), `drive.account_bytes`, and `drive.backup_bytes`. Supply exactly one metric per group; its usage and limit must use the same unit. The account UI currently reports included compute in USD credits, so use `ci.compute_usd` for that measurement; do not relabel credits as minutes. Logging event counts are similarly distinct from bytes. Sources must be `provider_api` or `owner_verified`; each observation must stay current. Verify the effective logging allowance in this account before filling it, especially around announced pricing changes.

## External uptime

No external monitoring account has been enrolled or represented as working. Configure a free provider outside Cloudflare to pull both of these endpoints at a conservative interval, with notifications to the owner's chosen destination:

```json
{
  "status": "enrollment_pending",
  "providerOutsideCloudflare": true,
  "plan": "free",
  "intervalSeconds": 300,
  "targets": [
    { "url": "https://sourcewayfinder.org/", "method": "GET", "expectedStatus": 200 },
    { "url": "https://sourcewayfinder.org/api/v1/domains", "method": "GET", "expectedStatus": 200 }
  ]
}
```

An uptime integration should write its own verified `monitors` records with `state`, `healthy`, and `checkedAt` to the configured status file. Until two active, healthy, recent checks are observed, the monitor reports `EXTERNAL_UPTIME_NOT_VERIFIED`. A local Mac probe is not equivalent to this outside check, particularly while the Mac sleeps. Test an intentional endpoint failure and recovery before calling alert delivery qualified.
