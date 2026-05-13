// Plan composes the protocol from panels + adherence. Two view modes
// (Dashboard / Read) plus the interactive habit-ring tap-to-mark.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

test.describe("Plan", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
  });

  test("composes the plan and renders the dashboard view by default", async ({ page }) => {
    await composePlan(page);
    await expect(page.locator(".view-toggle__opt.is-active")).toHaveText(/dashboard/i);
    await expect(page.locator(".dash-snapshot")).toBeVisible();
    await expect(page.locator(".hero-card").first()).toBeVisible();
  });

  test("renders pre-computed insights as expandable cards", async ({ page }) => {
    await composePlan(page);
    // Fixture plan has 4 insights — at least one shows as a card.
    const card = page.locator(".insight-card").first();
    await expect(card).toBeVisible();
    await card.locator("summary").click();
    await expect(card).toHaveAttribute("open", "");
    await expect(card.locator(".insight-card__detail")).toBeVisible();
  });

  test("eat list renders as gallery with frequency dots", async ({ page }) => {
    await composePlan(page);
    const card = page.locator(".eat-card").first();
    await expect(card).toBeVisible();
    await expect(card.locator(".freq-dot")).toHaveCount(7);
    await expect(card.locator(".freq-dot.is-on").first()).toBeVisible();
  });

  test("view toggle switches to Read mode and persists", async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /^read$/i }).click();
    await expect(page.locator(".prose").first()).toBeVisible();
    await expect(page.locator(".dash-snapshot")).toHaveCount(0);

    // Reload and check persistence.
    await page.reload();
    await expect(page.locator(".prose").first()).toBeVisible();
  });

  test("habit ring tap marks today done and updates UI", async ({ page }) => {
    await composePlan(page);
    const habitBtn = page.locator(".habit-card").first();
    await expect(habitBtn).toBeVisible();
    await expect(habitBtn).not.toHaveClass(/is-done/);

    await habitBtn.click();
    await expect(habitBtn).toHaveClass(/is-done/);

    // It persists to today's check-in — Today screen reflects it.
    await page.goto("/#/today");
    const checked = page.locator(".habit-check.is-done").first();
    await expect(checked).toBeVisible();
  });

  test("re-composing fires a second API call (uncached)", async ({ page }) => {
    const stats = await installMocks(page);
    await composePlan(page);
    expect(stats.planCalls).toBe(1);
    await page.getByRole("button", { name: /re-compose plan/i }).click();
    await page.waitForFunction(() => !!document.querySelector(".dash-snapshot"));
    expect(stats.planCalls).toBeGreaterThanOrEqual(2);
  });
});
