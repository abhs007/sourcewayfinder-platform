# First protected staging deployment

The two Cloudflare Access applications are saved. This package deploys the empty platform behind those applications so the owner can sign in and record policy decisions. It does not approve, publish or activate Verizon guidance.

## What the package will do

1. Verify the packaged files against their SHA-256 manifest and reject execution inside either agent workspace.
2. Read table names and row counts from the staging control database. Stop if flows, proposals, approvals, releases or bundles already exist; subsequent changes belong to the reviewed release process.
3. Apply the included migrations to the four named staging databases.
4. Generate a CSRF secret inside the operator directory, mode 0600. No automation credential is generated or enabled.
5. Deploy the four prebuilt staging Workers with `--no-bundle`, using the checked configuration and the control secret. The package has no npm scripts or build hooks. Both hostnames stay behind Access, and all four Workers have `workers.dev` and preview URLs disabled.
6. Write a local receipt after Wrangler succeeds. This receipt is deployment-command evidence only; sign-in and hosted functionality still need verification.

The package contains built web/admin assets, four compiled Worker modules, staging configurations, SQL migrations, the lockfile and this operator script. It contains no private directory, credentials, browser data, user survey responses, real guidance bundle, approval records or production configuration.

## Review and extract outside the agent workspace

Review `ops/staging-bootstrap.mjs`, the four `infra/cloudflare/staging-*.json` deployment files, the migrations, and `bootstrap-manifest.json`. The archive checksum is supplied alongside the archive. A checksum detects changes; it does not replace reviewing the operator code.

Use your own Terminal for these commands. The first block contains no credential and installs dependencies from the pinned lockfile with package lifecycle scripts disabled:

```zsh
swf_archive='/Users/abhishekvaishnav/EB2-NIW/sourcewayfinder-platform/test-results/staging-bootstrap/owner-bootstrap.tar.gz'
shasum -a 256 -c "$swf_archive.sha256"
swf_operator='/Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122'
mkdir -p -m 700 '/Users/abhishekvaishnav/.sourcewayfinder-operator'
mkdir -m 700 "$swf_operator"
tar -xzf "$swf_archive" -C "$swf_operator"
cd "$swf_operator"
node ops/staging-bootstrap.mjs --verify
npm ci --ignore-scripts
```

Stop if any command fails. If the operator folder already exists, inspect the previous attempt rather than extracting over it. Do not use this directory as an agent workspace or provide its secrets to an agent.

## Create the deployment credential yourself

In Cloudflare's [API token settings](https://dash.cloudflare.com/?to=/:account/api-tokens), create a dedicated, short-lived bootstrap token for account `a03d9f71f863eed1dc764ca7d4e34c49`. Set an expiry of one day and restrict the zone resource to `sourcewayfinder.org`.

The required capabilities are Workers creation/deployment, D1 read/write for preflight and migrations, and Workers Routes Write for the custom domains. Cloudflare's current model requires product-level Workers Admin to create new Workers; if the dashboard presents the older token-template terminology, use the Workers deployment template and review its permissions. Remove unrelated KV, R2, Pages or other product access. The four databases and account ID are listed in `infra/cloudflare/staging-account.json`.

This token may have rights beyond staging within that account. Its name does not make it technically staging-only. The reviewed script limits the targets, and the token must remain owner-controlled and be revoked after bootstrap. A later release credential should use narrower scopes where supported. See Cloudflare's [Workers permission guide](https://developers.cloudflare.com/workers/authorization/workers/), [D1 API setup](https://developers.cloudflare.com/d1/tutorials/import-to-d1-with-rest-api/) and [token permission reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

Paste the token only into the hidden terminal prompt below. The token is neither printed nor written by this command; close the terminal or run the unset command even if deployment fails. Do not paste it into chat.

```zsh
read -rs 'CLOUDFLARE_API_TOKEN?Paste the bootstrap Cloudflare API token: '
export CLOUDFLARE_API_TOKEN
node ops/staging-bootstrap.mjs --deploy
unset CLOUDFLARE_API_TOKEN
```

Wrangler uploads the generated CSRF key through its [supported secrets-file option](https://developers.cloudflare.com/workers/configuration/secrets/). No source interpretation, expected answer, merge or release decision is submitted. No production survey row is read or changed. If deployment stops partway, retain the non-secret error and report the failed step; do not disable Access or alter approval records to continue.

## Return to the hosted checks

### Retry after the static redirect upload error

The first owner-run bootstrap reached the web upload and received Cloudflare error `100324`: the packaged `_redirects` file contained an absolute hostname as its source. Workers asset redirects require path-only sources; the Worker already handles the canonical-host redirect. The source asset is corrected, and the build and package verification now reject this class of invalid rule before deployment. See [Cloudflare's redirect format](https://developers.cloudflare.com/workers/static-assets/redirects/).

The reviewed `--resume-web` mode keeps the empty-policy-table preflight, confirms existing deployments for control/API/survey, and deploys only the web Worker. It does not apply migrations, read or regenerate the CSRF key, or redeploy the other Workers. The updated launcher selects this retry mode. Use the same unexpired token; a new token is not required if the original remains valid.

```zsh
/bin/zsh /Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122/launch-staging.command
```

The prior successful components are inferred from the bootstrap's sequential order and the owner's web-upload error until their hosted deployments are independently observed. The retry checks those deployments before changing the web Worker. Hosted functionality remains pending until the retry and sign-in checks succeed.

After the terminal reports completion, revoke the bootstrap token and open [the staging approval dashboard](https://admin-staging.sourcewayfinder.org). Sign in with `abhishek51891@gmail.com` and complete Cloudflare's authenticator enrollment yourself. Keep any QR code, enrollment secret, recovery code and one-time code private.

Reply **“staging bootstrap complete”**, or share the non-secret error if a step failed. Then we can verify anonymous refusal and owner sign-in, prepare the narrowly scoped automation access, ingest the reviewed source material and bind your eighteen-case review to exact policy records. The hosted Verizon journeys follow those approvals.

Repository basis: [AGENTS.md](../AGENTS.md) requires that trusted release tooling be copied to a separately reviewed operator directory before receiving credentials and excludes private credentials from agent execution. This owner-run step implements that boundary.

## Update the empty staging admin dashboard

The initial deployment and owner Google/MFA sign-in are now observed working. Before registering any flow, the dashboard requires its new registration form. The reviewed package supports:

```zsh
node ops/staging-bootstrap.mjs --update-admin
```

The prepared owner launcher runs this mode after its hidden token prompt. It verifies package hashes, refuses existing flows/proposals/approvals/releases/bundles, checks all four existing staging deployments, and deploys only `sourcewayfinder-staging-control`. It performs no migrations and does not open or upload the local control-secret file. Existing hosted secrets are retained by Wrangler; the update supplies no replacement secret or variable with the same name. [Cloudflare secret deployment behavior](https://developers.cloudflare.com/workers/configuration/secrets/). Each successful run writes a separate timestamped receipt.

After completion, refresh the admin site and select **Review Verizon setup**. Review the flow scope, fallback URL, and three official-source boundaries. The owner checks the confirmation and selects **Register flow and sources**. This creates registration/audit records and leaves guidance under review. Interpretation, expected-answer and release approvals remain separate.

## Store the staging Access service identity

The empty-platform bootstrap is finished. After registering the flow, do not reuse the bootstrap launcher: its populated-table guard should stop further deployment through that path.

Cloudflare's prepared **SourceWayfinder staging evidence operator** form uses a seven-day (168-hour) lifetime. The owner generates it, then runs:

```zsh
/Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122/ops/capture-staging-access.command
```

Paste the generated **Client ID** at the first hidden prompt and **Client Secret** at the second. This is an Access service token, not the earlier Cloudflare deployment API token. The launcher verifies the reviewed package before accepting values. It writes only `secrets/staging-access.json` with owner-only permissions, refuses to overwrite a previous identity and makes no network requests. Return to the Cloudflare token list before replying **token saved** so the one-time secret is no longer displayed.

No application access is enabled by this capture. The exact internal-path Service Auth policy and separately scoped backend credentials must still be configured. A service identity cannot record human policy approvals. [Cloudflare service-token documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

## Enable the two staging backend service roles

After the restricted automation application is saved, run:

```zsh
/Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122/ops/provision-staging-services.command
```

Enter the temporary **Cloudflare deployment API token** at the hidden prompt (not the Access Client Secret). The reviewed script reads the saved Access identity locally, first confirms the internal path reaches the staging Worker, creates separate source/proposal credentials outside the repository, and adds only the staging control service's credential-registry secret. It checks collector authentication and verifies that the proposal identity cannot use collector scope. It refuses unrelated existing registries and retains interrupted setup for reconciliation. It writes a non-secret timestamped receipt; no source evidence or approvals are created by this step. Reply **services ready** after success, or share only the non-secret error.

## Upload fresh evidence and queue interpretation review

After service setup succeeds, run:

```zsh
/Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122/ops/upload-staging-evidence.command
```

This step uses the already saved service credentials; there is no token prompt. It fetches only the three registered Verizon sources, retains their raw pages, uploads evidence and records current source versions. It compares normalized text with the reviewed baseline. If any text differs, it retains evidence and reports that source review is needed, without submitting an interpretation. Otherwise it queues the proposed interpretation for the owner to review in the dashboard. It writes a non-secret timestamped receipt. No approvals or release actions occur.

The expanded operator package now includes the collector, source metadata, and an unapproved interpretation packet. These files do not grant authority to run source-dependent semantic tests.

### Timestamp-only difference on the first upload

The first attempt stopped on two hidden rendering timestamps in Verizon's account-roles page. The reviewed and fresh guidance and links otherwise match. The corrected v4 extractor preserves raw evidence and skips only standalone hidden timestamp spans. Its comparison baseline is derived from the original reviewed captures; it is not a new approval. Rerun the same upload command after the reviewed operator package is updated. No token prompt is needed.

### Submit the frozen candidate and expected cases

After the interpretation approval is recorded and the reviewed candidate package is installed, run:

```sh
/Users/abhishekvaishnav/.sourcewayfinder-operator/bootstrap-20261122/ops/submit-staging-candidate.command
```

No token entry is needed. This uses the saved proposal-only credential to submit the exact committed candidate and all 18 expected cases. It verifies source-review binding and returned manifests, then writes a timestamped non-secret receipt. It runs no semantic tests and submits no decisions or releases. On success, reopen the proposal to review the expected-answer gate. If it refuses changed candidate bytes, stop and have the packet regenerated; do not bypass the check.

Do not run the empty-only bootstrap deployment launcher after registering policy records. The dashboard corrections are part of the candidate and await the protected release process.
