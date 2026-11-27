# Paired scenario coverage across the six sampled brands

November 15, 2026. Development analysis using corpus v0.8; not preregistered. The selection rule below was written after exploratory evidence collection and the initial four cases, but before constructing this paired table. It cannot remove the initial selection bias.

## Selection rule and common conditions

Include each sampled brand once, choosing its documented protection against a device/SIM change. Use the Wireless (postpaid) section for AT&T, the prepaid section for T-Mobile, and the recorded customer scope for the other brands. These choices preserve contrasting plan requirements rather than create a standardized carrier benchmark. Fi's selected feature also covers port-out. Feature names and scopes are not assumed equivalent.

For each brand, contrast two hypothetical states for the eligible legitimate user:

- **N: normal resources.** The original device is available, the eligible user has account access, and any specifically named ordinary proof in the inspected instructions is usable. This is a positive procedural control, not a measured customer outcome. Unspecified risk-dependent challenges remain unresolved.
- **L: loss with limited resources.** The original device cannot be used. The user remembers the password and can independently access the currently registered email, but has no usable account session, independent authenticator, reachable SMS, or other active eligible account device. Assistance may exist; it is not assumed to succeed or fail. Physical loss here does not imply attacker access or compromise.

The endpoint is removal of the selected protection, not completed provisioning, porting, fraud prevention, or a guarantee of recovery. Where a normal route is described, this means the source gives a procedure under the assumed resources; it does not establish a complete protocol or the absence of additional checks.

## Paired evidence table

| Brand / selected protection | N: normal-resource interpretation | L: limited-resource interpretation | Evidence units |
|---|---|---|---|
| AT&T / Wireless Account Lock, Wireless section | A primary/secondary online user with an eligible active account device has a described app route. No universal per-operation proof rule is inferred. | The specified app-device prerequisite is unavailable. The selected evidence does not establish an applicable smartphone exception. A transfer PIN is a different operation. | O21, O23–O25, O42 |
| T-Mobile / prepaid SIM Protection | An authenticated Primary Line has described website controls. This is not evidence about the identity proof used at every transaction. | A complete prepaid lost-factor sign-in route remains unresolved. The postpaid digital-ID alternative is outside the selected eligibility scope. | O27, O39–O41 |
| Verizon / SIM Protection | Owner/Manager website controls are described. Extra security prompts may occur; their proof requirements remain unspecified even in this control state. | The record does not establish both account access and satisfaction of conditional protection-change prompts with only the stipulated resources. S14 explicitly excludes retail/customer-service staff disabling SIM Protection; do not assume that direct override. | O11–O12, O34–O35, O48 |
| Google Fi / Number Lock | A signed-in customer who can complete the stated credential re-entry has a described web route. Risk-specific challenge selection is not reconstructed. | The record refers to account recovery but does not establish its success for this particular resource configuration. The account-access constraint remains relevant. | O01–O03, O37–O38 |
| Visible / Line Lock | An authenticated customer who can receive the text code has a described ordinary unlock route followed by the documented delay. | Account access remains unresolved. S16 describes an email-code unlock in port-out instructions, unlike S02’s SMS step; whether that route applies to the selected device/SIM-change context is not established. Do not infer SMS is universally required. | O05–O10, O36, O50 |
| US Mobile / Enhanced Security | An authenticated Owner/Admin with usable password or authenticator proof has a described settings-change route. Login and change confirmation remain distinct. | Knowing the password is not evidence of satisfying login 2FA. The passkey troubleshooting shortcut does not establish a missing-factor exception. | O16–O19, O31–O33 |

The N and L columns encode different assumptions about account access and resources. They do not estimate the causal effect of losing a phone, and they do not establish that one brand is more recoverable. Each L row identifies a question for further evidence collection. No L row is coded as impossible recovery.

## What the comparison contributes

The table prevents a one-sided analysis consisting only of difficult loss cases. It also exposes why supplying an account session can resolve a different prerequisite from supplying an operation-specific proof. The Verizon row preserves an unspecified challenge in both states, rather than silently assuming it away. The US Mobile row preserves a password-based change-confirmation option without reducing the separate login requirement to password-only access.

These are applications of established dependency and authorization reasoning to the coded instructions. No new graph calculus, recovery guarantee, or security architecture is claimed. Independent review should assess whether the selected scope, observation mapping, and inferred unknowns are justified.

The additional AT&T prepaid SMS rule (O46) provides a scope check: it belongs to the separate prepaid section and must not be inserted into the postpaid row above. More documentation does not automatically justify a broader inference.

Email scope clarification: N assumes access to the specifically required receiving address. L supplies the current registered email only. Visible’s previous-address reset rule (O36) therefore adds a conditional credential-reset prerequisite if the address recently changed. The paired L scenario already supplies the remembered password, so this rule does not itself alter its account-login or protection-removal result.
