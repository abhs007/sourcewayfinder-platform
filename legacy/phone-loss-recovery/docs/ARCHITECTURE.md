# Architecture

The pure engine evaluates yes/no/unknown resource availability against scoped prerequisite groups. Results distinguish documented steps, conditions, unresolved evidence, conflict, unsupported scope and withdrawal. A documented step is never a completed transfer or provisioning result. UI and source acquisition are separate.

Interfaces: evaluateRecovery(context,catalog,{asOf}); mountRecoveryModule(root,{view,basePath,dataPath,brand}); build({outDir,basePath,siteUrl,brand}); renderFragment(view,options). Context includes provider, plan, role, goal, resource availability and SIM/port protection state. Catalog entries carry source IDs, scope, prerequisites, review dates and limitations. Source and task data are validated at build/load.

The same UI modules power standalone and host views. Module archives include source, rendering helpers, static assets, licenses and per-file SHA256 hashes with fixed ZIP timestamps. Pause & Verify vendors a pinned version, so its normal build requires no network. No database, API or migration is introduced. Historical research is immutable; current guidance is separate.
