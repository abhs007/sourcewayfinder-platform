# Release and authorized acceptance testing

The release tools are implemented, but a production release is not authorized by their existence. The two real procedures still need the owner's source interpretation, expected-answer, merge and exact-manifest decisions. No production deployment or real-procedure acceptance run was performed while writing this runbook.

## Establish the operator boundary

Create an operator directory outside the repository and every agent workspace, for example `/Users/abhishekvaishnav/.sourcewayfinder-operator`. Give it mode 0700. Copy reviewed `ops/authorized-tests.mjs` and `ops/publisher.mts` into that directory. Install the exact lockfile dependencies there, including Wrangler **4.166.0** and tsx. Keep these copies, their configuration, release receipts and credentials unavailable to agent containers. Record their SHA-256 hashes after review.

The candidate checkout must be clean and committed. Its `codeHash` is SHA-256 over canonical JSON `{files:[{path,sha256},...]}` for every Git-tracked file, ordered by path. `migrationHash` uses the same algorithm restricted to Worker SQL migrations. Worker files and both public/admin asset directories get separate content hashes. Run `inspectCandidate` from the trusted test tool to calculate these values; do not substitute a Git commit ID for the content hash.

Use separate credentials for the publisher (`release:prepare`, `release:promote`), incident suspension (`flow:suspend`), and CI (`test:write`). Store raw tokens in separate mode-0600 files inside the operator directory. Only the host tools read them. Candidate code never receives these credentials, the Cloudflare deployment token, a Docker socket, or a host home mount.

An operator configuration has this shape. Supply real values through the normal authorized setup; placeholder values fail validation.

```json
{
  "trustedRoot": "/Users/abhishekvaishnav/.sourcewayfinder-operator",
  "candidateRoot": "/path/to/clean/candidate-checkout",
  "environment": "staging",
  "policyOrigin": "https://admin-staging.sourcewayfinder.org",
  "publicOrigin": "https://staging.sourcewayfinder.org",
  "accountId": "VERIFIED_CLOUDFLARE_ACCOUNT_ID",
  "publisherCredentialFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/publisher.token",
  "incidentCredentialFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/incident.token",
  "ciCredentialFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/ci.token",
  "cloudflareApiTokenFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/cloudflare.token",
  "accessClientIdFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/access-client-id",
  "accessClientSecretFile": "/Users/abhishekvaishnav/.sourcewayfinder-operator/access-client-secret",
  "dockerPath": "/opt/homebrew/bin/docker",
  "testImage": "sha256:cfc1b6e8818f216b393e71f28db6fb85615dba9d622c7d1ff4a0de875b38ec27",
  "wranglerPath": "/Users/abhishekvaishnav/.sourcewayfinder-operator/node_modules/wrangler/bin/wrangler.js",
  "wranglerSha256": "REVIEWED_WRANGLER_ENTRYPOINT_HASH",
  "evidenceRoot": "/Users/abhishekvaishnav/.sourcewayfinder-operator/evidence",
  "migrationStrategy": "none",
  "allowNewWorkers": { "api": true, "control": true, "survey": true },
  "workerConfigs": {
    "web": "/Users/abhishekvaishnav/.sourcewayfinder-operator/staging-web.json",
    "api": "/Users/abhishekvaishnav/.sourcewayfinder-operator/staging-api.json",
    "control": "/Users/abhishekvaishnav/.sourcewayfinder-operator/staging-control.json",
    "survey": "/Users/abhishekvaishnav/.sourcewayfinder-operator/staging-survey.json"
  }
}
```

Set configuration mode to 0600. The Access service identity may reach only the required automation paths; it must not gain human review access. Google/Access authorization for the owner remains separate. For staging smoke requests, configure the narrowly allowlisted synthetic-check service identity through Access. The publisher attaches its client ID/secret only to staging smoke requests; the staging Worker separately verifies that service identity. Production smoke requests carry no synthetic identity credentials. Never bypass the host's identity policy to make a test pass.

The test image was built locally from pinned ARM64 Node 26.13.1, the project's exact lockfile, Playwright 1.65.1/Chromium, and required Linux libraries. A local image ID is immutable on this Mac. Rebuilds may have a different ID because OS package repositories move; record and review the resulting ID before changing configuration. The Dockerfile is `infra/paperclip/TestRunner.Dockerfile`.

## Authorize and execute real procedure tests

1. Submit the candidate bundle and its exact commit, code and migration hashes after approving the source interpretation.
2. Submit expected cases with `testCodeHash` equal to the SHA-256 of the trusted `authorized-tests.mjs` copy. Each case includes `id`, ordered `answers` (`questionId`, `choiceId`), and the full `expectedOutcome`: `id`, `title`, `nextStep`, `unresolved`, `sourceRefs`, and optional `prerequisites`. The proposed domain files contain these full outcomes but remain unapproved.
3. Review the expected outcomes against the official evidence and approve the exact `expected_answer_review` digest in the dashboard.
4. From the trusted directory, run:

```sh
node authorized-tests.mjs /absolute/operator.json proposal_id
```

The host asks the policy authority for the current human authorization and checks the clean candidate's hashes. It copies only built API/public assets and session migrations into temporary Docker volumes, alongside a read-only approved packet and read-only runner. The container has no network, no host mounts, no secrets, no capabilities and a read-only root filesystem. The browser talks to the candidate API over container loopback; the API uses actual local Miniflare D1 and a private test-only published-content binding.

The runner checks the exact API outcome and visible UI text/source links for every approved case, and requires every rule transition to be covered. Failed cases retain screenshots and browser traces. Afterward, the host rechecks the approval instance and candidate hashes before submitting results with the separate CI credential. A withdrawn/reapproved expected-answer digest needs a new run. A local `semanticExecutionAuthorized` flag cannot authorize execution.

These tests exercise source-dependent behavior through the UI/API in an isolated runtime. They do not certify source truth, prove Google MFA enrollment, or replace deployed staging and production checks. The fictional-only runner smoke is an engineering qualification; it is not an approval of either real flow.

## Prepare the exact release

After the source-dependent tests pass and the owner approves the exact merge digest (candidate, expected answers, current approval instance and CI result), run from the operator directory:

```sh
node --import tsx publisher.mts prepare /absolute/operator.json proposal_id
```

Preparation verifies the tested merged tree and artifact hashes, records existing Worker versions and all four D1 recovery bookmarks, and uploads immutable Worker versions without changing traffic. It copies assets into the operator evidence directory and disables candidate build hooks. The tool records upload receipts and creates a release proposal containing exact Worker version IDs, both asset hashes, previous versions, test evidence and recovery bookmarks.

Review that release in the dashboard. Verify environment, version identifiers, database bindings, previous public website version, test evidence and source freshness. Approve its exact `deployment_review` digest. The tool never manufactures this approval.

The production manifest requires a previous public-web version. A genuinely new API/control/survey component may have a null previous version when explicitly configured during preparation. Such a component cannot be automatically rolled back; a failed release stays suspended pending a forward fix.

## Promote and verify

```sh
node --import tsx publisher.mts promote /absolute/operator.json release_id
```

The publisher rechecks the approved manifest against its private upload receipt and observed Cloudflare versions. It acquires the shared-runtime deployment lease before changing traffic. If Worker code, either asset set or the migration hash changed, it suspends every active flow first; a data-only release with the identical runtime preserves other active flows. This deployment suspension retains the reviewed status epoch; the subsequent content promotion increments the epoch, invalidating prior sessions. Any source change or competing status update invalidates the release's conditional update. The lease blocks activation until verification. Activation also requires the exact release ID, bundle hash and status epoch displayed in the dashboard, the current CI approval instance, and a release tested against the current shared runtime.

Each Worker promotion uses the exact pinned version at 100% traffic through the pinned Wrangler CLI. Before every component, the tool rechecks current human decisions and source validity. It then observes the active Cloudflare deployment version, promotes the policy pointer, and checks the website, suspended flow's bundle hash, and original survey status/notice version. The separate CI identity submits smoke evidence. Guidance stays suspended until the owner activates the verified release from the dashboard.

After activation, run the final public guidance smoke and retain its evidence. If it fails, suspend the flow immediately. A successful pre-activation smoke does not prove that public guidance is working after activation.

## Failure and compatible rollback

A failed mutation or smoke triggers the incident credential's suspension call and a retained local failure record. If the policy service itself is unavailable, public guidance fails closed; recover that authority before any activation.

For a release whose previous versions all exist and whose schema did not change:

```sh
node --import tsx publisher.mts rollback /absolute/operator.json release_id
```

Rollback first suspends all active flows, restores the exact previously recorded Worker versions, observes them through Cloudflare, and keeps guidance suspended. Separate CI proof reconciles the previous shared-runtime digest; a code rollback alone cannot clear the deployment lease. It does not restore a D1 database, overwrite survey responses, change the content pointer to make guidance active, or override invalid sources. Reactivation requires current evidence and human review. Missing previous versions or incompatible schemas require a forward fix. If a failed deployment cannot be recovered, the owner may POST `/admin/v1/releases/:id/abandon` with its exact `{digest,reason}` and normal Access/CSRF credentials. This clears the failed lease, marks the runtime unknown, and suspends every flow. Only a newly reviewed and verified release can establish a usable runtime afterward.

The automated publisher deliberately refuses schema-changing releases. Apply a separately reviewed maintenance plan for additive migrations, record fresh recovery bookmarks, test compatibility and restore behavior, and prepare a new exact release manifest afterward. Destructive migrations and database restoration must not be hidden inside ordinary PR or publication commands. This maintenance release path and a hosted rollback/restore drill remain launch requirements.

## Before calling delivery complete

Verify the owner can sign in through Google and the configured independent Cloudflare MFA challenge; complete the four real content gates; run both authorized real-flow suites; demonstrate a source-change suspension and reviewed recovery; observe deployed smoke, quota/failure behavior and a restore drill; and confirm backup recovery and notifications. The current files provide execution paths and fail-closed checks. They do not establish that these external gates have been completed.
