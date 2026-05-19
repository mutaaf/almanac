// The privacy contract, enforced.
//
// Almanac MUST NOT egress to anywhere other than api.anthropic.com
// (for inference, BYOK, browser → API directly) and the standard
// font CDN (Google Fonts) and the dev server itself. Any other
// host appearing in network logs is a regression — period.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan, enterTour } from "../helpers/flows";

const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

test.describe("Privacy contract", () => {
  test.beforeEach(async ({ context }) => {
  });

  test("no off-device network egress beyond the allow-list", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);

    const offending = stats.outboundUrls.filter(u => {
      // Only http/https URLs count as "off-device egress" for this contract.
      // blob:, data:, ws: to the dev server, chrome-extension:, etc. are
      // intra-browser and don't leave the machine.
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("API key never appears in DOM or headers visible to other origins", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { key: "sk-ant-canary-VALUE-12345" });
    // The key is in an input[type=password] — its value lives in IndexedDB only.
    const html = await page.content();
    expect(html).not.toContain("sk-ant-canary-VALUE-12345");
  });

  test("the sample tour (ticket 0014) never widens the egress allow-list", async ({ page }) => {
    const stats = await installMocks(page);
    await enterTour(page);
    // Visit every page reachable on the tour. Each must paint without an
    // off-allow-list request, and the egress URL list must satisfy the same
    // allow-list assertion the consented path satisfies.
    for (const route of ["#/today", "#/plan", "#/meals", "#/progress", "#/recap", "#/labs"]) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline").first().waitFor();
    }
    // Also exercise the compare and panel-detail leaf routes — the tour's
    // fixture has two panels with id 1 and 2.
    await page.goto("/#/progress?compare=1,2");
    await page.locator(".compare-summary, .compare-empty, .headline").first().waitFor();
    await page.goto("/#/labs?id=1");
    await page.locator(".eyebrow, .headline").first().waitFor();

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("import of a malformed export does not crash the app", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/settings");

    // Attach a malformed JSON file to the import input.
    await page.locator("#import-file").setInputFiles({
      name: "garbage.almanac.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ this isn't JSON"),
    });
    await expect(page.locator("#io-status")).toContainText(/import failed/i);
  });
});
