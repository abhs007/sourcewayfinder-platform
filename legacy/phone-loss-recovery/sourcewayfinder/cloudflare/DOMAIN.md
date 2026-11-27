# SourceWayfinder domain

Configured on November 21, 2026.

- Primary hostname: `sourcewayfinder.org`
- Survey path: `/survey.html`
- `www.sourcewayfinder.org` is attached to the same Worker and redirects to the primary hostname, preserving paths and query strings.
- HTTP on the primary hostname redirects to HTTPS.
- Cloudflare manages the custom-domain DNS records and certificates.
- The original https://sourcewayfinder.sourcewayfinder.workers.dev/ address continues serving as a fallback while the new registration propagates.
- Canonical links use the `.org` hostname. Survey requests use the current origin and the same private D1 database.

At the configuration check, Cloudflare displayed the registration as active and both Worker DNS records as present. Public recursive DNS and the .org authoritative server still returned NXDOMAIN. The `.org` hostname is therefore configured, but end-to-end public HTTPS and survey checks remain pending DNS publication. Do not describe that verification as completed.

DNSSEC was requested and displayed Pending. WHOIS redaction was already enabled. No email service is configured by this website deployment.

## Verify after DNS publication

```sh
SURVEY_ORIGIN=https://sourcewayfinder.org node tests/cloudflare-browser.mjs
npm run export:survey
```

Check the primary homepage, survey, `www` redirect, HTTPS, and private export. The browser script submits a labeled synthetic response. Remove only its exact ID from D1 after verification, and keep it out of participant data. See README.md for administration details.
