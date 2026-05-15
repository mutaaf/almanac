// WebKit timing hardening — locks in the fix described in ticket 0005.
//
// The bug we're guarding against: in Mobile Safari, two things race after
// `compose()` finishes saving a Plan to IndexedDB.
//
//   1. The compose handler used to do
//        location.hash = "#/plan"; void renderPlan();
//      but if the hash is already "#/plan", WebKit does not fire `hashchange`,
//      so the only thing that paints is the (already in-flight) renderPlan().
//      That renderPlan() can fire its `latestPlan()` read BEFORE the Dexie
//      transaction is durably readable on WebKit, and the page would show
//      the empty state instead of the freshly-composed plan.
//   2. The composePlan test helper masked this with a `page.reload()` after
//      the click, which made the read deterministic but also hid the bug
//      from the suite.
//
// This spec asserts the deterministic-read behavior directly: compose the
// plan, then assert that BOTH IndexedDB and the rendered DOM show the
// freshly-composed plan — all WITHOUT any reload, on both projects.
//
// If either project regresses on this contract, this test fails.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

/**
 * Read the latest Plan row out of the live IndexedDB inside the page.
 * Returns the id of the most recent row, or null if no rows yet.
 *
 * We open a fresh connection (`almanac`) and use a raw read transaction
 * rather than going through Dexie so this is timing-equivalent to what
 * any consumer outside the SPA's connection would see.
 */
async function latestPlanIdInDb(page: Page): Promise<number | null> {
  return page.evaluate<number | null>(() => {
    return new Promise<number | null>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("plans")) { db.close(); resolve(null); return; }
        const tx = db.transaction("plans", "readonly");
        const store = tx.objectStore("plans");
        const all = store.getAll();
        all.onerror = () => { db.close(); resolve(null); };
        all.onsuccess = () => {
          const rows = (all.result as Array<{ id: number; generatedAt: number }>) ?? [];
          if (!rows.length) { db.close(); resolve(null); return; }
          rows.sort((a, b) => b.generatedAt - a.generatedAt);
          db.close();
          resolve(rows[0]?.id ?? null);
        };
      };
    });
  });
}

test.describe("WebKit hardening", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
  });

  test("compose() makes the new Plan readable on the very next render — no reload", async ({ page }) => {
    await page.goto("/#/plan");
    await page.locator(".eyebrow").waitFor();

    // Sanity: no Plan exists yet.
    expect(await latestPlanIdInDb(page)).toBeNull();

    // Click Compose. The button is on the empty-state page.
    await page.getByRole("button", { name: /^compose the plan$/i }).click();

    // The contract: after the click resolves the dashboard renders without
    // any reload and without any explicit wait beyond Playwright's default
    // auto-wait — and the Plan row is in IndexedDB by the time we see it.
    await expect(page.locator(".dash-snapshot")).toBeVisible({ timeout: 30_000 });

    const planId = await latestPlanIdInDb(page);
    expect(planId, "Plan row should be readable from IndexedDB once compose() resolves").not.toBeNull();
    expect(planId).toBeGreaterThan(0);

    // The rendered dashboard reflects it — no second click, no reload.
    await expect(page.locator(".view-toggle__opt.is-active")).toHaveText(/dashboard/i);
    await expect(page.locator(".hero-card").first()).toBeVisible();
  });

  test("composePlan helper lands on dashboard with the plan in DB, no reload trick required", async ({ page }) => {
    // Same contract, but through the shared helper — every test that uses
    // composePlan inherits this deterministic-read guarantee.
    await composePlan(page);

    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible();
    const planId = await latestPlanIdInDb(page);
    expect(planId, "composePlan() must leave the page with a readable Plan row").not.toBeNull();
  });
});
