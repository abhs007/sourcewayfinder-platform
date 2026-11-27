# google-lost-second-factor: exact case review

Unapproved local candidate. No semantic acceptance, hosted registration, interpretation decision or release has occurred.

Canonical bundle SHA-256: `84e98b5bc3e4a3c3a0486b75f26edbc92ac3ba7c4ec96d9f1777cae25140e7ba`

## Interpretation

Bounded routing for an adult using their own personal Google account when a phone or second factor is unavailable. Previously configured verification options are suggestions within Google sign-in, never a guarantee. Managed accounts, uncertain scope and Advanced Protection are handed to official instructions. A missing or unknown password uses the official recovery route.

## Source anchors

- **google-lost-factor**: [official page](https://support.google.com/accounts/answer/185834?hl=en); version `v_ce01c9fa48b8d697869679cdd2524d1dd018610ea39e6bce92dcf2f6fd3c`; raw SHA-256 `ec7696170608a18564520d9519cbce8336f01d82ead556e5361c28c522d51f83`.
- **google-lost-recovery**: [official page](https://support.google.com/accounts/answer/7682439?hl=en); version `v_029e276d4961751dd85e6d45739163efd7915f4350065dcb7655acafc3cc`; raw SHA-256 `b005f044a35efaea4ab42bd7a2abf46260e2cc9d33aa65390fcc1343d43a71fd`.

## Cases

### case-01

- Is this your own personal Google account, as an adult? **It is a work, school or managed account**

**Result:** Check with your account administrator

Google notes that personal-account recovery steps may not work for work, school or other managed accounts. Check the official guidance and contact your administrator.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery

### case-02

- Is this your own personal Google account, as an adult? **It is for a child or someone else**

**Result:** Use the official route for that account

This draft is limited to an adult recovering their own personal Google account. Open Google’s account help for the appropriate route.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery

### case-03

- Is this your own personal Google account, as an adult? **I am not sure**

**Result:** Confirm which account needs help

Check whether the account is personal or managed before choosing a recovery process. Use Google’s official account help if you are unsure.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery

### case-04

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **Yes**

**Result:** Check Google’s Advanced Protection instructions

Use Google’s official second-step help for Advanced Protection before choosing a recovery method. This draft does not apply the ordinary backup-options branch to that account.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Advanced Protection may require a different recovery route.

**Sources:** google-lost-factor

### case-05

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **I am not sure**

**Result:** Check Google’s Advanced Protection instructions

Use Google’s official second-step help for Advanced Protection before choosing a recovery method. This draft does not apply the ordinary backup-options branch to that account.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Advanced Protection may require a different recovery route.

**Sources:** google-lost-factor

### case-06

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **Another phone already signed in**

**Result:** Try your available Google verification option

Google lists another phone already signed in as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.

**Prerequisites:** You remember the password and can access another phone already signed in. This branch excludes Advanced Protection.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor

### case-07

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **A backup code I previously saved**

**Result:** Try your available Google verification option

Google lists a previously saved backup code as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.

**Prerequisites:** You remember the password and can access a previously saved backup code. This branch excludes Advanced Protection.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor

### case-08

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **A registered hardware security key**

**Result:** Try your available Google verification option

Google lists a registered hardware security key as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.

**Prerequisites:** You remember the password and can access a registered hardware security key. This branch excludes Advanced Protection.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor

### case-09

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **A passkey on another device**

**Result:** Try your available Google verification option

Google lists a passkey on another device as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.

**Prerequisites:** You remember the password and can access a passkey on another device. This branch excludes Advanced Protection.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor

### case-10

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **Another registered verification phone number**

**Result:** Try your available Google verification option

Google lists another verification phone number previously added to the account as a possible second-step option. Use Google’s sign-in process to try it. Once you regain access, follow its lost-phone security instructions.

**Prerequisites:** You remember the password and can access another verification phone number previously added to the account. This branch excludes Advanced Protection.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor

### case-11

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **None of these**

**Result:** Use Google’s account recovery process

Follow Google’s recovery process and answer its ownership questions. Do not share passwords or verification codes with this site or a third-party recovery service.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery

### case-12

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **Yes**
- Is the account enrolled in Google Advanced Protection? **No**
- Which previously set-up sign-in option can you still access? **I am not sure**

**Result:** Review which verification options you have

Open Google’s official second-step help to identify an option you previously set up. If none is available, follow its account recovery route.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-factor, google-lost-recovery

### case-13

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **No**

**Result:** Use Google’s account recovery process

Follow Google’s recovery process and answer its ownership questions. Do not share passwords or verification codes with this site or a third-party recovery service.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery

### case-14

- Is this your own personal Google account, as an adult? **Yes, my personal account**
- Do you remember your Google password? **I am not sure**

**Result:** Use Google’s account recovery process

Follow Google’s recovery process and answer its ownership questions. Do not share passwords or verification codes with this site or a third-party recovery service.

**Prerequisites:** No additional prerequisite stated.

**Unresolved:** Google determines which verification and recovery options are available.

**Sources:** google-lost-recovery
