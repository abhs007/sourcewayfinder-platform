# Verizon policy approval and hosted staging plan

**Status: protected staging and owner source registration are verified. The dashboard shows one Verizon flow, three registered sources and four audit events. The flow is under review. Source evidence ingestion, content approvals and hosted Verizon journeys remain pending.** This follows the owner’s review of all eighteen cases and the passing local journey results.

The redirect repair passed 118 unit/integration tests, type checking, the build and formatting. Seven additional checks cover the observed invalid redirect, valid external destinations, canonical-host behavior, staging authentication, configuration generation and the restricted retry plan. All four compiled Worker modules remain byte-identical to the first bootstrap package. The operator update changed only four known non-secret package files, the manifest and launcher; it did not inspect credential files. The new package SHA-256 is `7f7f5106ddc481c6eb80b78cc890cbf56e11669436c191a982f670641bffb5d9`. The owner subsequently replied “done” to the retry instructions; deployed Worker versions have not yet been independently captured.

## Initial hosted observations — November 23, 2026

Five unauthenticated GET requests returned HTTP 403 with no-store cache directives: the staging home page and domain API, and the admin home page, dashboard API and internal job path. The requests sent no cookies, credentials or answer data. Their status codes establish refusal from that client, not the specific rule responsible or authenticated application functionality. Results are retained in `test-results/hosted-staging/anonymous-access-results.json`.

Opening the admin hostname in the signed-in browser reached Cloudflare Access's “No authentication methods set up” page. The owner attempted enrollment and received an App Launcher disabled message. The account's App Launcher settings showed no associated policy. After the owner's explicit authorization, the existing owner-only Google policy was attached, Google was selected as the only provider and six-hour sessions were saved. The resulting launcher application ID is `5e5f26fd-35db-477f-98f7-5451882bb341`.

Live verification showed “Welcome Abhishek!” and tiles for both staging applications. The owner completed authenticator enrollment and verification. The agent did not inspect QR codes, enrollment secrets or verification codes. The launcher follows the existing global MFA default (off) to permit initial enrollment; both staging applications retain their separate authenticator-MFA requirements. The actual admin dashboard subsequently loaded successfully with all five record counts at zero.

## Authenticated hosted observations and registration update — November 23

The admin dashboard rendered with zero proposals, releases, sources, flows and audit events. The staging homepage rendered, `/api/v1/domains` returned `{"domains":[]}`, and `/api/survey/status` reported Cloudflare storage with survey version `needs-v1` and notice version `2026-11-21-public`. These are bootstrap connectivity checks, not a hosted guidance journey. The survey was not submitted and no responses were read. Evidence: `test-results/hosted-staging/authenticated-access-results.json` and its two screenshots.

The backend already supports human-authenticated flow and source registration, but the original dashboard lacked its form. A local candidate now displays the exact Verizon scope and all three collection boundaries before an explicit owner submission. It reconciles existing records before retrying, refuses conflicting IDs/boundaries, preserves CSRF checks, and leaves the flow under review. Browser tests intercept writes; they are not owner authorization or source-semantic acceptance.

The constrained `--update-admin` operator mode verifies all four existing staging deployments and refuses populated policy/content tables. It updates only the control Worker/admin assets, performs no migrations and does not read or replace the local control secret. The owner reported “admin updated.” Reloading the hosted dashboard verified the new registration control and displayed the exact flow scope and all three source boundaries. All five record counts remained zero. The form is open for the owner’s source-registration decision; its confirmation remains unchecked. The final candidate passes 127 unit/integration tests, 21 UI browser checks, type checking, build and formatting. Its 37-file package is `test-results/staging-bootstrap/2026-11-23T08-25-59.188Z.tar.gz`, SHA-256 `160b4cf8a5a139c57d8b126ac648c5899cb4bd9d5248a45e310a8ad0fad6c4a2`. The separate operator package was hash-verified and updated without accessing credentials. All four compiled Worker modules remain byte-identical to the earlier bootstrap; the deployed change is admin assets.

## Observed starting state

- Owner confirmed `abhishek51891@gmail.com` as the staging and policy administrator.
- Cloudflare dashboard sign-in succeeded for the account containing `sourcewayfinder.org`.
- Cloudflare One still showed enrollment. The selected Zero Trust Free checkout displayed $0/month, acceptance of terms, and authorization for charges above the free allowance. The owner completed activation. The subsequent dashboard showed **Plan: Zero Trust Free**, with team name `sweet-forest-7bc9`. No terms or billing checkbox was accepted by the agent.
- Full staging-only configurations were generated from the verified non-secret account settings in `infra/cloudflare/staging-account.json`. They include both Access audiences, hostnames, service bindings and four D1 bindings. All four Workers disable workers.dev and preview URLs; control/web assets require Worker authentication first. Private/operator configuration has not been inspected.
- The dashboard showed Workers Free as the current plan and five D1 databases: four staging databases matching the checked-in IDs and the existing production survey database. Only the database inventory was viewed; no survey rows were read.
- The candidate includes uncommitted reliability fixes and reviewed Verizon material. The protected acceptance runner requires a clean committed candidate and its exact content/artifact hashes.
- External retrieval of the two proposed staging hosts did not succeed. This does not establish whether private configuration or other deployments exist; verify those in the authenticated account before creating resources.

Google is connected. The owner created the OAuth client in project `sourcewayfinder-access` and transferred its credentials directly into Cloudflare. The provider test displayed **“Your connection works!”** with the confirmed administrator email. No credential value was read or retained by the agent, and no Google paid trial was selected. The callback is `https://sweet-forest-7bc9.cloudflareaccess.com/cdn-cgi/access/callback` and the JavaScript origin is `https://sweet-forest-7bc9.cloudflareaccess.com`.

After the owner explicitly authorized creation, both full-host applications were saved:

| Application                       | Host                                | Application ID                         |
| --------------------------------- | ----------------------------------- | -------------------------------------- |
| SourceWayfinder staging           | `staging.sourcewayfinder.org`       | `afe74908-777f-43d2-a2d1-581ffc5e96f4` |
| SourceWayfinder staging approvals | `admin-staging.sourcewayfinder.org` | `d3535b40-f1af-42c2-8740-cce559aa3c76` |

Both use the saved **SourceWayfinder owner — Google** policy (`5826a5eb-7e4e-4d01-8f4f-4ee352d74443`), allowing only `abhishek51891@gmail.com` and requiring Google. Each app selects Google only, uses six-hour sessions and requires Cloudflare's independent authenticator-application MFA with a six-hour interval. WARP authentication is off. Global default MFA was left off; enforcement is configured on these two applications. **The owner completed MFA and both actual applications now load.** The earlier provider test alone proved Google connectivity only.

Screenshots are retained in `test-results/hosted-staging/access-applications-created.jpg` and `test-results/hosted-staging/google-connection-passed.jpg`. The complete staging audiences are in the non-secret account file. No automation Access policy or service identity has been created.

The [operator bootstrap package](../../STAGING_BOOTSTRAP.md) is prepared for owner execution outside the agent workspace. It verifies packaged hashes and target boundaries, refuses populated policy/content tables, applies staging migrations and deploys prebuilt artifacts with a locally generated CSRF secret. Seven focused bootstrap checks, the full 111-test unit/integration suite, type checking and the artifact build passed locally. None of those checks used deployment credentials or performed a hosted mutation.

## Order of work

| Step                              | Agent preparation and verification                                                                                                                                                                       | Owner action where required                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Access enrollment              | Inspect the actual plan and record the outcome                                                                                                                                                           | Decide whether to accept Cloudflare’s terms and excess-usage billing authorization                                                   |
| 2. Identity and host protection   | Prepare full-host Access applications for `staging.sourcewayfinder.org` and `admin-staging.sourcewayfinder.org`; restrict human access to the confirmed Google identity; verify blocked anonymous access | Complete Google sign-in/MFA and any credential entry; review the specific access policy before it is saved                           |
| 3. Operator and staging bootstrap | Prepare complete staging-only configurations, service bindings and exact deployment artifacts; verify database identities and available quotas; retain workers.dev and preview access disabled           | Provision/use separately scoped secrets in the trusted operator environment; run credential-bearing host commands from that boundary |
| 4. Evidence and interpretation    | Prepare the flow, three exact official source boundaries, retained evidence and interpretation packet; verify freshness and source/version consistency                                                   | Register source boundaries and record the displayed `interpretation_review` decision                                                 |
| 5. Candidate and expectations     | Freeze a clean candidate, calculate content/migration/artifact hashes, and bind all eighteen reviewed cases to the trusted runner hash                                                                   | Record the exact `expected_answer_review` decision in the authenticated dashboard                                                    |
| 6. Protected acceptance           | Verify the actual runner receipt, all cases, branch coverage and unchanged approval instance                                                                                                             | Start the separately reviewed operator runner; credentials and Docker remain outside agent execution                                 |
| 7. Staging release and activation | Prepare the tested candidate and exact staging manifest, then verify deployed Worker versions and retained smoke evidence                                                                                | Review the candidate and staging deployment manifest, then activate the verified staging flow                                        |
| 8. Hosted checks                  | Exercise actual hosted guidance, refusal paths and cleanup; retain scoped results                                                                                                                        | Sign in to staging for session-creating browser checks; the read-only smoke identity cannot create sessions                          |

Cloudflare Access applications must precede public exposure of the hosts. Its [official setup guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) describes application policies and identity-provider selection. The Worker separately validates the exact Access issuer/audience/principal. Cloudflare dashboard sign-in is not itself proof that the application’s Google/MFA path works.

## Hosted acceptance checks

1. Anonymous requests cannot retrieve protected staging/admin assets or APIs. The wrong identity, missing/invalid JWT and cross-origin admin mutation are refused. Internal API/survey Workers have no public bypass route.
2. The owner reaches the dashboard through the configured Google identity and MFA path. Record visible authorization and audit results without exporting cookies or tokens.
3. All eighteen reviewed paths return the full expected outcomes through the actual web Worker, guidance API, published-content service and hosted session D1. Check 320px and desktop layouts, source links and no-store behavior. Verify session completion/deletion with scoped metadata, without logging answers or capabilities.
4. Disabled/stale guidance stays visible with the under-review notice and official link, while new guided sessions are refused. Test stalled status requests and idle/maximum session expiry; label any test clock/network substitution explicitly.
5. In a separately identified staging-only drill, change a controlled source input. Verify source ingestion, suspension, clearing of an existing browser journey, refusal of new sessions, and the maintenance/review record. Never edit Verizon’s real pages or label simulated source changes as live carrier events.
6. Demonstrate that restoration alone cannot reactivate guidance. Fresh review, passing evidence and exact release activation are required. A queued notification proves only a queue record; external delivery needs its own observed receipt.
7. Verify the existing public survey/status remains intact using read-only checks. Do not create fictional production survey submissions.

## Approval and credential boundaries

The [repository rules](../../../AGENTS.md) say: “Never approve interpretations, expected answers, merges, or releases.” The agent can prepare exact packets and inspect outcomes, but must not manufacture the owner’s authenticated decisions. The same rules exclude private credentials and the Docker socket from the agent workspace. Use the [release runbook](../../RELEASE_RUNBOOK.md) for the separately reviewed operator boundary.

The owner’s existing eighteen-case review remains valid for the unchanged written expectations. The dashboard step records that decision against the policy service’s exact source/candidate/test manifest. Changed source interpretation or expected output requires renewed review. Local document hashes are not approval IDs.

No production release is included in this staging task. A completed report must identify actual policy decisions, candidate hashes, hosted Worker versions, real test results and any untested operational checks. The prior [local results](LOCAL_VALIDATION_RESULTS.md) remain separate evidence.

## Source registration and service identity preparation — November 23

The owner completed the hosted registration form. The dashboard showed **Registration verified**, then one flow, three sources and four audit events: one `flow.created` and three `source.approved` records at 12:31:37 AM Pacific. Flow availability showed `under_review` with no successful source check. This approves the source collection boundaries, not their interpretation or expected answers. Evidence: `test-results/hosted-staging/source-registration-results.json` and `registration-audit-hosted.jpg`.

Cloudflare's service-token inventory was empty. A token creation form is prepared with name **SourceWayfinder staging evidence operator** and custom duration **168 hours**. It has not been generated. The current account has strict service-token authentication on. No new Access policy has been saved. The planned service application will cover only the admin host's internal automation paths; human dashboard access and approvals remain separate.

A reviewed capture launcher accepts the new Client ID and Client Secret at hidden prompts and saves them mode 0600 in the separate operator directory. It refuses existing-file replacement, unsafe permissions and redirected secret directories. Its three fixture tests and the ten bootstrap tests passed; type checking and shell syntax checks passed. No real credentials were supplied during tests. The next owner step is generating the token and storing it through this prompt, after which its exact application policy can be prepared.

## Automation access saved — November 23

The owner generated and reported saving the Access service identity. Its inventory entry expires November 30 at 12:38 AM Pacific (168 hours). After explicit owner authorization, the agent saved policy `b779e78e-cd68-4ea5-9433-cccec87806d1` and application `06ad5eb4-1c13-4373-b7a4-7a993abd649b`, restricted to `admin-staging.sourcewayfinder.org/internal/v1/*` and the exact staging evidence operator token. The application has no human identity provider selected; the original two applications retain their owner policy. Evidence: `test-results/hosted-staging/automation-access-results.json` and screenshot. The credential file has not been read by the agent.

The owner-only backend setup is prepared separately: two seven-day credentials, one with `source:write` and one with `proposal:write`. The script targets only the staging control Worker's `WORKER_CREDENTIALS_JSON` secret, verifies Access first, refuses to overwrite an unrelated existing registry, and checks collector access plus proposal-scope refusal. It changes no application code, migrations, content approvals or release records. Sixteen focused tests passed, including simulated provisioning and existing-secret refusal, with type checking and shell syntax checks. Actual provisioning and authenticated service checks still require owner execution.

## Backend service authentication verified — November 23

The owner-run receipt at 08:59:36 UTC confirms the Access route reaches the staging Worker, collector authentication succeeds, all three registered source IDs are present, and the proposal identity is refused collector access. Separate `source:write` and `proposal:write` roles expire November 30 at 08:59:28 UTC. No credentials were read by the agent. The non-secret receipt is retained in `test-results/hosted-staging/service-setup-results.json`.

The next prepared operator step fetches fresh public pages through the existing bounded collector, verifies exact registered boundaries, uploads raw chunks and normalized source versions, then compares normalized hashes with the owner-reviewed baseline. A changed hash stops interpretation submission. Unchanged text allows submission of an unapproved interpretation proposal bound to the newly recorded source-version IDs. No semantic tests, decisions, merges or release operations are performed. Twenty-three focused tests, type checking and shell syntax checks passed. Actual evidence upload is still pending.

## Fresh evidence uploaded; timestamp-only difference diagnosed

The first upload completed at 09:04:19 UTC. All three source versions are recorded, but interpretation submission correctly stopped because the account-roles normalized hash differed. Exact comparison of the retained reviewed and fresh captures found only two standalone timestamps in `<span style="display:none;">` elements. All other extracted prose and all 38 navigation entries were identical. The other two pages already matched their reviewed normalized hashes.

`parse5-content-v4` now omits only text-only spans whose sole inline style hides the element and whose entire text is a timestamp. Visible dates, hidden instructions, hidden links and conflicting display declarations remain part of the evidence comparison. Raw captures are retained unchanged. Both generations of all three pages produce identical normalized text when replayed through v4. The roles-page v4 hash is `9fb6522c304180112c6827d4bcf37590948698575a639e1cf396eb331090b48a`.

The original reviewed source register and owner review document remain unchanged. A separate `collection-baseline.v4.json` records the derived comparison baseline and provenance; it grants no human interpretation approval. The operator now requires both matching text and matching extractor version before queuing a proposal. Twenty-two focused source-independent tests and type checking passed. This is extraction regression testing, not semantic acceptance. Evidence: `test-results/hosted-staging/evidence-upload-first-results.json` and `test-results/source-review/verizon-staging-2026-11-23/normalization-comparison.json`. A fresh operator retry is still needed to record v4 sources and queue the interpretation.

## Interpretation proposal queued — November 23

The corrected owner-run upload completed at 09:14:01 UTC. All three freshly acquired pages match the v4 comparison baseline. Proposal `verizon-initial-ce98b9b5ec88cab60455` is now in `interpretation_review`, with digest `00da6177d97db83d674596f5e6289fb55831ff4018b5a2543014af653a2479f4`. The upload receipt records all current source-version and raw/normalized hashes in `test-results/hosted-staging/evidence-upload-v4-results.json`. No interpretation decision has been recorded yet. Candidate/expectation preparation, protected semantic acceptance and hosted guidance journeys remain pending.

The live dashboard independently shows one queued proposal, three sources, one flow and eleven audit events. Its review page displays **Source interpretation**, the matching digest above, an empty review-notes field and an unchecked confirmation. The owner has been asked to review and record the decision. Screenshot: `test-results/hosted-staging/interpretation-review-ready.jpg`.

## Interpretation approval verified; stale review display diagnosed — November 23

The owner's decision was recorded at 09:23:02 UTC as approval `b4a2bfdc-616a-4234-a76a-ba02062bc998`, bound to the interpretation digest above. Reopening the authenticated proposal detail confirmed `implementation_authorized` and the saved review notes. Evidence: `test-results/hosted-staging/interpretation-approval-results.json` and `interpretation-approved.jpg`.

The earlier follow-up incorrectly reported no approval because **Refresh queue** refreshed dashboard data but retained the previously selected proposal detail. The local correction closes the stale detail and clears its draft confirmation when refreshing the queue. Opening a review then fetches the current detail. A fictional browser regression reproduces an approval made in another browser and verifies the refreshed state, cleared confirmation, disabled duplicate approval and zero decision submissions. All five focused admin browser checks and type checking passed. This correction is local and has not yet been deployed. No additional owner interpretation approval is needed.

Candidate submission, exact expected-answer authorization, protected semantic testing and hosted guidance validation remain pending. The existing empty-only bootstrap deployment command must not be reused now that policy records exist.

## Candidate submission prepared — November 23

The dashboard also displayed a misleading missing-digest warning after approval, when no review gate was open. The local correction replaces that form with a progress explanation and identifies the pending implementation/test-case submission. It is included in the next candidate; hosted assets remain unchanged until an authorized release.

The staging-v4 bundle preserves the reviewed questions, transitions, outcomes and citation passages. Only source-version bindings and raw snapshot hashes differ from the reviewed domain draft. All 18 expected cases remain unchanged. Structural schema/graph validation and citation substring checks against retained v4 evidence passed; no source-dependent semantic tests were run.

`ops/submit-staging-candidate.command` is an owner-run submission step. Its reviewed operator copy verifies the clean committed candidate, built artifact hashes, exact runner bytes and packet contents before using the existing proposal-only identity. It submits only the candidate and expectations, checks returned manifests and records a non-secret receipt. It does not approve, test, merge or deploy. A changed candidate or manifest mismatch stops the operation.

Validation before freezing: 144 unit/integration tests, 28 fictional browser checks, two backup tests, type checking and the build passed. The new submission tests cover changed code/runner/environment, changed interpretation approval and mismatched expectations. The browser regression covers an externally saved approval and the completed-gate progress screen. Candidate submission and the next human review still require the operator step.
