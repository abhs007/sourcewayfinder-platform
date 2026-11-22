# Slack Free connection

Target workspace: `https://sourcewayfinder.slack.com/`. The supplied invitation establishes the workspace; it is not a bot credential and is not committed to this repository.

1. In Slack's developer app dashboard, create an app **from the manifest** at `infra/slack-app-manifest.json`, in SourceWayfinder.
2. Review and install the app. It requests only posting messages and creating/managing public channels. It does not read conversation history or user profiles.
3. Save its bot OAuth token directly to `private/slack-token.txt`, mode 600. Never put it in a chat, issue, source file, or agent environment.
4. Run `node ops/slack-setup.mjs private/slack-token.txt`. Record the three channel IDs in the protected control-service configuration. If channels already exist, use those IDs rather than recreating them.
5. Configure the control service's supported Slack notification credentials through Wrangler secret input. The sender must route incidents, reviews, and releases to their corresponding destination.
6. Generate a fictional staging source-change incident, review request, and recovery. Verify each destination and exactly one deduplicated notice. A Slack reaction must never approve an application decision.

These steps are not yet evidence of a connected integration. The current configuration has no Slack credential, so delivery is not claimed. Durable audit history lives in D1 and encrypted backups, regardless of Slack Free message visibility.
