# SourceWayfinder: concrete guidance review

Both guidance bundles are **drafts awaiting human review**. Their graphs and schemas pass structural validation. Their proposed source-dependent expected answers have **not** been executed or approved. No production guidance is authorized by this document.

The public application and generic renderer handle both bundles without domain-specific code. A separate fictional flow has passed browser tests through the actual Worker API, restricted published-content service binding, and local D1. That demonstrates the infrastructure path, not the correctness of the real guidance.

## Review these artifacts

| Topic                                                       | Bundle                                                                          | Proposed expected answers                                                                              | Source evidence and review questions                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verizon consumer postpaid SIM Protection and account access | [8 questions, 12 outcomes](../domains/verizon-sim-protection/bundle.draft.json) | [18 cases, full expected outcome text](../domains/verizon-sim-protection/expected-cases.proposed.json) | [Review packet](../domains/verizon-sim-protection/review-packet.json) · [Source register](../domains/verizon-sim-protection/source-register.json) |
| SSA replacement card, unchanged details                     | [5 questions, 7 outcomes](../domains/ssa-replacement-card/bundle.draft.json)    | [13 cases, full expected outcome text](../domains/ssa-replacement-card/expected-cases.proposed.json)   | [Review packet](../domains/ssa-replacement-card/review-packet.json) · [Source register](../domains/ssa-replacement-card/source-register.json)     |

The expected-answer files contain an explicit `human_review_required` status, no approver, no approval date, and `semanticExecutionAuthorized: false`. Each expected outcome includes its full text, prerequisites, unresolved conditions, and source references so a reviewer can assess what the user would see.

## Decisions needed from the owner

1. **Verizon interpretation:** accept or revise the limited consumer-postpaid scope, the Owner/Manager prerequisite, the distinction between SIM Protection and Number Lock, and the conservative account-access handoffs. In particular, confirm that the protection-disable outcome represents the source's 15-minute statement together with its additional-delay caveat without promising immediate activation. The full account FAQ includes labeled AI summaries; review the full official answers behind the selected passages.
2. **SSA interpretation:** accept or revise the initial scope of an adult replacing their own card with unchanged details. Children, representatives, first cards, changes, and unclear requests receive official links. The flow does not decide online eligibility or prescribe identity documents; SSA's service determines those requirements.
3. **Expected answers:** separately review every proposed case and its complete expected outcome. The source rationale is a proposed interpretation, not independent human validation. Revise the cases before approving them if any condition or uncertainty is wrong or missing.
4. **Later gates:** review the actual test results and merged candidate, then approve the exact production release manifest through the authenticated dashboard. Neither this document, a Paperclip task, nor a Slack reaction authorizes tests, merge, or deployment.

Local artifact hashes identify the exact review material below. They are not policy-service approval IDs. Once submitted to the policy service, decisions must bind to that service's displayed canonical manifest digest. A source, bundle, expected answer, code, or migration change requires its dependent review to be repeated.

## Exact local artifact hashes

| Artifact                | Canonical SHA-256                                                  |
| ----------------------- | ------------------------------------------------------------------ |
| Verizon bundle          | `6cce957f585185da184c8e3cdf4062ec722a057e14873b32eb1f2c591b2be1d7` |
| Verizon expected cases  | `cfe86b6e87c2b97289d141bc0084ebccd1fe97983d6591c9597f139c6694382c` |
| Verizon source register | `80ed7b459d97d74736eccffe6b6d9c99a2da18fba5227f3106c363ffac27d9f9` |
| SSA bundle              | `022d708bfcdc1028d0020cb7ff2aeae4451b9c1955afe163be785872d95a0a8f` |
| SSA expected cases      | `ad31a655959ca2788704df9c7354dbe740c65962a6827b2342ef63bb13ab1d99` |
| SSA source register     | `61464ee1ec876fadc4ea146e8941c67bc18e2e02b39baf323a01257d24f6173c` |

## Evidence acquisition and remaining operational checks

Five official pages have actual retained HTML bytes, normalized text, SHA-256 hashes, retrieval times, and source-version identifiers. Raw evidence is private at `private/evidence/`; the source registers name the exact files. Source-register timestamps describe those captures only. They do not claim ongoing freshness after this run.

Verizon pages work with the HTTPS collector. Their raw HTML includes changing presentation data. A specific reviewed content boundary is extracted before comparison; raw observations remain preserved. The policy service keeps the logical source version when normalized text and extractor version match, and suspends on consequential changes.

The two canonical SSA pages return HTTP 403 to direct HTTPS collection in this environment. Ordinary Chromium navigation returned HTTP 200. The explicit SSA browser collector also succeeded with a fresh browser context, JavaScript disabled, DNS checked and pinned, exact main-document scope, subresources blocked, a 30-second deadline, and response-size checks during transfer. No account, challenge-solving action, personal profile, or credential was used. The browser method is recorded in the extractor identifier.

Daily acquisition must run `npm run collect -- --browser` so the explicitly configured SSA browser sources are enabled. Confirm the pinned Chromium installation in the isolated local runtime, the production Access service-token policy, the scoped collector credential, and the scheduled wake path before launch. A failed source check cannot be reported as successful freshness. Critical extraction or unsafe-destination failures suspend guidance and require human source revalidation; ordinary source-age checks still apply.

No live carrier account procedure, SSA application, identity verification, or participant outcome was tested. Do not describe either draft flow as verified real-world completion until its human gates and authorized acceptance tests have passed.
