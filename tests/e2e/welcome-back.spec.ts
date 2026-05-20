// Lapse-aware welcome-back surface (ticket 0018).
//
// The router records a session row on every full page load, then reads the
// most-recent session row OLDER than the row it just wrote. When that gap
// exceeds 14 days AND the user has a composed plan AND the resolved route is
// `#/today` AND the user has not dismissed for today, the router redirects
// once to `#/welcome-back`. The surface renders entirely from local data —
// zero Anthropic calls — and ends with two equally-weighted CTAs:
//
//   "Pick up where I left off"          → routes to #/today
//   "Re-compose with the time off counted" → routes to #/plan?recompose=lapse-aware
//
// Each `test()` here maps 1:1 to a checkbox on the ticket so a reviewer can
// read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import {
  onboard, addManualPanel, composePlan,
  seedSessionGap, clearSessions, simulateAppOpen, waitForDb,
} from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Force the latest plan's `generatedAt` to `daysAgo` days behind the wall
 * clock at write time. Used by the retest-overdue / retest-coming-due tests
 * where the surface derives a target date from `plan.generatedAt + whenWeeks`.
 */
async function ageLatestPlan(page: Page, daysAgo: number): Promise<void> {
  await page.evaluate(({ days }: { days: number }) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("plans", "readwrite");
        const store = tx.objectStore("plans");
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const rows = (getAll.result as Array<{ id: number; generatedAt: number }>);
          if (!rows.length) { db.close(); resolve(); return; }
          rows.sort((a, b) => b.generatedAt - a.generatedAt);
          const latest = rows[0]!;
          latest.generatedAt = Date.now() - days * 86_400_000;
          store.put(latest);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, { days: daysAgo });
}

/** Seed a projection snapshot whose creation date was N days ago. */
async function seedProjection(page: Page, opts: {
  markerKey: string; panelId: number;
  low: number; high: number; weeksOut: [number, number];
  createdDaysAgo: number;
}): Promise<void> {
  await page.evaluate((row) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projections")) {
          db.close(); resolve(); return;
        }
        const tx = db.transaction("projections", "readwrite");
        tx.objectStore("projections").add({
          markerKey: row.markerKey,
          panelId: row.panelId,
          low: row.low, high: row.high,
          weeksOut: row.weeksOut,
          createdAt: Date.now() - row.createdDaysAgo * 86_400_000,
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, opts);
}

/** Return the newest panel id, or 0 when there is none. */
async function latestPanelId(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => resolve(0);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("panels", "readonly");
        const all: number[] = [];
        const cur = tx.objectStore("panels").openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { all.push((c.value as { id: number }).id); c.continue(); }
          else   { db.close(); resolve(all.length ? Math.max(...all) : 0); }
        };
        cur.onerror = () => { db.close(); resolve(0); };
      };
    });
  });
}

/** Common setup: onboard, add a manual panel, compose the plan, clear sessions. */
async function setup(page: Page): Promise<MockStats> {
  const stats = await installMocks(page);
  await onboard(page);
  await addManualPanel(page);
  await composePlan(page);
  // Onboarding + the panel + the compose flow all drove the router through
  // several loads, each one appending a session row. Wipe so we can stage the
  // exact prior-session anchor per scenario.
  await clearSessions(page);
  return stats;
}

/* ========================================================================== */
/*  First session ever — no prior row, no redirect                            */
/* ========================================================================== */

test.describe("Welcome back · first session", () => {
  test("no prior session row → no redirect; user lands on Today as normal", async ({ page }) => {
    await setup(page);
    // No sessions seeded — the very next page load will write the first row
    // and read no prior row.
    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/today/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Gap below threshold — no redirect                                         */
/* ========================================================================== */

test.describe("Welcome back · gap below threshold", () => {
  test("gap of 7 days → no redirect; Today renders normally", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 7);
    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/today/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Gap above threshold WITH no plan — no redirect                            */
/* ========================================================================== */

test.describe("Welcome back · no plan", () => {
  test("gap of 42 days but no composed plan → no redirect (welcome-back is plan-anchored)", async ({ page }) => {
    // Onboard but DO NOT compose a plan.
    await installMocks(page);
    await onboard(page);
    await clearSessions(page);
    await seedSessionGap(page, 42);
    await simulateAppOpen(page, "#/today");
    // Today's no-plan empty state renders — and welcome-back does NOT.
    await expect(page).toHaveURL(/#\/today/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Gap above threshold WITH plan + projection-opened — redirect + CTA        */
/* ========================================================================== */

test.describe("Welcome back · gap + plan + projection opened during the gap", () => {
  test("redirects once to #/welcome-back; projection-opened row renders; CTA routes to plan", async ({ page }) => {
    await setup(page);
    // Plan composed `now`; a projection created 70 days ago with a window of
    // [8, 12] weeks (56..84 days). Today (70d after creation) is inside the
    // window — and the window opened day 56, which was 14 days ago: AFTER
    // the prior session (42 days ago). So `opensAt > prev` AND `opensAt <= now`.
    const panelId = await latestPanelId(page);
    expect(panelId).toBeGreaterThan(0);
    await seedProjection(page, {
      markerKey: "ferritin_m", panelId, low: 50, high: 80,
      weeksOut: [8, 12], createdDaysAgo: 70,
    });
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    const surface = page.locator(".welcome-back");
    await expect(surface).toBeVisible();
    // Eyebrow "Welcome back." with a period — neutral, not exclamatory.
    await expect(surface.locator(".welcome-back__eyebrow")).toContainText(/welcome back\./i);
    // Gap line uses the factual phrasing.
    await expect(surface).toContainText(/it has been 42 days\./i);
    // Projection-opened row.
    const changed = surface.locator(".welcome-back__changed");
    await expect(changed).toBeVisible();
    await expect(changed).toContainText(/ferritin/i);
    await expect(changed).toContainText(/projection window opened/i);
    await expect(changed).toContainText(/still open/i);
    // CTA "Plan a retest" routes to #/plan.
    const cta = changed.locator("a", { hasText: /plan a retest/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /#\/plan/);
  });

  test("redirect happens at most once per session — same-session navigation back to #/today goes to Today", async ({ page }) => {
    await setup(page);
    const panelId = await latestPanelId(page);
    await seedProjection(page, {
      markerKey: "ferritin_m", panelId, low: 50, high: 80,
      weeksOut: [8, 12], createdDaysAgo: 70,
    });
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);

    // In-session navigation back to Today via the masthead link must land on
    // Today — the once-per-session flag stays set.
    await page.locator("a[href='#/today']").first().click();
    await expect(page).toHaveURL(/#\/today/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Gap with retest-overdue — section renders + CTA routes to plan            */
/* ========================================================================== */

test.describe("Welcome back · retest overdue", () => {
  test("plan's retest target date in the past → 'retest was scheduled for ...' row + Update retest plan CTA", async ({ page }) => {
    await setup(page);
    // Backdate the plan so its 12-week retest target is in the past. The fixture
    // plan has retest[0].whenWeeks = 12 (84 days). A generatedAt 120 days ago
    // makes the target 36 days overdue.
    await ageLatestPlan(page, 120);
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    const overdue = page.locator(".welcome-back__overdue");
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText(/your retest was scheduled for/i);
    await expect(overdue).toContainText(/days ago/i);
    const cta = overdue.locator("a", { hasText: /update retest plan/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /#\/plan/);
  });
});

/* ========================================================================== */
/*  Gap of 21 days → three missed Sunday recaps                               */
/* ========================================================================== */

test.describe("Welcome back · recap-missed-count", () => {
  test("21-day gap surfaces a 'three Sunday recaps' line with Read recap CTA", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 21);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    const surface = page.locator(".welcome-back");
    // A 21-day gap spans three Sundays.
    await expect(surface).toContainText(/3 sunday recaps?/i);
    const cta = surface.locator("a", { hasText: /read recap/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /#\/recap/);
  });
});

/* ========================================================================== */
/*  Deep-link to a non-Today route during a lapse does NOT redirect           */
/* ========================================================================== */

test.describe("Welcome back · route gating", () => {
  test("deep-link to #/labs during a lapse → lands on labs, no redirect", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 42);
    await simulateAppOpen(page, "#/labs");
    await expect(page).toHaveURL(/#\/labs/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });

  test("deep-link to #/plan during a lapse → lands on plan, no redirect", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 42);
    await simulateAppOpen(page, "#/plan");
    await expect(page).toHaveURL(/#\/plan/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Dismissed-for-today persists across in-session navigation                 */
/* ========================================================================== */

test.describe("Welcome back · dismissal", () => {
  test("'Dismiss for today' sets the localStorage flag and routes to Today; subsequent same-day reopens skip the redirect", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 42);
    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);

    // The dismiss link lives top-right; clicking it routes to Today and stores
    // the flag namespaced by today's local ISO date.
    await page.locator(".welcome-back__dismiss").click();
    await expect(page).toHaveURL(/#\/today/);

    const flag = await page.evaluate(() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `almanac.welcomeBack.dismissed.${y}-${m}-${dd}`;
      return localStorage.getItem(key);
    });
    expect(flag).toBe("true");

    // Reload + revisit Today — the redirect is suppressed for the rest of today.
    await page.reload();
    await expect(page).toHaveURL(/#\/today/);
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});

/* ========================================================================== */
/*  Habit titles capped at three                                              */
/* ========================================================================== */

test.describe("Welcome back · whatsStill habit titles", () => {
  test("plan with 5 habits → exactly 3 titles listed verbatim with 'and 2 more' tail", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    const still = page.locator(".welcome-back__still");
    await expect(still).toBeVisible();
    // Three habits from the fixture plan (which has 5).
    await expect(still).toContainText(/1\/2 cup oats with breakfast/i);
    await expect(still).toContainText(/10-min walk after dinner/i);
    await expect(still).toContainText(/10-min morning sun/i);
    // The "and 2 more" tail names the count of remaining habits.
    await expect(still).toContainText(/and 2 more/i);
  });
});

/* ========================================================================== */
/*  Pick-up CTA lands on Today                                                */
/* ========================================================================== */

test.describe("Welcome back · CTAs", () => {
  test("'Pick up where I left off' lands on Today", async ({ page }) => {
    await setup(page);
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    await page.getByRole("link", { name: /pick up where i left off/i }).click();
    await expect(page).toHaveURL(/#\/today/);
    // No second redirect — the once-per-session flag suppresses it.
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });

  test("'Re-compose with the time off counted' lands on #/plan?recompose=lapse-aware and the synthetic skip days appear in the prompt", async ({ page }) => {
    // Heavier setup than the other welcome-back tests: full onboarding + panel
    // + first compose + second compose under the lapse-aware flag, plus a
    // request-capture wait. Generous timeout for parallel-worker load on CI.
    test.setTimeout(120_000);
    const stats = await setup(page);
    await seedSessionGap(page, 42);

    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);

    // Capture the next outbound Anthropic POST so the prompt body can be sniffed.
    const planRequestBodyP = page.waitForRequest(
      (req) => req.url().includes("api.anthropic.com/v1/messages") && req.method() === "POST",
      { timeout: 30_000 },
    );

    await page.getByRole("link", { name: /re-compose with the time off counted/i }).click();
    // The link routes to #/plan?recompose=lapse-aware. The plan page reads the
    // query flag and immediately strips it via history.replaceState so a
    // reload doesn't re-trigger — tolerate either form to avoid racing the
    // replaceState. The compose call itself is the user-visible proof: a
    // second plan row lands in Dexie and the synthetic-skip-days line shows
    // up in the request body (asserted below).
    await expect(page).toHaveURL(/#\/plan/);
    // The plan page auto-fires compose when the recompose query flag is set.
    await waitForDb(page, "plans", (n) => n >= 2, { timeoutMs: 30_000 });

    const planRequest = await planRequestBodyP;
    const body = planRequest.postDataJSON() as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const userText = body.messages
      .flatMap(m => Array.isArray(m.content) ? m.content : [])
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("\n");
    // The synthetic skip-days line lives in the adherence block of the prompt.
    // (42-day gap is capped at 30.)
    expect(userText).toMatch(/user was away.*no check-ins logged.*30 days/i);
    void stats;
  });
});

/* ========================================================================== */
/*  Privacy — zero Anthropic calls on the welcome-back render path            */
/* ========================================================================== */

test.describe("Welcome back · privacy", () => {
  test("render + dismissal path makes zero Anthropic calls", async ({ page }) => {
    const stats = await setup(page);
    await seedSessionGap(page, 42);

    const before = {
      plan: stats.planCalls, meals: stats.mealsCalls,
      extract: stats.extractCalls, swap: stats.swapCalls,
    };
    await simulateAppOpen(page, "#/today");
    await expect(page).toHaveURL(/#\/welcome-back/);
    await expect(page.locator(".welcome-back")).toBeVisible();

    await page.locator(".welcome-back__dismiss").click();
    await expect(page).toHaveURL(/#\/today/);
    // Give any deferred fetch a chance to fire.
    await page.waitForTimeout(200);

    expect(stats.planCalls    - before.plan).toBe(0);
    expect(stats.mealsCalls   - before.meals).toBe(0);
    expect(stats.extractCalls - before.extract).toBe(0);
    expect(stats.swapCalls    - before.swap).toBe(0);
  });
});

/* ========================================================================== */
/*  Tour and shared-view modes short-circuit                                  */
/* ========================================================================== */

test.describe("Welcome back · tour/shared-view bypass", () => {
  test("tour mode does not trigger the redirect", async ({ page }) => {
    await installMocks(page);
    // Tour visitor — no IndexedDB profile, but the tour fixture carries a plan.
    await page.goto("/");
    await page.getByRole("button", { name: /take a tour with sample data/i }).click();
    await expect(page).toHaveURL(/#\/today/);
    // The welcome-back surface must not render.
    await expect(page.locator(".welcome-back")).toHaveCount(0);
  });
});
