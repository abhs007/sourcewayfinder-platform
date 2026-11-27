# Reviewed-domain inputs

## Account-recovery additions — November 26, 2026

`google-lost-second-factor/` and `google-compromised-account/` add two **unapproved research drafts** with 23 proposed cases in total. Read each `REVIEW.md` and `review-packet.json`. Official research captures are retained under `research/account-recovery-2026-11-26/`; provisional `draft_` source identities are not policy-service approvals.

Google's raw research pages are approximately 1.6 MiB each, exceeding the production collector's 1 MiB limit. Their production ingestion therefore requires separately reviewed bounded acquisition work. Do not raise limits or bypass the collector to publish these drafts. No semantic acceptance tests have been run for these new procedures. Public discovery entries expose official-source handoffs while guided answers remain unavailable.

## Original pilot inputs

`verizon-sim-protection/` and `ssa-replacement-card/` contain draft production candidates, proposed expected answers, exact source registers, and review packets. Neither bundle is an active release. Start with `docs/DRAFT_REVIEW.md`.

`sources.json` is a narrow local acquisition allowlist. The hosted collector additionally requires the same URL, exact path, and origin to exist in the human-approved policy registry. Editing this local file never grants hosted source approval.

The collector preserves raw HTML and normalized text privately, below `private/evidence/`. It accepts only HTML, refuses bodies over 1 MiB and normalized content over 100 KiB, and rejects missing required passages. It never silently truncates a source. Scope-bound content selectors avoid comparing unrelated navigation and render timestamps. Selector or extractor changes require review.

Run a due check:

```sh
npm run collect -- --browser
```

`--browser` explicitly enables sources configured with browser acquisition; it is not an automatic fallback for failed requests. `--source ssa-replacement --force --browser` performs a bounded manual recheck of one source. Omit `--force` in scheduled execution. Checks are serial, at least two seconds apart, and normally due daily with jitter. A missed schedule triggers one current check per due source, not a replay of missed timers.

For hosted ingestion, `SWF_COLLECTOR_CONFIG` points to an owner-owned mode-0600 JSON file outside agent workspaces:

```json
{
  "policyOrigin": "https://admin.sourcewayfinder.org",
  "collectorToken": "SET_IN_PRIVATE_CONFIG",
  "accessClientId": "SET_IN_PRIVATE_CONFIG",
  "accessClientSecret": "SET_IN_PRIVATE_CONFIG"
}
```

The Access fields are supplied together. The scoped bearer cannot create human approvals. No redirects are followed on authenticated policy requests. Without remote credentials, the collector only retains evidence locally and does not imply hosted freshness.

The local collector lock prevents overlapping runs. After a crash, inspect `private/evidence/collector.lock`, verify that its recorded process is no longer running, and remove that stale lock before restarting. Never remove an active collector's lock. Retained files are immutable; a conflicting hash-named file stops the operation. Do not delete an old source version referenced by a review or release.

A normalized-equivalent remote check may return an older canonical source version than the newest raw observation. `snapshot.canonicalSource` records that remote reference. Use the canonical version/hash when preparing hosted proposals, and retain the new raw observation as collection evidence. Do not pair an old semantic source-version identifier with a new raw hash.
