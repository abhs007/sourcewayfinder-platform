import { test, expect } from '@playwright/test';
import { startFictionalRuntime } from './fictional-runtime.mts';
let runtime: Awaited<ReturnType<typeof startFictionalRuntime>>;
const origin = 'http://127.0.0.1:5175';
test.beforeAll(async () => {
  runtime = await startFictionalRuntime({ port: 8789, origin, localFixtureOnly: true });
});
test.afterAll(async () => {
  await runtime?.mf.dispose();
});
test.beforeEach(async () => {
  await runtime.control
    .prepare(
      "UPDATE flows SET status='active',status_epoch=1,last_successful_check_at=? WHERE id=?",
    )
    .bind(new Date(Date.now() - 1000).toISOString(), runtime.fixture.flowId)
    .run();
});

test('real Worker API, D1 and restricted published reader complete a fictional browser flow', async ({
  page,
}) => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Fictional test procedure' }).click();
  await expect(
    page.getByRole('heading', { name: 'Do you have the fictional office confirmation?' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  const answer = page.waitForResponse((r) => r.url().endsWith('/answers'));
  await page.getByRole('button', { name: 'Continue' }).click();
  const response = await answer;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  await expect(
    page.getByRole('heading', { name: 'Review can be requested in this fictional scenario' }),
  ).toBeVisible();
  const row = await runtime.sessions
    .prepare('SELECT token_hash,sequence FROM sessions ORDER BY created_at DESC LIMIT 1')
    .first<{ token_hash: string; sequence: number }>();
  expect(row?.sequence).toBe(1);
  expect(row?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Finish this session' }).click();
  await expect
    .poll(
      async () =>
        await runtime.sessions.prepare('SELECT count(*) AS n FROM sessions').first<number>('n'),
    )
    .toBe(0);
});

test('real fictional unknown branch renders at 320px without protocol changes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Fictional test procedure' }).click();
  await page.getByRole('radio', { name: 'I am not sure' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Clarify the prerequisite' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('integrated-fictional-mobile.png'),
    fullPage: true,
  });
});

test('authoritative D1 suspension blocks the next actual browser answer', async ({ page }) => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Fictional test procedure' }).click();
  await expect(page.getByRole('radio', { name: 'Yes', exact: true })).toBeVisible();
  await runtime.control
    .prepare("UPDATE flows SET status='under_review',status_epoch=status_epoch+1 WHERE id=?")
    .bind(runtime.fixture.flowId)
    .run();
  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Let’s check the official route.' }),
  ).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('actual published reader refuses unknown flow IDs', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8789/api/v1/flows/does-not-exist');
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body.code).toBe('NOT_FOUND');
});

test('static fallback remains usable when the application module cannot load', async ({ page }) => {
  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'Official guidance is always available.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Verizon SIM Protection' })).toHaveAttribute(
    'href',
    'https://www.verizon.com/support/knowledge-base-309294/',
  );
});
