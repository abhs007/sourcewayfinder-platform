# Policy authority

This Worker holds approvals, immutable source versions, reviewed candidates, release manifests, and the active content pointers in one D1 database. Raw retained evidence goes into a separate D1 database. The public API binds only to the `PublishedContent` entrypoint, which exposes `listFlows`, `getFlow`, `getBundle`, and `getSources`.

Apply every numbered migration in `migrations/` in order to the control database and `evidence-migrations/0001_evidence.sql` to the evidence database. Use separate databases for staging and production. Direct D1 operations go to the primary; these reads must not be replaced with unconstrained replica reads.

## Configuration

| Binding or variable       | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `CONTROL_DB`              | D1 policy/content database                             |
| `EVIDENCE_DB`             | Private D1 retained raw evidence                       |
| `ENVIRONMENT`             | `staging` or `production`; production rejects fixtures |
| `ASSETS`                  | Built administrative application                       |
| `ACCESS_TEAM_DOMAIN`      | Exact `team.cloudflareaccess.com` domain               |
| `ACCESS_AUD`              | Access application audience                            |
| `ADMIN_EMAIL`             | Exact authorized Google email                          |
| `ADMIN_ORIGIN`            | Exact HTTPS dashboard origin                           |
| `CSRF_SECRET`             | Secret with at least 32 random characters              |
| `WORKER_CREDENTIALS_JSON` | Secret array of scoped credential hashes               |
| `SLACK_WEBHOOK_URL`       | Optional secret Slack incoming webhook                 |

A service credential record has `id`, `sha256`, `enabled`, `expiresAt`, and `scopes`. Hash a cryptographically random bearer token locally and retain only its hash in this Worker. Give each component its own credential and scopes. A service credential never authenticates a human. Access JWT validation checks the signature, issuer, audience, expiration and exact email. There is no development authentication bypass.

Configure the Access application to require your Google identity and Cloudflare's independent authenticator-app MFA. Protect static admin assets as well as API routes. Disable unrestricted `workers.dev` access. Internal automation routes require scoped credentials even when Cloudflare Access allows a narrowly configured service path. Never give the public API a binding to the default policy entrypoint.

## Review and release

1. The owner registers a flow and approved source URL boundaries through the administrative API. New flows start suspended.
2. The collector retains complete raw evidence and submits a successful source check. The Worker verifies raw and normalized hashes. Changed content suspends dependent guidance immediately and enqueues one maintenance event.
3. The bridge submits an immutable interpretation proposal. The owner approves its exact `interpretation_review` digest.
4. The bridge submits a candidate bundle, full commit identifier, code hash and migration hash. Citations must match retained passages in the approved source versions. It then submits expected cases and their test-code hash.
5. The owner approves `expected_answer_review`. Only the CI credential can submit a test run, and its start time must follow that approval. Test evidence records the exact approval instance.
6. The owner approves `merge_review` against the digest of the candidate, expected answers, current expected-answer approval and exact passing CI result.
7. The trusted publisher prepares a release with the merged tree hash and exact version identifiers for all four Workers. The merged tree hash must match the tested code hash. The owner approves `deployment_review` against the whole release manifest.
8. The publisher first acquires the shared-runtime lease, suspending every active flow if shared Worker/assets/schema hashes change, then promotes the policy pointer atomically. Promotion rechecks the latest four decisions, exact artifacts, current sources, test proof, previous release and status epoch. Concurrent attempts allow only one promotion. Guidance stays suspended.
9. CI submits smoke evidence for the exact release digest. The owner activates the verified release. Activation requires the owner's observed release ID, bundle hash and status epoch, then repeats approval, exact CI proof, source and shared-runtime checks within the conditional update.

Revoking a decision suspends the affected flow. Changing a released candidate or expected cases also suspends it. Reapproving expected answers requires a new test run; old results cannot be reused after withdrawal. Restoring Worker code alone never activates guidance.

The trusted external publisher still owns uploading and promoting actual Cloudflare Worker versions, observing their behavior, and reconciling deployment failures. This service does not deploy code, execute submitted tests, or certify that an agent's statements are true. Hosted release and rollback drills must verify those boundaries before launch.

## HTTP contracts

All JSON requests are limited to 256 KiB and reject duplicate keys. Responses carry request IDs and use `Cache-Control: no-store`. Administrative mutations require the Access assertion, an exact `Origin`, and `X-CSRF-Token` from `GET /admin/v1/dashboard`.

| Route                                           | Principal/scope                 |
| ----------------------------------------------- | ------------------------------- |
| `GET /admin/v1/dashboard`                       | Owner                           |
| `GET /admin/v1/proposals/:id`                   | Owner                           |
| `GET /admin/v1/releases/:id`                    | Owner                           |
| `POST /admin/v1/flows`                          | Owner                           |
| `POST /admin/v1/sources`                        | Owner                           |
| `POST /admin/v1/proposals/:id/decisions`        | Owner                           |
| `POST /admin/v1/releases/:id/decisions`         | Owner                           |
| `POST /admin/v1/flows/:id/status`               | Owner                           |
| `GET /internal/v1/sources`                      | `source:write`                  |
| `POST /internal/v1/evidence`                    | `source:write`                  |
| `PUT /internal/v1/evidence/:id/chunks/:ordinal` | `source:write`                  |
| `POST /internal/v1/evidence/:id/complete`       | `source:write`                  |
| `POST /internal/v1/source-checks`               | `source:write`                  |
| `POST /internal/v1/proposals`                   | `proposal:write`                |
| `POST /internal/v1/proposals/:id/candidate`     | `proposal:write`                |
| `POST /internal/v1/proposals/:id/expectations`  | `proposal:write`                |
| `POST /internal/v1/test-runs`                   | `test:write`                    |
| `POST /internal/v1/releases`                    | `release:prepare`               |
| `POST /internal/v1/releases/:id/promote`        | `release:promote`               |
| `POST /internal/v1/releases/:id/verify`         | `test:write`                    |
| `POST /internal/v1/flows/:id/status`            | `flow:suspend`, suspension only |
| `POST /internal/v1/jobs/claim`                  | `job:claim`                     |
| `POST /internal/v1/jobs/:id/finish`             | `job:claim`                     |

A review decision is `{gate, decision, digest, reason}`. Decisions are `approve`, `reject`, or `revise`. Flow status changes require `{status, reason}`. The source registration shape is `{id,flowId,url,title,approvedOrigin,approvedPath}`.

Evidence reservations use `{id,rawSha256,bytes,chunks}`. Each snapshot is capped at 1 MiB and split into exact 128 KiB chunks, except the final chunk. Upload each chunk as `{base64}` and complete the reservation only after every byte is present. Reservations charge payload bytes plus conservative per-row overhead against a 350 MiB ceiling. Reconcile actual D1 storage metrics during operation; never delete approved evidence to make a new collection fit.

Successful source checks use `{sourceId,sourceVersionId,snapshotSha256,normalizedSha256,normalizedText,extractorVersion,evidenceId,effectiveAt?}`. Normalized text is capped at 131,072 characters and is never silently truncated. Failed checks use `{sourceId,error}` and do not extend freshness. Source version and evidence IDs must match `[a-z][a-z0-9_-]{0,63}`.

A maintenance lease lasts 40 minutes. Only one unexpired job lease may exist globally. Expired leases can be resumed up to three attempts. Quota pauses require a future `notBefore` and do not consume repair attempts. This lock controls dispatch through the bridge; the owner must keep direct, uncoordinated Paperclip wakes disabled.

Configure an hourly scheduled trigger. The scheduled handler emits deduplicated overdue-source notifications after 24 hours and suspends stale active flows at 72 hours. Public status reads independently enforce the 72-hour boundary even if the scheduler or local Mac is unavailable. Notification delivery is bounded and may duplicate after a network timeout; the permanent record is the outbox and audit ledger.

## Validation

`npx vitest run tests/policy.test.ts tests/policy-auth.test.ts` exercises synthetic fixtures against local Miniflare D1 and verifies authentication, CSRF, scope restrictions, approval invalidation, concurrent promotion, source-change suspension, evidence limits, quota pause/resume and the 72-hour boundary. These are engineering tests. They do not approve Verizon or SSA guidance and do not replace hosted D1 acceptance, Google authentication setup, deployment smoke checks, or recovery drills.

## Bounded maintenance stages

Initial complete source collection and consequential changes enqueue `source_change`. Human interpretation approval enqueues `implement_guidance`; a changed candidate enqueues `draft_expectations`; human expected-answer approval enqueues `authorized_tests`. Only the last stage calls the trusted deterministic runner. The bridge maps implementation to the backend agent and expectation drafting to fresh QA context. It does not automatically merge or publish.

Jobs are unique by stage, entity and artifact/approval identity. Duplicate decisions are idempotent. Claiming a job returns only that flow's current source passages and relevant proposal/bundle manifests, skips superseded work, and waits without a model call when registered sources are incomplete or stale. Withdrawal and reapproval create a new approval instance; old dependent code, tests or releases cannot silently regain authorization.

Critical missing-page, extraction, incomplete-content and unsafe-origin failures suspend the flow and invalidate the source version immediately. Transient network failures retain the last successful check, subject to the 24/72-hour limits. A successful recovery of an invalidated version still requires the owner to review `/admin/v1/sources/:id` and POST `{sourceVersionId,reason}` to its `/revalidate` endpoint; flow activation is a separate action. Stable normalized content with volatile raw HTML keeps its reviewed logical source version and records the new raw fetch in immutable `source_observations`.

Slack notification delivery prefers `SLACK_BOT_TOKEN` with separate `SLACK_INCIDENT_CHANNEL`, `SLACK_REVIEW_CHANNEL` and `SLACK_RELEASE_CHANNEL` IDs. Incident, human-review and release events are routed separately. An incoming webhook is an optional single-channel fallback. Missing credentials do not manufacture delivery success; queued and failed events remain visible in the database.
