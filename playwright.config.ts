import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright runs every E2E spec twice — once in desktop Chromium and once
 * in mobile WebKit (iPhone 15 viewport) — because Almanac targets both real
 * environments and Mobile Safari has its own ideas about IndexedDB, paste,
 * and focus.
 *
 * Tests speak to a mocked api.anthropic.com (see tests/helpers/mocks.ts) so
 * CI never makes real API calls.
 *
 * Locally: `npm test` (after `npm run dev` boots Vite).
 * CI:      `npm run test:ci` (Playwright starts Vite via webServer).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // WebKit's IndexedDB has eventual-consistency quirks under heavy parallelism;
  // one retry locally + two on CI absorbs the genuine timing flakes without
  // hiding real regressions (flakes show in the report as "flaky").
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 2,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  timeout: 45_000,
  expect: { timeout: 12_000 },

  use: {
    baseURL: "http://127.0.0.1:5181",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],

  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5181",
    url: "http://127.0.0.1:5181",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
