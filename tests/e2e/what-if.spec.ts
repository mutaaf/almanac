// What-if marker simulator (ticket 0019).
//
// The deterministic insight engine (src/insights.ts) is run twice — once on
// the live panel, once on a hypothetical panel where one or more marker values
// are dragged — and the Plan page re-renders the insights list with three diff
// states: still fires / would no longer fire / would newly fire. Nothing is
// persisted; no Anthropic call is made; the egress allow-list is untouched.
//
// Each test maps 1:1 to an acceptance-criteria checkbox in the ticket.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, addManualPanel, addIronPanel, composePlan, waitForDb,
  enterSimulation, dragSimulationSlider, seedPlanAndPanel,
} from "../helpers/flows";

/* ============================================================================
   Pure function — simulateInsights (exposed on window.__almanacSimulate)
   ============================================================================ */

test.describe("What-if simulator — pure simulateInsights", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("clones the panel, re-runs computeInsights, and returns a diff of rule ids", async ({ page }) => {
    // A male iron panel: ferritin 32 fires iron_restricted_erythropoiesis.
    // Drag ferritin to 250 → iron rule retires, inflammation_triad newly fires
    // (hs-CRP 1.5 was one signal short; ferritin > 200 is the second).
    const diff = await page.evaluate(() => {
      const w = window as unknown as {
        __almanacSimulate?: (panel: unknown, overrides: unknown) => {
          current: Array<{ id: string }>;
          hypothetical: Array<{ id: string }>;
          diff: { stillFires: string[]; wouldNoLongerFire: string[]; wouldNewlyFire: string[] };
        };
      };
      const panel = {
        drawnAt: "2026-05-01",
        source: "manual",
        createdAt: Date.now(),
        results: [
          { markerKey: "ferritin_m", value: 32, unit: "ng/mL" },
          { markerKey: "mcv", value: 86, unit: "fL" },
          { markerKey: "hs_crp", value: 1.5, unit: "mg/L" },
        ],
      };
      return w.__almanacSimulate!(panel, [{ markerKey: "ferritin_m", value: 250 }]);
    });

    expect(diff).not.toBeNull();
    expect(diff.diff.wouldNoLongerFire).toContain("iron_restricted_erythropoiesis");
    expect(diff.diff.wouldNewlyFire).toContain("inflammation_triad");
    // The current set fired the iron rule; the hypothetical set did not.
    expect(diff.current.map(i => i.id)).toContain("iron_restricted_erythropoiesis");
    expect(diff.hypothetical.map(i => i.id)).not.toContain("iron_restricted_erythropoiesis");
  });

  test("is pure — calling it twice never contaminates state and never persists", async ({ page }) => {
    await addIronPanel(page);
    // Snapshot the panels store before any simulation calls.
    const before = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("panels", "readonly");
          const all = tx.objectStore("panels").getAll();
          all.onsuccess = () => { db.close(); resolve(JSON.stringify(all.result)); };
        };
        req.onerror = () => resolve("");
      });
    });

    // Call simulateInsights twice with different overrides. The second call
    // must not see any mutation left by the first (no shared cache).
    const { a, b } = await page.evaluate(() => {
      const w = window as unknown as {
        __almanacSimulate?: (panel: unknown, overrides: unknown) => {
          hypothetical: Array<{ id: string }>;
        };
      };
      const panel = {
        drawnAt: "2026-05-01", source: "manual", createdAt: 1,
        results: [
          { markerKey: "ferritin_m", value: 32, unit: "ng/mL" },
          { markerKey: "mcv", value: 86, unit: "fL" },
          { markerKey: "hs_crp", value: 1.5, unit: "mg/L" },
        ],
      };
      const a = w.__almanacSimulate!(panel, [{ markerKey: "ferritin_m", value: 250 }]).hypothetical.map(i => i.id);
      const b = w.__almanacSimulate!(panel, [{ markerKey: "ferritin_m", value: 32 }]).hypothetical.map(i => i.id);
      return { a, b };
    });

    // First call retired the iron rule; second (back to 32) fires it again —
    // proving the first call did not mutate the shared input.
    expect(a).not.toContain("iron_restricted_erythropoiesis");
    expect(b).toContain("iron_restricted_erythropoiesis");

    const after = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("panels", "readonly");
          const all = tx.objectStore("panels").getAll();
          all.onsuccess = () => { db.close(); resolve(JSON.stringify(all.result)); };
        };
        req.onerror = () => resolve("");
      });
    });
    expect(after).toBe(before);
  });
});

/* ============================================================================
   The chip — "What if?" on every marker on the Plan page
   ============================================================================ */

test.describe("What-if simulator — the chip", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
  });

  test("every marker on the Plan page gains a keyboard-focusable What if? chip", async ({ page }) => {
    await composePlan(page);
    const chips = page.locator(".sim-chip");
    await expect(chips.first()).toBeVisible();
    // The supporting marker ferritin_m is on the page; its chip is present.
    const ferChip = page.locator(`.sim-chip[data-marker-key="ferritin_m"]`).first();
    await expect(ferChip).toBeVisible();
    await expect(ferChip).toHaveAttribute("role", "button");
    // Keyboard focusable — a real <button> (or tabindex=0) takes focus.
    await ferChip.focus();
    await expect(ferChip).toBeFocused();
  });

  test("the same marker rendered in two places shows the same chip label", async ({ page }) => {
    await composePlan(page);
    const labels = await page.locator(`.sim-chip[data-marker-key="ferritin_m"]`).allTextContents();
    expect(labels.length).toBeGreaterThanOrEqual(1);
    for (const l of labels) {
      expect(l.trim().toLowerCase()).toBe("what if?");
    }
  });
});

/* ============================================================================
   Single-marker drag — live re-render + diff badges
   ============================================================================ */

test.describe("What-if simulator — single-marker drag", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
    await composePlan(page);
  });

  test("entering simulation paints the header with current → dragged copy", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    const header = page.locator(".sim-header");
    await expect(header).toContainText(/simulating/i);
    // 75 is inside the [0.3×, 2.5×] window for a current value of 32 (max 80).
    await dragSimulationSlider(page, "ferritin_m", 75);
    await expect(header).toContainText("32");
    await expect(header).toContainText("75");
    await expect(header).toContainText(/insights? changed/i);
  });

  test("dragging ferritin up strikes through the iron card (would no longer fire)", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    // 75 > the male functional floor of 70 → the iron rule stops firing.
    await dragSimulationSlider(page, "ferritin_m", 75);
    const retired = page.locator(".insight--would-no-longer-fire");
    await expect(retired.first()).toBeVisible();
    await expect(retired.first()).toContainText(/would no longer fire/i);
  });

  test("re-rendering happens within 50ms of a slider input event", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    const elapsed = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>(
        '.sim-slider[data-marker-key="ferritin_m"] .sim-slider__input',
      )!;
      input.value = "250";
      const t0 = performance.now();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // The handler is synchronous; measure right after dispatch returns.
      const t1 = performance.now();
      return t1 - t0;
    });
    expect(elapsed).toBeLessThan(50);
    await expect(page.locator(".insight--would-no-longer-fire").first()).toBeVisible();
  });

  test("Keep my real value exits simulation and restores the original render", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 75);
    await expect(page.locator(".insight--would-no-longer-fire").first()).toBeVisible();

    await page.getByRole("button", { name: /keep my real value/i }).click();
    await expect(page.locator(".sim-header")).toHaveCount(0);
    await expect(page.locator(".insight--would-no-longer-fire")).toHaveCount(0);
    await expect(page.locator(".insight--would-newly-fire")).toHaveCount(0);
    // The plan body is back — the iron insight card renders normally.
    await expect(page.locator(".insight-card, .insight").first()).toBeVisible();
  });

  test("Reset to current snaps the slider back but keeps simulation mode active", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 75);
    await expect(page.locator(".insight--would-no-longer-fire").first()).toBeVisible();

    await page.getByRole("button", { name: /reset to current/i }).click();
    // Header still present (mode is active), but no diff (slider back at 32).
    await expect(page.locator(".sim-header")).toBeVisible();
    await expect(page.locator(".insight--would-no-longer-fire")).toHaveCount(0);
    const input = page.locator(`.sim-slider[data-marker-key="ferritin_m"] .sim-slider__input`);
    await expect(input).toHaveValue("32");
  });
});

/* ============================================================================
   would newly fire — dragging a marker past a threshold surfaces a fresh rule
   ============================================================================ */

test.describe("What-if simulator — would newly fire", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    // ferritin 90 (no iron rule) + hs-CRP 1.5 (one inflammation signal). Seeded
    // directly so the page renders the dashboard without a compose round-trip.
    await seedPlanAndPanel(page, [
      { markerKey: "ferritin_m", value: 90, unit: "ng/mL" },
      { markerKey: "hs_crp", value: 1.5, unit: "mg/L" },
    ], "ferritin_m");
  });

  test("dragging ferritin up past 200 surfaces a would-newly-fire inflammation card", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    // 220 is inside the [0.3×, 2.5×] window for a current value of 90 (max 225).
    await dragSimulationSlider(page, "ferritin_m", 220);
    const fresh = page.locator(".insight--would-newly-fire");
    await expect(fresh.first()).toBeVisible();
    await expect(fresh.first()).toContainText(/would newly fire/i);
    // The body carries the rule's gloss (re-used from 0013) — inflammation.
    await expect(fresh.first()).toContainText(/inflammation/i);
  });
});

/* ============================================================================
   Eat list / habit stack are NOT reactive
   ============================================================================ */

test.describe("What-if simulator — eat list stays put", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
    await composePlan(page);
  });

  test("the eat list does not re-render and shows the honest note", async ({ page }) => {
    const eatBefore = await page.locator(".dash-eats, .eat-item, .eat-card").first().innerText();
    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 75);

    // The note above the eat list / habit stack is present.
    await expect(page.locator(".sim-eat-note")).toContainText(
      /based on your real values\. close the simulation to see how they would shift/i,
    );
    // The eat list content is unchanged.
    const eatAfter = await page.locator(".dash-eats, .eat-item, .eat-card").first().innerText();
    expect(eatAfter).toBe(eatBefore);
  });
});

/* ============================================================================
   Zero Anthropic calls across an extended drag
   ============================================================================ */

test.describe("What-if simulator — zero network", () => {
  test("50 drag events fire zero Anthropic calls", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
    await composePlan(page);
    const before = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;

    await enterSimulation(page, "ferritin_m");
    // 50 distinct input events across the slider's range.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        '.sim-slider[data-marker-key="ferritin_m"] .sim-slider__input',
      )!;
      for (let i = 0; i < 50; i++) {
        input.value = String(20 + i * 5);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await expect(page.locator(".sim-header")).toBeVisible();

    const after = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });
});

/* ============================================================================
   The live plan is never written during simulation
   ============================================================================ */

test.describe("What-if simulator — live plan untouched", () => {
  test("db.latestPlan() is byte-identical before and after a simulation", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
    await composePlan(page);
    await waitForDb(page, "plans", (n) => n >= 1);

    const snapshot = async () => page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("plans", "readonly");
          const cur = tx.objectStore("plans").openCursor(null, "prev");
          cur.onsuccess = () => {
            const c = cur.result;
            db.close();
            resolve(c ? JSON.stringify(c.value) : "");
          };
          cur.onerror = () => { db.close(); resolve(""); };
        };
        req.onerror = () => resolve("");
      });
    });

    const before = await snapshot();
    expect(before).not.toBe("");

    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 75);
    await expect(page.locator(".insight--would-no-longer-fire").first()).toBeVisible();
    await page.getByRole("button", { name: /keep my real value/i }).click();
    await expect(page.locator(".sim-header")).toHaveCount(0);

    const after = await snapshot();
    expect(after).toBe(before);
  });
});

/* ============================================================================
   Multi-marker simulation — overrides stack
   ============================================================================ */

test.describe("What-if simulator — multi-marker", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronPanel(page);
    await composePlan(page);
  });

  test("a second marker stacks under the header and both overrides apply", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 60);
    // Now add a second marker.
    await enterSimulation(page, "mcv");
    await dragSimulationSlider(page, "mcv", 91);

    // Both sliders are present under the header.
    await expect(page.locator(`.sim-slider[data-marker-key="ferritin_m"]`)).toBeVisible();
    await expect(page.locator(`.sim-slider[data-marker-key="mcv"]`)).toBeVisible();
    // The header names both markers.
    const header = page.locator(".sim-header");
    await expect(header).toContainText(/ferritin/i);
    await expect(header).toContainText(/mcv/i);
    await expect(header).toContainText("60");
    await expect(header).toContainText("91");
  });

  test("closing one override removes only that override", async ({ page }) => {
    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 60);
    await enterSimulation(page, "mcv");
    await dragSimulationSlider(page, "mcv", 91);

    // Close just the ferritin override.
    await page.locator(`.sim-slider[data-marker-key="ferritin_m"] .sim-slider__close`).click();
    await expect(page.locator(`.sim-slider[data-marker-key="ferritin_m"]`)).toHaveCount(0);
    // MCV override survives; header still active.
    await expect(page.locator(`.sim-slider[data-marker-key="mcv"]`)).toBeVisible();
    await expect(page.locator(".sim-header")).toBeVisible();
  });
});

/* ============================================================================
   User-defined markers fall back to approximate bounds
   ============================================================================ */

test.describe("What-if simulator — user-defined marker", () => {
  test("a user marker with no range uses approximate bounds and notes it", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    // Seed a user-defined marker (no labRange), a panel that references it, and
    // a minimal composed plan — directly into IndexedDB so the page renders the
    // dashboard without a compose round-trip (deterministic + fast). The
    // lp_pla2 chip surfaces in the panel-summary block; entering simulation
    // shows the approximate-bounds note because the marker carries no range.
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["userMarkers", "panels", "plans"], "readwrite");
          tx.objectStore("userMarkers").put({
            key: "lp_pla2",
            name: "Lp-PLA2 Activity",
            shortName: "Lp-PLA2",
            category: "lipids",
            unit: "nmol/min/mL",
            aliases: ["lp-pla2", "lp pla2"],
            optimalRange: { high: 150 },
            description: "Specialty inflammation marker.",
            createdAt: Date.now(),
          });
          tx.objectStore("panels").add({
            id: 1,
            drawnAt: "2026-05-01",
            source: "manual",
            createdAt: Date.now(),
            results: [
              { markerKey: "ferritin_m", value: 32, unit: "ng/mL" },
              { markerKey: "mcv", value: 86, unit: "fL" },
              { markerKey: "lp_pla2", value: 200, unit: "nmol/min/mL" },
            ],
          });
          tx.objectStore("plans").add({
            generatedAt: Date.now(),
            basedOnPanelIds: [1],
            snapshot: "A seeded plan for the user-marker simulation test.",
            insights: [
              { markerKey: "ferritin_m", title: "Iron stores low", detail: "Below the functional floor.", priority: "high" },
            ],
            eatList: [],
            avoidList: [],
            lifestyle: [],
            supplements: [],
            habitStack: { intro: "Small actions.", habits: [] },
            retest: [],
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    });

    // Reload so the router reads the freshly-seeded plan + panel + marker, then
    // wait for the dashboard to paint.
    await page.goto("/#/plan");
    await page.reload();
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });

    // The user marker gets a chip in the panel-summary block.
    const chip = page.locator(`.sim-chip[data-marker-key="lp_pla2"]`).first();
    await expect(chip).toBeVisible();
    await enterSimulation(page, "lp_pla2");
    // The slider notes the approximate bounds for a user-defined marker.
    await expect(
      page.locator(`.sim-slider[data-marker-key="lp_pla2"]`),
    ).toContainText(/user-defined marker.*bounds are approximate/i);
  });
});

/* ============================================================================
   Trend rules carry the "after the next draw" temporal hedge
   ============================================================================ */

test.describe("What-if simulator — trend rules", () => {
  test("a trend rule diff reads 'after the next draw'", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });

    // Seed three ferritin draws — 100, 90, 95 — so the latest draw (95) BREAKS
    // the monotonic decline and `trending_down_ferritin` does NOT fire yet.
    // Dragging the current value down to 80 makes the last three (100, 90, 80)
    // a clean monotonic decline → the trend rule newly fires, and because it
    // is a TREND rule its badge carries the "after the next draw" temporal
    // hedge in the copy. A bare plan is seeded too so the page renders the
    // dashboard without a compose round-trip (deterministic + fast).
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["panels", "plans"], "readwrite");
          const store = tx.objectStore("panels");
          const mk = (drawnAt: string, value: number) => ({
            drawnAt, source: "manual", createdAt: Date.now(),
            results: [{ markerKey: "ferritin_m", value, unit: "ng/mL" }],
          });
          store.add(mk("2026-01-01", 100));
          store.add(mk("2026-02-01", 90));
          store.add(mk("2026-05-01", 95));
          tx.objectStore("plans").add({
            generatedAt: Date.now(), basedOnPanelIds: [],
            snapshot: "A seeded plan for the trend-rule simulation test.",
            insights: [{ markerKey: "ferritin_m", title: "Ferritin", detail: "Seeded.", priority: "high" }],
            eatList: [], avoidList: [], lifestyle: [], supplements: [],
            habitStack: { intro: "Small actions.", habits: [] }, retest: [],
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    });

    // Reload so the router reads the freshly-seeded panels + plan.
    await page.goto("/#/plan");
    await page.reload();
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });

    await enterSimulation(page, "ferritin_m");
    // 80 is inside the [0.3×, 2.5×] window for a current value of 95.
    await dragSimulationSlider(page, "ferritin_m", 80);
    // Whichever trend-rule card appears, its badge carries the temporal hedge.
    const trendBadge = page.locator(".insight--would-newly-fire, .insight--would-no-longer-fire")
      .filter({ hasText: /after the next draw/i });
    await expect(trendBadge.first()).toBeVisible();
  });
});

/* ============================================================================
   Provenance during simulation reflects the hypothetical value
   ============================================================================ */

test.describe("What-if simulator — provenance reflects hypothetical", () => {
  test("the would-newly-fire card's provenance value row reads the dragged number", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    // ferritin 90 (no iron rule) + hs-CRP 1.5 (one inflammation signal). Seeded
    // directly so the page renders the dashboard without a compose round-trip.
    await seedPlanAndPanel(page, [
      { markerKey: "ferritin_m", value: 90, unit: "ng/mL" },
      { markerKey: "hs_crp", value: 1.5, unit: "mg/L" },
    ], "ferritin_m");

    await enterSimulation(page, "ferritin_m");
    await dragSimulationSlider(page, "ferritin_m", 220);
    const fresh = page.locator(".insight--would-newly-fire").first();
    await expect(fresh).toBeVisible();

    // The would-newly-fire card carries a "Why this fired" provenance chip.
    const chip = fresh.locator(".insight__provenance-chip");
    await expect(chip).toBeVisible();
    await chip.click();
    const slideover = page.locator("aside.slideover");
    await expect(slideover).toBeVisible();
    // The supporting-marker value row reflects the HYPOTHETICAL ferritin (220),
    // not the live 90.
    const ferRow = slideover.locator(".provenance-markers__row").filter({ hasText: /ferritin/i });
    await expect(ferRow).toContainText("220");
    await expect(ferRow).not.toContainText(/\b90\b/);
  });
});

/* ============================================================================
   Default panel (no rules firing) — the chip still appears
   ============================================================================ */

test.describe("What-if simulator — chip on marker insights without rules", () => {
  test("chips appear on the standard cholesterol panel's markers too", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);
    // The default fixture insights cite total_cholesterol, triglycerides, etc.
    await expect(page.locator(`.sim-chip[data-marker-key="total_cholesterol"]`).first()).toBeVisible();
    await expect(page.locator(`.sim-chip[data-marker-key="triglycerides"]`).first()).toBeVisible();
  });
});
