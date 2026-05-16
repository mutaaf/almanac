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

/* ============================================================================
   Per-marker "Why is this a problem?" slideover (ticket 0006)
   ============================================================================
   The chevron on each insight card opens a local slideover. No route change,
   no API call. Three sections: The marker / Your trajectory / How to move it.
*/
test.describe("Plan — Why slideover", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
  });

  test("every insight with a markerKey renders a Why affordance with accessible label", async ({ page }) => {
    await composePlan(page);
    // The fixture's high-priority insight cites total_cholesterol -> shortName
    // is undefined so accessible label uses the full name.
    const whyBtn = page.getByRole("button", { name: /read why total cholesterol is on the list/i });
    await expect(whyBtn).toBeVisible();
    // The triglycerides insight gets its own chevron too.
    await expect(page.getByRole("button", { name: /read why triglycerides is on the list/i })).toBeVisible();
  });

  test("tapping the Why chevron opens a slideover without changing the route", async ({ page }) => {
    await composePlan(page);
    const hashBefore = await page.evaluate(() => location.hash);
    // Spy on history.pushState — must not fire from the slideover open.
    await page.evaluate(() => {
      (window as any).__pushCount = 0;
      const orig = history.pushState.bind(history);
      history.pushState = (...args: any[]) => {
        (window as any).__pushCount++;
        return orig(args[0], args[1], args[2]);
      };
    });

    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    await expect(page.locator("aside.slideover")).toBeVisible();

    const hashAfter = await page.evaluate(() => location.hash);
    expect(hashAfter).toBe(hashBefore);
    const pushCount = await page.evaluate(() => (window as any).__pushCount as number);
    expect(pushCount).toBe(0);
  });

  test("slideover renders three sections in order with the expected headings", async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    const headings = await page.locator("aside.slideover section h2, aside.slideover section h3").allTextContents();
    expect(headings).toEqual(["The marker", "Your trajectory", "How to move it"]);
  });

  test('"The marker" section renders the marker DB description verbatim', async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    // From src/data/markers.ts — must match exactly.
    const expected = "Total minus HDL is the better marker; the absolute number matters less than ApoB and the LDL/HDL particle picture.";
    await expect(page.locator("aside.slideover .slideover__marker-desc")).toHaveText(expected);
  });

  test('"Your trajectory" with a single reading shows the one-reading fallback + labs link', async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    const fallback = page.locator("aside.slideover .slideover__trajectory");
    await expect(fallback).toContainText(/only one reading on file/i);
    await expect(fallback.locator("a[href='#/labs']")).toBeVisible();
  });

  test('"Your trajectory" lists newest-to-oldest, max 6 rows when multiple panels exist', async ({ page }) => {
    // Add 6 more panels with steadily-declining total_cholesterol so we have
    // 7 readings total — the slideover must show only the most recent 6.
    const dates = ["2026-04-15", "2026-03-15", "2026-02-15", "2026-01-15", "2025-12-15", "2025-11-15"];
    const values = ["232", "228", "220", "215", "210", "205"];
    for (let i = 0; i < dates.length; i++) {
      await page.goto("/#/labs?manual=1");
      await page.locator("#drawnAt").waitFor({ state: "visible" });
      await page.fill("#drawnAt", dates[i]!);
      await page.fill("#labName", `Earlier draw ${i + 1}`);
      await page.locator(".manual-row__input[data-key='total_cholesterol']").fill(values[i]!);
      await page.getByRole("button", { name: /^save panel$/i }).click();
      await page.locator(".result__name").first().waitFor();
    }

    await composePlan(page);
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    const rows = page.locator("aside.slideover .slideover__trajectory-row");
    await expect(rows).toHaveCount(6);
    // First row is the newest reading (244 from the original manual panel on 2026-05-01).
    await expect(rows.first()).toContainText("244");
    await expect(rows.first()).toContainText("2026-05-01");
    // Last row is the 6th-newest — 210 from 2025-12-15. The 7th-oldest (205)
    // is dropped per the "≤6 rows" cap.
    await expect(rows.last()).toContainText("210");
    await expect(rows.last()).toContainText("2025-12-15");
  });

  test('"How to move it" lists matching eat items + supplements as tap-targets that scroll', async ({ page }) => {
    await composePlan(page);
    // total_cholesterol matches the "soluble-fiber" eat card (markerKeys includes total_cholesterol).
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    const targets = page.locator("aside.slideover .slideover__move button[data-target]");
    await expect(targets.first()).toBeVisible();
    const labels = await targets.allTextContents();
    expect(labels.some(l => /soluble fiber/i.test(l))).toBe(true);

    // Clicking a target closes the slideover and scrolls the matching card into view.
    await targets.first().click();
    await expect(page.locator("aside.slideover")).toHaveCount(0);
  });

  test('"How to move it" also surfaces matching supplement Recommendations', async ({ page }) => {
    await composePlan(page);
    // vit_d_25oh is on the medium-priority insight; supplement vit-d3 lists vit_d_25oh in markerKeys.
    await page.getByRole("button", { name: /read why vitamin d.*on the list/i }).click();
    await expect(
      page.locator("aside.slideover .slideover__move button[data-target]")
        .filter({ hasText: /vitamin d3/i })
    ).toBeVisible();
  });

  test("slideover closes on Escape and returns focus to the originating chevron", async ({ page }) => {
    await composePlan(page);
    const chevron = page.getByRole("button", { name: /read why total cholesterol is on the list/i });
    await chevron.focus();
    await chevron.click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("aside.slideover")).toHaveCount(0);
    const focusedLabel = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-label") ?? "");
    expect(focusedLabel).toMatch(/read why total cholesterol is on the list/i);
  });

  test("slideover closes on backdrop tap and on the close button", async ({ page }) => {
    await composePlan(page);
    const chevron = page.getByRole("button", { name: /read why total cholesterol is on the list/i });
    await chevron.click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await page.locator(".slideover-backdrop").click({ position: { x: 10, y: 10 } });
    await expect(page.locator("aside.slideover")).toHaveCount(0);

    // Now via the close button.
    await chevron.click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await page.locator("aside.slideover .slideover__close").click();
    await expect(page.locator("aside.slideover")).toHaveCount(0);
  });

  test("open/close fires zero new Anthropic calls", async ({ page }) => {
    const stats = await installMocks(page);
    await composePlan(page);
    const before = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    const chevron = page.getByRole("button", { name: /read why total cholesterol is on the list/i });
    await chevron.click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("aside.slideover")).toHaveCount(0);
    const after = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });

  test("variant: mobile enters from bottom and is ≥60vh; desktop enters from right", async ({ page, isMobile }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /read why total cholesterol is on the list/i }).click();
    const slideover = page.locator("aside.slideover");
    await expect(slideover).toBeVisible();
    if (isMobile) {
      await expect(slideover).toHaveClass(/slideover--from-bottom/);
      const box = await slideover.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      // ≥60vh in height.
      expect(box!.height).toBeGreaterThanOrEqual(viewport!.height * 0.6 - 1);
    } else {
      await expect(slideover).toHaveClass(/slideover--from-right/);
    }
  });
});
