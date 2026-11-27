# Preserved website and research navigator

All new SourceWayfinder development belongs in this repository. The previous public repository is retained as a historical reference, with its Git history and published demo links preserved.

`phone-loss-recovery/` is an exact 86-file snapshot of the old repository at commit [`5c1c0086e9343adcca5cae86f619f3e15d5fb893`](https://github.com/abhs007/phone-loss-recovery/tree/5c1c0086e9343adcca5cae86f619f3e15d5fb893). The [import manifest](import-manifest.json) records every path, size and SHA-256 hash. It was taken from the public remote, which was newer than the original local checkout. Local uncommitted changes were not imported or deleted.

| Location                                              | Purpose                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `phone-loss-recovery/src/`, `content/`, `research/`   | Original six-brand research navigator and its frozen research references.                                                   |
| `phone-loss-recovery/sourcewayfinder/Product_Design/` | Existing standalone SourceWayfinder website and survey assets.                                                              |
| `phone-loss-recovery/sourcewayfinder/cloudflare/`     | Existing website/survey Worker, migration, build and owner export tooling.                                                  |
| `phone-loss-recovery/sourcewayfinder/wrangler.jsonc`  | Existing hosting configuration, preserved without changing Worker name, domain, database, rate limit or retention schedule. |
| `../apps/`, `../workers/`, `../domains/`              | Newer platform UI, services and separately reviewed domain candidates.                                                      |

## Check and build

From the platform repository root, using the root project's documented Node version:

```sh
npm run check:legacy
```

This checks the imported file hashes, survey schema compatibility, twelve source-independent Worker checks, and builds both old applications. It needs no dependency install, credentials, participant records or production access. It does not run source-dependent guidance acceptance tests.

The outputs are `phone-loss-recovery/dist/client/` and `phone-loss-recovery/sourcewayfinder/dist/`; neither is committed or included in the platform's public asset build. `npm run sources:legacy` runs the original availability monitor and writes an ignored report under `phone-loss-recovery/source-reports/`. Hash differences in that report require review; they do not establish changed procedures.

## Operational boundaries

The copied READMEs, test reports, study statements and deployment commands describe their historical context. They do not grant permission to deploy, export participant data, run semantic tests or change approval records. Follow the platform's current `AGENTS.md` and release rules. Survey exports, databases, credentials, local caches and the old local checkout remain outside this import.

The live `.org` website and survey continue on their existing Cloudflare resources. Archiving their old GitHub source repository is a source-management change, not a domain or database migration. The historical GitHub Pages site keeps its existing deployment; its old build and release workflows are not activated here. The weekly read-only source monitor is relocated to this repository's root workflow directory.

Software retains MIT terms. Original educational and research content retains the imported CC BY 4.0 terms in `phone-loss-recovery/CONTENT_LICENSE.md`; third-party rights and historical attribution remain intact.
