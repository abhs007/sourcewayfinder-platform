# SourceWayfinder

SourceWayfinder provides deterministic, source-linked guidance with human review of interpretations, expected answers, merges, and releases. Public requests never call a model or Paperclip.

The implementation includes a React public site and review dashboard, four independently deployable Cloudflare Workers, D1 persistence, a local isolated Paperclip/Codex runtime, source collection, bounded maintenance dispatch, release tooling, and encrypted backups. Verizon and SSA guidance are **drafts awaiting human approval**. Production has not been released.

## Start locally

Use Node 26.13.1 and the committed lockfile:

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
npm run test:ui
```

`npm run dev` runs the fictional local integration environment. It does not publish or approve either real guidance flow. For the Vite development UI, run `npm exec vite -- --config apps/web/vite.config.ts` in another terminal.

## Delivery and operation

- [Implementation status](docs/IMPLEMENTATION_STATUS.md): observed results and remaining setup.
- [Acceptance ledger](docs/ACCEPTANCE_LEDGER.md): delivery gates and missing proof.
- [Paperclip runtime](docs/PAPERCLIP_RUNTIME.md): installation, isolation, agents, authentication, usage controls.
- [Maintenance bridge](docs/BRIDGE.md): phase routing, trusted test dispatch, and restart reconciliation.
- [Operations](docs/OPERATIONS.md): collection, orchestration, traffic, incidents, and daily work.
- [Content review](docs/DRAFT_REVIEW.md): retained official evidence and the two proposed flows.
- [Release runbook](docs/RELEASE_RUNBOOK.md): digest-bound tests, staging, promotion, and rollback.
- [Backup and recovery](docs/BACKUP_RECOVERY.md): encrypted Drive backups, retention, key custody, and restore.
- [Monitoring](docs/MONITORING.md) and [Slack setup](docs/SLACK_SETUP.md): quota admission and notifications.

Agents prepare changes and staging candidates. The owner approves source interpretation, expected answers, merges, and exact production manifests. Repository CI has no production credentials. `private/` holds local credentials and evidence and is excluded from Git and Docker build context.
