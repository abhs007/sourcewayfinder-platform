# SourceWayfinder

SourceWayfinder provides deterministic, source-linked guidance with human review of interpretations, expected answers, merges, and releases. Public requests never call a model or Paperclip.

The implementation includes a React public site and review dashboard, four independently deployable Cloudflare Workers, D1 persistence, a local isolated Paperclip/Codex runtime, source collection, bounded maintenance dispatch, release tooling, and encrypted backups. The Verizon pilot has retained owner decisions and isolated acceptance evidence; SSA and two new Google account-recovery flows remain unapproved drafts. Production has not been released. See [the current status](docs/IMPLEMENTATION_STATUS.md) for the distinction between tested candidates and hosted qualification.

## Open-source development

Project-authored code and documentation are available under the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for upstream profiles, dependency licenses and official-source material.

The current development work is on [`implementation/platform-foundation`](https://github.com/abhs007/sourcewayfinder-platform/tree/implementation/platform-foundation). That branch contains candidate work; publication of source does not merge it, approve any procedure or deploy the application. `main` remains the earlier baseline until a separately authorized merge.

This source tree contains no operator credentials or private survey responses. Full third-party research captures remain outside Git; public registers include their metadata and trace excerpts. Source-dependent semantic tests require exact human authorization. Ordinary fictional fixtures and structural checks are available for contributors.

See [the account-recovery and website update](docs/PRODUCT_ENHANCEMENTS_2026-11-26.md), [publication review](docs/OPEN_SOURCE_PUBLICATION_2026-11-26.md) and [security guidance](SECURITY.md).

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
