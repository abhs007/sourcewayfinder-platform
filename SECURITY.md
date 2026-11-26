# Security and responsible disclosure

Do not put credentials, session capabilities, account identifiers, private evidence or survey responses in public issues, pull requests or logs.

For a suspected vulnerability, use GitHub's private vulnerability reporting option when it is available. Otherwise contact the repository owner through a private channel before sharing exploit details. This project does not offer a paid bounty or promise a response deadline.

The public guidance path is deterministic. Human content decisions, source validity, exact test bindings and release authorization remain required. A public repository, passing CI or an accepted pull request does not approve procedural guidance or authorize a production release.

The checked-in staging hostnames, account/database identifiers and Access audiences are non-secret configuration identifiers. They grant no access by themselves. Operators must use their own account configuration and keep credentials outside agent workspaces. Do not run deployment or operator commands against the maintainer's environment.

No credentials, private survey data or deployment authority are supplied by this repository. See `AGENTS.md` and the operational documentation for those boundaries.
