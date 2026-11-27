# SourceWayfinder

Understand your options. Find your next step.

An independent research prototype for source-linked procedural guidance. This folder contains the website, original vector logo, survey instrument, local collection server, design notes and reproducible browser checks.

Custom domain configuration: `sourcewayfinder.org`. See [domain status](cloudflare/DOMAIN.md) for verification status. The [original hosting address](https://sourcewayfinder.sourcewayfinder.workers.dev/) remains available.

## Run locally

From the repository root, using Python 3:

```sh
python3 sourcewayfinder/Survey_Research/server.py
```

Open http://127.0.0.1:8765/ for the website, or http://127.0.0.1:8765/survey.html for the survey. Stop with Ctrl+C. No API keys or paid services are required.

The server binds only to localhost. Responses are stored in a private local SQLite database. Export instructions and the collection protocol are in [Survey_Research/README.txt](Survey_Research/README.txt). Opening the HTML files directly works as a design preview, with survey collection disabled.

## Verify

With the repository's Node dependencies installed (`npm ci`) and Chromium installed (`npx playwright install chromium`), run from the repository root:

```sh
node sourcewayfinder/tests/guidance.mjs
node sourcewayfinder/tests/survey.mjs
```

Survey checks use temporary synthetic records and remove the test database afterward. QA reports describe software checks, not participant outcomes.

## Scope and limitations

The phone preview covers Verizon consumer postpaid SIM Protection, not comprehensive recovery across all carriers. The Social Security replacement flow retains earlier source criteria and requires a fresh authoritative review before release. This implementation does not inherit verification claims from the research paper.

Automatic discovery, source synchronization, issue delivery, broader coverage and developer access remain planned. No independent user outcomes or accuracy improvements have been established. Full accessibility and production security review remain outstanding.

Cloudflare hosting uses a Worker and private D1 database. See [cloudflare/README.md](cloudflare/README.md) for deployment, retention, and authenticated CSV export. GitHub Pages cannot run the Python collection server. The existing Phone-Loss Recovery homepage remains a separate site.

SourceWayfinder is intended to remain free for the public. Domain and trademark availability have not been established. See [Product_Design/Design_Review.txt](Product_Design/Design_Review.txt) for design checks and limitations.

Survey responses, exports, private case documents, and local tool caches are excluded from this source package.
