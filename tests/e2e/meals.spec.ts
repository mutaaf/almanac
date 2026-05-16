// Meals — the 7-day plan + grocery list. Generation is mocked.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

// Local-date ISO — must match src/db.ts today(), NOT new Date().toISOString()
// (which would shift by a day across the UTC midnight boundary). The week
// stored by the meal generator is keyed off the local date.
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

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

/* ============================================================================
   Single-meal swap (ticket 0003)
   ============================================================================ */

test.describe("Meals · swap a single meal", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);

    // Generate the week so we land with a persisted MealPlan.
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);
  });

  test("day-detail dinner card exposes a Swap button distinct from re-roll", async ({ page }) => {
    // Open day 0's detail — that's today, the first patched cell.
    await page.goto(`/#/meals?day=${todayIso()}`);
    await expect(page.locator(".meal-detail")).toHaveCount(3);

    // One Swap button per meal in the detail view.
    const swapBtns = page.locator(".meal-detail [data-action='swap']");
    await expect(swapBtns).toHaveCount(3);

    // The week-level "Re-roll" button is still around and is NOT a Swap.
    await expect(page.getByRole("button", { name: /re-roll the week/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^swap$/i }).first()).toBeVisible();
  });

  test("swap fires a single SWAP_VOICE call, preserves the meal id, replaces only that slot", async ({ page }) => {
    const day0 = todayIso();

    // Capture every Anthropic request so we can prove exactly one swap call
    // fired and that its system message carried the SWAP_VOICE sentinel.
    const anthropicReqs: Array<{ url: string; system: string }> = [];
    page.on("request", (req) => {
      if (req.url().startsWith("https://api.anthropic.com/v1/messages")) {
        const body = req.postDataJSON() as { system?: Array<{ text: string }> };
        const sys = (body?.system ?? []).map((s) => s.text).join("\n");
        anthropicReqs.push({ url: req.url(), system: sys });
      }
    });

    await page.goto(`/#/meals?day=${day0}`);
    await expect(page.locator(".meal-detail")).toHaveCount(3);

    // Capture what the OTHER days look like before the swap so we can
    // assert byte-equality after.
    const day1 = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const tx = req.result.transaction("mealPlans", "readonly");
          const all = tx.objectStore("mealPlans").getAll();
          all.onsuccess = () => {
            const latest = (all.result as any[]).sort((a, b) => b.generatedAt - a.generatedAt)[0];
            // Return everything except day 0 (the one we're about to swap).
            resolve(latest.days.slice(1));
          };
        };
      });
    });

    // Tap Swap on day 0 dinner (the third meal-detail card).
    const dinnerSwap = page.locator(".meal-detail").nth(2).locator("[data-action='swap']");
    await dinnerSwap.click();

    // Wait for the re-render — the new title from swap.json is the marker.
    await expect(page.locator(".meal-detail__title", {
      hasText: /sardines on whole-grain toast/i,
    })).toBeVisible();

    // Exactly one swap-flavored Anthropic request should have fired.
    const swapReqs = anthropicReqs.filter((r) => r.system.includes("SWAP_VOICE"));
    expect(swapReqs).toHaveLength(1);
    // And no extra plan/meals calls beyond the ones from beforeEach setup.
    const planReqs  = anthropicReqs.filter((r) => r.system.includes("FOOD-FIRST"));
    const mealsReqs = anthropicReqs.filter((r) => r.system.includes("7-day meal plan"));
    // Inside this test body we only fired the one swap; setup calls live in
    // beforeEach and were issued before this listener attached.
    expect(planReqs).toHaveLength(0);
    expect(mealsReqs).toHaveLength(0);

    // Walk the persisted MealPlan: the slot kept its id, the other 6 days
    // are byte-identical, and the swapped meal is the new one.
    const persisted = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const tx = req.result.transaction("mealPlans", "readonly");
          const all = tx.objectStore("mealPlans").getAll();
          all.onsuccess = () => {
            const rows = (all.result as any[]).sort((a, b) => b.generatedAt - a.generatedAt);
            resolve(rows[0]);
          };
        };
      });
    });

    expect(persisted.days[0].dinner.id).toBe("d0-d");
    expect(persisted.days[0].dinner.title).toMatch(/sardines on whole-grain toast/i);

    // Days 1..6 must match what they were before the swap, exactly.
    expect(persisted.days.slice(1)).toEqual(day1);
  });

  test("grocery rebuild: unique-to-original removed, unique-to-new added", async ({ page }) => {
    const day0 = todayIso();
    await page.goto(`/#/meals?day=${day0}`);
    await page.locator(".meal-detail").nth(2).locator("[data-action='swap']").click();
    await expect(page.locator(".meal-detail__title", {
      hasText: /sardines on whole-grain toast/i,
    })).toBeVisible();

    // Open the rebuilt grocery list.
    await page.goto("/#/meals?grocery=1");

    const allItems = await page.locator(".grocery__name").allTextContents();
    const joined = allItems.join(" | ").toLowerCase();

    // "Swiss chard" was unique to the original d0-d (d4-l carries plain
    // "chard"). It must be gone from the grocery list.
    expect(joined).not.toMatch(/swiss chard/);

    // "fresh dill" was introduced by the swap fixture and appears in no
    // other meal in the week. It must appear in the rebuilt list.
    expect(joined).toMatch(/fresh dill/);
  });

  test("telemetry records a swap CallRecord with cacheReadTokens > inputTokens", async ({ page }) => {
    await page.goto(`/#/meals?day=${todayIso()}`);
    await page.locator(".meal-detail").nth(2).locator("[data-action='swap']").click();
    await expect(page.locator(".meal-detail__title", {
      hasText: /sardines on whole-grain toast/i,
    })).toBeVisible();

    await page.goto("/#/settings");
    await page.locator("summary").getByText(/recent calls/i).click();

    // The recent-calls table has a row whose Kind cell reads "swap".
    const swapRow = page.locator(".telem-table tbody tr").filter({ hasText: /swap/ });
    await expect(swapRow.first()).toBeVisible();

    // Pull the row's numbers out of the DOM and verify cacheRead > input.
    // Column order from settings.ts: When | Kind | Model | Input | CacheWrite | CacheRead | Output | Stop
    const cells = await swapRow.first().locator("td").allTextContents();
    const input     = parseInt(cells[3]!.replace(/[^\d]/g, ""), 10);
    const cacheRead = parseInt(cells[5]!.replace(/[^\d]/g, ""), 10);
    expect(cacheRead).toBeGreaterThan(input);
  });

  test("network failure surfaces errorCard() and leaves the original meal intact", async ({ page }) => {
    // Override the route just for this test: any SWAP_VOICE call errors out.
    await page.route("**/v1/messages", async (route, request) => {
      const body = request.postDataJSON() as { system?: Array<{ text: string }> };
      const sys = (body?.system ?? []).map((s) => s.text).join("\n");
      if (sys.includes("SWAP_VOICE")) {
        await route.abort("internetdisconnected");
        return;
      }
      await route.fallback();
    });

    const day0 = todayIso();
    await page.goto(`/#/meals?day=${day0}`);

    // The original dinner title — captured before the click.
    const originalTitle = await page.locator(".meal-detail").nth(2).locator(".meal-detail__title").textContent();
    expect(originalTitle).toMatch(/salmon/i);

    await page.locator(".meal-detail").nth(2).locator("[data-action='swap']").click();

    // errorCard() should render.
    await expect(page.locator(".error-card")).toBeVisible();

    // And the original meal still reads "salmon", not the swap-fixture title.
    await expect(page.locator(".meal-detail").nth(2).locator(".meal-detail__title"))
      .toHaveText(originalTitle ?? "");
  });
});
