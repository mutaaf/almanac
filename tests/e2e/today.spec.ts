// Today is the daily ritual: today's meals on top, habit stack below,
// 14-day streak strip at the bottom.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

test.describe("Today", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);
  });

  test("shows habit stack and 14-day streak strip", async ({ page }) => {
    await page.goto("/#/today");
    await expect(page.locator(".habit-check")).toHaveCount(5);  // fixture habits
    await expect(page.locator(".streak-strip")).toBeVisible();
    await expect(page.locator(".streak-cell")).toHaveCount(14);
  });

  test("after generating meals, today's meals are surfaced above habits", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);

    await page.goto("/#/today");
    await expect(page.locator(".meal-tiles")).toBeVisible();
    await expect(page.locator(".meal-tile")).toHaveCount(3);
  });

  test("habit tap toggles is-done state", async ({ page }) => {
    await page.goto("/#/today");
    const first = page.locator(".habit-check").first();
    await first.click();
    await expect(first).toHaveClass(/is-done/);
    await first.click();
    await expect(first).not.toHaveClass(/is-done/);
  });

  test("meal tile tap toggles is-eaten state", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    // Wait for the week to render before navigating away, otherwise the meal
    // plan may not have persisted by the time we land on /today.
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);

    await page.goto("/#/today");
    const tile = page.locator(".meal-tile").first();
    await tile.click();
    await expect(tile).toHaveClass(/is-eaten/);
  });

  test("save check-in persists habit + signals to today's record", async ({ page }) => {
    await page.goto("/#/today");
    await page.locator(".habit-check").first().click();
    await page.locator("summary").getByText(/how do you feel/i).click();
    await page.fill("#sleep", "7.5");
    await page.fill("#mood", "4");
    await page.fill("#energy", "4");
    await page.getByRole("button", { name: /save check-in/i }).click();
    await expect(page.locator("#save-status")).toContainText(/saved/i);

    // Reload and confirm.
    await page.reload();
    await expect(page.locator(".habit-check.is-done")).toHaveCount(1);
  });
});
