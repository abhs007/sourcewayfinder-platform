import { startFictionalRuntime } from '../tests/e2e/fictional-runtime.mts';

// This command has no route for accepting real guidance bundles or approval credentials.
const { mf } = await startFictionalRuntime({
  port: 8787,
  origin: 'http://127.0.0.1:5173',
  localFixtureOnly: true,
});
console.log(
  'Fictional API + actual restricted published-content reader listening at ' +
    (await mf.ready) +
    '.',
);
console.log(
  'Run npm exec vite -- --config apps/web/vite.config.ts in another terminal. The D1 fixture databases are ephemeral; no real guidance or approval authority is exposed.',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await mf.dispose();
    process.exit(0);
  });
