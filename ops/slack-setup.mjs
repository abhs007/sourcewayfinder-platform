import { readFile, writeFile, stat } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw Error('Usage: node ops/slack-setup.mjs private/slack-token.txt');
if ((await stat(path)).mode & 0o077) throw Error('Token file must have owner-only mode600');
const token = (await readFile(path, 'utf8')).trim();
if (!token.startsWith('xoxb-'))
  throw Error('A Slack bot OAuth token from the installed SourceWayfinder app is required');
const api = async (method, body = {}) => {
  const r = await fetch('https://slack.com/api/' + method, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw Error(`Slack ${method}: ${data.error ?? r.status}`);
  return data;
};
const auth = await api('auth.test');
if (new URL(auth.url).hostname !== 'sourcewayfinder.slack.com')
  throw Error('Wrong Slack workspace; expected SourceWayfinder');
let output = { workspace: auth.team_id, channels: {} };
try {
  output = JSON.parse(await readFile('private/slack-channels.json', 'utf8'));
  if (output.workspace !== auth.team_id) throw Error('Workspace mismatch');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
for (const [kind, name] of Object.entries({
  incidents: 'swf-incidents',
  reviews: 'swf-reviews',
  releases: 'swf-releases',
})) {
  if (output.channels[kind]) continue;
  try {
    const { channel } = await api('conversations.create', { name, is_private: false });
    output.channels[kind] = channel.id;
    await writeFile('private/slack-channels.json', JSON.stringify(output, null, 2) + '\n', {
      mode: 0o600,
    });
  } catch (e) {
    throw Error(
      `${name}: ${e.message}. If it already exists, use its existing channel ID; do not create duplicate channels.`,
    );
  }
}
await writeFile('private/slack-channels.json', JSON.stringify(output, null, 2) + '\n', {
  mode: 0o600,
});
console.log(
  'Created three SourceWayfinder channels; IDs saved in private/slack-channels.json. No messages sent by setup.',
);
