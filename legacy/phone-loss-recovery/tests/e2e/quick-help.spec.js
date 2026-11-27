import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("plain English opens the carrier guide without repeating the story", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByLabel("Your situation").fill("My T-Mobile phone was stolen.");
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.getByRole("button", { name: "Find my next step" }).click();
  await expect(
    page.getByRole("link", { name: "T-Mobile lost or stolen device guide" }),
  ).toHaveAttribute("href", /t-mobile.com\/support\/account\/lost-or-stolen/);
  await expect(page).toHaveURL(/\/$/);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Personalize my checklist" }).click();
  await expect(page.getByLabel("Provider", { exact: true })).toHaveValue(
    "tmobile",
  );
  await expect(page.getByLabel("Account role")).toHaveValue("unknown");
});

test("ambiguous story asks for the goal and preserves the carrier", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByLabel("Your situation").fill("I lost my phone on Verizon");
  await page.getByRole("button", { name: "Find my next step" }).click();
  await page.getByRole("button", { name: "I can’t sign in" }).click();
  await expect(
    page.getByRole("link", { name: "Open Verizon support" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("Your situation")).toBeEmpty();
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact),
    ),
  ).toEqual([]);
});

test("tap-only path handles unknown carriers without guessing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByText("Choose from a list instead").click();
  await page
    .getByRole("button", { name: "Get my number working again" })
    .click();
  await page
    .getByRole("button", { name: "Another carrier or not sure" })
    .click();
  await expect(page.locator(".plr-help")).toContainText("Check a bill");
});

test("dictation requires local recognition and leaves the transcript editable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class LocalSpeech {
      get processLocally() {
        return this.local;
      }
      set processLocally(value) {
        this.local = value;
      }
      static async available(options) {
        return options.processLocally ? "available" : "unavailable";
      }
      start() {
        if (!this.local) throw Error("remote");
        this.onresult({
          results: [[{ transcript: "My AT&T phone was stolen" }]],
        });
        this.onend();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: LocalSpeech,
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByRole("button", { name: "Dictate on this device" }).click();
  await expect(page.getByLabel("Your situation")).toHaveValue(
    "My AT&T phone was stolen",
  );
  await page.getByLabel("Your situation").fill("My Visible phone was stolen");
  await page.getByRole("button", { name: "Find my next step" }).click();
  await expect(
    page.getByRole("link", {
      name: "Visible lost-phone and account access guide",
    }),
  ).toBeVisible();
});

test("on-device dictation unavailable keeps typing available and never starts audio", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class MissingLanguage {
      get processLocally() {
        return true;
      }
      static async available() {
        return "downloadable";
      }
      start() {
        window.micStarted = true;
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: MissingLanguage,
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByRole("button", { name: "Dictate on this device" }).click();
  await expect(page.getByRole("status")).toContainText("Type or choose");
  expect(await page.evaluate(() => window.micStarted)).toBeUndefined();
  await page
    .getByLabel("Your situation")
    .fill("I use Visible and cannot receive texts. I need my number back.");
  await page.getByRole("button", { name: "Find my next step" }).click();
  await expect(page.locator("blockquote")).toContainText(
    "can’t receive text messages",
  );
  await page.getByRole("button", { name: "Personalize my checklist" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByLabel("SMS to the affected line is reachable"),
  ).toHaveValue("no");
});

test("landing page fits a borrowed phone with larger text", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Larger text" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
});

test("stolen shortcut opens carrier help; misplaced shortcut focuses official finders", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "I left it somewhere" }).click();
  await expect(page.locator("#plr-finders")).toBeFocused();
  await expect(page.getByRole("link", { name: "Samsung Find for Galaxy" })).toHaveAttribute("href", "https://samsungfind.samsung.com/");
  await page.getByRole("link", { name: "Back to choices" }).click();
  await expect(page.getByRole("link", { name: "I left it somewhere" })).toBeFocused();
  await page.getByRole("button", { name: "I think it was stolen" }).click();
  await page.getByRole("button", { name: "T-Mobile" }).click();
  await expect(page.getByRole("link", { name: "T-Mobile lost or stolen device guide" })).toBeVisible();
});

test("landing finder links remain available without scripts", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Phone unavailable? Start with what you still have." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Apple Find Devices for iPhone" })).toHaveAttribute("href", "https://www.icloud.com/find");
  await expect(page.getByRole("link", { name: "Google Find Hub for Android" })).toHaveAttribute("href", "https://android.com/find");
  await context.close();
});

test("catalog failure preserves the homepage and allows a retry", async ({ page }) => {
  await page.route("**/catalog.json", route => route.abort());
  await page.goto("/");
  const story = page.getByRole("button", { name: "Tell us what happened" });
  await story.click();
  await expect(page.getByRole("status")).toContainText("couldn’t load");
  await expect(page.getByRole("link", { name: "Samsung Find for Galaxy" })).toBeVisible();
  await page.unroute("**/catalog.json");
  await story.click();
  await expect(page.getByLabel("Your situation")).toBeVisible();
});

test("Back and browser Forward retrace stolen-phone and personalized checklist steps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "I think it was stolen" }).click();
  const back = page.getByRole("button", { name: "Back", exact: true });
  await expect(back).toBeVisible();
  await page.getByRole("button", { name: "T-Mobile" }).click();
  await page.getByRole("button", { name: "Personalize my checklist" }).click();
  await back.click();
  await expect(page.getByRole("heading", { name: "Ask about protecting your line" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Which carrier serves the missing phone?" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("link", { name: "T-Mobile lost or stolen device guide" })).toBeVisible();
  await back.click();
  await back.click();
  await expect(page.getByRole("heading", { name: "Phone unavailable? Start with what you still have." })).toBeVisible();
});

test("browser Back restores an editable story privately and permits a different choice", async ({ page }) => {
  const story = "My Verizon phone was stolen";
  await page.goto("/");
  await page.getByRole("button", { name: "Tell us what happened" }).click();
  await page.getByLabel("Your situation").fill(story);
  await page.getByRole("button", { name: "Find my next step" }).click();
  await expect(page.getByRole("link", { name: "Verizon lost-device suspension guide" })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain("Verizon");
  await page.goBack();
  await expect(page.getByLabel("Your situation")).toHaveValue(story);
  await page.getByLabel("Your situation").fill("My T-Mobile phone was stolen");
  await page.getByRole("button", { name: "Find my next step" }).click();
  await expect(page.getByRole("link", { name: "T-Mobile lost or stolen device guide" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
