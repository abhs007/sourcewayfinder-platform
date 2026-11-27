SOURCEWAYFINDER NEEDS SURVEY — needs-v1
Local implementation, November 21, 2026

STATUS
Integrated into Product_Design/survey.html, linked from the home page and footer.
The Python server provides local collection and CSV export. A separate Cloudflare Worker/D1 implementation is documented in ../cloudflare/README.md.
No real participants or findings. QA uses a disposable database with synthetic records, deleted after testing.

RUN LOCALLY
From the repository root:
python3 sourcewayfinder/Survey_Research/server.py
Open http://127.0.0.1:8765/survey.html in a browser on this computer.
Stop the server with Ctrl+C.
Opening survey.html directly is a design preview. Submission is disabled there.
The server binds only to this computer. Do not expose this development server to the internet.

EXPORT
python3 sourcewayfinder/Survey_Research/server.py --export /tmp/sourcewayfinder-responses.csv
Database: Survey_Research/.data/responses.sqlite3
Only the local filesystem owner can read the database/export by default. There is no online admin or export route.
Keep raw records private. Review optional comments for identifying details before sharing or quoting anything. Use aggregate reporting and avoid small-group disclosures.

QUESTIONNAIRE
Canonical options and version: Product_Design/survey-schema.json.
Experience, task, starting point, perceived difficulty, obstacles, outcome, optional age group, response assistance, concept interest, optional comment.
Only participation agreement and recent-experience question are required. Interest is asked after experience questions. Do not silently change questions once recruitment starts; version the instrument and keep versions separate in analysis.
No identity, email, exact address, account numbers or uploads are requested. The local server stores a random response ID, UTC receipt time, survey version and answers. No request/IP log is saved. The random response ID deduplicates retries, not people.

COLLECTION AND INTERPRETATION PLAN
Purpose: explore reported navigation difficulties and design preferences among recruited adult respondents. This instrument has not been psychometrically validated.
First pilot the wording with a few consenting adults before wider collection. Record wording changes and separate pilot responses from the final instrument.
Recruit beyond close personal contacts where feasible, including adults who found official guidance easy. Record invitation channels, dates, known relationship to the project, and whether help was offered in a separate aggregate recruitment log; do not attach identities to responses.
Participation is optional. Do not coach responses or suggest that favorable answers benefit the project. No outreach has been sent.
For assisted participation, read wording neutrally, record the participant's own answers, and use the assistance field. Analyze proxy/helper experiences separately from first-person responses.
Report counts and denominators per question, missing responses, recruitment method, age/assistance distribution when group size permits, and all response options including easy experiences and lack of interest.
A convenience sample cannot establish nationwide prevalence or represent all older adults. Concept interest does not establish adoption. Self-reported difficulty does not establish incorrect search/AI output. This survey does not test SourceWayfinder accuracy or show improved outcomes.
A later usability study should use defined tasks, independent expected outcomes, and observed completion/understanding rather than favorable opinions alone.
Before collecting data for a formal manuscript, establish the applicable venue/institution ethics requirements and document the determination. No review approval or exemption is claimed.

PUBLIC COLLECTION
The Cloudflare deployment has its own survey endpoint, private D1 database, rate limits, privacy notice and 180-day active-database cleanup. See ../cloudflare/README.md for authenticated administration, export and production check instructions. Keep downloaded raw exports private and delete within 180 days. This Python server remains local-only.

VERIFICATION
See QA_results.json. Checks include consent and server validation, retries/idempotency, unavailable service behavior, private-file routing, CSV formula escaping, and reflow. Passing these checks does not establish accessibility conformance, security of a future production deployment, or user-research findings.
