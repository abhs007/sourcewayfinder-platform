# google-compromised-account — review draft

English guidance for an adult securing their own personal Google account or Gmail after suspected unauthorized activity. It selects an official recovery or review route; it does not diagnose compromise, assess financial loss or guarantee account security.

## Proposed cases

| Case | Selections | Proposed outcome |
|---|---|---|
| case-01 | account-scope=managed | managed-account |
| case-02 | account-scope=other | outside-scope |
| case-03 | account-scope=unknown | confirm-scope |
| case-04 | account-scope=personal; can-sign-in=yes; concern=activity | review-events |
| case-05 | account-scope=personal; can-sign-in=yes; concern=device | review-devices |
| case-06 | account-scope=personal; can-sign-in=yes; concern=other | review-security |
| case-07 | account-scope=personal; can-sign-in=yes; concern=unknown | review-security |
| case-08 | account-scope=personal; can-sign-in=no | recover-access |
| case-09 | account-scope=personal; can-sign-in=unknown | check-access |

## Source and review boundaries

Feedback suggested primary-email compromise triage. The user’s ability to sign in changes the official starting point; uncertainty remains an explicit handoff.

Each question, choice and outcome is in bundle.draft.json. All branches, including unknown answers, are listed above. Proposed targets were enumerated structurally; the semantic acceptance runner has not been run.

Research captures and selected passages: ../research/account-recovery-2026-11-26/capture-register.json. The full Google pages, rather than the feedback blueprint, govern this proposal. Source passages are minimal trace anchors; an owner must review the complete relevant sections, all outcome wording and source bindings.

Before guided release: register approved source boundaries; acquire with the production collector; replace provisional source identities; review interpretation and exact expected answers; execute the newly authorized candidate; follow merge, deployment, verification and activation gates. No existing Verizon decision or test result is inherited.

## Acquisition constraint

These unauthenticated research pages are approximately 1.6 MiB each and exceed the production collector’s 1 MiB raw-body limit. They were captured by a separately bounded 2 MiB research helper, not ingested through policy. A reviewed bounded acquisition approach is still needed before production registration/interpretation. Existing collector limits remain intact. Markitdown extractions are separate fetches and can omit collapsed prose; use the raw capture and its companion text for the registered research-byte identity.
