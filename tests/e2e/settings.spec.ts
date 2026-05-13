// Settings — profile edit, export/import roundtrip, telemetry, wipe.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

test.describe("Settings", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("profile fields round-trip", async ({ page }) => {
    await page.goto("/#/settings");
    await expect(page.locator("#name")).toHaveValue("Test User");
    await expect(page.locator("#heightIn")).toHaveValue("70");
    await expect(page.locator("#weightLb")).toHaveValue("175");
    await expect(page.locator("#dietPattern")).toContainText(/halal/i);

    await page.fill("#name", "Renamed");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.locator("#set-status")).toContainText(/saved/i);

    await page.reload();
    await expect(page.locator("#name")).toHaveValue("Renamed");
  });

  test("telemetry panel records plan + extract calls", async ({ page }) => {
    await addManualPanel(page);
    await composePlan(page);
    await page.goto("/#/settings");

    // Stat tiles render.
    await expect(page.locator(".telem-stat")).toHaveCount(6);
    await expect(page.locator(".telem-stat").filter({ hasText: /total calls/i })).toContainText("1");

    // Recent-calls table has at least one row.
    await page.locator("summary").getByText(/recent calls/i).click();
    await expect(page.locator(".telem-table tbody tr").first()).toBeVisible();
  });

  test("wipe clears all data and returns to onboarding", async ({ page }) => {
    await addManualPanel(page);
    await page.goto("/#/settings");
    page.once("dialog", d => d.accept());
    await page.getByRole("button", { name: /burn the almanac/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);
  });

  test("export downloads a .almanac.json", async ({ page }) => {
    await addManualPanel(page);
    await page.goto("/#/settings");
    const dl = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export the almanac/i }).click(),
    ]);
    expect(dl[0].suggestedFilename()).toMatch(/\.almanac\.json$/);
  });
});
