// Public source acquisition and review preparation only. No credentials or policy decisions.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource, retain, type SourceConfig } from './collector.mts';
import { canonical, sha } from './authorized-tests.mjs';

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const run = process.argv[2] ?? 'account-recovery-2026-11-26';
  if (!/^account-recovery-\d{4}-\d{2}-\d{2}(?:-r\d+)?$/.test(run))
    throw Error('Invalid capture run name');
  const output = resolve(root, 'docs/release', run);
  const rawFolder = `domains/research/${run}`;
  const rawRoot = resolve(root, rawFolder);
  // Refuse overwrite, including a partial prior capture. Preserve evidence for review.
  await mkdir(output, { recursive: false });
  await mkdir(rawRoot, { recursive: false });
  const sources: SourceConfig[] = JSON.parse(
    await readFile(resolve(root, 'domains/account-recovery-sources.proposed.json'), 'utf8'),
  );
  const snapshots = new Map<string, Awaited<ReturnType<typeof retain>>>();
  for (const source of sources) {
    const snapshot = await retain(source, await fetchSource(source), rawRoot);
    snapshots.set(source.id, snapshot);
  }
  const records = [];
  for (const flowId of ['google-lost-second-factor', 'google-compromised-account']) {
    const path = resolve(output, flowId);
    await mkdir(path);
    const bundle = JSON.parse(
      await readFile(resolve(root, `domains/${flowId}/bundle.draft.json`), 'utf8'),
    );
    const proposedCases = JSON.parse(
      await readFile(resolve(root, `domains/${flowId}/expected-cases.proposed.json`), 'utf8'),
    );
    const remap = (id: string) =>
      id !== 'google-recovery'
        ? id
        : flowId === 'google-lost-second-factor'
          ? 'google-lost-recovery'
          : 'google-compromised-recovery';
    for (const source of bundle.sources) {
      source.id = remap(source.id);
      const snapshot = snapshots.get(source.id)!;
      if (!snapshot.normalizedText.includes(source.passage))
        throw Error(`Reviewed passage absent: ${source.id}`);
      source.sourceVersionId = snapshot.sourceVersionId;
      source.snapshotSha256 = snapshot.snapshotSha256;
    }
    for (const outcome of bundle.outcomes) outcome.sourceRefs = outcome.sourceRefs.map(remap);
    const cases = proposedCases.map((testCase: any) => {
      const expectedOutcome = bundle.outcomes.find(
        (outcome: any) => outcome.id === testCase.expectedOutcomeId,
      );
      if (!expectedOutcome) throw Error(`Proposed case has no named outcome: ${testCase.id}`);
      return {
        id: testCase.id,
        answers: testCase.answers,
        expectedOutcome: structuredClone(expectedOutcome),
      };
    });
    const interpretation = {
      flowId,
      sourceVersionIds: bundle.sources.map((source: any) => source.sourceVersionId),
      interpretation:
        flowId === 'google-lost-second-factor'
          ? 'Bounded routing for an adult using their own personal Google account when a phone or second factor is unavailable. Previously configured verification options are suggestions within Google sign-in, never a guarantee. Managed accounts, uncertain scope and Advanced Protection are handed to official instructions. A missing or unknown password uses the official recovery route.'
          : 'Bounded routing for an adult using their own personal Google account after suspected unauthorized activity. Sign-in availability determines recovery versus the official activity/device checklist. The flow does not diagnose compromise, guarantee safety, or replace the rest of Google security guidance.',
      uncertainties: [
        'Google decides which verification options it offers and whether ownership is established.',
        'The adult-only scope and conservative unknown/out-of-scope handoffs are project scope decisions, not universal Google eligibility findings.',
      ],
    };
    const files = {
      'bundle.proposed.json': bundle,
      'expected-cases.proposed.json': { cases },
      'interpretation.proposed.json': interpretation,
    };
    const hashes: Record<string, string> = {};
    for (const [name, content] of Object.entries(files)) {
      const raw = JSON.stringify(content, null, 2) + '\n';
      await writeFile(resolve(path, name), raw, { flag: 'wx' });
      hashes[name] = sha(raw);
    }
    const lines = [
      `# ${flowId}: exact case review`,
      '',
      'Unapproved local candidate. No semantic acceptance, hosted registration, interpretation decision or release has occurred.',
      '',
      `Canonical bundle SHA-256: \`${sha(canonical(bundle))}\``,
      '',
      '## Interpretation',
      '',
      interpretation.interpretation,
      '',
      '## Source anchors',
      '',
      ...bundle.sources.map(
        (source: any) =>
          `- **${source.id}**: [official page](${source.url}); version \`${source.sourceVersionId}\`; raw SHA-256 \`${source.snapshotSha256}\`.`,
      ),
      '',
      '## Cases',
      '',
    ];
    for (const testCase of cases) {
      const outcome = testCase.expectedOutcome;
      lines.push(
        `### ${testCase.id}`,
        '',
        ...testCase.answers.map((answer: any) => {
          const q = bundle.questions.find((q: any) => q.id === answer.questionId);
          const choice = q.choices.find((c: any) => c.id === answer.choiceId);
          return `- ${q.prompt} **${choice.label}**`;
        }),
        '',
        `**Result:** ${outcome.title}`,
        '',
        outcome.nextStep,
        '',
        '**Prerequisites:** ' +
          (outcome.prerequisites?.join(' ') || 'No additional prerequisite stated.'),
        '',
        '**Unresolved:** ' + outcome.unresolved.join(' '),
        '',
        '**Sources:** ' + outcome.sourceRefs.join(', '),
        '',
      );
    }
    await writeFile(resolve(path, 'CASE_REVIEW.md'), lines.join('\n').trimEnd() + '\n', { flag: 'wx' });
    records.push({
      flowId,
      cases: cases.length,
      bundleHash: sha(canonical(bundle)),
      files: hashes,
      approvals: [],
      semanticTestsRun: false,
      policySourceBindingsVerified: false,
    });
  }
  const captureRegister = [...snapshots.values()].map(({ normalizedText, ...snapshot }) => ({
    ...snapshot,
    normalizedTextBytes: Buffer.byteLength(normalizedText),
    registeredInPolicy: false,
    rawFile: `${rawFolder}/${snapshot.snapshotSha256}.html`,
    textFile: `${rawFolder}/${snapshot.normalizedSha256}.txt`,
  }));
  await writeFile(
    resolve(output, 'capture-register.json'),
    JSON.stringify(captureRegister, null, 2) + '\n',
    { flag: 'wx' },
  );
  await writeFile(
    resolve(output, 'preparation.json'),
    JSON.stringify(
      {
        preparedAt: new Date().toISOString(),
        sourceProfile:
          'Exact three English Google help URLs; 2 MiB raw ceiling, 100 KiB normalized ceiling; ordinary sources retain 1 MiB.',
        sourceSnapshots: captureRegister.length,
        flows: records,
        deployed: false,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  console.log(
    `Prepared ${records.length} unapproved flow packets and ${captureRegister.length} public source observations. No acceptance tests or policy writes.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
