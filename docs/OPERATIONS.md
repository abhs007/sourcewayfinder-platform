# Operating SourceWayfinder

This is one owner’s operation. Paperclip coordinates bounded work; the public platform remains useful when Paperclip, the Mac, or model capacity is unavailable. No agent is an approval authority.

## Local start

Use Node 26.13.1, the committed npm lockfile, Docker CLI/Compose, and the dedicated `sourcewayfinder` Colima profile. Run from this repository:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run test:ui
python3 ops/paperclip-runtime.py status
npm run doctor
```

`python3 ops/paperclip-runtime.py prepare`, `vm-start`, `build`, and `up` prepare/start the isolated runtime. Read the Paperclip runbook before rebuilding an existing controller. Preserve its PostgreSQL volume, authentication secrets, SSH host keys, and guest Codex credentials. Do not use `docker compose down -v` as a repair step.

`npm run dev` serves a clearly fictional local integration fixture. It cannot approve or publish the real Verizon/SSA bundles. Start the public Vite server separately with `npm exec vite -- --config apps/web/vite.config.ts`. Production bundles remain under review until their evidence and expected cases are explicitly approved.

## Daily review

Open the authenticated review dashboard. Read incidents first. Review the source passages and the interpretation, then the expected outcomes and tests. Review a concise candidate diff and observed test results before merging. Approve a production release only after its manifest identifies exact Worker versions, code/migration/bundle hashes, retained test evidence, previous versions and recovery bookmarks.

Paperclip task completion and Slack reactions never satisfy a gate. A new source revision, changed expected answer, candidate, migration or bundle requires the dependent reviews again. A fresh QA/security context is another machine check, not independent human validation.

## Collection and dispatch

`npm run collect -- --browser` acquires the configured official sources locally. Verizon uses bounded HTTPS; SSA uses explicit isolated Chromium because ordinary direct HTTP returned 403. The browser collector uses no personal profile or login, disables JavaScript, blocks subresources, pins public DNS, and bounds document size/time. It never solves an access challenge.

For hosted ingestion, set `SWF_COLLECTOR_CONFIG` to an owner-only mode-600 JSON file with `policyOrigin`, `collectorToken`, `accessClientId` and `accessClientSecret`. Only sources registered by the human administrator are admitted. It retains immutable raw snapshots, normalized passages and provenance. A 304 reuses retained evidence only after integrity validation. Daily schedules use jitter and persistent `nextCheckAt`; a wake reconciles once instead of replaying every missed timer. A stale collector lock after a crash requires verifying its recorded PID is no longer alive before removing that one lock.

`npm run bridge -- private/bridge.json` reconciles durable policy jobs with Paperclip tasks. Its configuration includes `paperclipUrl`, `ownerCookieFile`, `policyUrl`, a job/proposal-scoped `policyToken`, and Access machine credentials. These files are never mounted in agents. A SQLite lease and inspection of active Paperclip runs admit one model run globally through this bridge. Agents cannot wake other agents through the task gateway. Owner manual runs must use the same dispatcher; deliberately starting runs outside it can bypass admission control.

The bridge never accepts approval commands from model output. It admits a structured proposal packet to the policy service, which validates the source set and creates a human review item. A provider quota response persists the job and pauses dispatch. It does not switch to an API key. Resume only after the actual provider permits it; inspect `private/bridge/state.sqlite` and the Paperclip run rather than repeatedly probing a model. Expired owner/Codex login causes a pause, not credential substitution.

## Deployment and traffic

Four separately built Workers serve web assets, guidance, control/admin, and survey. Guidance uses a named `PublishedContent` service binding with no mutation API. Sessions, policy and evidence have separate D1 bindings. Internal guidance/survey Workers have no `workers.dev`, previews, or public routes.

Production static assets are served before Worker code; `/api/*` invokes the web router and separate API/survey binding. `_headers` supplies static response protections. `_redirects` provides the canonical `www` redirect. Verify redirect behavior at the real edge before release. Staging serves through Worker authentication and must additionally have a full-host Cloudflare Access policy. The admin Worker validates Access signature, issuer, audience, expiry and exact Google email even behind Access. Configure Google MFA and verify it in the identity provider; email equality alone is not MFA proof.

Cloudflare distributes stateless requests. There is no local web origin or additional load balancer. D1 remains the authority for session sequences, leases, approval decisions and release pointers. Status polling never extends a session. Responses are `no-store`; there is no successful-guidance offline replay.

Generate complete configurations with `node ops/cloudflare-config.mjs private/cloudflare.json` after Access identifiers exist. `node ops/migrate.mjs staging` applies only staging schemas. `node ops/staging-deploy.mjs` requires the dedicated staging credential and denies production targets. Production uses the separately reviewed trusted publisher; ordinary PR CI holds no deployment, approval, backup or survey credentials.

## Failure response

- **Source changed or missing:** keep the affected flow under review, retain evidence, review the interpretation and expected cases. Freshness is checked during every guided request; Mac downtime cannot keep old guidance alive indefinitely.
- **Source collector silent:** warn at 24 hours; refuse guided answers at 72 hours. Public official links remain available. Restore collection and review eligibility before activation.
- **D1/status authority unavailable:** the API returns a typed error with request ID. Do not serve a previously successful decision from cache.
- **Release smoke failure:** suspend first, restore compatible application versions if available, retain disabled guidance, and prepare a forward fix. Restoring code never proves source validity.
- **Lost runtime:** recover PostgreSQL and controller recovery secrets from an authenticated backup; restore guest authentication or sign in again. Keep all roles paused until adapter and isolation checks pass.
- **Expired credential:** rotate through the service’s normal flow, keep the new secret outside the agent environment, and rerun a bounded environment test.

## Logs, capacity and free limits

Structured metadata logs carry request/trace/service/environment fields and relevant artifact/job/release IDs. Public logs omit answers, capabilities, authorization headers, account identifiers and survey payloads. Approval/release records are durable D1 audit events; sampled Cloudflare operational logs are not the permanent approval ledger. Container JSON logs rotate at 10 MB, five files. Preserve failed test traces locally and in encrypted backups.

The actual account was verified as Workers Free: 100,000 requests/day, 10 ms CPU/request, 10 D1 databases maximum, five million D1 rows read/day, 100,000 written/day and five account cron triggers. Current allocation is five databases: the original production survey plus four isolated staging databases. Production needs three additional databases; reuse the original survey, never copy staging survey responses into it. Staging cron triggers are disabled to keep the combined account below five.

Operational evidence storage stops at 350 MB/database and retains every referenced source. Backups use a 2 GB initial budget. Never automatically upgrade a plan. Account-wide quota measurements must include existing applications; a new project does not get a separate daily allowance. At 60% warn; at 80% stop nonessential collection, artifact work and diagnostics. Uptime checks must also run outside Cloudflare; this external monitor still requires setup and verification.

`node --import tsx ops/capacity.mts` is a bounded local discovery-load diagnostic: 20 requests/second for five minutes, then 100/second for five seconds. It does not prove hosted CPU, regional latency, full session/answer throughput, or free-tier headroom. Hosted capacity qualification must measure those separately and preserve the resulting evidence.

Staging smoke authentication uses a separate Access Service Auth token, configured as `STAGING_CHECK_CLIENT_ID` on the staging web Worker. Its signed JWT must have the exact staging audience, issuer, expiry and matching `common_name`, with the service-token empty subject. It is limited to read-only public staging routes and cannot reach admin/internal operations or create sessions. The owner identity remains a separate path. See [Cloudflare's application-token contract](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/). The synthetic identity is never enabled in production.

GitHub Free CI was checked in the authenticated billing UI: included compute/storage headroom was available and the account-wide Actions budget was already $0 with excess usage blocked. The repository variable `SWF_FREE_CI_VERIFIED` enables ordinary candidate validation under that cap; recheck it if account billing changes. No production credentials enter the workflow.

The broader local diagnostic `node --import tsx ops/capacity-sessions.mts` creates a fresh fictional runtime and exercises session creation, all three answer branches, and deletion. Its observed 6,498 requests had zero errors and left zero sessions. Local latency does not qualify hosted CPU, D1 billing or edge throughput.
