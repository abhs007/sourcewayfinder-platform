# google-lost-second-factor — review draft

English guidance for an adult with their own personal Google account whose primary phone or usual second step is unavailable. Excludes managed accounts, child/representative recovery and detailed Advanced Protection recovery.

## Proposed cases

| Case | Selections | Proposed outcome |
|---|---|---|
| case-01 | account-scope=managed | managed-account |
| case-02 | account-scope=other | outside-scope |
| case-03 | account-scope=unknown | confirm-scope |
| case-04 | account-scope=personal; password=yes; advanced=yes | check-advanced |
| case-05 | account-scope=personal; password=yes; advanced=unknown | check-advanced |
| case-06 | account-scope=personal; password=yes; advanced=no; backup-method=device | use-device |
| case-07 | account-scope=personal; password=yes; advanced=no; backup-method=code | use-code |
| case-08 | account-scope=personal; password=yes; advanced=no; backup-method=key | use-key |
| case-09 | account-scope=personal; password=yes; advanced=no; backup-method=passkey | use-passkey |
| case-10 | account-scope=personal; password=yes; advanced=no; backup-method=number | use-number |
| case-11 | account-scope=personal; password=yes; advanced=no; backup-method=none | recovery |
| case-12 | account-scope=personal; password=yes; advanced=no; backup-method=unknown | check-method |
| case-13 | account-scope=personal; password=no | recovery |
| case-14 | account-scope=personal; password=unknown | recovery |

## Source and review boundaries

Feedback suggested account lockouts and lost 2FA recovery. Do not implement the blueprint’s universal password-before-device-erase order or any promise of immediate recovery.

Each question, choice and outcome is in bundle.draft.json. All branches, including unknown answers, are listed above. Proposed targets were enumerated structurally; the semantic acceptance runner has not been run.

Research captures and selected passages: ../research/account-recovery-2026-11-26/capture-register.json. The full Google pages, rather than the feedback blueprint, govern this proposal. Source passages are minimal trace anchors; an owner must review the complete relevant sections, all outcome wording and source bindings.

Before guided release: register approved source boundaries; acquire with the production collector; replace provisional source identities; review interpretation and exact expected answers; execute the newly authorized candidate; follow merge, deployment, verification and activation gates. No existing Verizon decision or test result is inherited.

## Acquisition constraint

These unauthenticated research pages are approximately 1.6 MiB each and exceed the production collector’s 1 MiB raw-body limit. They were captured by a separately bounded 2 MiB research helper, not ingested through policy. A reviewed bounded acquisition approach is still needed before production registration/interpretation. Existing collector limits remain intact. Markitdown extractions are separate fetches and can omit collapsed prose; use the raw capture and its companion text for the registered research-byte identity.
