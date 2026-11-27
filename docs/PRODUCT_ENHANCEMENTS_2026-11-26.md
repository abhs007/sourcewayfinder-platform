# SourceWayfinder account-recovery expansion and website handoff

November 26, 2026 | Local development candidate; no production release

The applicant selected account recovery as the next priority. This update turns two feedback suggestions into bounded procedure proposals and improves the existing React website. It preserves the established wordmark, colors, deterministic guidance engine, survey and approval boundaries.

## Where the project stands

The public deployment is documented as the original prototype. This task changed the newer platform repository, not that older production site. The public custom-domain fetch was not independently available through the web tool during this task. No protected live dashboard was accessed.

The retained November 23 records identify candidate `2f041f5ea8b8c3b9883f9d5a6b6e7780c311066b`, proposal `verizon-initial-ce98b9b5ec88cab60455`, authorized run `run_edaab6002c014021b60c1221b0a29eba` and prepared receipt `release_1795428199436`. Eighteen Verizon cases and the modeled-branch check passed in isolation. Interpretation, expected-answer and merge gates were recorded. This is historical candidate evidence; today's changed web assets need a new candidate review and exact test binding. Hosted activation and the complete source-change/recovery demonstration remain outstanding.

## New scenarios

| Procedure                                                  | Questions | Outcomes | Transitions | Proposed cases |
| ---------------------------------------------------------- | --------: | -------: | ----------: | -------------: |
| Google sign-in after losing a phone or usual second factor |         4 |       11 |          17 |             14 |
| Google account/Gmail after suspected unauthorized access   |         3 |        8 |          11 |              9 |

Read the [lost-factor review packet](../domains/google-lost-second-factor/REVIEW.md) and [compromised-account review packet](../domains/google-compromised-account/REVIEW.md). Each directory includes its bundle, proposed cases and review status.

The lost-factor draft distinguishes remembered password, Advanced Protection and available pre-existing verification options. The suspected-compromise draft distinguishes whether the person can sign in and what they observed. Managed accounts, child/representative cases and unknown answers have explicit handoffs. No password, email address, recovery code or identity document is collected. No bypass or guaranteed recovery time is promised.

These are source-derived proposals, not adopted interpretations. The blueprint's universal order for password changes, line suspension and remote erasure was not implemented. The wider feedback categories remain exploratory.

## Source evidence and ingestion constraint

The official references are [Google second-step help](https://support.google.com/accounts/answer/185834?hl=en), [Google compromised-account help](https://support.google.com/accounts/answer/6294825?hl=en) and [Google account recovery](https://support.google.com/accounts/answer/7682439?hl=en). Research acquisition metadata, SHA-256 hashes, raw HTML and companion extracted text are under [the dated source folder](../domains/research/account-recovery-2026-11-26/).

The `draft_` source identifiers are provisional research references. They are not hosted registry or approval identities. Raw source captures are approximately 1.6 MiB each; they were retained by a separately bounded 2 MiB research helper. They exceed the production collector's 1 MiB limit. The production collector and guards were not changed. Do not submit or release these bundles until a separately reviewed bounded acquisition method is in place and policy-service source identities replace the provisional ones.

Markitdown saves are separate acquisitions and can omit collapsed sections. The raw captures and their companion text—not the separately fetched Markdown—define the hashes and passage anchors in the register. The preparation helper refuses to overwrite this capture set on rerun.

## Website enhancements

- Search supports common task vocabulary such as “I lost my phone,” “2FA,” “Gmail” and “SSN.” It is deterministic keyword matching; no model call or search analytics is added.
- Topic filters separate phones/accounts from identity documents. A result count and useful empty state support browsing and recovery from an unsuccessful search.
- Static discovery entries survive an empty or unavailable registry. Matching server records retain authority for active, under-review and retired state; a static entry cannot activate a flow.
- The directory request now has a ten-second deadline. On a stalled request, official links remain usable and the loading state ends.
- A completed guided outcome can show the questions and answers that led there. The summary is transient, clears with the session and is not a client-side editing/backtracking API.
- The no-JavaScript fallback now includes the new official Google routes.
- Layout is checked at 320, 390, 768 and 1440 pixels. The homepage retains the existing brand and uses a more compact, top-aligned task panel.

The new cards remain marked under review. Clicking them opens the official-source fallback and does not create a guidance session. Public questions and answers still come from the policy-controlled API.

## Verification

| Check                                          | Observed result                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| TypeScript                                     | Passed after final code changes                                         |
| Public/admin/Worker builds                     | Passed after final code changes                                         |
| Full source-independent unit/integration suite | 150 passed                                                              |
| Full browser suite                             | 34 passed; fictional fixtures and interface contracts                   |
| Follow-up layout and static-fallback checks    | 12 passed, after layout/no-JavaScript changes                           |
| Final search/provenance checks                 | 6 passed, after natural-phrase search refinement                        |
| New recovery bundles                           | Structurally valid; all 28 transitions represented by 23 proposed paths |
| New recovery semantic acceptance               | Not run; current human authorization does not exist                     |

The first sandboxed suite attempt could not bind loopback ports (`EPERM`). Repeating the same suite with permission for temporary local servers resolved the environment failure; guards were not weakened. Test counts above describe distinct runs and must not be added together as unique user cases.

Desktop and mobile screenshots in [the review folder](product-review-2026-11-26/) show a deliberately unavailable local API, with all four topics under review and their official handoffs preserved. They are software presentation evidence, not a hosted deployment or participant evaluation. Initial screenshots caught the existing entrance animation mid-transition; the reviewed copies disable animation for stable capture.

## Next release work

1. Prepare and review a bounded Google acquisition approach compatible with collector and evidence limits.
2. Review the 23 proposed cases and source interpretations; register official boundaries and obtain current exact policy identities and decisions.
3. Freeze the changed candidate, run its authorized tests and prepare a new release manifest. Preserve the historical Verizon evidence separately.
4. Resume protected hosted qualification when owner authentication is available. Complete release review, verification, activation, public smoke and source-change/recovery demonstration.

No older MFA device was removed or reset, no authentication was bypassed, and no operator credentials or private survey responses were accessed. The repository reserves content and release decisions for the owner. Nothing was pushed, merged, approved or deployed during this update.
