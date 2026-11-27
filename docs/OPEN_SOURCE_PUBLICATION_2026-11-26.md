# Open-source publication review

November 26, 2026

The owner explicitly requested making the newer SourceWayfinder platform repository public if review found it suitable. Source publication is separate from content approval, a Git merge and production deployment. Those gates remain unchanged.

## Reviewed scope

- All five pre-publication commits and their 190 historical paths were inventoried. No `private/`, environment-secret file, key file, database or credential-store path was found in that history.
- Gitleaks v8.30.1 was downloaded from its official GitHub release and checked against the release asset's SHA-256. History and an allowlisted copy of the proposed public tree were scanned locally with findings fully redacted.
- Each scan produced three generic-key findings. Manual review identified two Cloudflare Access audience identifiers and one recorded Worker artifact SHA-256. These are non-secret identifiers/hashes; they are not bearer credentials, signing keys or API tokens. The scanner results were retained with their findings rather than described as zero findings.
- The public tree excludes private operational state, credentials, survey responses, ignored runtime/build outputs and full third-party research captures. Public source registers retain source URLs, hashes, byte sizes and small trace excerpts. Optional raw-capture integrity checks are explicitly skipped in a public clone that lacks the local research files.
- Project-authored software/documentation has an MIT license, consistent with the earlier prototype. Apache-2.0 upstream profile notices remain intact. Third-party guidance, marks and dependency packages are not relicensed by the project.
- Checked-in staging hostnames, owner principal and account/database/audience identifiers are non-secret project configuration. They grant no access. Contributors must use their own account settings; the repository contains no production credentials or authority to deploy to the maintainer's account.

No production environment, credential store, operator directory, Docker socket or private survey responses were accessed during publication review. Security scanning is a bounded review, not a guarantee that the code has no vulnerability or that procedural content is correct.

## Candidate status

The development branch contains the deterministic platform, the recorded Verizon pilot work, two unapproved Google recovery proposals, the SSA proposal and website enhancements. Making the code public does not approve these procedures, reuse an old acceptance result for changed artifacts, activate guidance or qualify a hosted release. Read [implementation status](IMPLEMENTATION_STATUS.md) and [the dated product handoff](PRODUCT_ENHANCEMENTS_2026-11-26.md) before treating a component as operational evidence.

The public repository's development branch is the code-review entry point. Historical baseline refs are preserved; no release, merge or guidance decision is created by publication.
