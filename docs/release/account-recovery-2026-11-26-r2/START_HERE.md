# Account-recovery release review

Prepared November 26, 2026, America/Los_Angeles. This is a new local release candidate, not a production deployment or content approval.

## Review the two proposed procedures

- [Lost phone or second factor: 14 exact cases](google-lost-second-factor/CASE_REVIEW.md).
- [Suspected account compromise: nine exact cases](google-compromised-account/CASE_REVIEW.md).
- [Four captured source observations](capture-register.json), covering three official Google pages. The common recovery page has separate flow-specific registry identities.
- [Preparation and artifact hashes](preparation.json).

Each case includes the chosen answers and full proposed result, prerequisites, unresolved conditions and source identifiers. The adult-only scope, managed-account handoffs and treatment of unknown answers are explicit product boundaries. A local version identifier is not a hosted policy decision. The owner must review the source interpretation and exact expected-answer digest in the policy dashboard before the trusted acceptance runner executes either real procedure.

These packets preserve the original draft routing. They expand named expected outcomes into full expected-answer records and bind them to new source captures. No proposed answer was evaluated as a semantic acceptance test during preparation. The original research drafts and the earlier failed preparation's partial captures are retained separately.

## Engineering changes

The collector and policy service now share a finite acquisition profile for these exact English Google help documents: `/accounts/answer/185834?hl=en`, `/accounts/answer/6294825?hl=en` and `/accounts/answer/7682439?hl=en`. Those three documents have a 2 MiB raw ceiling; ordinary sources retain their 1 MiB ceiling. Normalized text remains bounded at 100 KiB. Redirects must preserve the exact origin, path and query. Private-address rejection, pinned DNS, timeouts, HTML completion checks and immutable raw evidence remain enforced.

Larger evidence reservations require an enabled human-registered source matching that profile. Policy ingestion checks the bound again, preventing a larger reservation from being reused against an ordinary source. The existing aggregate evidence capacity and chunk sizes are unchanged. Larger captures consume the same finite capacity; capacity monitoring and evidence maintenance remain operational requirements.

The admin UI offers separate registration packets for Verizon and both Google procedures. Each shows the exact URL and raw document bound, requires the owner's checkbox, verifies the stored records and leaves guidance under review. Shared Google recovery instructions use distinct source IDs for each flow. Deployment buttons use the environment-neutral term “Release deployment” because the same dashboard also handles staging.

## Observed hosted starting point

The protected dashboard was readable on November 26. It showed one Verizon proposal in `merge_authorized`, three registered sources and one older release in `deployment_review`: `release_1795428199436`, bound to candidate `2f041f5ea8b8c3b9883f9d5a6b6e7780c311066b`. That pending manifest does not include this candidate. It must not be approved as authorization for these changes.

The retained staging handoff also identifies incomplete staging smoke authorization and a missing release-verification credential binding. These must be reconciled in the owner environment, followed by a newly prepared exact manifest. The Cloudflare account dashboard currently requires the owner's sign-in. No Access policy, credential, source registration, content decision, traffic allocation or activation was changed while preparing this packet.

## Release sequence

1. Restore Cloudflare account access and configure the restricted staging smoke identity. Retain Google/MFA protection and the existing internal-only service boundary. Review any new access grant before saving it.
2. Refresh the three registered Verizon sources using the owner-run collector. Continue against the existing interpretation only if the canonical source versions and reviewed passages remain valid. Changed guidance requires a new interpretation review.
3. Submit this clean, committed candidate with the retained Verizon bundle and eighteen cases. The policy service invalidates the previous candidate's expectations and merge binding. The owner reviews the new expected-answer digest; the trusted runner then tests the new artifacts, followed by a new merge decision.
4. Prepare a corrected staging manifest, obtain its exact deployment decision, promote and verify staging. This installs the new registration and bounded-ingestion support. Bootstrap deployment must not be used to overwrite populated policy tables.
5. Register both Google flows and their four source boundaries in the updated dashboard. Upload fresh bounded captures, reconcile canonical hosted version IDs, and submit both interpretation proposals. The owner reviews each interpretation and exact expected-answer manifest. Run all 23 cases through the authorized UI/API runner and check complete transition coverage. Obtain the corresponding merge and staging release decisions, then verify and activate as permitted by policy.
6. Validate hosted source-change suspension, official fallback, session invalidation and reviewed recovery. Preserve failure evidence. A local test or visible card is not a hosted guided-flow success.
7. Prepare the production configuration and protected production admin service. Preserve the existing survey database, consent/notice versions and live hostname. Production has its own policy records and release decisions; staging decisions are not production approvals. Prepare the exact production manifest, obtain the owner's decision, promote, verify, activate and run public smoke checks.

The owner executes credential-bearing operations in the separate operator environment. Agents prepare and verify source, artifacts and review material; they do not submit the owner's content, merge or release decisions. See [the release runbook](../../RELEASE_RUNBOOK.md) and [contributor rules](../../../AGENTS.md).
