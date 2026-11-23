# First real flow: Verizon SIM Protection

**State: all 18 written cases reviewed by the owner; 36 local browser journeys passed.** The domain draft and expected cases now match the reviewed packet. Authenticated policy decisions, protected staging and release remain pending. See [the validation report](LOCAL_VALIDATION_RESULTS.md) for the exact test scope and retained results.

## Exact materials

- [Editable review of all 18 cases](ALL_CASES_REVIEW.md): customer selections, complete proposed outcomes, prior review status and space for changes.
- [Proposed bundle](bundle.proposed.json): eight questions and twelve outcomes.
- [Proposed expected answers](expected-cases.proposed.json): eighteen cases with their full user-visible outcomes.
- [Fresh source register](source-register.json): three public pages acquired with `parse5-content-v3`.
- [Review manifest](review-manifest.json): canonical SHA-256 identifiers and structural results.

Raw and normalized captures are local at `test-results/source-review/verizon-v3/`, relative to the repository root. Each source-register entry identifies its exact files. These captures have not been uploaded to the authoritative policy service. Preserve them before cleaning generated artifacts. The source register's times refer to acquisition only, not to ongoing freshness.

The drafts in `domains/verizon-sim-protection/` now match this reviewed packet. It refreshes source bindings and changes the general sign-in handoff so that “Something else” and “I am not sure” do not assume the problem is failed verification. The owner marked all eighteen cases **Keep as written** in the saved review document. Its older ten-confirmed/eight-pending introductory inventory is preserved as historical text; the eighteen explicit case decisions and [review receipt](owner-review-evidence.json) record the completed batch review.

## Reviewed source interpretation

The initial consumer-postpaid restriction is our product boundary. It is not a claim that every cited Verizon page excludes every other account type.

The [SIM Protection instructions](https://www.verizon.com/support/knowledge-base-309294/) support the Owner/Manager access prerequisite, the Security settings route, line-specific changes, saving and any requested verification. They describe a fifteen-minute transaction block after disabling and possible further delay. They distinguish SIM Protection from Number Lock. The flow must preserve those conditions and must not promise activation or a successful number transfer.

The [account-access FAQ](https://www.verizon.com/support/my-verizon-faqs/) supplies the password-recovery route and addresses failed-attempt lockout. The [account-roles FAQ](https://www.verizon.com/support/assign-account-manager-roles-faqs/) distinguishes limited Member access from Owner/Manager responsibilities. Review the full answers on those pages, not their labeled generated summaries. These pages do not establish a guaranteed workaround for unavailable verification.

Unknown answers intentionally lead to clarification or an official handoff. That is a proposed conservative product rule; it is not an independently verified recovery procedure.

## Start with this complete path

**Scenario:** a person with a consumer postpaid account wants to change a SIM/device, can sign in as Owner/Manager, and says SIM Protection is enabled.

1. `account-type = postpaid`
2. `intent = replace`
3. `replace-access = yes`
4. `replace-role = authorized`
5. `protection-state = enabled`

Proposed expected outcome: `disable-protection`, “Review the protection change before proceeding.” Its exact text, prerequisites, unresolved condition and source references are in case `replace-enabled` in the expected-answer file. Review them against the full official instructions. Do not infer that the user has completed the change merely because they reached this outcome.

Before accepting the whole flow, review its boundary cases too:

| Cases                                                                                 | Decision to assess                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `wrong-account`, `account-unknown`                                                    | Stop or clarify account scope                                                   |
| `enable-authorized`                                                                   | Preserve sign-in, role, saving and verification prerequisites                   |
| `enable-member`, `enable-role-unknown`, `replace-role-member`, `replace-role-unknown` | Do not infer account authority                                                  |
| `enable-access-unknown`, `replace-access-unknown`                                     | Check access through the official route                                         |
| `enable-forgot`                                                                       | Offer the official password path without promising recovery                     |
| `replace-enabled`, `replace-disabled`, `protection-unknown`                           | Distinguish protection state; do not equate disabling with completed activation |
| `replace-no-verification`, `access-other`, `access-unknown`                           | Explain the sign-in problem without inventing a bypass                          |
| `port-different`, `intent-unknown`                                                    | Separate number transfer and clarify uncertain intent                           |

All twenty-seven branch identifiers were exercised at both widths during local validation. Exact outcome comparisons establish that the implementation matches the owner-reviewed answers. They do not independently establish that Verizon will complete a customer’s account procedure.

## Remaining policy and hosted validation sequence

1. The written-case review and local browser/API/session-D1 checks are complete. Preserve their exact inputs and results. Any changed expectation or source interpretation needs renewed review before its next source-dependent run.
2. Through the existing trusted operator environment, ingest the retained bytes and current source versions. Re-fetch if the review is no longer current. Register or reconcile the exact source allowlist through the owner interface. Do not copy identifiers while omitting the raw evidence.
3. Prepare a committed candidate, build its artifacts, and submit the interpretation, bundle and expected-answer manifest. Record owner decisions through the authenticated review interface against its displayed digests. The local hashes identify material; they are not approval IDs. Bind the exact runner hash and code/migration artifacts required by the existing protocol.
4. Only after the policy service authorizes the exact expectations, run `ops/authorized-tests.mjs` from its separately reviewed operator copy. Its two CLI arguments are the existing owner-held operator configuration path and exact proposal ID. Do not run it from the agent checkout with production credentials, bypass the authorization endpoint or enable tests by editing JSON flags.
5. Retain the runner's actual per-case results, complete outcome comparisons, branch coverage, artifact hashes and any failure traces. A failure returns to the same review process; changed expected answers require new review.
6. Review the exact passing results and release candidate, then qualify protected staging and deployment through the existing release gates. Confirm the active path, unknown branches, unavailable status, stalled network fallback and session expiry in that environment.
7. In an isolated controlled drill, change a copied source destination or requirement; confirm ingestion, suspension, browser clearing, refusal of new sessions, a review job and notification record. Label the source change simulated. The restored/revised flow must remain suspended until its fresh reviews, passing tests and explicit activation are complete. A notification record does not demonstrate delivery to an external recipient.

The fictional tests cover the technical request path and simulated source-change suspension. The separately requested local Verizon run now checks the reviewed outcomes through the actual UI, API Worker and session D1, with a read-only content test provider. Trusted-runner policy acceptance, live operator authentication, deployment, full maintenance/recovery and user outcomes remain unvalidated. No private runtime, credential or approval record was accessed for the local review run.

The repository's [contributor rules](../../../AGENTS.md) state: “Do not run source-dependent semantic acceptance tests before the exact expectations have current human authorization.” The owner’s saved decisions and explicit request supplied that authorization for the scoped local journey check. Policy-service decisions remain empty and are still required by the protected acceptance/release pipeline.
