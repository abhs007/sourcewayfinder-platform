# One active SourceWayfinder repository

The active development repository is [sourcewayfinder-platform](https://github.com/abhs007/sourcewayfinder-platform). The original [phone-loss-recovery repository](https://github.com/abhs007/phone-loss-recovery) is retained for its history and existing links. Source consolidation does not activate the newer platform's guidance candidates or replace the live website.

## Preserved source and contracts

The exact public remote snapshot `5c1c0086e9343adcca5cae86f619f3e15d5fb893` is copied under [`legacy/phone-loss-recovery/`](../legacy/phone-loss-recovery/). It contains both the original research navigator and the standalone SourceWayfinder website/survey. All 86 imported files have hashes in the [manifest](../legacy/import-manifest.json). The older local checkout, its uncommitted edits and its untracked files are untouched.

The survey's `needs-v1` instrument, original consent notice, SQL migration, retry handling, rate limit and 180-day cleanup code are preserved. The platform's survey instrument and initial migration must match the imported versions before `npm run check:legacy` succeeds. No responses are read, exported or moved. No DNS records, service bindings, Cloudflare routes, database IDs or credentials are changed.

## Hosting dependency check

Read-only public checks observed HTTP 200 for the `.org` home page, survey page/assets, public survey readiness endpoint, original Worker hostname and historical GitHub Pages home page. The readiness endpoint returned `needs-v1`, `cloudflare` and notice version `2026-11-21-public`. These checks establish availability and the public version contract; they do not submit a response or validate actual production storage writes.

The five served JavaScript, stylesheet and logo files match the imported source bytes. The two served HTML pages differ because Cloudflare injects its public beacon script; removing only that identified hosting script restores the source HTML. This consolidation does not change that hosting setting or add the script to source.

The GitHub Pages API identifies an existing workflow-built site at `https://abhs007.github.io/phone-loss-recovery/`, with no custom domain. The `.org` custom domains belong to the separate Cloudflare Worker configuration. Existing deployments can remain in place while this repository becomes the sole development location. Both sets of public URLs are checked again after archival.

## Checks and workflow changes

`npm run check:legacy` verifies import hashes and survey schema parity, runs the original twelve source-independent Worker checks, and rebuilds both historical applications. `build:legacy` writes only ignored legacy outputs. The normal platform build remains separate; no legacy research assets are added to its served directories.

The old weekly source-availability job is relocated to `.github/workflows/legacy-sources.yml`, preserving its schedule and read-only behavior. The new manual/PR validation workflow checks the preserved source without credentials or dependency installation. Both root workflows respect the existing free-CI configuration flag. The original nested `.github/workflows/` files remain inert historical copies; no legacy publish or release workflow is enabled in this repository.

The active platform remains on `implementation/platform-foundation`. Consolidation is published there without merging `main`, submitting content approvals, promoting a release or deploying production. The exact earlier evaluated candidate remains accessible at its existing commit URL, separately from this new source-management change.

## Recovery and further work

GitHub archival is reversible. The original repository, history and existing deployment links remain available. No local checkout is deleted. Restoring the old repository's write access would not itself roll back any Cloudflare service because those services are not changed here.

The legacy source remains separated from the new UI and policy services. Replacing the public production website with the newer platform remains a distinct release task requiring its existing qualification and human approval gates. Future work should change the maintained platform components and deliberately retire legacy code when the replacement is qualified.
