// Compare — side-by-side draw comparison with shared-marker deltas (ticket 0009).
//
// One screen that answers the comparative question "did the thing I changed
// actually work?" — given two panels by id, render only their intersection
// of markers, the value on each draw, the delta, the percent change, the
// flag transition, and a per-row functional-range thermometer.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so the next reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, waitForDb } from "../helpers/flows";

/**
 * Save a manual-entry panel by filling the given marker keys with the given
 * values. Leaves the page on /labs?id=<n> once the row has committed.
 */
async function addPanelWith(
  page: Page,
  drawnAt: string,
  values: Array<[string, string]>,
): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", drawnAt);
  for (const [key, value] of values) {
    await page.locator(`.manual-row__input[data-key='${key}']`).fill(value);
  }
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  await expect(page.locator(".result__name").first()).toBeVisible();
}

/**
 * Read the two panel ids back from IndexedDB so the spec can build the
 * `?compare=A,B` URL without relying on the routing-side ordering of an
 * auto-derived id (Dexie autoincrement is monotonic, but reading it is
 * the honest thing to do — see addPanel / waitForPanelCommit pattern).
 */
async function panelIdsOldestFirst(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    return new Promise<number[]>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onerror   = () => resolve([]);
      req.onsuccess = () => {
        const db = req.result;
        const tx  = db.transaction("panels", "readonly");
        const all: { id: number; drawnAt: string }[] = [];
        const cur = tx.objectStore("panels").openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) {
            const v = c.value as { id: number; drawnAt: string };
            all.push({ id: v.id, drawnAt: v.drawnAt });
            c.continue();
          } else {
            db.close();
            all.sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
            resolve(all.map(r => r.id));
          }
        };
        cur.onerror = () => { db.close(); resolve([]); };
      };
    });
  });
}

/**
 * Seed a user-defined marker (ticket 0002) directly into Dexie so the spec
 * does not have to drive the unmatched-row UI. The compare page must show
 * user-defined markers when both panels carry them.
 */
async function seedUserMarker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("userMarkers", "readwrite");
        tx.objectStore("userMarkers").put({
          key: "lp_pla2_user",
          name: "Lp-PLA2 (user)",
          shortName: "Lp-PLA2",
          category: "cardio",
          unit: "nmol/min/mL",
          aliases: ["lp-pla2", "lp pla2"],
          labRange:     { high: 225 },
          optimalRange: { high: 150 },
          description: "User-defined.",
          createdAt: Date.now(),
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  });
}

/**
 * Append a Result for `markerKey` with `value` onto an existing panel,
 * directly via IndexedDB. Used to seed user-defined-marker rows without
 * relying on the manual-entry form (which only iterates the seed catalog).
 */
async function appendResultToPanel(
  page: Page,
  panelId: number,
  markerKey: string,
  value: number,
  unit: string,
  optimal: { low?: number; high?: number },
): Promise<void> {
  await page.evaluate(async (args) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("panels", "readwrite");
        const store = tx.objectStore("panels");
        const get = store.get(args.panelId);
        get.onsuccess = () => {
          const p = get.result as { results: any[] };
          const opt = args.optimal as { low?: number; high?: number };
          const inOpt =
            (opt.low  == null || args.value >= opt.low) &&
            (opt.high == null || args.value <= opt.high);
          p.results.push({
            markerKey: args.markerKey,
            value: args.value,
            unit: args.unit,
            optimalRange: opt,
            flag: inOpt ? "optimal" : "suboptimal",
          });
          store.put(p);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, { panelId, markerKey, value, unit, optimal });
}

test.describe("Compare draws", () => {
  test("picker → compare flow renders the comparison page", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    // Two panels with shared markers.
    await addPanelWith(page, "2026-02-01", [
      ["total_cholesterol", "244"],
      ["triglycerides",     "165"],
      ["apo_b",             "95"],
    ]);
    await addPanelWith(page, "2026-05-01", [
      ["total_cholesterol", "212"],
      ["triglycerides",     "120"],
      ["apo_b",             "78"],
    ]);
    await waitForDb(page, "panels", (n) => n >= 2);

    await page.goto("/#/progress");
    // Picker UI lives at the top of progress when no `compare` param is set.
    await expect(page.locator("#compare-earlier")).toBeVisible();
    await expect(page.locator("#compare-later")).toBeVisible();

    const [earlierId, laterId] = await panelIdsOldestFirst(page);
    await page.selectOption("#compare-earlier", String(earlierId));
    await page.selectOption("#compare-later",   String(laterId));
    await page.getByRole("button", { name: /^compare$/i }).click();

    await expect(page).toHaveURL(new RegExp(`#/progress\\?compare=${earlierId},${laterId}$`));
    // Header summarises the comparison: dates + count + improved/regressed tally.
    await expect(page.locator(".compare-summary")).toBeVisible();
    await expect(page.locator(".compare-summary")).toContainText("2026-02-01");
    await expect(page.locator(".compare-summary")).toContainText("2026-05-01");
    await expect(page.locator(".compare-summary")).toContainText("3 markers in common");
  });

  test("intersection-only: drops markers that aren't in both panels", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    // Earlier has chol + trig + vit_d; later has chol + trig + apo_b.
    // Intersection should be exactly { chol, trig } — vit_d and apo_b drop out.
    await addPanelWith(page, "2026-02-01", [
      ["total_cholesterol", "244"],
      ["triglycerides",     "165"],
      ["vit_d_25oh",        "28"],
    ]);
    await addPanelWith(page, "2026-05-01", [
      ["total_cholesterol", "212"],
      ["triglycerides",     "120"],
      ["apo_b",             "78"],
    ]);
    await waitForDb(page, "panels", (n) => n >= 2);

    const [earlierId, laterId] = await panelIdsOldestFirst(page);
    await page.goto(`/#/progress?compare=${earlierId},${laterId}`);

    await expect(page.locator(".compare-row")).toHaveCount(2);
    const rowNames = await page.locator(".compare-row__name").allTextContents();
    expect(rowNames).toEqual(expect.arrayContaining(["Total Cholesterol", "Triglycerides"]));
    // The non-shared markers must NOT appear in the comparison.
    for (const name of rowNames) {
      expect(name).not.toContain("Vitamin D");
      expect(name).not.toContain("ApoB");
    }
  });

  test("cross-boundary badges: improved (entered optimal) and regressed (exited optimal)", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    // ApoB optimal is <=80. 95 → 78 enters optimal: improved.
    // Triglycerides optimal is <=80. 65 → 110 exits optimal: regressed.
    await addPanelWith(page, "2026-02-01", [
      ["apo_b",         "95"],
      ["triglycerides", "65"],
    ]);
    await addPanelWith(page, "2026-05-01", [
      ["apo_b",         "78"],
      ["triglycerides", "110"],
    ]);
    await waitForDb(page, "panels", (n) => n >= 2);

    const [earlierId, laterId] = await panelIdsOldestFirst(page);
    await page.goto(`/#/progress?compare=${earlierId},${laterId}`);

    const apoRow = page.locator(".compare-row", { hasText: /Apolipoprotein B|ApoB/ });
    await expect(apoRow.locator(".compare-row__badge--improved")).toBeVisible();

    const trigRow = page.locator(".compare-row", { hasText: /Triglycerides/ });
    await expect(trigRow.locator(".compare-row__badge--regressed")).toBeVisible();

    // Header tallies match.
    await expect(page.locator(".compare-summary")).toContainText("1 improved, 1 regressed");
  });

  test("empty intersection renders the editorial empty state", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    await addPanelWith(page, "2026-02-01", [
      ["total_cholesterol", "244"],
    ]);
    await addPanelWith(page, "2026-05-01", [
      ["vit_d_25oh", "28"],
    ]);
    await waitForDb(page, "panels", (n) => n >= 2);

    const [earlierId, laterId] = await panelIdsOldestFirst(page);
    await page.goto(`/#/progress?compare=${earlierId},${laterId}`);

    await expect(page.locator(".compare-empty")).toBeVisible();
    await expect(page.locator(".compare-empty")).toContainText(/share no markers/i);
    // Back-to-picker link must point at the bare /progress route.
    await expect(page.getByRole("link", { name: /pick another pair/i })).toHaveAttribute("href", "#/progress");
  });

  test("user-defined markers (ticket 0002) compare when both panels carry them", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await seedUserMarker(page);

    await addPanelWith(page, "2026-02-01", [["apo_b", "95"]]);
    const [firstId] = await panelIdsOldestFirst(page);
    await appendResultToPanel(page, firstId!, "lp_pla2_user", 240, "nmol/min/mL", { high: 150 });

    await addPanelWith(page, "2026-05-01", [["apo_b", "78"]]);
    const ids = await panelIdsOldestFirst(page);
    const laterId = ids[1]!;
    await appendResultToPanel(page, laterId, "lp_pla2_user", 130, "nmol/min/mL", { high: 150 });

    await page.goto(`/#/progress?compare=${firstId},${laterId}`);
    await expect(page.locator(".compare-row", { hasText: /Lp-PLA2/ })).toBeVisible();
    // The user marker also crossed into optimal (240 → 130, with high=150) so
    // the badge logic must work for user markers too.
    await expect(
      page.locator(".compare-row", { hasText: /Lp-PLA2/ }).locator(".compare-row__badge--improved"),
    ).toBeVisible();
  });

  test("reversed input swaps earlier/later and shows the swap notice", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    await addPanelWith(page, "2026-02-01", [["apo_b", "95"]]);
    await addPanelWith(page, "2026-05-01", [["apo_b", "78"]]);
    await waitForDb(page, "panels", (n) => n >= 2);

    const [earlierId, laterId] = await panelIdsOldestFirst(page);
    // Pass the NEWER one as "earlier" — the page must swap and warn.
    await page.goto(`/#/progress?compare=${laterId},${earlierId}`);

    await expect(page.locator(".compare-swap-notice")).toBeVisible();
    // After the swap, the header still leads with the older date.
    await expect(page.locator(".compare-summary")).toContainText(/2026-02-01.+2026-05-01/);
  });

  test("zero Anthropic calls fire on the compare page", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);

    await addPanelWith(page, "2026-02-01", [["apo_b", "95"]]);
    await addPanelWith(page, "2026-05-01", [["apo_b", "78"]]);
    await waitForDb(page, "panels", (n) => n >= 2);

    const [earlierId, laterId] = await panelIdsOldestFirst(page);

    // Reset extract/plan/meals counters established by onboarding/test setup.
    const before = {
      extract: stats.extractCalls,
      plan:    stats.planCalls,
      meals:   stats.mealsCalls,
      swap:    stats.swapCalls,
    };

    await page.goto(`/#/progress?compare=${earlierId},${laterId}`);
    await expect(page.locator(".compare-row")).toHaveCount(1);
    // Linger a half-beat to catch any deferred fetch.
    await page.waitForTimeout(200);

    expect(stats.extractCalls).toBe(before.extract);
    expect(stats.planCalls).toBe(before.plan);
    expect(stats.mealsCalls).toBe(before.meals);
    expect(stats.swapCalls).toBe(before.swap);
  });
});
