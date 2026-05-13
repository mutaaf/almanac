// Meals — the 7-day plan + grocery list. Generation is mocked.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

test.describe("Meals", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);
  });

  test("generates a 7-day meal plan and renders the week", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);
    await expect(page.locator(".meal-card").first()).toBeVisible();
  });

  test("today's cell is highlighted in the day strip", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell.is-today")).toHaveCount(1);
  });

  test("clicking a day shows full meal detail for that day", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await page.locator(".day-strip__cell").nth(2).click();
    await expect(page.locator(".meal-detail").first()).toBeVisible();
    await expect(page.locator(".meal-detail__ingredients li").first()).toBeVisible();
  });

  test("grocery list lists every section and items have checkboxes", async ({ page }) => {
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    // Wait for the week to render before the grocery link is reachable.
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);
    await page.getByRole("link", { name: /grocery list/i }).click();
    await expect(page).toHaveURL(/#\/meals\?grocery=1$/);

    // Fixture has 4 sections.
    await expect(page.locator(".grocery__section")).toHaveCount(4);
    await expect(page.locator(".grocery__row").first()).toBeVisible();
    await page.locator(".grocery__row input[type='checkbox']").first().check();
    await expect(page.locator(".grocery__row input[type='checkbox']").first()).toBeChecked();
  });
});
