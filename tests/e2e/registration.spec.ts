import { test, expect } from '@playwright/test';
import packet from '../../domains/verizon-sim-protection/registration.proposed.json' with { type: 'json' };

// UI wiring only: intercepted registration requests, no source fetch or semantic acceptance.
test('owner registration survives a lost response and records only missing boundaries', async ({
  page,
}, testInfo) => {
  const flows: any[] = [],
    sources: any[] = [],
    mutations: any[] = [];
  let failOnce = true;
  await page.route('**/admin/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/admin/v1/dashboard')
      return route.fulfill({
        json: {
          csrfToken: 'fixture-registration-csrf',
          flows,
          sources,
          proposals: [],
          releases: [],
          audit: [],
        },
      });
    const body = request.postDataJSON();
    mutations.push({ path, body, csrf: request.headers()['x-csrf-token'] });
    if (path === '/admin/v1/flows') flows.push({ ...body, status: 'under_review' });
    else if (path === '/admin/v1/sources') {
      sources.push({
        id: body.id,
        flow_id: body.flowId,
        title: body.title,
        url: body.url,
        approved_origin: body.approvedOrigin,
        approved_path: body.approvedPath,
        enabled: 1,
      });
      if (failOnce) {
        failOnce = false;
        return route.abort('failed');
      }
    } else throw Error('Unexpected mutation: ' + path);
    return route.fulfill({ json: { id: body.id } });
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Review Verizon setup' }).click();
  const submit = page.getByRole('button', { name: 'Register flow and sources', exact: true });
  await expect(submit).toBeDisabled();
  expect(mutations).toEqual([]);
  await expect(page.getByRole('region', { name: 'Proposed registration' })).toContainText(
    packet.flow.scope,
  );
  for (const source of packet.sources)
    await expect(page.getByText(source.approvedPath, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('registration-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('registration-mobile.png'), fullPage: true });
  await page.getByRole('checkbox').check();
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Saved records are retained');
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox').check();
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Registration verified');
  expect(mutations.map((m) => m.path)).toEqual([
    '/admin/v1/flows',
    ...packet.sources.map(() => '/admin/v1/sources'),
  ]);
  expect(mutations.map((m) => m.body)).toEqual([packet.flow, ...packet.sources]);
  expect(mutations.every((m) => m.csrf === 'fixture-registration-csrf')).toBe(true);
  expect(flows[0].status).toBe('under_review');
  await page.getByRole('button', { name: 'Back to the queue' }).click();
  await expect(page.getByRole('button', { name: 'Review Verizon setup' })).toHaveCount(0);
});

test('expired authentication blocks registration before any write', async ({ page }) => {
  let authenticated = true;
  let writes = 0;
  await page.route('**/admin/v1/**', (route) => {
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill(
      authenticated
        ? {
            json: {
              csrfToken: 'fixture-csrf',
              flows: [],
              sources: [],
              proposals: [],
              releases: [],
              audit: [],
            },
          }
        : { status: 403, json: { message: 'Authentication required' } },
    );
  });
  await page.goto('http://127.0.0.1:5174');
  await page.getByRole('button', { name: 'Review Verizon setup' }).click();
  await page.getByRole('checkbox').check();
  authenticated = false;
  await page.getByRole('button', { name: 'Register flow and sources' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign in again');
  expect(writes).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Review Verizon setup' })).toHaveCount(0);
});
