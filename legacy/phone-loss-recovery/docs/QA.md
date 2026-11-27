# Release verification

November 17, 2026. Automated sessions use fictional fixtures; no participant results or live carrier tests exist.

- Content validation: six providers, 48 scoped rules, twelve tasks and twelve official sources.
- Engine/research tests: 31 passed, including explicit mappings of the twelve published resource assumptions and unchanged historical-file hashes. Current evaluation is separate from reproducing historical interpretations.
- Pause & Verify regression and module-pin checks: 36 passed.
- Browser end-to-end matrix: 75 passed across Chromium, Firefox, WebKit, Android-sized Chromium and iPhone-sized WebKit, including the actual host integration. Mobile profiles are emulation.
- Source availability: all twelve official URLs returned HTTP 200 during the initial monitoring run. Response hashes are not proof of content correctness or backend enforcement.
- Source-currentness review: assistant inspection of the cited passages; no independent human validation claimed.
- Module ZIP ordering/timestamps are fixed, with matching hashes on consecutive builds. The archive is pinned in Pause & Verify.
- Desktop results and responsive layouts were visually inspected. Native accessibility-tree reading order, labels and heading focus were inspected, alongside keyboard tests and axe scans for serious/critical violations. A real assistive-technology user evaluation/VoiceOver session was not performed; no accessibility certification is claimed.

A newer Playwright WebKit build reported a native hit-test mismatch despite matching DOM and driver bounding boxes. The same click diagnostic and full matrix passed with the pinned Playwright 1.62.1 runtime. Tests retain real pointer interactions and do not bypass hit testing.

Printed results expand evidence sections for output. Local study exports and deletion, no automatic persistent storage/uploads, malformed/missing data, source-text escaping and offline data failures are exercised.

Release archive: phone-loss-recovery-0.1.0.zip; 100331 bytes; SHA256 3af91b93092c763003513b484543f78e33fa7acf657e1735a81a0018043673ca.
