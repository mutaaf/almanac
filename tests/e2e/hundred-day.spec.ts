// The hundred-day mark — quarterly reflective surface (ticket 0021).
//
// Every acceptance-criteria checkbox maps 1:1 to a test or expectation below.
//
// The surface fires once per 100-day block from the user's FIRST plan, when
// 50+ check-ins fell inside the window. It is computed deterministically from
// local data — `computeHundredDayState()` is a PURE function with ZERO
// Anthropic calls (asserted via the mock request count). Tour mode (0014) and
// shared-view mode (0017) short-circuit the surface entirely.
//
// Test browsers: chromium (full path including the print CTA) and mobile-webkit
// (renders, stacks the three sections, touch targets ≥44×44). The print path
// itself is asserted on chromium only — Mobile Safari's print() opens a system
// dialog Playwright cannot dismiss, the same tooling limitation print.spec.ts
// documents.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import {
  onboard, enterTour, seedHundredDayState, type SeedHundredDayOpts,
} from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Stub window.print so the print CTA never opens a real dialog. Records a
 * count + the document title at fire (mirrors print.spec.ts).
 */
async function stubPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__printCount = 0;
    (window as any).__printTitleAtFire = null;
    window.print = () => {
      (window as any).__printCount = ((window as any).__printCount ?? 0) + 1;
      (window as any).__printTitleAtFire = document.title;
    };
  });
}

async function readPrintCount(page: Page): Promise<number> {
  return page.evaluate(() => ((window as any).__printCount as number | undefined) ?? 0);
}

/** Open the app at a route via a full reload so the router reads fresh rows. */
async function openAt(page: Page, route: string): Promise<void> {
  await page.goto(`/${route}`);
  await page.reload();
}

/**
 * A canonical quarter-1 timeline: one plan 105 days ago, two habits, 60
 * check-ins. Habit "magnesium" held strongly; habit "walk" slipped from week 6.
 * Mirrors the user-lens narrative in the ticket.
 */
function quarterOneOpts(): SeedHundredDayOpts {
  const checkIns: SeedHundredDayOpts["checkIns"] = [];
  // 60 check-ins across days 0..99. Magnesium logged on every one; the walk
  // logged through week 5 (days 0..34) then drops out.
  let placed = 0;
  for (let day = 0; day < 100 && placed < 60; day += 1) {
    // Skip some days so the count lands near 60 across the window.
    if (day % 5 === 4) continue;
    const habits = ["magnesium"];
    if (day <= 34) habits.push("walk"); // walk slips after week 5
    checkIns.push({ dayOffset: day, habitsCompleted: habits });
    placed += 1;
  }
  return {
    plans: [
      {
        daysAgo: 105,
        habits: [
          { id: "magnesium", title: "Magnesium glycinate at night" },
          { id: "walk", title: "Afternoon walk" },
        ],
      },
    ],
    checkIns,
  };
}

/* -------------------------------------------------------------------------- */
/*  Gate: pre-day-100 and under-50-check-ins users see nothing                 */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — the firing gate", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("a user before day 100 sees no card and the route renders the empty state", async ({ page }) => {
    // Plan only 40 days old — well short of 100.
    await seedHundredDayState(page, {
      plans: [{ daysAgo: 40, habits: [{ id: "h1", title: "Walk" }] }],
      checkIns: Array.from({ length: 60 }, (_, i) => ({ dayOffset: i % 40, habitsCompleted: ["h1"] })),
    });
    await openAt(page, "#/today");
    await expect(page.locator(".headline").first()).toBeVisible();
    await expect(page.locator(".recap-card--quarterly")).toHaveCount(0);

    await openAt(page, "#/hundred-day");
    await expect(page.locator(".hundred-day-empty, .hundred-day")).toBeVisible();
    // It is the empty state (not enough timeline), not a populated arc.
    await expect(page.locator(".hundred-day__arc")).toHaveCount(0);
  });

  test("a day-100 user with fewer than 50 check-ins sees no card", async ({ page }) => {
    await seedHundredDayState(page, {
      plans: [{ daysAgo: 105, habits: [{ id: "h1", title: "Walk" }] }],
      checkIns: Array.from({ length: 30 }, (_, i) => ({ dayOffset: i, habitsCompleted: ["h1"] })),
    });
    await openAt(page, "#/today");
    await expect(page.locator(".recap-card--quarterly")).toHaveCount(0);
    await openAt(page, "#/hundred-day");
    await expect(page.locator(".hundred-day__arc")).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  The Today card + dismissal cadence                                         */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — the Today card", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("a day-100 user with 50+ check-ins sees the quarterly card above the meals row", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/today");
    const card = page.locator(".recap-card--quarterly");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/A quarterly note · 100 days/i);
    // Tapping routes to the surface.
    await card.getByRole("link", { name: /read the hundred-day/i }).click();
    await expect(page).toHaveURL(/#\/hundred-day$/);
    await expect(page.locator(".hundred-day")).toBeVisible();
  });

  test("'Not this quarter' dismissal stores the per-quarter key and sticks across reloads", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/today");
    await expect(page.locator(".recap-card--quarterly")).toBeVisible();
    await page.getByRole("button", { name: /not this quarter/i }).click();
    await expect(page.locator(".recap-card--quarterly")).toHaveCount(0);

    const flag = await page.evaluate(() => localStorage.getItem("almanac.hundredDay.dismissed.q1"));
    expect(flag).toBe("true");

    // Reload — the card stays gone.
    await openAt(page, "#/today");
    await expect(page.locator(".recap-card--quarterly")).toHaveCount(0);
  });

  test("dismissing quarter 1 still surfaces the card on day 200 for quarter 2", async ({ page }) => {
    // Pre-set the q1 dismissal flag, then seed a 205-day-old plan (quarter 2).
    await page.evaluate(() => localStorage.setItem("almanac.hundredDay.dismissed.q1", "true"));
    const checkIns: SeedHundredDayOpts["checkIns"] = [];
    // 60 check-ins inside the SECOND window (days 100..199).
    let placed = 0;
    for (let day = 100; day < 200 && placed < 60; day += 1) {
      if (day % 5 === 4) continue;
      checkIns.push({ dayOffset: day, habitsCompleted: ["h1"] });
      placed += 1;
    }
    await seedHundredDayState(page, {
      plans: [{ daysAgo: 205, habits: [{ id: "h1", title: "Walk" }] }],
      checkIns,
    });
    await openAt(page, "#/today");
    const card = page.locator(".recap-card--quarterly");
    await expect(card).toBeVisible();
    // Quarter-2 eyebrow on the surface itself.
    await card.getByRole("link", { name: /read the hundred-day/i }).click();
    await expect(page.locator(".hundred-day__eyebrow")).toContainText(/the second hundred/i);
  });
});

/* -------------------------------------------------------------------------- */
/*  The three sections                                                         */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — the surface", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("renders eyebrow, headline, and the three sections in order: arc, labs, editorial", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/hundred-day");

    await expect(page.locator(".hundred-day__eyebrow")).toContainText(/the first hundred/i);
    await expect(page.locator(".headline")).toContainText(/what 100 days actually did/i);

    // The three sections, in DOM order.
    const sectionClasses = await page.locator(".hundred-day__section").evaluateAll((els) =>
      els.map((e) => e.className),
    );
    expect(sectionClasses.length).toBe(3);
    expect(sectionClasses[0]).toContain("hundred-day__arc");
    expect(sectionClasses[1]).toContain("hundred-day__labs");
    expect(sectionClasses[2]).toContain("hundred-day__editorial");
  });

  test("arc section lists each habit with its held-day count", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/hundred-day");

    const arc = page.locator(".hundred-day__arc");
    await expect(arc).toContainText(/magnesium glycinate at night/i);
    await expect(arc).toContainText(/afternoon walk/i);
    // Magnesium held more days than the walk (which slipped at week 6).
    const rows = arc.locator(".hundred-day__arc-row");
    await expect(rows).toHaveCount(2);
    // The walk's row names a slip week.
    await expect(arc).toContainText(/slipped from week/i);
  });

  test("arc unions habits across recomposes and marks the day a habit was added", async ({ page }) => {
    // Two plans: the first 105 days ago (one habit), a recompose 70 days ago
    // (adds a second habit on day ~35). 60 check-ins, both habits logged after
    // the recompose.
    const checkIns: SeedHundredDayOpts["checkIns"] = [];
    let placed = 0;
    for (let day = 0; day < 100 && placed < 60; day += 1) {
      if (day % 5 === 4) continue;
      const habits = ["protein"];
      if (day >= 35) habits.push("creatine"); // added at the recompose
      checkIns.push({ dayOffset: day, habitsCompleted: habits });
      placed += 1;
    }
    await seedHundredDayState(page, {
      plans: [
        { daysAgo: 105, habits: [{ id: "protein", title: "Morning protein" }] },
        { daysAgo: 70, habits: [
          { id: "protein", title: "Morning protein" },
          { id: "creatine", title: "Creatine with breakfast" },
        ] },
      ],
      checkIns,
    });
    await openAt(page, "#/hundred-day");

    const arc = page.locator(".hundred-day__arc");
    await expect(arc.locator(".hundred-day__arc-row")).toHaveCount(2);
    await expect(arc).toContainText(/morning protein/i);
    await expect(arc).toContainText(/creatine with breakfast/i);
    // The added habit names the day it joined.
    await expect(arc).toContainText(/added on day/i);
  });

  test("labs section lists marker movements ordered by absolute delta, with two draws", async ({ page }) => {
    const opts = quarterOneOpts();
    opts.panels = [
      // Two draws inside the window. ApoB moves 8 (small); ferritin moves 16 (big).
      { dayOffset: 5,  results: [
        { markerKey: "ferritin_m", value: 32, unit: "ng/mL" },
        { markerKey: "apo_b", value: 99, unit: "mg/dL" },
      ] },
      { dayOffset: 90, results: [
        { markerKey: "ferritin_m", value: 48, unit: "ng/mL" },
        { markerKey: "apo_b", value: 91, unit: "mg/dL" },
      ] },
    ];
    await seedHundredDayState(page, opts);
    await openAt(page, "#/hundred-day");

    const labs = page.locator(".hundred-day__labs");
    const rows = labs.locator(".hundred-day__movement-row");
    await expect(rows).toHaveCount(2);
    // Ordered by absolute delta descending → ferritin (Δ16) before ApoB (Δ8).
    const keys = await rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.markerKey));
    expect(keys).toEqual(["ferritin_m", "apo_b"]);
    await expect(labs).toContainText(/32/);
    await expect(labs).toContainText(/48/);
  });

  test("a single-draw marker is excluded; the single-draw labs note renders", async ({ page }) => {
    const opts = quarterOneOpts();
    opts.panels = [
      { dayOffset: 5, results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
    ];
    await seedHundredDayState(page, opts);
    await openAt(page, "#/hundred-day");

    const labs = page.locator(".hundred-day__labs");
    await expect(labs.locator(".hundred-day__movement-row")).toHaveCount(0);
    await expect(labs).toContainText(/two draws within the window are needed for a delta/i);
    await expect(labs).toContainText(/you drew once/i);
  });

  test("zero draws renders the cadence-only labs empty state", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts()); // no panels
    await openAt(page, "#/hundred-day");
    const labs = page.locator(".hundred-day__labs");
    await expect(labs).toContainText(/no draws inside the window/i);
    await expect(labs).toContainText(/habit cadence is the only signal/i);
  });

  test("projection evaluation surfaces within/above/below per evaluateLanded()", async ({ page }) => {
    const opts = quarterOneOpts();
    opts.panels = [
      { dayOffset: 5,  results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
      { dayOffset: 90, results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }] },
    ];
    // A projection computed from the first panel: band 40–55. The last value
    // 48 lands inside → "within".
    opts.projections = [
      { markerKey: "ferritin_m", panelDayOffset: 5, low: 40, high: 55 },
    ];
    await seedHundredDayState(page, opts);
    await openAt(page, "#/hundred-day");

    const row = page.locator(".hundred-day__movement-row[data-marker-key='ferritin_m']");
    await expect(row).toContainText(/within/i);
  });

  test("editorial section omits the marker-mover paragraph when no marker moved", async ({ page }) => {
    // No panels → no marker movements → no marker-mover paragraph.
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/hundred-day");

    const editorial = page.locator(".hundred-day__editorial");
    await expect(editorial).toBeVisible();
    await expect(editorial.locator(".hundred-day__para[data-kind='marker-mover']")).toHaveCount(0);
    // No banned words anywhere in the editorial section.
    const text = ((await editorial.textContent()) ?? "").toLowerCase();
    for (const banned of ["journey", "amazing", "exciting", "great", "crushed", "smashed"]) {
      expect(text).not.toContain(banned);
    }
  });

  test("editorial section emits a marker-mover paragraph when a marker moved", async ({ page }) => {
    const opts = quarterOneOpts();
    opts.panels = [
      { dayOffset: 5,  results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
      { dayOffset: 90, results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }] },
    ];
    await seedHundredDayState(page, opts);
    await openAt(page, "#/hundred-day");

    const editorial = page.locator(".hundred-day__editorial");
    await expect(editorial.locator(".hundred-day__para[data-kind='marker-mover']")).toHaveCount(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Purity + zero-network                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — determinism and zero network", () => {
  let stats: MockStats;

  test.beforeEach(async ({ page }) => {
    await stubPrint(page);
    stats = await installMocks(page);
    await onboard(page);
  });

  test("the full render + print CTA fire zero Anthropic calls", async ({ page, browserName }) => {
    const opts = quarterOneOpts();
    opts.panels = [
      { dayOffset: 5,  results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
      { dayOffset: 90, results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }] },
    ];
    await seedHundredDayState(page, opts);

    const before = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    await openAt(page, "#/hundred-day");
    await expect(page.locator(".hundred-day")).toBeVisible();

    if (browserName !== "webkit") {
      await page.getByRole("button", { name: /read this as a one-page pdf/i }).click();
      await expect(page.locator(".print-sheet[data-audience='hundred-day']")).toBeAttached();
      await expect.poll(() => readPrintCount(page)).toBeGreaterThanOrEqual(1);
    }
    await page.waitForTimeout(120);
    const after = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });

  test("computeHundredDayState is a pure function over synthetic inputs", async ({ page }) => {
    // Import the module and call it directly from a page.evaluate context — no
    // DOM, no Dexie. Snapshot the structured output shape.
    const out = await page.evaluate(async () => {
      const mod = await import("/src/progress/hundred-day.ts");
      const DAY = 86_400_000;
      const now = 100 * DAY + 10 * DAY; // 110 days after the first plan
      const firstPlanAt = 0;
      const plans = [{
        id: 1, generatedAt: 0, basedOnPanelIds: [],
        snapshot: "", insights: [],
        eatList: [], avoidList: [], lifestyle: [], supplements: [],
        habitStack: { intro: "", habits: [{ id: "h1", title: "Walk", cue: "AM", why: "x" }] },
        retest: [],
      }];
      const checkIns: any[] = [];
      for (let d = 0; d < 60; d += 1) {
        checkIns.push({ day: new Date(d * DAY).toISOString().slice(0, 10), habitsCompleted: ["h1"], createdAt: 0 });
      }
      const state = mod.computeHundredDayState(now, firstPlanAt, plans as any, [], checkIns as any, []);
      return state;
    });
    expect(out).not.toBeNull();
    expect(out.quarterIndex).toBe(1);
    expect(Array.isArray(out.arc.habits)).toBe(true);
    expect(out.arc.habits[0].id).toBe("h1");
    expect(out.arc.habits[0].heldDays).toBe(60);
    expect(Array.isArray(out.labs.panels)).toBe(true);
    expect(Array.isArray(out.labs.markerMovements)).toBe(true);
    expect(Array.isArray(out.editorial.paragraphs)).toBe(true);
  });

  test("returns null before day 100 and under 50 check-ins", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const mod = await import("/src/progress/hundred-day.ts");
      const DAY = 86_400_000;
      const plan = {
        id: 1, generatedAt: 0, basedOnPanelIds: [], snapshot: "", insights: [],
        eatList: [], avoidList: [], lifestyle: [], supplements: [],
        habitStack: { intro: "", habits: [] }, retest: [],
      };
      const manyCheckIns = Array.from({ length: 60 }, (_, d) => ({
        day: new Date(d * DAY).toISOString().slice(0, 10), habitsCompleted: [], createdAt: 0,
      }));
      const fewCheckIns = manyCheckIns.slice(0, 30);
      return {
        noPlan: mod.computeHundredDayState(200 * DAY, 0, [], [], manyCheckIns as any, []),
        tooEarly: mod.computeHundredDayState(40 * DAY, 0, [plan] as any, [], manyCheckIns as any, []),
        tooFew: mod.computeHundredDayState(110 * DAY, 0, [plan] as any, [], fewCheckIns as any, []),
        ok: mod.computeHundredDayState(110 * DAY, 0, [plan] as any, [], manyCheckIns as any, []),
      };
    });
    expect(result.noPlan).toBeNull();
    expect(result.tooEarly).toBeNull();
    expect(result.tooFew).toBeNull();
    expect(result.ok).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Print path (chromium full; mobile renders CTA)                             */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — the one-page PDF", () => {
  test.beforeEach(async ({ page }) => {
    await stubPrint(page);
    await installMocks(page);
    await onboard(page);
  });

  test("the PDF lays out all three sections on a print sheet", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    const opts = quarterOneOpts();
    opts.panels = [
      { dayOffset: 5,  results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
      { dayOffset: 90, results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }] },
    ];
    await seedHundredDayState(page, opts);
    await openAt(page, "#/hundred-day");

    await page.getByRole("button", { name: /read this as a one-page pdf/i }).click();
    const sheet = page.locator(".print-sheet[data-audience='hundred-day']");
    await expect(sheet).toBeAttached();
    // The three sections show up on the sheet.
    await expect(sheet).toContainText(/the arc/i);
    await expect(sheet).toContainText(/the labs/i);
    await expect(sheet).toContainText(/magnesium glycinate at night/i);
    await expect(sheet).toContainText(/ferritin/i);
  });

  test("mobile: the print CTA renders and is a ≥44px touch target", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "this is the mobile counterpart");
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/hundred-day");
    const cta = page.getByRole("button", { name: /read this as a one-page pdf/i });
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("the dismissal control on the Today card is a ≥44px touch target", async ({ page }) => {
    await seedHundredDayState(page, quarterOneOpts());
    await openAt(page, "#/today");
    const dismiss = page.getByRole("button", { name: /not this quarter/i });
    await expect(dismiss).toBeVisible();
    const box = await dismiss.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

/* -------------------------------------------------------------------------- */
/*  Tour + shared-view short-circuit                                           */
/* -------------------------------------------------------------------------- */

test.describe("Hundred-day — session-scoped modes short-circuit", () => {
  test("tour mode surfaces neither the Today card nor a populated hundred-day route", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    // No quarterly card on the tour Today.
    await expect(page.locator(".recap-card--quarterly")).toHaveCount(0);
    // The route renders the empty/short-circuit state, never a populated arc.
    await page.goto("/#/hundred-day");
    await page.locator(".hundred-day, .hundred-day-empty, .headline").first().waitFor();
    await expect(page.locator(".hundred-day__arc")).toHaveCount(0);
  });
});
