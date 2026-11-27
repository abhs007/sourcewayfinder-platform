import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const providers = ["att", "tmobile", "verizon", "fi", "visible", "usmobile"];
async function journey(page, provider = "tmobile", prefix = "") {
  await page.goto(prefix + "/navigator/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).selectOption(provider);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Show my checklist" }).click();
  await expect(
    page.getByRole("heading", { name: "Your recovery checklist" }),
  ).toBeVisible();
}
for (const p of providers)
  test(`${p} completes a source-linked journey`, async ({ page }) => {
    await journey(page, p);
    await expect(page.locator(".plr-results .plr-card")).toHaveCount(7);
    await page.getByText("Evidence and scope", { exact: true }).first().click();
    await expect(page.locator(".plr-results a").first()).toHaveAttribute(
      "href",
      /^https:/,
    );
    await expect(page).toHaveURL(/\/navigator\/$/);
    await page.getByRole("button", { name: "Edit answers" }).click();
    await expect(page.getByLabel("Provider", { exact: true })).toHaveValue(p);
    await page.getByLabel("Plan", { exact: true }).selectOption("business");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Show my checklist" }).click();
    await expect(page.locator(".plr-status.out_of_scope")).toHaveCount(7);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(
      page.getByRole("heading", { name: "What do you need to do?" }),
    ).toBeVisible();
  });
test("evidence filters preserve fifty historical observations", async ({
  page,
}) => {
  await page.goto("/evidence/");
  await expect(page.locator("[data-evidence] .plr-card")).toHaveCount(48);
  await page.getByLabel("Provider", { exact: true }).selectOption("visible");
  await expect(page.locator("[data-evidence] .plr-card")).toHaveCount(7);
  await page.getByLabel("Evidence status").selectOption("conflicting");
  await expect(page.locator("[data-evidence] .plr-card")).toHaveCount(1);
  await page.getByLabel("Provider", { exact: true }).selectOption("");
  await page.getByLabel("Evidence status").selectOption("");
  await page.getByLabel("Collection").selectOption("historical");
  await expect(page.locator("[data-evidence] .plr-card")).toHaveCount(50);
});
test("all twelve practice tasks show feedback and next task", async ({
  page,
}) => {
  await page.goto("/practice/");
  for (let i = 0; i < 12; i++) {
    await page.locator("[data-task]").selectOption(String(i));
    await page.locator("input[value=supported]").check();
    await page.getByRole("button", { name: "Check my answer" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Supported interpretation",
    );
    await expect(page.getByRole("button", { name: "Next task" })).toBeVisible();
  }
});
test("study withholds feedback, exports explicit records and deletes local session", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), method: r.method() }),
  );
  await page.goto("/study/");
  await page.getByLabel("I understand the local").check();
  await page.getByRole("button", { name: "Begin local session" }).click();
  let navigator = 0,
    official = 0;
  for (let i = 0; i < 6; i++) {
    const text = await page.locator(".plr-content").innerText();
    if (text.includes("Condition: navigator")) navigator++;
    else official++;
    await expect(page.getByText("Matched rubric", { exact: true })).toHaveCount(
      0,
    );
    if (i === 0)
      await page.getByRole("button", { name: "Request help" }).click();
    await page.locator("input[value=supported]").check();
    await page.getByRole("button", { name: "Submit task answer" }).click();
  }
  expect(navigator).toBe(3);
  expect(official).toBe(3);
  await expect(
    page.getByRole("heading", { name: "Session complete" }),
  ).toBeVisible();
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await d;
  const session = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(session.results).toHaveLength(6);
  expect(session.synthetic).toBe(true);
  expect(session.results[0].helpRequests).toBe(1);
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect(await readFile(await (await csv).path(), "utf8")).toContain(
    "elapsedMs",
  );
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(
    requests.every(
      (r) =>
        r.method === "GET" && new URL(r.url).origin === "http://127.0.0.1:8788",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Delete this session" }).click();
  await expect(
    page.getByRole("button", { name: "Begin local session" }),
  ).toBeVisible();
});
test("broken and malformed catalogs fail without inventing results", async ({
  page,
}) => {
  await page.route("**/data/catalog.json", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/navigator/");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Guidance is unavailable" }),
  ).toBeVisible();
  await page.unroute("**/data/catalog.json");
  await page.route("**/data/catalog.json", (r) =>
    r.fulfill({ contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
test("source text is escaped and public flow stays free of serious axe issues", async ({
  page,
}) => {
  await journey(page);
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) => ["serious", "critical"].includes(v.impact)),
  ).toEqual([]);
  await page.getByRole("button", { name: "Larger text" }).click();
  await expect(page.locator("#recovery-module")).toHaveClass(/plr-large/);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".plr-header")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Your recovery checklist" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
  await page.screenshot({
    path: `test-results/layout-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("render malicious catalog text as text, never executable markup", async ({
  page,
}) => {
  await page.route("**/data/catalog.json", async (r) => {
    const response = await r.fetch();
    const c = await response.json();
    c.rules.forEach(
      (x) => (x.summary = '<img src=x onerror="window.injected=true">'),
    );
    await r.fulfill({ json: c });
  });
  await journey(page);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator(".plr-results img")).toHaveCount(0);
  await expect(page.locator(".plr-results")).toContainText("<img");
});
test("keyboard navigation and narrow reflow remain usable", async ({
  page,
  browserName,
}) => {
  await page.goto("/navigator/");
  await page.getByLabel("My goal").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Larger text" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("offline data requests show a truthful failure without transmitting input", async ({
  page,
  context,
}) => {
  await page.route("**/data/**", (r) => r.abort("internetdisconnected"));
  await page.goto("/navigator/");
  await expect(
    page.getByRole("heading", { name: "Guidance is unavailable" }),
  ).toBeVisible();
  expect(page.url()).not.toContain("?");
  await page.unroute("**/data/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("My goal")).toBeVisible();
});
test("actual Pause & Verify module and original exercise coexist", async ({
  page,
}) => {
  test.skip(!process.env.INTEGRATION, "Requires the private sibling checkout.");
  await journey(page, "tmobile", "http://127.0.0.1:8787/phone-loss");
  await expect(page.locator(".plr-card")).toHaveCount(7);
  await page.goto("http://127.0.0.1:8787/practice/");
  await expect(page.getByRole("heading").first()).toBeVisible();
});
