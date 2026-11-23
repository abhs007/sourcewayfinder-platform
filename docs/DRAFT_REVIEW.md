# SourceWayfinder: concrete guidance review

Both guidance bundles remain **unpublished drafts**. The owner marked all 18 Verizon cases **Keep as written**, and all 36 local browser journeys passed at 320px and 1440px. SSA’s 13 cases still await review. Authenticated policy approvals and protected acceptance remain pending for both. No production guidance is authorized by this document. See [the Verizon results and scope](validation/verizon-sim-protection/LOCAL_VALIDATION_RESULTS.md).

The public application and generic renderer handle both bundles without domain-specific code. A separate fictional flow has passed browser tests through the actual Worker API, restricted published-content service binding, and local D1. That demonstrates the infrastructure path. The subsequent Verizon run separately checks that the actual UI/API/session-D1 implementation matches the owner-reviewed expected outcomes, using a read-only content test provider.

## Review these artifacts

| Topic                                                       | Bundle                                                                          | Proposed expected answers                                                                              | Source evidence and review questions                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verizon consumer postpaid SIM Protection and account access | [8 questions, 12 outcomes](../domains/verizon-sim-protection/bundle.draft.json) | [18 cases, full expected outcome text](../domains/verizon-sim-protection/expected-cases.proposed.json) | [Review packet](../domains/verizon-sim-protection/review-packet.json) · [Source register](../domains/verizon-sim-protection/source-register.json) |
| SSA replacement card, unchanged details                     | [5 questions, 7 outcomes](../domains/ssa-replacement-card/bundle.draft.json)    | [13 cases, full expected outcome text](../domains/ssa-replacement-card/expected-cases.proposed.json)   | [Review packet](../domains/ssa-replacement-card/review-packet.json) · [Source register](../domains/ssa-replacement-card/source-register.json)     |

The expected-answer files contain an explicit `human_review_required` status, no approver, no approval date, and `semanticExecutionAuthorized: false`. Those fields describe pending policy-service authorization; the separate Verizon review receipt records the completed document review without fabricating policy decisions. Each expected outcome includes its full text, prerequisites, unresolved conditions, and source references.

## Decisions needed from the owner

1. **Verizon interpretation — document review complete:** all eighteen written decisions are preserved in the [owner’s marked file](validation/verizon-sim-protection/ALL_CASES_REVIEW.md). Record the corresponding authenticated policy decision against the exact proposal digest. The reviewed content covers the limited consumer-postpaid scope, the Owner/Manager prerequisite, the distinction between SIM Protection and Number Lock, and the conservative account-access handoffs. The reviewed protection-disable outcome retains the source’s 15-minute statement and additional-delay caveat without promising immediate activation. The full account FAQ includes labeled AI summaries; the review packet identifies the full official answers as the source material.
2. **SSA interpretation:** accept or revise the initial scope of an adult replacing their own card with unchanged details. Children, representatives, first cards, changes, and unclear requests receive official links. The flow does not decide online eligibility or prescribe identity documents; SSA's service determines those requirements.
3. **Expected answers:** Verizon’s eighteen written cases have been reviewed and locally exercised; retain that record when completing the authenticated policy step. Review SSA’s thirteen cases individually. Any changed expected answer needs a fresh decision before source-dependent execution.
4. **Later gates:** review the actual test results and merged candidate, then approve the exact production release manifest through the authenticated dashboard. The local Verizon result is not release proof; the protected acceptance runner still requires the policy service’s exact authorization.

Local artifact hashes identify the exact review material below. They are not policy-service approval IDs. Once submitted to the policy service, decisions must bind to that service's displayed canonical manifest digest. A source, bundle, expected answer, code, or migration change requires its dependent review to be repeated.

## Exact local artifact hashes

| Artifact                | Canonical SHA-256                                                  |
| ----------------------- | ------------------------------------------------------------------ |
| Verizon bundle          | `9eaf8eaf24743ee7fbaf14380fdf05fd5d5e12d2ba42eb09b7a43a1022e06fb7` |
| Verizon expected cases  | `384ce059a3755682de23ff07a972d392cb0861d15225ab861db8850ff80e65a6` |
| Verizon source register | `02d53b7af964096264195337da83d7748f27e0357d2353b923d15f6ca7132caa` |
| SSA bundle              | `022d708bfcdc1028d0020cb7ff2aeae4451b9c1955afe163be785872d95a0a8f` |
| SSA expected cases      | `ad31a655959ca2788704df9c7354dbe740c65962a6827b2342ef63bb13ab1d99` |
| SSA source register     | `61464ee1ec876fadc4ea146e8941c67bc18e2e02b39baf323a01257d24f6173c` |

## Evidence acquisition and remaining operational checks

Five official pages have actual retained HTML bytes, normalized text, SHA-256 hashes, retrieval times, and source-version identifiers. The refreshed Verizon captures are local under `test-results/source-review/verizon-v3/`; the earlier SSA evidence is private at `private/evidence/`. The source registers name the exact files. Source-register timestamps describe those captures only. They do not claim ongoing freshness after this run.

Verizon pages work with the HTTPS collector. Their raw HTML includes changing presentation data. A specific reviewed content boundary is extracted before comparison; raw observations remain preserved. The policy service keeps the logical source version when normalized text and extractor version match, and suspends on consequential changes.

The two canonical SSA pages return HTTP 403 to direct HTTPS collection in this environment. Ordinary Chromium navigation returned HTTP 200. The explicit SSA browser collector also succeeded with a fresh browser context, JavaScript disabled, DNS checked and pinned, exact main-document scope, subresources blocked, a 30-second deadline, and response-size checks during transfer. No account, challenge-solving action, personal profile, or credential was used. The browser method is recorded in the extractor identifier.

Daily acquisition must run `npm run collect -- --browser` so the explicitly configured SSA browser sources are enabled. Confirm the pinned Chromium installation in the isolated local runtime, the production Access service-token policy, the scoped collector credential, and the scheduled wake path before launch. A failed source check cannot be reported as successful freshness. Critical extraction or unsafe-destination failures suspend guidance and require human source revalidation; ordinary source-age checks still apply.

No live carrier account procedure, SSA application, identity verification, or participant outcome was tested. Do not describe either draft flow as verified real-world completion until its human gates and authorized acceptance tests have passed.
