# Reliability fixes and local validation

The two issues identified in the November 22 MVP review are fixed in the local working tree. The changes have not been committed, synchronized into Paperclip, merged or deployed. This report describes the modified checkout based on `3e86c9c157a05f76d3595dfffa3d8ae357ba645a`, not a new released version.

## Source changes

`parse5-content-v3` preserves procedural text inside forms. It retains anchor destinations, form actions/methods, submit-action overrides and the document base URL as inert navigation evidence alongside contiguous prose. Link/form destination changes therefore participate in the normalized hash without inserting metadata into source quotations. Input values and executable scripts are not extracted.

The extractor version changes the source-version identity. A 304 response under an older extractor causes the verified retained HTML to be re-extracted. The normal collector also avoids sending cache validators when its extractor identity changes. Existing policy checks reject prior source versions after the upgraded observation, even when prose is unchanged. No previous approval is copied or silently renewed.

The extractor is still bounded to the configured content selector/main region. It is not a universal semantic interpretation engine: layout-only instructions, images, scripts, table relationships and content outside the chosen boundary need separate qualification. More URL changes can produce review requests; that is preferable to treating a changed destination as unchanged guidance.

## Browser status and expiry

Status requests have a ten-second deadline that covers both headers and body consumption. A deadline clears the guidance, aborts the request and presents the official-source fallback. Clearing does not depend on the fetch promise rejecting correctly.

An independent timer enforces the thirty-minute idle and two-hour maximum session limits. Visibility checks evaluate expiry before the pending-request guard. Answering extends only the idle deadline. Cleanup cancels timers and requests; stopped/old sessions cannot replace a later screen with a delayed error.

The thirty-second status polling interval is unchanged. Browser timers can be throttled while a page is suspended; on returning to a visible tab the application checks the absolute session deadlines again. The server continues to enforce its own availability and session rules.

## Observed verification

| Check                                                             | Result                                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| New collector regressions against original code                   | Eight failures, nine existing checks passed |
| Four new timeout/expiry browser regressions against original code | All four reproduced failures                |
| Full unit/integration suite after the fixes                       | 104 passed across 11 files                  |
| Collector suite after strengthening the cached-version fixture    | 17 passed                                   |
| Full browser suite                                                | 25 passed                                   |
| Type check                                                        | Passed                                      |
| Production artifact build                                         | Passed                                      |

Formatting and whitespace checks also passed.

The collector regressions cover destination-only changes, form instructions, form actions, button/input overrides, base URLs, source-passage continuity and extractor migration on 304. Policy tests use actual local D1 to check invalidation and maintenance-job deduplication after link, form and extractor changes.

Browser regressions cover stalled headers, stalled bodies, expiry during a pending request, tab return, cleanup and the maximum session age while answers extend idle time. During development two assertions were corrected to match existing contracts: duplicate fallback links need a scoped locator, and a completed answer clears the radio selection. The new-session rejection assertion uses the existing HTTP 423 / `FLOW_UNDER_REVIEW` contract.

The integrated fictional test exercises a successful user journey through React, the real Worker API, the restricted published-content reader and local D1. It then normalizes and ingests a link-only source change through the policy service, observes suspension through the API, clears the browser outcome and confirms that a new session is refused. Its initial active release is synthetic setup. It does not exercise live authentication, network acquisition, real human approval, deployment or an entire release/recovery cycle.

Logs and generated screenshots remain under `test-results/reliability-2026-11-22/` and `test-results/browser/`. These are local ignored artifacts, not hosted CI evidence. The backup implementation was unchanged; its previously reported result is not a new backup/restore qualification.

## One real flow prepared for owner review

Start with [the Verizon review packet](verizon-sim-protection/REVIEW.md). Three official pages were fetched again and processed with v3. The proposed bundle is structurally valid: eight questions, twelve outcomes and eighteen proposed cases naming all twenty-seven branches. No source-dependent expected outcome was executed or approved.

After owner interpretation and expected-answer review, use the existing trusted operator path to ingest evidence, bind decisions to policy-service digests and run the isolated acceptance runner. A local checksum, this report or a passing fictional test does not replace those decisions.

Before rollout, update the separately reviewed collector/runtime copy, re-ingest affected source versions and repeat the dependent reviews. Keep affected guidance under review until its current release is verified and activated. Rolling code back must not restore withdrawn source approvals or reactivate suspended guidance.
