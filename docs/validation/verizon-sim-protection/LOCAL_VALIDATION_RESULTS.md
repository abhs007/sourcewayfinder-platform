# Verizon SIM Protection: local validation results

**Result: passed.** All 18 owner-reviewed cases completed through the built public website, API Worker and local session D1 at both 320px and 1440px: **36 successful journeys, with all 27 decision branches exercised at each width**.

Completed November 22, 2026 at 10:37 p.m. America/Los_Angeles (`2026-11-23T06:37:54.112Z`). This is local guidance-journey validation. Protected policy acceptance and hosted deployment remain pending.

## Review and changes applied

The saved [owner review](ALL_CASES_REVIEW.md) marks all eighteen cases **Keep as written**. No case wording was changed by the owner. Its earlier ten-confirmed/eight-pending inventory remains historical; the eighteen marked decisions resolve the final batch scope. The document is preserved byte-for-byte, with the review recorded separately in [owner-review-evidence.json](owner-review-evidence.json).

The bundle, expected cases and source register under `domains/verizon-sim-protection/` now match that packet. They use the retained `parse5-content-v3` source captures. The shared sign-in handoff says “Ask Verizon about the sign-in problem,” preserving the reviewed distinction between an unavailable verification method and another or uncertain sign-in problem. The reviewed 15-minute block and possible additional delay remain in the protection-disable outcome; reaching that result never claims activation has succeeded.

The case review and explicit request to run validation authorized this local check. No policy-service approval was created. Draft authorization metadata remains unchanged for the protected release pipeline.

## What the run checked

For every case at both widths, the browser selected the reviewed answers through the actual React UI. The test checked:

- Successful API answer responses with `Cache-Control: no-store`, and complete outcome equality against the owner-reviewed expected answer, including source references.
- The visible title, next step, every prerequisite and unresolved condition, plus expected official-source links.
- No horizontal page overflow, browser script errors or use of browser local/session storage.
- A hashed session token and correct answer sequence in local D1; “Finish this session” returned to the homepage and deleted the session.
- Unchanged input and built-artifact hashes throughout execution, retained source-capture integrity and the source-age limit.

The `replace-enabled` mobile and desktop screenshots were also visually inspected: the timing caveat, prerequisites, unresolved condition and source link are readable, without clipped content. The screenshots are viewport emulation, not tests on physical phones.

| Reviewed case             | 320px | 1440px |
| ------------------------- | ----- | ------ |
| `wrong-account`           | Pass  | Pass   |
| `account-unknown`         | Pass  | Pass   |
| `enable-authorized`       | Pass  | Pass   |
| `enable-member`           | Pass  | Pass   |
| `enable-role-unknown`     | Pass  | Pass   |
| `enable-access-unknown`   | Pass  | Pass   |
| `enable-forgot`           | Pass  | Pass   |
| `replace-enabled`         | Pass  | Pass   |
| `replace-disabled`        | Pass  | Pass   |
| `protection-unknown`      | Pass  | Pass   |
| `replace-role-member`     | Pass  | Pass   |
| `replace-role-unknown`    | Pass  | Pass   |
| `replace-access-unknown`  | Pass  | Pass   |
| `replace-no-verification` | Pass  | Pass   |
| `access-other`            | Pass  | Pass   |
| `access-unknown`          | Pass  | Pass   |
| `port-different`          | Pass  | Pass   |
| `intent-unknown`          | Pass  | Pass   |

The first attempt stopped at the final homepage check because the test expected only part of the heading. Correcting the locator allowed the complete rerun to pass. The initial failure is retained under `test-results/reviewed-verizon/2026-11-23T06-36-30.772Z/`; it was a test-selector issue, not a changed expected answer or an application fix.

## Retained evidence

- [Durable machine-readable results](local-validation-results.json): every case result, coverage, timestamps, input hashes, runner hash and API/web/migration hashes.
- Local run folder: `test-results/reviewed-verizon/2026-11-23T06-37-35.107Z/`, including the original result, `replace-enabled-320.png`, `replace-enabled-1440.png` and supporting logs. These generated files are ignored by Git; preserve them with the review archive.
- Public source captures: `test-results/source-review/verizon-v3/`, located by [source-register.json](source-register.json). Their acquisition times describe the retained snapshots, not continuous monitoring.
- Supporting checks: 104 unit/integration tests passed across 11 files; build, TypeScript, formatting and Git whitespace checks passed. The earlier reliability follow-up separately passed 25 fictional browser checks; those are not counted among the 36 reviewed Verizon journeys. See [the reliability report](../RELIABILITY_FIXES_2026-11-22.md).

| Reviewed artifact                   | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| Owner Markdown, exact bytes         | `f954104a238b95d5366a300779c94914b40885a8e8fe7b201790676db3e1d369` |
| Bundle, canonical JSON              | `9eaf8eaf24743ee7fbaf14380fdf05fd5d5e12d2ba42eb09b7a43a1022e06fb7` |
| Expected packet, canonical JSON     | `384ce059a3755682de23ff07a972d392cb0861d15225ab861db8850ff80e65a6` |
| Expected case array, canonical JSON | `51d82e09017494ef076e0c4f2df54c402fe323b07220abcaf88bd5ceec763b65` |
| Source register, canonical JSON     | `02d53b7af964096264195337da83d7748f27e0357d2353b923d15f6ca7132caa` |
| Result record, exact bytes          | `2f0b49cace8e97089c72b56ec4ea6657bf105ce3a0a6a230dbc7855e8cd17e75` |

## Repeat the local check

From the repository root, with the pinned dependencies and retained public captures available:

```sh
npm run build
npm run test:reviewed:verizon -- --review-sha256=f954104a238b95d5366a300779c94914b40885a8e8fe7b201790676db3e1d369
```

The runner is [tests/reviewed/verizon-local.mts](../../../tests/reviewed/verizon-local.mts). It requires the explicit hash, verifies all eighteen decisions and exact reviewed inputs, and rejects stale captures. An intentional mismatched-hash invocation was rejected before starting the browser. It is separate from ordinary CI and does not run real guidance implicitly. If the review, expectations or captured guidance change, retain the new owner review before another source-dependent run; do not merely replace a hash to force execution.

## Scope and remaining validation

The local runner substitutes a **read-only published-content provider** for the control service. The active flow is a test precondition. The actual built API still evaluates the reviewed bundle and uses ephemeral D1, but this setup does not test the owner’s identity, policy approval chain, hosted control service, deployed web Worker, Cloudflare edge configuration or production activation. External browser requests were blocked. No Verizon account was accessed, no SIM setting changed, and no participant outcome was measured.

The source interpretations were reviewed by the owner; matching those expectations is implementation evidence, not an independent carrier endorsement or a guarantee of recovery. No merge or deployment occurred.

The remaining path is to ingest the retained evidence through the trusted operator environment, record the exact authenticated interpretation/expectation decisions, run the existing protected acceptance runner against a committed candidate, and qualify protected staging. That staging pass must include status/suspension behavior, network failure and session expiry, followed by the controlled source-change and recovery drill described in [REVIEW.md](REVIEW.md). The local results do not manufacture or replace those release proofs.
