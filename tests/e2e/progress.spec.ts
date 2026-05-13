// Progress — sparkline trends across panels, with the functional range
// as the band behind the line.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard } from "../helpers/flows";

test.describe("Progress", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("renders an empty state when no panels exist", async ({ page }) => {
    await page.goto("/#/progress");
    await expect(page.getByText(/no labs yet/i)).toBeVisible();
  });

  test("renders the latest-values section when there is one panel", async ({ page }) => {
    await page.goto("/#/labs?manual=1");
    await page.fill("#drawnAt", "2026-05-01");
    await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
    await page.getByRole("button", { name: /^save panel$/i }).click();
    await page.goto("/#/progress");
    await expect(page.getByText(/awaiting a second draw/i)).toBeVisible();
  });

  test("renders trend rows with sparklines when 2+ panels exist", async ({ page }) => {
    // Panel 1
    await page.goto("/#/labs?manual=1");
    await page.locator("#drawnAt").waitFor({ state: "visible" });
    await page.fill("#drawnAt", "2026-03-01");
    await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
    await page.getByRole("button", { name: /^save panel$/i }).click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/);

    // Panel 2
    await page.goto("/#/labs?manual=1");
    await page.locator("#drawnAt").waitFor({ state: "visible" });
    await page.fill("#drawnAt", "2026-05-01");
    await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("212");
    await page.getByRole("button", { name: /^save panel$/i }).click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/);

    await page.goto("/#/progress");
    await expect(page.locator(".trend")).toHaveCount(1);
    await expect(page.locator(".trend__chart svg")).toBeVisible();
    // Direction was downward — and our optimum for total_chol is <200, so the
    // move from 244 → 212 is moving toward optimum and should color as good.
    await expect(page.locator(".trend__delta--good")).toBeVisible();
  });
});
