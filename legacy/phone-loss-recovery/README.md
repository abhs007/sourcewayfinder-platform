# Phone-Loss Recovery Navigator

Evidence-linked guidance for phone loss across AT&T, T-Mobile, Verizon, Google Fi, Visible and US Mobile. It separates credential recovery, account access, protection removal and completed operations. Unknown is not impossible recovery.

Demo: https://abhs007.github.io/phone-loss-recovery/ . Source: https://github.com/abhs007/phone-loss-recovery . Author: Abhishek Vaishnav, Independent Researcher; ORCID 0009-0008-6318-8190.

## Run

Use Node.js 22+:

```sh
npm ci
npm run validate
npm run build
npm run dev
```

Open http://127.0.0.1:8788 . Use BASE_PATH=/phone-loss-recovery/ when building and serving the repository-subpath demo. SITE_URL sets its canonical origin/site URL. No account, key or backend is needed.

## Features and checks

The home page accepts a short typed description or tap choices, recognizes supported carrier names and common goals locally, and links to official help. Optional English dictation requires on-device recognition and an installed language pack. The standalone preview also includes the four-stage navigator, printable checklist, filterable evidence, separate frozen research collection, twelve fictional practice tasks, and local study sessions with explicit JSON/CSV export. No automatic uploads or persistence.

```sh
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run package:module
```

With the sibling Pause & Verify checkout and vendored module prepared, INTEGRATION=1 npm run test:e2e tests the actual integration. The public CI suite runs standalone without private-repository access. Browser projects include Chromium, Firefox, WebKit and two mobile emulations; they are not real-device tests. See docs/QA.md for actual results.

The paper is a research preprint: https://doi.org/10.5281/zenodo.24301157 . This release establishes no live carrier enforcement, independent human coding, participant outcomes, actual recovery success or fraud reduction. Synthetic tests are not participant results. No working phone needs to be suspended or changed. Participant recruitment and any required research review are separate from software testing.

See the architecture, study protocol, consent template and source-review process in docs/. Code MIT; original content CC BY 4.0; third-party rights retained.
