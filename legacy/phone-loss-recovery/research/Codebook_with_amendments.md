# Carrier documentation study: codebook v0.1

Date: November 14, 2026. Exploratory coding, developed after initial source inspection; not preregistered.

## Question and sampling

What do public carrier instructions establish about protecting a phone number and recovering control when the original device is unavailable?

The initial purposive sample contains AT&T, T-Mobile, Verizon, Google Fi, Visible, and US Mobile. It covers different retail arrangements, not six independent network operators. Visible and Verizon must not be treated as independent corporate observations. No market-share weighting, random selection, subscriber sample, fraud outcomes, or usability measurements are available. Conclusions apply to inspected documents and stated scopes.

## Unit and evidence boundaries

The unit is a scoped claim about a workflow step, not a carrier-wide security score. Preserve product, plan, account role, operation, channel, and exceptional circumstances. A single brand may require several records. Each record names its supporting source; the source register gives the URL, access date, section locator, observed date, and access limitations.

Provider documentation establishes what the provider describes. It does not demonstrate backend enforcement, actual customer outcomes, representative support behavior, or the absence of undisclosed exceptions. All current coding is one AI-assisted pass. Neither independent human agreement nor author verification has been completed.

Do not equate:

- Password reset with successful account access.
- Account access with authorization to remove a lock.
- Lock removal with SIM provisioning or completed port-out.
- An enrolled second factor with fresh authentication for the requested operation.
- Notifications with a guaranteed opportunity to stop a transfer.
- An unlock delay with a measured reduction in fraud.
- A generic lost-device identity check with eligibility for every protected operation.

## Status vocabulary

| Code | Meaning |
|---|---|
| documented | Explicit statement in an inspected source, within the recorded scope. |
| not_specified_in_source | The inspected source does not establish the property. This means unknown, not absent. |
| announced_future | The source describes planned behavior, without subsequent deployment verification. |

Additional codes to introduce only when needed: contradicted_between_sources, retrieval_failed, and not_applicable. Never turn retrieval failure into a negative finding. Internal contradictions should be recorded and excluded from automated inference until resolved.

## Scenario definitions for subsequent analysis

1. Original phone available; legitimate owner requests a device change.
2. Phone unavailable; another enrolled authenticator remains usable.
3. Phone unavailable; email remains accessible but no alternative authenticator is known.
4. Phone unavailable; email recovery depends on that same number.
5. Multi-line account; another active eligible account device is available.
6. An attacker has account credentials but no independent authenticator.
7. An attacker controls the phone number but not an independent recovery factor.

These are proposed analytic scenarios, not completed participant or carrier experiments. “Unavailable” must distinguish physical loss, device failure, service suspension, and compromise. A stolen unlocked device is not equivalent to a destroyed device.

## Retrieval and coverage

Initial pages came from earlier exploratory research. On November 14 the study revisited all six brands; Google Fi's dedicated lock article and Visible's Member Security article were added. Browser rendering was required for substantive AT&T and T-Mobile text. AT&T FAQs were expanded; its Prepaid tab was not inspected. Nested T-Mobile eligibility sections remain pending. Searches for lost-device recovery identified follow-up pages but search snippets alone were not coded as confirmed procedures.

Version 0.1 is therefore an initial corpus, not an exhaustive documentation audit. Full source snapshots were not retained; exact historical reproducibility is limited. Preserve compact evidence notes now, and acquire permitted timestamped snapshots before freezing the publication dataset. Do not describe a locally hashed coding file as a hash of the remote webpage.

## Review and analysis rules

Before reporting comparative counts, freeze the scope and retrieval procedure, complete planned follow-up retrieval for each brand, and have an independent coder assess the same claims. Report raw agreement and disagreement categories; use reliability statistics only when the unit and sample justify them. Repeated review by the same assistant is not independent coding.

Analyze unknown prerequisites with explicitly labeled alternative assumptions. A path that exists only after assuming a support exception is conditional, not documented recoverability. If every considered completion yields the same result, the conclusion is robust only over those completions, not over all real-world implementations. Never report the proportion of synthetic completions as the probability that a carrier is vulnerable.

Publication blockers: incomplete recovery-path retrieval; missing immutable source snapshots; independent coding pending; unverified novelty against related recovery research; no real-world validation. A documentation study can still be a legitimate original empirical study, but its claims must remain about documentation unless stronger evidence is collected.



## November 15 amendment: selected documentary design

The user selected a rigorous documentation study with explicit limits. Live account validation is outside this design and is not a prerequisite for claims confined to documentation. Operational claims remain prohibited without a separate authorized study. This amendment supersedes the earlier blanket listing of “no real-world validation” as a publication blocker; it does not relax evidence standards.

Corpus v0.8 preserves 16 November 15 source responses, including recovered embedded FAQs, and 50 coding records. Historical November 14 versions remain unavailable. Prepaid AT&T and T-Mobile eligibility follow-up has occurred. The recovery search log records adaptive follow-up rather than exhaustive coverage. Author and independent review, a completed related-work comparison, and venue-specific reporting remain pending.

A source-scoped unknown may coexist with a later documented assertion. Do not count it as a current brand-wide unknown. Cross-source discrepancies remain in the issue register while each source retains its own coding status. The same-assistant audit is a separate artifact, not a new independent coder. Corpus-size counts describe the artifact; they do not estimate prevalence or recoverability.
