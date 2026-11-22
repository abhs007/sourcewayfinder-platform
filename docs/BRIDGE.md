# Maintenance bridge

Run `npm run bridge -- /absolute/private/bridge.json --once` to perform one reconciliation, or omit `--once` for a one-minute polling loop. The bridge performs no model call while idle. Its configuration, bootstrap manifest, owner cookie and local SQLite journal must remain outside agent mounts. Configuration and cookie files must be owned by the operator and mode 0600. The state directory is mode 0700.

The bridge accepts these policy jobs:

| Job                  | Execution                     | Output                                                   |
| -------------------- | ----------------------------- | -------------------------------------------------------- |
| `source_change`      | Source analyst                | Interpretation proposal with the claimed source versions |
| `implement_guidance` | Backend agent                 | Candidate bundle, commit and code/migration hashes       |
| `draft_expectations` | QA in a fresh session         | Proposed full expected outcomes; no semantic execution   |
| `authorized_tests`   | Fixed external trusted runner | CI proof using a separate CI credential                  |

The local admission lease renews every ten seconds. Policy also limits the company to one active 40-minute maintenance lease. The bridge checks live Paperclip runs before dispatch and disables periodic, assignment and on-demand wakes for configured agents. Only the selected role is briefly enabled for an explicit invocation. Source packets are capped at 48,000 UTF-8 bytes; oversized evidence pauses for scoping instead of being truncated. QA packets omit previous expected answers. Quota failures require owner resumption; the bridge never repeatedly probes an exhausted subscription.

Existing configuration fields are `paperclipUrl`, `policyUrl`, `ownerCookieFile`, `policyToken`, `accessClientId`, `accessClientSecret`, and `monitorStateFile`. Add the following only after installing and reviewing the trusted test runner outside the candidate repository:

```json
{
  "authorizedTests": {
    "script": "/absolute/operator-trusted/authorized-tests.mjs",
    "config": "/absolute/operator-trusted/test-config.json",
    "sha256": "SHA256_OF_EXACT_REVIEWED_RUNNER_BYTES"
  }
}
```

The runner and its configuration must lie inside `trustedRoot`; that root and `candidateRoot` must be disjoint. The bridge checks the script hash, ownership, write permissions and separate CI credential. It executes only `node <fixed-script> <fixed-config> <validated-proposal-id>` without a shell. Agent-provided commands and credential paths are ignored. The runner obtains current human authorization from policy and independently verifies candidate/test hashes before source-dependent execution. A 30-minute timeout and 1 MiB diagnostic bound stop runaway execution. The runner retains complete proof in its configured private evidence location; bridge logs contain only metadata and diagnostic hashes.

## Restart and uncertain outcomes

`private/bridge/state.sqlite` stores each claim, issue, dispatch intent, run and completion. Preserve this journal in backups. A restart reconciles an accepted invocation by exact issue, agent and dispatch timestamp before doing anything else; it never assumes a Paperclip idempotency key alone guarantees uniqueness. An issue creation with an uncertain response is recovered only if the exact named issue exists. Multiple matches or no matching run after an uncertain invocation pause for owner reconciliation.

An exact saved `/finish` request is safe to retry because policy binds completion idempotence to the finishing identity and result. Completed deterministic runs write a private receipt before finishing their policy job. If the host dies before that receipt, inspect the trusted runner's proof and policy test record before taking further action; the bridge will not spawn a duplicate test. An uncertain candidate/expectation submission also pauses for inspection. Never delete the journal to clear a pause: confirm the remote issue, run and proposal state first. `waiting_quota` requires confirmation that provider capacity has returned before an operator reconciles the checkpoint.

Validation uses fictional packets only: `npx vitest run tests/bridge.test.ts`. No real guidance expectations or owner approvals are created by these tests.
