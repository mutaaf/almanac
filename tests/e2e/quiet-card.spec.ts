// Quiet-day card on Today (ticket 0015).
//
// On Monday–Saturday the Today screen leads with a single editorial card that
// surfaces the most useful between-cadence note about the user's actual state.
// Three rule kinds, with a strict precedence order:
//
//   adherence-at-risk > projection-window > meal-skipped-pattern
//
// On Sundays the existing recap card (ticket 0008) takes precedence and the
// quiet card is suppressed entirely. The card composes entirely from local
// data — no Anthropic call, no schema migration, no new egress.
//
// Each top-level `test` maps to an acceptance-criteria checkbox on the ticket
// so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan, enterTour } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Time control                                                              */
/* -------------------------------------------------------------------------- */

// Local-noon avoids the DST / timezone edge of midnight when getDay() could
// flip across the date boundary. The card renderer reads `Date.now()` for the
// "is today Sunday" decision and the dismissal localStorage key, so a fixed
// noon-local time is the safe pin.
function localNoon(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0);
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Wednesday May 20 2026 — the canonical "non-Sunday, mid-week" anchor for
// most of this spec. Same anchor as the projection spec for consistency.
const WED_2026_05_20 = localNoon(2026, 5, 20);

// Sunday May 17 2026 — used for the Sunday-precedence test.
const SUN_2026_05_17 = localNoon(2026, 5, 17);

/* -------------------------------------------------------------------------- */
/*  Habit ids that match plan.json fixture (same ids used by recap + project) */
/* -------------------------------------------------------------------------- */

const H = {
  oats: "h-oats", walk: "h-walk", sun: "h-sun", d3: "h-d3", water: "h-water",
} as const;

/* -------------------------------------------------------------------------- */
/*  Direct IndexedDB seeders                                                  */
/* -------------------------------------------------------------------------- */

interface SeedCheckIn {
  day: string;
  habitsCompleted: string[];
  mealsAte?: string[];
}

// Replace whatever is in the `checkins` store with these rows.
async function seedCheckIns(page: Page, rows: SeedCheckIn[]): Promise<void> {
  await page.evaluate((seeded: SeedCheckIn[]) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("checkins")) {
          db.close(); resolve(); return;
        }
        const tx = db.transaction("checkins", "readwrite");
        const store = tx.objectStore("checkins");
        const clear = store.clear();
        clear.onsuccess = () => {
          for (const row of seeded) {
            store.add({ ...row, createdAt: Date.now() });
          }
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, rows);
}

interface SeedProjection {
  markerKey: string;
  panelId: number;
  low: number;
  high: number;
  weeksOut: [number, number];
  /** Days ago (relative to wall clock at write time). The createdAt anchor
   *  controls whether "today" falls in the [weeksOut[0], weeksOut[1]] window. */
  createdDaysAgo: number;
}

async function seedProjections(page: Page, rows: SeedProjection[]): Promise<void> {
  await page.evaluate((seeded: SeedProjection[]) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projections")) {
          db.close(); resolve(); return;
        }
        const tx = db.transaction("projections", "readwrite");
        const store = tx.objectStore("projections");
        const clear = store.clear();
        clear.onsuccess = () => {
          const now = Date.now();
          for (const r of seeded) {
            store.add({
              markerKey: r.markerKey,
              panelId: r.panelId,
              low: r.low,
              high: r.high,
              weeksOut: r.weeksOut,
              createdAt: now - r.createdDaysAgo * 86400_000,
            });
          }
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, rows);
}

async function panelIdsOldestFirst(page: Page): Promise<number[]> {
  return page.evaluate(() => {
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

/* -------------------------------------------------------------------------- */
/*  Adherence-at-risk seed: oats held 4/14, recent 7d (3 skipped) worse than  */
/*  prior 7d (4 skipped). 4 < ceil(0.5 * 14) = 7, and the latest-7-skip count */
/*  (3) > prior-7-skip count (3)... we need the most-recent 7 to be strictly  */
/*  WORSE than the prior 7 (more skipped days). Build the matrix accordingly. */
/* -------------------------------------------------------------------------- */

/**
 * Returns 14 days of check-ins anchored to `today`, with the "oats" habit held
 * on the days listed in `oatsDaysAgo` (numbers are days-ago from today, 0..13).
 * Every day gets a check-in row so daysWithoutCheckIn isn't a confounder.
 */
function adherenceMatrix(today: Date, oatsDaysAgo: number[]): SeedCheckIn[] {
  const set = new Set(oatsDaysAgo);
  const rows: SeedCheckIn[] = [];
  for (let d = 0; d < 14; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    rows.push({
      day: isoLocal(dt),
      habitsCompleted: set.has(d) ? [H.oats] : [],
    });
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Shared setup                                                              */
/* -------------------------------------------------------------------------- */

async function setupOnWed(page: Page): Promise<MockStats> {
  await page.clock.setFixedTime(WED_2026_05_20);
  const stats = await installMocks(page);
  await onboard(page);
  await addManualPanel(page);
  await composePlan(page);
  return stats;
}

async function generateMealPlan(page: Page): Promise<void> {
  await page.goto("/#/meals");
  await page.getByRole("button", { name: /generate the week/i }).click();
  await expect(page.locator(".day-strip__cell")).toHaveCount(7);
}

/* ========================================================================== */
/*  Empty state — no card on a fresh slate                                    */
/* ========================================================================== */

test.describe("Quiet card · empty state", () => {
  test("no adherence concerns, no projections, no meal pattern → card omitted", async ({ page }) => {
    await setupOnWed(page);
    // Hold every habit every day in the 14-day window so adherence is unimpeachable.
    const rows: SeedCheckIn[] = [];
    for (let d = 0; d < 14; d++) {
      const dt = new Date(WED_2026_05_20);
      dt.setDate(WED_2026_05_20.getDate() - d);
      rows.push({ day: isoLocal(dt), habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water] });
    }
    await seedCheckIns(page, rows);

    await page.goto("/#/today");
    // The Today page must paint (habits are the sentinel).
    await expect(page.locator(".habit-check").first()).toBeVisible();
    // The quiet card carries its own class so the test reads as the absence
    // of the card, not the absence of all editorial elements.
    await expect(page.locator(".recap-card--quiet")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Adherence-at-risk fires + CTA scrolls to habits                           */
/* ========================================================================== */

test.describe("Quiet card · adherence-at-risk", () => {
  test("fires when a habit is below threshold AND recent 7d is worse than prior 7d", async ({ page }) => {
    await setupOnWed(page);
    // Oats held on 4 of the 14 days. Prior 7d (days 7..13 ago): oats on day 9, 11, 13 → 3 hits, 4 skips.
    // Recent 7d (days 0..6 ago): oats on day 5 → 1 hit, 6 skips. Recent (6) > prior (4) → worse.
    await seedCheckIns(page, adherenceMatrix(WED_2026_05_20, [5, 9, 11, 13]));

    await page.goto("/#/today");
    const card = page.locator(".recap-card--quiet");
    await expect(card).toBeVisible();
    // The card eyebrow reads "A note for today".
    await expect(card.locator(".recap-card__eyebrow")).toContainText(/a note for today/i);
    // The headline names the habit by its plan-fixture title ("1/2 cup oats with breakfast").
    await expect(card).toContainText(/oats with breakfast/i);
    // The CTA reads "Open habits" — not "Click here".
    const cta = card.locator("a, button", { hasText: /open habits/i });
    await expect(cta).toBeVisible();

    // The habit stack section carries `data-scroll="habits"` so the CTA can
    // find it. Sanity-check the attribute is present on the page.
    await expect(page.locator("[data-scroll='habits']")).toHaveCount(1);
  });
});

/* ========================================================================== */
/*  Projection-window fires + CTA routes to plan                              */
/* ========================================================================== */

test.describe("Quiet card · projection-window", () => {
  test("fires when today falls inside [weeksOut[0], weeksOut[1]] window", async ({ page }) => {
    await setupOnWed(page);
    // Adherence is fine — no adherence-at-risk note should fire and beat us.
    const rows: SeedCheckIn[] = [];
    for (let d = 0; d < 14; d++) {
      const dt = new Date(WED_2026_05_20);
      dt.setDate(WED_2026_05_20.getDate() - d);
      rows.push({ day: isoLocal(dt), habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water] });
    }
    await seedCheckIns(page, rows);

    // Find the panel id we just composed against.
    const panelIds = await panelIdsOldestFirst(page);
    expect(panelIds.length).toBeGreaterThan(0);
    const latestPanelId = panelIds[panelIds.length - 1]!;

    // Ferritin snapshot created 70 days ago with a window of [8, 12] weeks
    // (56..84 days). 70 days falls squarely inside that window.
    await seedProjections(page, [
      {
        markerKey: "ferritin_m",
        panelId: latestPanelId,
        low: 50, high: 80,
        weeksOut: [8, 12],
        createdDaysAgo: 70,
      },
    ]);

    await page.goto("/#/today");
    const card = page.locator(".recap-card--quiet");
    await expect(card).toBeVisible();
    // The headline names the marker.
    await expect(card).toContainText(/ferritin/i);
    // The body says "Your next draw would be the first useful one".
    await expect(card).toContainText(/first useful one/i);
    // The CTA reads "Plan a retest" and routes to #/plan.
    const cta = card.locator("a", { hasText: /plan a retest/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /#\/plan/);
  });

  test("does NOT fire when today is before the window opens", async ({ page }) => {
    await setupOnWed(page);
    const rows: SeedCheckIn[] = [];
    for (let d = 0; d < 14; d++) {
      const dt = new Date(WED_2026_05_20);
      dt.setDate(WED_2026_05_20.getDate() - d);
      rows.push({ day: isoLocal(dt), habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water] });
    }
    await seedCheckIns(page, rows);
    const panelIds = await panelIdsOldestFirst(page);
    const latestPanelId = panelIds[panelIds.length - 1]!;
    // Window opens at 8 weeks (56 days); we're only 14 days in.
    await seedProjections(page, [{
      markerKey: "ferritin_m", panelId: latestPanelId,
      low: 50, high: 80, weeksOut: [8, 12], createdDaysAgo: 14,
    }]);
    await page.goto("/#/today");
    await expect(page.locator(".habit-check").first()).toBeVisible();
    await expect(page.locator(".recap-card--quiet")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Meal-skipped-pattern fires + CTA routes to the right meal day             */
/* ========================================================================== */

test.describe("Quiet card · meal-skipped-pattern", () => {
  test("fires when the same slot on the same weekday slipped two weeks running", async ({ page }) => {
    await setupOnWed(page);
    await generateMealPlan(page);

    // Build 14 days of check-ins with the SAME-DAY-OF-WEEK breakfast skipped
    // two weeks running. The meal plan's weekStart is today (Wed May 20). The
    // day-of-week math (today.getDay()) is what the card uses.
    //
    // Today is Wed 5/20. The meal plan's days[0] is today; days[7-of-the-week
    // wraps] — actually the meal plan only spans 7 days starting today, so
    // "two consecutive weeks" requires a second meal plan or a clever match
    // against the SAME-DAY-OF-WEEK in the upcoming plan window. Per the
    // engineering notes the rule reads the current meal plan's slot + the
    // weekday and asks whether the same slot was eaten on the matching
    // weekday across the two weeks PRIOR to today, where the slot id under
    // examination is the upcoming-week-occurrence in the meal plan.
    //
    // Concretely: today's mealPlan has a Thursday breakfast (the day after
    // today). The card asks: did the user eat that meal's id on the last two
    // Thursdays' check-ins? If neither week shows the id in `mealsAte`, fire.
    //
    // Seed: 14 days of check-ins with `mealsAte` deliberately empty on the
    // last two Thursdays (which would be 13 and 6 days ago from Wed 5/20),
    // ate other meals on every other day so the rule has data to read.
    const rows: SeedCheckIn[] = [];
    for (let d = 0; d < 14; d++) {
      const dt = new Date(WED_2026_05_20);
      dt.setDate(WED_2026_05_20.getDate() - d);
      const dayOfWeek = dt.getDay();
      // dayOfWeek 4 = Thursday. Leave mealsAte empty on Thursdays.
      const mealsAte = dayOfWeek === 4 ? [] : ["something-unrelated"];
      rows.push({
        day: isoLocal(dt),
        habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water],
        mealsAte,
      });
    }
    await seedCheckIns(page, rows);

    await page.goto("/#/today");
    const card = page.locator(".recap-card--quiet");
    await expect(card).toBeVisible();
    // The headline names a day-of-week and a slot.
    await expect(card).toContainText(/thursday|breakfast|lunch|dinner/i);
    // The body says "Two weeks of this slot have slipped".
    await expect(card).toContainText(/two weeks/i);
    // The CTA reads "Swap this slot" and routes to #/meals?day=YYYY-MM-DD.
    const cta = card.locator("a", { hasText: /swap this slot/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /#\/meals\?day=\d{4}-\d{2}-\d{2}/);
  });
});

/* ========================================================================== */
/*  Precedence — adherence wins over projection wins over meals               */
/* ========================================================================== */

test.describe("Quiet card · precedence", () => {
  test("adherence-at-risk wins over projection-window when both qualify", async ({ page }) => {
    await setupOnWed(page);
    // Adherence-at-risk seed (oats below threshold AND worsening trend).
    await seedCheckIns(page, adherenceMatrix(WED_2026_05_20, [5, 9, 11, 13]));

    // Projection-window seed — also qualifies.
    const panelIds = await panelIdsOldestFirst(page);
    const latestPanelId = panelIds[panelIds.length - 1]!;
    await seedProjections(page, [{
      markerKey: "ferritin_m", panelId: latestPanelId,
      low: 50, high: 80, weeksOut: [8, 12], createdDaysAgo: 70,
    }]);

    await page.goto("/#/today");
    const card = page.locator(".recap-card--quiet");
    await expect(card).toBeVisible();
    // Adherence wins — body should not be the projection's "first useful one".
    await expect(card).not.toContainText(/first useful one/i);
    // It should be the adherence note (names a habit).
    await expect(card).toContainText(/oats with breakfast/i);
    // Only ONE card renders — no stacking.
    await expect(page.locator(".recap-card--quiet")).toHaveCount(1);
  });
});

/* ========================================================================== */
/*  Dismissal — per-day localStorage key                                      */
/* ========================================================================== */

test.describe("Quiet card · dismissal", () => {
  test("'Not today' link sets localStorage and yanks the card; reload keeps it gone", async ({ page }) => {
    await setupOnWed(page);
    await seedCheckIns(page, adherenceMatrix(WED_2026_05_20, [5, 9, 11, 13]));

    await page.goto("/#/today");
    const card = page.locator(".recap-card--quiet");
    await expect(card).toBeVisible();

    await card.locator("[data-action='dismiss-quiet']").click();
    await expect(card).toHaveCount(0);

    // Today is 2026-05-20 so the dismissal key is namespaced by that date.
    const dismissed = await page.evaluate(() => {
      return localStorage.getItem("almanac.quiet.dismissed.2026-05-20");
    });
    expect(dismissed).toBe("true");

    // Reload — the card stays gone for the rest of today.
    await page.reload();
    await expect(page.locator(".recap-card--quiet")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Sunday recap card wins over the quiet card                                */
/* ========================================================================== */

test.describe("Quiet card · Sunday precedence", () => {
  test("on Sunday the recap card renders; the quiet card is suppressed", async ({ page }) => {
    await page.clock.setFixedTime(SUN_2026_05_17);
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);

    // A state that WOULD fire the quiet card on a non-Sunday: adherence-at-risk.
    await seedCheckIns(page, adherenceMatrix(SUN_2026_05_17, [5, 9, 11, 13]));

    await page.goto("/#/today");
    // The Sunday recap card renders.
    await expect(page.locator(".recap-card")).toBeVisible();
    // The recap card has its OWN eyebrow ("A Sunday note"); the quiet card's
    // variant class must NOT be present.
    await expect(page.locator(".recap-card--quiet")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Zero Anthropic calls during a Today render with a card                    */
/* ========================================================================== */

test.describe("Quiet card · privacy", () => {
  test("renders entirely from local data — zero Anthropic calls during a full Today load", async ({ page }) => {
    const stats = await setupOnWed(page);
    await seedCheckIns(page, adherenceMatrix(WED_2026_05_20, [5, 9, 11, 13]));

    const before = {
      plan: stats.planCalls, meals: stats.mealsCalls,
      extract: stats.extractCalls, swap: stats.swapCalls,
    };

    await page.goto("/#/today");
    await expect(page.locator(".recap-card--quiet")).toBeVisible();
    // Wait long enough that any deferred fetch would have fired.
    await page.waitForTimeout(200);

    expect(stats.planCalls    - before.plan).toBe(0);
    expect(stats.mealsCalls   - before.meals).toBe(0);
    expect(stats.extractCalls - before.extract).toBe(0);
    expect(stats.swapCalls    - before.swap).toBe(0);
  });
});

/* ========================================================================== */
/*  Sample tour surfaces a quiet card against the fixture state               */
/* ========================================================================== */

test.describe("Quiet card · sample tour", () => {
  test("a tour visitor sees the quiet card render against the fixture", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);

    // Skip the test on actual Sundays — the recap card wins on Sundays and
    // the quiet card is intentionally suppressed. The tour's fixture is built
    // to fire on Mon–Sat; on a Sunday the recap card is the right surface.
    const isSunday = await page.evaluate(() => new Date().getDay() === 0);
    test.skip(isSunday, "Sunday: recap card wins over the quiet card (by design)");

    await page.goto("/#/today");
    // The Today page must paint.
    await expect(page.locator(".headline").first()).toBeVisible();
    // The quiet card surfaces. The fixture's habit-check pattern is built
    // (in ticket 0014) so the adherence-at-risk predicate fires for at least
    // one habit; this assertion is the cross-ticket contract.
    await expect(page.locator(".recap-card--quiet")).toBeVisible();
  });
});
