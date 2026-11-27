import { test, expect } from '@playwright/test';
// Directory and UI behavior only; no source-dependent scenario answers are executed.
test('search, filters and empty results work without granting access to draft guidance', async ({
  page,
}) => {
  let sessionCalls = 0;
  await page.route('**/api/v1/domains', (r) => r.fulfill({ json: { domains: [] } }));
  await page.route('**/api/v1/sessions', (r) => {
    sessionCalls++;
    return r.abort();
  });
  await page.goto('/');
  await expect(page.getByText('4 topics found')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find a topic' }).fill('lost 2fa');
  await expect(page.getByText('1 topic found')).toBeVisible();
  await page.getByRole('button', { name: 'Identity documents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching topic yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all topics' }).click();
  await expect(page.getByText('4 topics found')).toBeVisible();
  await page.getByRole('button', { name: 'Lost phone or Google verification access' }).click();
  await expect(
    page.getByRole('heading', { name: 'Let’s check the official route.' }),
  ).toBeVisible();
  await expect(
    page.locator('.guidance-card').getByRole('link', { name: 'Visit the official source' }),
  ).toHaveAttribute('href', 'https://support.google.com/accounts/answer/185834?hl=en');
  await expect(page.getByRole('radio')).toHaveCount(0);
  expect(sessionCalls).toBe(0);
});
test('stalled directory exits loading and retains official handoffs', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/v1/domains', () => {});
  await page.goto('/');
  await page.clock.fastForward(10001);
  await expect(page.getByRole('status')).toContainText('Live guidance is unavailable');
  await expect(
    page.getByRole('link', {
      name: 'Secure a Google account after suspicious activity',
      exact: true,
    }),
  ).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) {
  test(`discovery stays readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Find a topic' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`discovery-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}
