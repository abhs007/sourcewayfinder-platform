# Cloudflare deployment

SourceWayfinder uses a Worker for its public assets and survey API, and D1 for private responses. No respondent account is needed. The local Python server remains available for offline development.

From this `sourcewayfinder` folder:

```sh
npm ci
npm run test:worker
npm run build
npx wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

The committed configuration targets the project owner's existing database. Other users must create their own database and replace its ID before deployment. Database IDs are identifiers, not access credentials. Never commit OAuth tokens, `.dev.vars`, `.env`, `.wrangler`, response databases, or exports.

## Survey administration

Only authenticated Cloudflare account users can query or export responses. No public administration, response listing, or export endpoint exists.

```sh
npm run export:survey
```

This writes a timestamped CSV to the ignored `exports/` directory. Spreadsheet formula prefixes are escaped. Keep exports private, review comments for accidental identifying information, and delete raw exports within 180 days. The server's scheduled daily cleanup applies to D1 rows, not downloaded files or provider backups.

## Operational behavior

- Explicit consent and server-side validation, 12 KB request limit, same-origin submissions.
- Approximate per-Cloudflare-location limit of six submissions per minute per IP. Shared networks may need to wait; this is not a guarantee against automated abuse.
- UUID retry deduplication prevents repeated saves of the same submission. It does not identify duplicate people.
- No application analytics, response logging, or IP fields in the response table. Cloudflare still processes connection information.
- Active responses older than 180 days are removed daily by a scheduled Worker.
- Static deployment uses an explicit seven-file allowlist. Code, database files, QA results, and internal documents are not served.
- Database failures return an error; the UI preserves the response for retry.
- Public guidance remains a limited research preview. Survey interest is not evidence of tool effectiveness.

## Local verification

```sh
npx wrangler d1 migrations apply DB --local
npm run dev
# In a second terminal (repository Playwright dependencies must be installed):
node tests/cloudflare-browser.mjs
```

The browser check submits a clearly labeled synthetic response. Run it against production only for a planned deployment check, then remove that exact test response using the authenticated D1 console/CLI. Do not mix it with participant responses. `cloudflare-smoke.json` records only the test ID and checks, never participant data.
