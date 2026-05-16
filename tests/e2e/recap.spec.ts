// Weekly recap (ticket 0008).
//
// The recap is a deterministic, computed view over local data — no Anthropic
// call. We seed the IndexedDB `checkins` store directly with the dates we
// need (current week + prior week) so the renderer has something to render,
// and we lock the browser's wall clock with page.clock.install() so the
// "what day is it" decisions inside the SPA (Sunday-only nav, current-week
// resolution, dismissal key) are deterministic across machines and time zones.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Time control                                                              */
/* -------------------------------------------------------------------------- */

// Local-noon ISO for a given Y/M/D — using noon avoids any DST / timezone
// edge that could flip `getDay()` for a user near the date boundary. The
// recap helpers all read `new Date()` not UTC, so noon-local is the safest
// fixed point.
function localNoon(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0);
}

// Local-date ISO — matches src/db.ts `iso()`. Used to derive the day keys
// for seeded check-ins, so they line up with the SPA's notion of "today".
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Sunday May 10 2026 — a real Sunday. Used by the Sunday-card / current-week
// tests. We lock the clock to noon so `getDay()` reads 0 (Sunday) regardless
// of where the CI box is on the globe.
const SUNDAY_2026_05_10 = localNoon(2026, 5, 10);

// Monday May 11 2026 — a non-Sunday in the same week. Used by the "card is
// suppressed Mon–Sat" test.
const MONDAY_2026_05_11 = localNoon(2026, 5, 11);

// Sunday May 17 2026 — one ISO week after SUNDAY_2026_05_10. Used by the
// "dismissal does not carry into next week" test.
const SUNDAY_2026_05_17 = localNoon(2026, 5, 17);

/* -------------------------------------------------------------------------- */
/*  Check-in seeding                                                          */
/* -------------------------------------------------------------------------- */

interface SeedCheckIn {
  day: string;                  // YYYY-MM-DD
  habitsCompleted: string[];
  mealsAte?: string[];
  signals?: { sleepHours?: number; mood?: 1|2|3|4|5; energy?: 1|2|3|4|5 };
}

// Seed `checkins` rows straight into IndexedDB. The SPA's Dexie schema (v5)
// declares `checkins: "++id, &day, createdAt"`, so we must use auto-increment
// (omit `id`) and the `&day` uniqueness constraint forbids dupes for one
// calendar day — match that by clearing first.
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

/* -------------------------------------------------------------------------- */
/*  Habit ids that match plan.json fixture                                    */
/* -------------------------------------------------------------------------- */
// The fixture plan has five habits with these ids. Adherence math reads them.
const H = {
  oats: "h-oats", walk: "h-walk", sun: "h-sun", d3: "h-d3", water: "h-water",
} as const;

// Meal ids that match the meals.json fixture week (d0..d6, breakfast/lunch/dinner).
const M = (day: number, slot: "b" | "l" | "d") => `d${day}-${slot}`;

/* -------------------------------------------------------------------------- */
/*  Common setup — clock locked + onboarded + plan + meals                    */
/* -------------------------------------------------------------------------- */

interface SetupOpts {
  /** The wall-clock the SPA should see. */
  at: Date;
}

async function setup(page: Page, opts: SetupOpts): Promise<MockStats> {
  // Lock only `Date.now()` / `new Date()` — leave setTimeout/setInterval
  // alone so Dexie's internal flushes (and Playwright's own waiters) keep
  // working. page.clock.install() would freeze timers too and deadlock the
  // IndexedDB transactions Dexie depends on. `setFixedTime` is the right
  // tool for "the page believes it's Sunday" without breaking async I/O.
  await page.clock.setFixedTime(opts.at);
  const stats = await installMocks(page);
  await onboard(page);
  await addManualPanel(page);
  await composePlan(page);

  // Generate the meal plan so "Meals on plan" has something to compare to.
  await page.goto("/#/meals");
  await page.getByRole("button", { name: /generate the week/i }).click();
  await expect(page.locator(".day-strip__cell")).toHaveCount(7);
  return stats;
}

/* ========================================================================== */
/*  Empty week — fewer than 3 check-ins                                       */
/* ========================================================================== */

test.describe("Recap · empty week", () => {
  test("shows editorial empty state when fewer than 3 check-ins", async ({ page }) => {
    await setup(page, { at: SUNDAY_2026_05_10 });

    // Only one check-in this week — well below the threshold of 3.
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats] },
    ]);

    await page.goto("/#/recap");
    await expect(page.locator(".recap-empty")).toBeVisible();
    await expect(page.locator(".recap-empty"))
      .toContainText(/not enough was logged this week/i);
    // No broken averages — none of the data sections render.
    await expect(page.locator(".recap-section--adherence")).toHaveCount(0);
    await expect(page.locator(".recap-section--signals")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Partial week — enough check-ins but only some sections populated           */
/* ========================================================================== */

test.describe("Recap · partial week", () => {
  test("renders sections that have data, suppresses signals when none logged", async ({ page }) => {
    await setup(page, { at: SUNDAY_2026_05_10 });

    // 4 days of habits, no signals at all, no meals logged.
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats, H.walk] },
      { day: "2026-05-05", habitsCompleted: [H.oats, H.walk, H.sun] },
      { day: "2026-05-06", habitsCompleted: [H.oats] },
      { day: "2026-05-07", habitsCompleted: [H.oats, H.walk] },
    ]);

    await page.goto("/#/recap");
    // Adherence section renders with each habit's N-of-7.
    await expect(page.locator(".recap-section--adherence")).toBeVisible();
    const oatsRow = page.locator(".recap-adherence-row", { hasText: /oats with breakfast/i });
    await expect(oatsRow).toContainText(/4\s*of\s*7/i);
    const walkRow = page.locator(".recap-adherence-row", { hasText: /walk after dinner/i });
    await expect(walkRow).toContainText(/3\s*of\s*7/i);

    // No signals logged → the Signals section is suppressed, not "NaN".
    await expect(page.locator(".recap-section--signals")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Full week with deltas — every section populated                           */
/* ========================================================================== */

test.describe("Recap · full week with deltas", () => {
  test("renders all six sections with adherence, meals-on-plan, signal deltas, mover, suggestion, week-in-numbers", async ({ page }) => {
    const stats = await setup(page, { at: SUNDAY_2026_05_10 });

    // Reset Anthropic-call counters so the post-render assertion only sees
    // calls that happened during the recap render itself.
    const callsBeforeRecap = {
      plan: stats.planCalls,
      meals: stats.mealsCalls,
      extract: stats.extractCalls,
      swap: stats.swapCalls,
    };

    // Prior week (Apr 27 – May 3) — sleep avg 6.5h, mood 3, energy 3.
    // Current week (May 4 – May 10) — sleep avg 7.5h (+1.0h), mood 4 (+1), energy 4 (+1).
    // The biggest absolute delta belongs to "sleep" by a wide margin (60 min
    // vs 1 point on a 1–5 scale — that's the comparison the editorial line
    // is going to make, not normalized).
    const priorWeek: SeedCheckIn[] = [
      { day: "2026-04-27", habitsCompleted: [H.oats, H.walk], signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-04-28", habitsCompleted: [H.oats],         signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-04-29", habitsCompleted: [H.oats, H.walk], signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-04-30", habitsCompleted: [H.oats],         signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-05-01", habitsCompleted: [H.oats, H.walk], signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-05-02", habitsCompleted: [H.oats],         signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
      { day: "2026-05-03", habitsCompleted: [H.oats, H.walk], signals: { sleepHours: 6.5, mood: 3, energy: 3 } },
    ];
    // Current week: Mon May 4 → Sun May 10. Oats hit 6 of 7, walk 5 of 7,
    // sun 2 of 7 (the "lowest" — picked up by "thing to try next week"),
    // d3 5 of 7, water 7 of 7.
    const currentWeek: SeedCheckIn[] = [
      { day: "2026-05-04", habitsCompleted: [H.oats, H.walk, H.d3, H.water],         mealsAte: [M(0,"b"), M(0,"l"), M(0,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-05", habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water],  mealsAte: [M(1,"b"), M(1,"l"), M(1,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-06", habitsCompleted: [H.oats, H.walk, H.d3, H.water],         mealsAte: [M(2,"b"), M(2,"l"), M(2,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-07", habitsCompleted: [H.oats, H.water],                       mealsAte: [M(3,"b"), M(3,"l"), M(3,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-08", habitsCompleted: [H.oats, H.walk, H.sun, H.d3, H.water],  mealsAte: [M(4,"b"), M(4,"l"), M(4,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-09", habitsCompleted: [H.oats, H.walk, H.d3, H.water],         mealsAte: [M(5,"b"), M(5,"l")],          signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
      { day: "2026-05-10", habitsCompleted: [H.water],                               mealsAte: [M(6,"b"), M(6,"l"), M(6,"d")], signals: { sleepHours: 7.5, mood: 4, energy: 4 } },
    ];
    await seedCheckIns(page, [...priorWeek, ...currentWeek]);

    await page.goto("/#/recap");
    await expect(page.locator(".recap")).toBeVisible();

    // Section 1 — Adherence (5 habits × 7 days).
    const adherence = page.locator(".recap-section--adherence");
    await expect(adherence).toBeVisible();
    await expect(adherence.locator(".recap-adherence-row")).toHaveCount(5);
    await expect(adherence.locator(".recap-adherence-row", { hasText: /oats/i }))
      .toContainText(/6\s*of\s*7/i);
    await expect(adherence.locator(".recap-adherence-row", { hasText: /walk/i }))
      .toContainText(/5\s*of\s*7/i);
    await expect(adherence.locator(".recap-adherence-row", { hasText: /morning sun/i }))
      .toContainText(/2\s*of\s*7/i);

    // Section 2 — Meals on plan: 20 of 21 (we logged 3 meals each day except
    // Saturday, which had 2). Total planned: 21 (3 × 7 days).
    const meals = page.locator(".recap-section--meals");
    await expect(meals).toBeVisible();
    await expect(meals).toContainText(/20\s*of\s*21/i);

    // Section 3 — Signals + deltas.
    const signals = page.locator(".recap-section--signals");
    await expect(signals).toBeVisible();
    // Sleep avg formatted as h/min ("7h 30m") with delta "+60 min" or "+1h 0m".
    const sleepRow = signals.locator(".recap-signal-row", { hasText: /sleep/i });
    await expect(sleepRow).toContainText(/7h\s*30m/);
    await expect(sleepRow).toContainText(/\+1h|\+60\s*min/i);
    const moodRow = signals.locator(".recap-signal-row", { hasText: /mood/i });
    await expect(moodRow).toContainText(/4\.0/);
    await expect(moodRow).toContainText(/\+1\.0/);

    // Section 4 — What moved most: sleep led the week.
    const mover = page.locator(".recap-section--mover");
    await expect(mover).toBeVisible();
    await expect(mover).toContainText(/sleep/i);

    // Section 5 — Thing to try next week (lowest-adherence habit < 5/7).
    const suggest = page.locator(".recap-section--suggest");
    await expect(suggest).toBeVisible();
    // Lowest adherence is "morning sun" at 2/7 — it must be named.
    await expect(suggest).toContainText(/morning sun/i);

    // Section 6 — Week in numbers: date range + days-with-habit-log + days-without.
    const numbers = page.locator(".recap-section--numbers");
    await expect(numbers).toBeVisible();
    // Date range — the ISO week 2026-W19 is May 4 → May 10. Match loosely
    // on month + endpoints so locale formatting doesn't break us.
    await expect(numbers).toContainText(/may\s*4/i);
    await expect(numbers).toContainText(/may\s*10/i);
    // 7 days with at least one logged habit (every day in our seed); 0 without.
    await expect(numbers).toContainText(/7/);

    // Zero new Anthropic calls during the recap render — recap is local-only.
    expect(stats.planCalls   - callsBeforeRecap.plan).toBe(0);
    expect(stats.mealsCalls  - callsBeforeRecap.meals).toBe(0);
    expect(stats.extractCalls- callsBeforeRecap.extract).toBe(0);
    expect(stats.swapCalls   - callsBeforeRecap.swap).toBe(0);
  });
});

/* ========================================================================== */
/*  Sunday card on Today + dismissal                                          */
/* ========================================================================== */

test.describe("Recap · Sunday card on Today", () => {
  test("Sunday: card appears, links to recap, dismissal stores localStorage key", async ({ page }) => {
    await setup(page, { at: SUNDAY_2026_05_10 });
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats], signals: { sleepHours: 7 } },
      { day: "2026-05-05", habitsCompleted: [H.oats], signals: { sleepHours: 7 } },
      { day: "2026-05-06", habitsCompleted: [H.oats], signals: { sleepHours: 7 } },
    ]);

    await page.goto("/#/today");
    const card = page.locator(".recap-card");
    await expect(card).toBeVisible();
    await expect(card.locator("a", { hasText: /open recap/i })).toBeVisible();

    // Dismiss the card.
    await card.locator("[data-action='dismiss-recap']").click();
    await expect(card).toHaveCount(0);

    // localStorage now holds the dismissal key for this ISO week.
    // 2026-05-10 is in ISO week 2026-W19.
    const dismissed = await page.evaluate(() => {
      return localStorage.getItem("almanac.recap.dismissed.2026-W19");
    });
    expect(dismissed).toBe("true");

    // Reload — the card stays gone.
    await page.reload();
    await expect(page.locator(".recap-card")).toHaveCount(0);
  });

  test("non-Sunday: card is not rendered on Today", async ({ page }) => {
    await setup(page, { at: MONDAY_2026_05_11 });
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats] },
      { day: "2026-05-05", habitsCompleted: [H.oats] },
      { day: "2026-05-06", habitsCompleted: [H.oats] },
    ]);
    await page.goto("/#/today");
    // Today header must be present (sanity) before asserting the absence.
    await expect(page.locator(".habit-check").first()).toBeVisible();
    await expect(page.locator(".recap-card")).toHaveCount(0);
  });

  test("next Sunday: a fresh card appears even if the previous week was dismissed", async ({ page }) => {
    // Boot on May 10 (Sunday), dismiss, then move the clock to May 17 (next
    // Sunday) and reload. The dismissal key was 2026-W19; the new week is
    // 2026-W20 — different key, fresh card.
    await setup(page, { at: SUNDAY_2026_05_10 });
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats] },
      { day: "2026-05-05", habitsCompleted: [H.oats] },
      { day: "2026-05-06", habitsCompleted: [H.oats] },
    ]);
    await page.goto("/#/today");
    await page.locator(".recap-card [data-action='dismiss-recap']").click();
    await expect(page.locator(".recap-card")).toHaveCount(0);

    // Jump the clock forward 7 days; reload.
    await page.clock.setFixedTime(SUNDAY_2026_05_17);
    await page.reload();
    // Seed a fresh batch so the new week has enough check-ins for the card
    // to render (Sundays without data still render the empty-state recap;
    // the card itself shows up regardless of data, but the test asserts the
    // card by its dismissal status not its content).
    await seedCheckIns(page, [
      { day: "2026-05-11", habitsCompleted: [H.oats] },
      { day: "2026-05-12", habitsCompleted: [H.oats] },
      { day: "2026-05-13", habitsCompleted: [H.oats] },
    ]);
    await page.reload();
    await expect(page.locator(".recap-card")).toBeVisible();
  });
});

/* ========================================================================== */
/*  Navigation — #/recap route + conditional nav                              */
/* ========================================================================== */

test.describe("Recap · navigation", () => {
  test("#/recap is a real route that renders the recap page", async ({ page }) => {
    await setup(page, { at: SUNDAY_2026_05_10 });
    await seedCheckIns(page, [
      { day: "2026-05-04", habitsCompleted: [H.oats] },
      { day: "2026-05-05", habitsCompleted: [H.oats] },
      { day: "2026-05-06", habitsCompleted: [H.oats] },
    ]);
    await page.goto("/#/recap");
    await expect(page.locator(".recap, .recap-empty").first()).toBeVisible();
  });

  test("nav: Recap link is visible on Sundays", async ({ page }) => {
    await setup(page, { at: SUNDAY_2026_05_10 });
    await page.goto("/#/today");
    await expect(
      page.locator(".masthead nav a", { hasText: /^\s*recap\s*$/i })
    ).toBeVisible();
  });

  test("nav: Recap link is hidden Mon–Sat unless currently on the recap page", async ({ page }) => {
    await setup(page, { at: MONDAY_2026_05_11 });
    await page.goto("/#/today");
    await expect(
      page.locator(".masthead nav a", { hasText: /^\s*recap\s*$/i })
    ).toHaveCount(0);

    // But while on /recap (e.g. user typed the URL or followed a deep link),
    // the link is shown so they can navigate back.
    await page.goto("/#/recap");
    await expect(
      page.locator(".masthead nav a", { hasText: /^\s*recap\s*$/i })
    ).toBeVisible();
  });
});
