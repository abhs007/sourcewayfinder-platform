import { test, expect, type Page } from '@playwright/test';

// Fictional protocol fixtures only. These tests never assert real-world procedure answers.
const flow = {
  id: 'fictional',
  title: 'Fictional procedure',
  scope: 'An invented procedure for interface testing only.',
  status: 'active',
  officialUrl: 'https://example.org/procedure',
  lastSuccessfulCheckAt: '2026-11-22T12:00:00Z',
  statusEpoch: 1,
};
const question = {
  type: 'question',
  question: {
    id: 'first',
    prompt: 'Which fictional option fits?',
    help: 'Choose an invented option.',
    choices: [
      { id: 'yes', label: 'Fictional yes' },
      { id: 'unknown', label: 'I am not sure' },
    ],
  },
};
const session = {
  sessionId: 'fictional-session',
  token: 'fictional-capability',
  sequence: 0,
  bundleHash: 'a'.repeat(64),
  statusEpoch: 1,
  flowId: 'fictional',
  step: question,
  sources: [
    { id: 'fixture-source', title: 'Fictional source', url: 'https://example.org/procedure' },
  ],
  officialUrl: flow.officialUrl,
};
const outcome = {
  ...session,
  sequence: 1,
  step: {
    type: 'outcome',
    outcome: {
      id: 'end',
      title: 'Fictional next step',
      nextStep: 'Consult the fictional source.',
      prerequisites: ['An invented prerequisite'],
      unresolved: [],
      sourceRefs: ['fixture-source'],
    },
  },
};
async function fixtures(page: Page) {
  await page.route('**/api/v1/domains', (r) => r.fulfill({ json: { domains: [flow] } }));
  await page.route('**/api/v1/flows/fictional', (r) => r.fulfill({ json: flow }));
  await page.route('**/api/v1/sessions', (r) => r.fulfill({ json: session, status: 201 }));
  await page.route('**/api/v1/sessions/fictional-session', (r) =>
    r.fulfill({ json: { deleted: true } }),
  );
}
async function begin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fictional procedure' }).click();
  await expect(page.getByRole('heading', { name: question.question.prompt })).toBeVisible();
}

test('static official routes survive guidance API failure at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Live guidance is unavailable');
  await expect(page.getByRole('link', { name: 'Replace a Social Security card' })).toHaveAttribute(
    'href',
    'https://www.ssa.gov/number-card/replace-card',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('public-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Phone and account access' }).click();
  await expect(
    page.getByRole('heading', { name: 'Let’s check the official route.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('fictional question and outcome work through keyboard only', async ({ page }, testInfo) => {
  await fixtures(page);
  let submitted: any;
  await page.route('**/api/v1/sessions/fictional-session/answers', async (r) => {
    submitted = { body: r.request().postDataJSON(), headers: r.request().headers() };
    await r.fulfill({ json: outcome });
  });
  await begin(page);
  await expect(page.getByRole('heading', { name: question.question.prompt })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Fictional next step' })).toBeVisible();
  expect(submitted.body).toEqual({ questionId: 'first', choiceId: 'yes', sequence: 0 });
  expect(submitted.headers.authorization).toBe('Bearer fictional-capability');
  expect(submitted.headers['idempotency-key']).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Fictional source', exact: true })).toHaveAttribute(
    'href',
    flow.officialUrl,
  );
  expect(
    await page.evaluate(
      () => Object.keys(localStorage).length + Object.keys(sessionStorage).length,
    ),
  ).toBe(0);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('fictional-outcome-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Finish this session' }).click();
  await expect(page.getByRole('heading', { name: 'Find your next step.' })).toBeVisible();
});

test('pending answer disables duplicate submission and malformed result clears guidance', async ({
  page,
}) => {
  await fixtures(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/v1/sessions/fictional-session/answers', async (r) => {
    calls++;
    await pending;
    await r.fulfill({
      json: {
        ...outcome,
        step: {
          type: 'question',
          question: { id: 'bad', prompt: 'Unsafe response', choices: [null] },
        },
      },
    });
  });
  await begin(page);
  await page.getByRole('radio', { name: 'Fictional yes' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'I am not sure' })).toBeDisabled();
  release!();
  await expect(
    page.getByRole('heading', { name: 'Let’s check the official route.' }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByText('Unsafe response')).toHaveCount(0);
});

test('malformed initial response is rejected without rendering arbitrary objects', async ({
  page,
}) => {
  await fixtures(page);
  await page.route('**/api/v1/sessions', (r) =>
    r.fulfill({ json: { ...session, sources: [null] } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Fictional procedure' }).click();
  await expect(page.getByText('We could not verify the guidance response.')).toBeVisible();
});

test('status epoch change stops an existing session', async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  await begin(page);
  await page.route('**/api/v1/flows/fictional', (r) =>
    r.fulfill({ json: { ...flow, statusEpoch: 2 } }),
  );
  await page.clock.fastForward(30001);
  await expect(
    page.getByRole('heading', { name: 'Let’s check the official route.' }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('status authority failure stops an existing session', async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  await begin(page);
  await page.route('**/api/v1/flows/fictional', (r) => r.abort());
  await page.clock.fastForward(30001);
  await expect(page.getByText('We cannot confirm that this guidance is current.')).toBeVisible();
});

test('polling does not extend the 30 minute idle deadline', async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  await begin(page);
  await page.clock.fastForward(30 * 60 * 1000 + 1);
  await expect(page.getByText('Your session expired.')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

// Real fetch/Response contracts with fictional data; no real procedure expectations.
async function stallStatus(page: Page, stage: 'headers' | 'body') {
  await page.addInitScript((stage) => {
    const original = window.fetch.bind(window);
    const state = { requests: 0, aborted: 0 };
    Object.assign(window, { statusProbe: state });
    window.fetch = async (input, init) => {
      if (String(input) !== '/api/v1/flows/fictional') return original(input, init);
      state.requests++;
      if (stage === 'headers')
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              state.aborted++;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":'));
            init?.signal?.addEventListener(
              'abort',
              () => {
                state.aborted++;
                controller.error(new DOMException('Aborted', 'AbortError'));
              },
              { once: true },
            );
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    };
  }, stage);
}
async function completeFictional(page: Page) {
  await page.route('**/api/v1/sessions/fictional-session/answers', (r) =>
    r.fulfill({ json: outcome }),
  );
  await begin(page);
  await page.getByRole('radio', { name: 'Fictional yes' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Fictional next step' })).toBeVisible();
}
for (const stage of ['headers', 'body'] as const) {
  test(`a stalled status ${stage} response clears an existing outcome within the request deadline`, async ({
    page,
  }) => {
    await fixtures(page);
    await stallStatus(page, stage);
    await page.clock.install();
    await completeFictional(page);
    await page.clock.fastForward(30001);
    await expect.poll(() => page.evaluate(() => (window as any).statusProbe.requests)).toBe(1);
    await page.clock.fastForward(10001);
    await expect(page.getByText('We cannot confirm that this guidance is current.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fictional next step' })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Visit the official source' }).first(),
    ).toHaveAttribute('href', flow.officialUrl);
    await expect.poll(() => page.evaluate(() => (window as any).statusProbe.aborted)).toBe(1);
  });
}
test('idle expiry clears guidance even while a status request is pending', async ({ page }) => {
  await fixtures(page);
  await stallStatus(page, 'headers');
  await page.clock.install();
  await completeFictional(page);
  // Skip missed polls like a throttled background tab; the first pending check is near expiry.
  await page.clock.fastForward(29 * 60 * 1000 + 55000);
  await expect.poll(() => page.evaluate(() => (window as any).statusProbe.requests)).toBe(1);
  await page.clock.fastForward(6000);
  await expect(page.getByText('Your session expired.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fictional next step' })).toHaveCount(0);
});
test('returning to a visible tab checks expiry before an in-flight request guard', async ({
  page,
}) => {
  await fixtures(page);
  await stallStatus(page, 'body');
  await page.clock.install();
  await completeFictional(page);
  await page.clock.fastForward(30001);
  await expect.poll(() => page.evaluate(() => (window as any).statusProbe.requests)).toBe(1);
  const afterExpiry = await page.evaluate(() => Date.now() + 31 * 60 * 1000);
  await page.clock.setSystemTime(afterExpiry);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Your session expired.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fictional next step' })).toHaveCount(0);
});

test('leaving a session cancels the pending status deadline', async ({ page }) => {
  await fixtures(page);
  await stallStatus(page, 'headers');
  await page.clock.install();
  await completeFictional(page);
  await page.clock.fastForward(30001);
  await expect.poll(() => page.evaluate(() => (window as any).statusProbe.requests)).toBe(1);
  await page.getByRole('button', { name: 'Finish this session' }).click();
  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page.getByRole('heading', { name: 'Find your next step.' })).toBeVisible();
  await expect(page.getByText('We cannot confirm that this guidance is current.')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).statusProbe.aborted)).toBe(1);
});

test('answers extend idle expiry but never the two-hour session limit', async ({ page }) => {
  await fixtures(page);
  await page.clock.install();
  let sequence = 0;
  await page.route('**/api/v1/sessions/fictional-session/answers', (r) =>
    r.fulfill({ json: { ...session, sequence: ++sequence } }),
  );
  await begin(page);
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(29 * 60 * 1000);
    await page.getByRole('radio', { name: 'Fictional yes' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('radio', { name: 'Fictional yes' })).not.toBeChecked();
  }
  await page.clock.fastForward(4 * 60 * 1000 + 1);
  await expect(page.getByText('Your session expired.')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('mobile fictional guidance fits and respects reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixtures(page);
  await begin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText('Please do not enter a name,')).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('fictional-question-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'All topics' }).click();
  expect(await page.locator('.hero-copy').evaluate((e) => getComputedStyle(e).animationName)).toBe(
    'none',
  );
});

test('desktop public homepage is visually reviewable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Live guidance is unavailable');
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('public-desktop.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin exact gate and digest require explicit review and notes', async ({
  page,
}, testInfo) => {
  const proposal = {
    id: 'fixture-proposal',
    title: 'Fictional change',
    state: 'interpretation_review',
    nextGate: 'interpretation_review',
    digest: 'b'.repeat(64),
    manifest: { usage: 'fictional' },
    sourceVersions: [{ id: 'fixture-v1', passage: 'Invented evidence only' }],
  };
  await page.route('**/admin/v1/dashboard', (r) =>
    r.fulfill({
      json: {
        csrfToken: 'fixture-csrf',
        flows: [flow],
        proposals: [proposal],
        releases: [],
        audit: [],
      },
    }),
  );
  await page.route('**/admin/v1/proposals/fixture-proposal', (r) => r.fulfill({ json: proposal }));
  let received: any;
  await page.route('**/admin/v1/proposals/fixture-proposal/decisions', (r) => {
    received = { body: r.request().postDataJSON(), headers: r.request().headers() };
    return r.fulfill({ json: { recorded: true } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Review evidence' }).click();
  await expect(page.getByLabel('Review gate')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Approve source interpretation' })).toBeDisabled();
  await expect(page.getByText('Invented evidence only', { exact: false }).first()).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('admin-review-desktop.png'),
    fullPage: true,
  });
  await page.getByLabel('Reason and review notes').fill('Fictional interface test only.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve source interpretation' }).click();
  expect(received.body).toEqual({
    gate: 'interpretation_review',
    decision: 'approve',
    digest: 'b'.repeat(64),
    reason: 'Fictional interface test only.',
  });
  expect(received.headers['x-csrf-token']).toBe('fixture-csrf');
  await expect(page.getByRole('status')).toContainText('Your decision was recorded');
});

test('admin queue refresh discards stale detail after a decision in another browser', async ({
  page,
}) => {
  let approvedElsewhere = false;
  const proposal = () => ({
    id: 'fictional-refresh',
    title: 'Fictional refresh review',
    state: approvedElsewhere ? 'implementation_authorized' : 'interpretation_review',
    nextGate: approvedElsewhere ? null : 'interpretation_review',
    digest: approvedElsewhere ? null : 'b'.repeat(64),
    approvals: approvedElsewhere
      ? [{ decision: 'approve', reason: 'Fictional external review' }]
      : [],
  });
  await page.route('**/admin/v1/dashboard', (route) =>
    route.fulfill({
      json: {
        csrfToken: 'fixture-csrf',
        flows: [flow],
        proposals: [proposal()],
        releases: [],
        audit: [],
      },
    }),
  );
  await page.route('**/admin/v1/proposals/fictional-refresh', (route) =>
    route.fulfill({ json: proposal() }),
  );
  let decisions = 0;
  await page.route('**/admin/v1/proposals/fictional-refresh/decisions', (route) => {
    decisions++;
    return route.fulfill({ status: 500, json: { message: 'Unexpected decision request' } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Review evidence' }).click();
  await page.getByLabel('Reason and review notes').fill('Fictional draft review');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Approve source interpretation' })).toBeEnabled();
  approvedElsewhere = true;
  await page.getByRole('button', { name: 'Refresh queue' }).click();
  await expect(page.getByRole('heading', { name: 'Record your decision' })).toHaveCount(0);
  await expect(page.getByText('implementation_authorized', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review evidence' }).click();
  await expect(page.getByText('Fictional external review', { exact: false }).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No decision needed from you right now' }),
  ).toBeVisible();
  await expect(
    page.getByText('Source interpretation is approved.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Reason and review notes')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve this gate' })).toHaveCount(0);
  await expect(page.getByText('No digest supplied', { exact: false })).toHaveCount(0);
  expect(decisions).toBe(0);
});

test('admin authorization failure has no available review action at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('**/admin/v1/dashboard', (r) =>
    r.fulfill({ status: 403, json: { message: 'Authentication required' } }),
  );
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByRole('alert')).toContainText('Authentication required');
  await expect(page.getByRole('button', { name: 'Review evidence' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin revalidates an exact recovered source without activating its flow', async ({
  page,
}) => {
  const source = {
    id: 'fictional-source',
    title: 'Fictional recovered source',
    latest_version_id: 'fictional-v2',
    last_error: null,
  };
  const detail = {
    ...source,
    latestVersion: {
      id: 'fictional-v2',
      snapshot_sha256: 'c'.repeat(64),
      normalized_text: 'Fictional source evidence after recovery.',
      valid: 0,
    },
    observations: [],
  };
  await page.route('**/admin/v1/dashboard', (r) =>
    r.fulfill({
      json: {
        csrfToken: 'fixture-csrf',
        flows: [],
        proposals: [],
        releases: [],
        sources: [source],
        audit: [],
      },
    }),
  );
  await page.route('**/admin/v1/sources/fictional-source', (r) => r.fulfill({ json: detail }));
  let submitted: any;
  await page.route('**/admin/v1/sources/fictional-source/revalidate', (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ json: { revalidated: true } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Source checks' }).click();
  await page.getByRole('button', { name: 'Review evidence' }).click();
  await expect(page.getByRole('button', { name: 'Revalidate this source version' })).toBeDisabled();
  await expect(
    page.getByText('Fictional source evidence after recovery.', { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByLabel('Reason and review notes')
    .fill('Reviewed the fictional recovered passage.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Revalidate this source version' }).click();
  expect(submitted).toEqual({
    sourceVersionId: 'fictional-v2',
    reason: 'Reviewed the fictional recovered passage.',
  });
  await expect(page.getByRole('status')).toContainText('Guidance remains suspended');
});

test('admin activation binds the displayed verified release and epoch', async ({ page }) => {
  const suspended = {
    ...flow,
    status: 'under_review',
    statusEpoch: 7,
    bundleHash: 'd'.repeat(64),
    releaseId: 'verified-release',
  };
  await page.route('**/admin/v1/dashboard', (r) =>
    r.fulfill({
      json: {
        csrfToken: 'fixture-csrf',
        flows: [suspended],
        proposals: [],
        releases: [{ id: 'verified-release', state: 'verified' }],
        sources: [],
        audit: [],
      },
    }),
  );
  let received: any;
  await page.route('**/admin/v1/flows/fictional/status', (r) => {
    received = { body: r.request().postDataJSON(), headers: r.request().headers() };
    return r.fulfill({ json: { status: 'active' } });
  });
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('verified-release');
    expect(dialog.message()).toContain('d'.repeat(64));
    await dialog.accept('Reviewed fictional smoke proof.');
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Flow availability' }).click();
  await page.getByRole('button', { name: 'Activate verified release' }).click();
  await expect(page.getByRole('status')).toContainText('exact verified release is active');
  expect(received.body).toEqual({
    status: 'active',
    reason: 'Reviewed fictional smoke proof.',
    releaseId: 'verified-release',
    bundleHash: 'd'.repeat(64),
    statusEpoch: 7,
  });
  expect(received.headers['x-csrf-token']).toBe('fixture-csrf');
});
