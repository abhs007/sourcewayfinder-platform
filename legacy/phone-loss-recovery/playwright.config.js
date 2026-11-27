import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:8788", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run build && npm run dev",
      url: "http://127.0.0.1:8788",
      reuseExistingServer: !process.env.CI,
    },
    ...(process.env.INTEGRATION
      ? [
          {
            command: "node scripts/dev.mjs",
            cwd: "../pause-and-verify",
            url: "http://127.0.0.1:8787",
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "android", use: { ...devices["Pixel 5"] } },
    { name: "iphone", use: { ...devices["iPhone 12"] } },
  ],
});
