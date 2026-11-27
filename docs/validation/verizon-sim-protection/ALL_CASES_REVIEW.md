# Verizon flow: all 18 cases for review

Use this file to review and edit the entire first flow in one place. **Ten summarized results have been confirmed in our conversation; eight cases remain pending.** All exact wording below remains open for your edits, including the cases already discussed.

## How to use this file

1. Check the question-and-answer path and proposed result against the linked official source.
2. Edit the proposed title, guidance, prerequisites or uncertainty directly. Add explanations under **Your changes or comments**.
3. Mark one review decision for each case: keep, revise or check the source. Leave it unchecked until you have reviewed the full case.

Keep each **Case ID** so your edits can be matched to the implementation. Several cases share the same outcome; their shared IDs are shown so we can reconcile wording consistently. Edits here will be applied to the proposed bundle and test expectations after your review.

An empty prerequisites or uncertainty list means that the draft records no additional items in that field. It does not establish that every real-world requirement is satisfied. The question-and-answer path still applies.

The consumer-postpaid restriction is the scope selected for this first flow. These are proposed guidance outcomes, not completed Verizon account transactions. This document records review work; authenticated approvals and real-source acceptance tests remain separate.

## Review overview

| No. | Case                                                                                    | Prior conversation review |
| --- | --------------------------------------------------------------------------------------- | ------------------------- |
| 1   | [A different account type](#case-wrong-account)                                         | Pending                   |
| 2   | [Account type is unknown](#case-account-unknown)                                        | Pending                   |
| 3   | [Enable protection with Owner or Manager access](#case-enable-authorized)               | Summary confirmed         |
| 4   | [Enable protection with Account Member or other access](#case-enable-member)            | Summary confirmed         |
| 5   | [Enable protection when the account role is unknown](#case-enable-role-unknown)         | Pending                   |
| 6   | [Enable protection when sign-in access is unknown](#case-enable-access-unknown)         | Pending                   |
| 7   | [Forgotten password or failed-attempt lockout](#case-enable-forgot)                     | Summary confirmed         |
| 8   | [Change a SIM or device while protection is on](#case-replace-enabled)                  | Summary confirmed         |
| 9   | [Change a SIM or device while protection is off](#case-replace-disabled)                | Summary confirmed         |
| 10  | [The protection setting is unknown](#case-protection-unknown)                           | Summary confirmed         |
| 11  | [Change a SIM or device with Account Member or other access](#case-replace-role-member) | Summary confirmed         |
| 12  | [Change a SIM or device when the account role is unknown](#case-replace-role-unknown)   | Summary confirmed         |
| 13  | [Change a SIM or device when sign-in access is unknown](#case-replace-access-unknown)   | Summary confirmed         |
| 14  | [A verification step is unavailable](#case-replace-no-verification)                     | Summary confirmed         |
| 15  | [Another sign-in problem](#case-access-other)                                           | Pending                   |
| 16  | [The cause of the sign-in problem is unknown](#case-access-unknown)                     | Pending                   |
| 17  | [Transfer a number to another carrier](#case-port-different)                            | Pending                   |
| 18  | [The customer is unsure what they need](#case-intent-unknown)                           | Pending                   |

## Official references

- [SIM Protection and Number Lock][sim-settings]
- [My Verizon account access][account-access]
- [Account roles][account-roles]

Review the full official answers, including conditions and timing. The FAQ pages can also contain labeled generated summaries. Source capture details are in [source-register.json](source-register.json).

<a id="case-wrong-account"></a>

## 01. A different account type

**Case ID:** `wrong-account` · **Shared outcome ID:** `outside-scope`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                               |
| --------------------------------------------------- | --------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | No, a prepaid, business, or different account |

**Proposed result title:** Use the guidance for your account type

**Proposed guidance**

> This guide covers consumer postpaid accounts. Choose the appropriate account guidance through Verizon’s official support pages.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- The requirements for your account type are not established by this flow.

**Reason for the proposed result:** Account types outside consumer postpaid must not receive these steps.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-account-unknown"></a>

## 02. Account type is unknown

**Case ID:** `account-unknown` · **Shared outcome ID:** `confirm-account`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer |
| --------------------------------------------------- | --------------- |
| Is this a Verizon consumer postpaid mobile account? | I am not sure   |

**Proposed result title:** Confirm your account type first

**Proposed guidance**

> Use Verizon’s account help to confirm which service and account type you have before following a SIM Protection procedure.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

None separately listed in the draft.

**Reason for the proposed result:** Unknown account type must be resolved first.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-enable-authorized"></a>

## 03. Enable protection with Owner or Manager access

**Case ID:** `enable-authorized` · **Shared outcome ID:** `enable-protection`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                  |
| --------------------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account |
| What are you trying to do?                                      | Turn on SIM Protection           |
| Can you sign in to My Verizon now?                              | Yes                              |
| Does that sign-in have Account Owner or Account Manager access? | Yes, Owner or Manager            |

**Proposed result title:** Turn on protection through My Verizon

**Proposed guidance**

> Open Account → Account settings → Security settings. Edit SIM Protection for the intended line, turn it on, save, and complete any verification Verizon requests.

**Additional prerequisites listed in the draft**

- An Account Owner or Manager sign-in.
- Access to any verification required by Verizon.

**Uncertainty or conditions still unresolved**

None separately listed in the draft.

**Reason for the proposed result:** Official SIM settings procedure requires Owner or Manager privileges.

**Official references:** [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-enable-member"></a>

## 04. Enable protection with Account Member or other access

**Case ID:** `enable-member` · **Shared outcome ID:** `authorized-role`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                    |
| --------------------------------------------------------------- | ---------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account   |
| What are you trying to do?                                      | Turn on SIM Protection             |
| Can you sign in to My Verizon now?                              | Yes                                |
| Does that sign-in have Account Owner or Account Manager access? | No, Account Member or another role |

**Proposed result title:** Check the account role

**Proposed guidance**

> Confirm access with the Account Owner or an authorized Account Manager. Account Member access is limited.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No role change or recovery outcome is promised.

**Reason for the proposed result:** Account Member role is insufficient for these management steps.

**Official references:** [Account roles][account-roles] · [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-enable-role-unknown"></a>

## 05. Enable protection when the account role is unknown

**Case ID:** `enable-role-unknown` · **Shared outcome ID:** `authorized-role`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                  |
| --------------------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account |
| What are you trying to do?                                      | Turn on SIM Protection           |
| Can you sign in to My Verizon now?                              | Yes                              |
| Does that sign-in have Account Owner or Account Manager access? | I am not sure                    |

**Proposed result title:** Check the account role

**Proposed guidance**

> Confirm access with the Account Owner or an authorized Account Manager. Account Member access is limited.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No role change or recovery outcome is promised.

**Reason for the proposed result:** An unknown role must not be treated as authorized.

**Official references:** [Account roles][account-roles] · [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-enable-access-unknown"></a>

## 06. Enable protection when sign-in access is unknown

**Case ID:** `enable-access-unknown` · **Shared outcome ID:** `check-signin`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                  |
| --------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account |
| What are you trying to do?                          | Turn on SIM Protection           |
| Can you sign in to My Verizon now?                  | I am not sure                    |

**Proposed result title:** Check account access on Verizon’s site

**Proposed guidance**

> Try the official My Verizon sign-in route. If a verification step is unavailable, use Verizon’s account-access help.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- This guide cannot confirm your sign-in or verification options.

**Reason for the proposed result:** Unknown access should hand off before procedural changes.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-enable-forgot"></a>

## 07. Forgotten password or failed-attempt lockout

**Case ID:** `enable-forgot` · **Shared outcome ID:** `password-recovery`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                            | Selected answer                                              |
| --------------------------------------------------- | ------------------------------------------------------------ |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account                             |
| What are you trying to do?                          | Turn on SIM Protection                                       |
| Can you sign in to My Verizon now?                  | No                                                           |
| What is preventing you from signing in?             | I forgot my password or was locked out after failed attempts |

**Proposed result title:** Use Verizon’s password recovery

**Proposed guidance**

> Use the password-recovery link in Verizon’s account-access FAQ and follow its prompts. The same FAQ addresses lockout after repeated failed sign-in attempts.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- Required verification and recovery success are not established here.

**Reason for the proposed result:** Password FAQ supports a recovery attempt, not guaranteed success.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-enabled"></a>

## 08. Change a SIM or device while protection is on

**Case ID:** `replace-enabled` · **Shared outcome ID:** `disable-protection`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account                      |
| What are you trying to do?                                      | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                              | Yes                                                   |
| Does that sign-in have Account Owner or Account Manager access? | Yes, Owner or Manager                                 |
| Is SIM Protection currently enabled for the affected line?      | Yes                                                   |

**Proposed result title:** Review the protection change before proceeding

**Proposed guidance**

> For an intended SIM or device change, edit SIM Protection in My Verizon’s Security settings. Disabling it does not permit an immediate transaction: Verizon describes a 15-minute block and possible additional delay.

**Additional prerequisites listed in the draft**

- An authorized Owner or Manager sign-in.
- A deliberate, legitimate SIM or device change.

**Uncertainty or conditions still unresolved**

- Follow Verizon’s current confirmation and timing instructions.

**Reason for the proposed result:** A legitimate intended device change must account for protection and delay.

**Official references:** [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-disabled"></a>

## 09. Change a SIM or device while protection is off

**Case ID:** `replace-disabled` · **Shared outcome ID:** `activation-handoff`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account                      |
| What are you trying to do?                                      | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                              | Yes                                                   |
| Does that sign-in have Account Owner or Account Manager access? | Yes, Owner or Manager                                 |
| Is SIM Protection currently enabled for the affected line?      | No                                                    |

**Proposed result title:** Continue with Verizon’s device procedure

**Proposed guidance**

> Use Verizon’s official support for the intended SIM or device change. This flow does not complete or validate activation.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- Activation prerequisites and timing remain with Verizon.

**Reason for the proposed result:** Disabled protection does not prove activation prerequisites.

**Official references:** [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-protection-unknown"></a>

## 10. The protection setting is unknown

**Case ID:** `protection-unknown` · **Shared outcome ID:** `check-protection`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account                      |
| What are you trying to do?                                      | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                              | Yes                                                   |
| Does that sign-in have Account Owner or Account Manager access? | Yes, Owner or Manager                                 |
| Is SIM Protection currently enabled for the affected line?      | I am not sure                                         |

**Proposed result title:** Check the affected line’s setting

**Proposed guidance**

> Review SIM Protection for the line in My Verizon’s Security settings before deciding whether any change is needed.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

None separately listed in the draft.

**Reason for the proposed result:** Unknown settings require inspection, not assumed disabling.

**Official references:** [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-role-member"></a>

## 11. Change a SIM or device with Account Member or other access

**Case ID:** `replace-role-member` · **Shared outcome ID:** `authorized-role`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account                      |
| What are you trying to do?                                      | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                              | Yes                                                   |
| Does that sign-in have Account Owner or Account Manager access? | No, Account Member or another role                    |

**Proposed result title:** Check the account role

**Proposed guidance**

> Confirm access with the Account Owner or an authorized Account Manager. Account Member access is limited.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No role change or recovery outcome is promised.

**Reason for the proposed result:** Limited role must not receive change authorization.

**Official references:** [Account roles][account-roles] · [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-role-unknown"></a>

## 12. Change a SIM or device when the account role is unknown

**Case ID:** `replace-role-unknown` · **Shared outcome ID:** `authorized-role`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                                        | Selected answer                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account?             | Yes, a consumer postpaid account                      |
| What are you trying to do?                                      | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                              | Yes                                                   |
| Does that sign-in have Account Owner or Account Manager access? | I am not sure                                         |

**Proposed result title:** Check the account role

**Proposed guidance**

> Confirm access with the Account Owner or an authorized Account Manager. Account Member access is limited.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No role change or recovery outcome is promised.

**Reason for the proposed result:** Unknown role does not establish privileges.

**Official references:** [Account roles][account-roles] · [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-access-unknown"></a>

## 13. Change a SIM or device when sign-in access is unknown

**Case ID:** `replace-access-unknown` · **Shared outcome ID:** `check-signin`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                            | Selected answer                                       |
| --------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account                      |
| What are you trying to do?                          | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                  | I am not sure                                         |

**Proposed result title:** Check account access on Verizon’s site

**Proposed guidance**

> Try the official My Verizon sign-in route. If a verification step is unavailable, use Verizon’s account-access help.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- This guide cannot confirm your sign-in or verification options.

**Reason for the proposed result:** Unknown access requires official check.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-replace-no-verification"></a>

## 14. A verification step is unavailable

**Case ID:** `replace-no-verification` · **Shared outcome ID:** `verification-handoff`

**Prior conversation review:** Summarized result confirmed; full wording remains editable.

**Scenario — customer selections in order**

| Question                                            | Selected answer                                       |
| --------------------------------------------------- | ----------------------------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account                      |
| What are you trying to do?                          | Change a SIM or device while SIM Protection may be on |
| Can you sign in to My Verizon now?                  | No                                                    |
| What is preventing you from signing in?             | I cannot complete a verification step                 |

**Proposed result title:** Ask Verizon about the sign-in problem

**Proposed guidance**

> Use Verizon’s official account-access support. Explain what prevents sign-in and whether a verification option is unavailable; do not provide credentials or codes to this website.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No bypass, store override, or guaranteed recovery route has been verified.

**Reason for the proposed result:** No verified bypass or guaranteed recovery is established.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-access-other"></a>

## 15. Another sign-in problem

**Case ID:** `access-other` · **Shared outcome ID:** `verification-handoff`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                  |
| --------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account |
| What are you trying to do?                          | Get back into My Verizon         |
| What is preventing you from signing in?             | Something else                   |

**Proposed result title:** Ask Verizon about the sign-in problem

**Proposed guidance**

> Use Verizon’s official account-access support. Explain what prevents sign-in and whether a verification option is unavailable; do not provide credentials or codes to this website.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No bypass, store override, or guaranteed recovery route has been verified.

**Reason for the proposed result:** Unclassified access issue must not invent a recovery route.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-access-unknown"></a>

## 16. The cause of the sign-in problem is unknown

**Case ID:** `access-unknown` · **Shared outcome ID:** `verification-handoff`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                  |
| --------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account |
| What are you trying to do?                          | Get back into My Verizon         |
| What is preventing you from signing in?             | I am not sure                    |

**Proposed result title:** Ask Verizon about the sign-in problem

**Proposed guidance**

> Use Verizon’s official account-access support. Explain what prevents sign-in and whether a verification option is unavailable; do not provide credentials or codes to this website.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- No bypass, store override, or guaranteed recovery route has been verified.

**Reason for the proposed result:** Unknown access cause remains unresolved.

**Official references:** [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-port-different"></a>

## 17. Transfer a number to another carrier

**Case ID:** `port-different` · **Shared outcome ID:** `port-handoff`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                   |
| --------------------------------------------------- | --------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account  |
| What are you trying to do?                          | Move my number to another carrier |

**Proposed result title:** Number transfer needs a separate procedure

**Proposed guidance**

> SIM Protection and Number Lock address different changes. Use Verizon’s official Number Lock and transfer guidance for a port-out.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

- This flow does not establish your port-out prerequisites.

**Reason for the proposed result:** Number Lock and SIM Protection must not be conflated.

**Official references:** [SIM Protection and Number Lock][sim-settings]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

<a id="case-intent-unknown"></a>

## 18. The customer is unsure what they need

**Case ID:** `intent-unknown` · **Shared outcome ID:** `clarify-task`

**Prior conversation review:** Pending.

**Scenario — customer selections in order**

| Question                                            | Selected answer                  |
| --------------------------------------------------- | -------------------------------- |
| Is this a Verizon consumer postpaid mobile account? | Yes, a consumer postpaid account |
| What are you trying to do?                          | I am not sure                    |

**Proposed result title:** Check the official options

**Proposed guidance**

> Read Verizon’s SIM Protection and account-access pages to identify the task that fits your situation.

**Additional prerequisites listed in the draft**

None listed.

**Uncertainty or conditions still unresolved**

None separately listed in the draft.

**Reason for the proposed result:** Unknown intent requires official task clarification.

**Official references:** [SIM Protection and Number Lock][sim-settings] · [Account-access FAQ][account-access]

**Your review decision**

- [*] Keep as written
- [ ] Revise using my edits or comments below
- [ ] Check the official source before deciding

**Your changes or comments**

_Write here, or edit the proposed wording above._

## Comments about the whole flow

Use this space for missing scenarios, confusing questions, wording changes that should apply across several cases, or concerns about the handoffs.

_Write here._

## Review baseline

The customer selections and complete proposed outcomes above were copied from [expected-cases.proposed.json](expected-cases.proposed.json), with question and choice labels from [bundle.proposed.json](bundle.proposed.json). This file presents the existing proposals for editing; it does not establish that the expected answers are independently validated. The [review manifest](review-manifest.json) identifies those inputs, and [owner review notes](OWNER_REVIEW_NOTES.md) preserve the conversation confirmations.

[sim-settings]: https://www.verizon.com/support/knowledge-base-309294/
[account-access]: https://www.verizon.com/support/my-verizon-faqs/
[account-roles]: https://www.verizon.com/support/assign-account-manager-roles-faqs/
