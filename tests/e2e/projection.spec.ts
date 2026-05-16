// Next-draw projection — what we'd expect to see if you tested today
// (ticket 0012).
//
// Each top-level `test` maps 1:1 to an acceptance-criteria checkbox on the
// ticket. Determinism is the product, so every projection comes from a fixed
// adherence pattern + a fixed latest-panel value seeded directly into Dexie.
// No Anthropic calls — we assert the mock counter on a full render.
//
// Clock control uses `page.clock.setFixedTime` (NOT `install` — that
// deadlocks Dexie's transactions; see ticket 0008's implementation log).

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan, waitForDb } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Time control                                                              */
/* -------------------------------------------------------------------------- */

// Local-noon — avoids the DST / timezone edge of midnight when getDay() could
// flip across the date boundary. The projection module reads `Date.now()`
// when it computes the 14-day adherence window, so the fixed time has to be
// late enough in the day that seeded check-ins ≤ today are visible.
function localNoon(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0);
}

// May 20 2026 — a Wednesday three weeks after our seeded panel on May 1.
// The fixed clock means the rolling 14-day adherence window is May 7..20
// (chronological), which is what the test's seeded check-in days sit in.
const WED_2026_05_20 = localNoon(2026, 5, 20);

// Local-date ISO — matches src/db.ts iso(). Used to derive day keys for
// seeded check-ins so they line up with the SPA's notion of "today".
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/* -------------------------------------------------------------------------- */
/*  Habit ids — must match the plan.json fixture (same as recap.spec.ts)      */
/* -------------------------------------------------------------------------- */

const H = {
  oats: "h-oats", walk: "h-walk", sun: "h-sun", d3: "h-d3", water: "h-water",
} as const;

/* -------------------------------------------------------------------------- */
/*  Direct IndexedDB seeding helpers                                          */
/* -------------------------------------------------------------------------- */

interface SeedCheckIn {
  day: string;
  habitsCompleted: string[];
}

// Replace whatever is in the `checkins` store with these rows. Used to put
// adherence into a known state for the deterministic projection band.
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

// Replace the panels store with the supplied panels. Used by the v5→v6
// migration test so the migration path is exercised on a known seed.
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
 * Save a manual-entry panel filling the given key/value pairs. Leaves the page
 * on /labs?id=<n> once the row has committed. Mirrored from compare.spec.ts.
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

/* -------------------------------------------------------------------------- */
/*  Shared setup: onboarded + plan composed at WED_2026_05_20                 */
/* -------------------------------------------------------------------------- */

interface SetupResult { stats: MockStats; }

async function setupWithPanel(page: Page, opts: { drawnAt: string; values: Array<[string, string]> }): Promise<SetupResult> {
  await page.clock.setFixedTime(WED_2026_05_20);
  const stats = await installMocks(page);
  await onboard(page);
  await addPanelWith(page, opts.drawnAt, opts.values);
  await composePlan(page);
  return { stats };
}

/* ========================================================================== */
/*  AC: section omitted when there are no panels at all                       */
/* ========================================================================== */

test.describe("Projection · section omission", () => {
  test("no panels at all → projection section never renders", async ({ page }) => {
    await page.clock.setFixedTime(WED_2026_05_20);
    await installMocks(page);
    await onboard(page);

    await page.goto("/#/progress");
    // The page renders its empty state — that's all there is on the route.
    await expect(page.getByText(/no labs yet/i)).toBeVisible();
    // No projection section.
    await expect(page.locator(".projection-section")).toHaveCount(0);
  });

  test("panel exists but no marker has a curated responsiveness entry → section omitted", async ({ page }) => {
    // Total cholesterol is intentionally NOT in the curated responsiveness
    // list (the literature on dietary cholesterol response is too noisy for
    // the editorial voice to commit to a band). A panel that carries ONLY
    // total cholesterol should yield zero projection cards, so the section
    // header is omitted entirely.
    await setupWithPanel(page, {
      drawnAt: "2026-05-01",
      values: [["total_cholesterol", "244"]],
    });
    // Adherence still gets a sensible state so the empty-section path is
    // tested independently of the "below threshold" branch.
    await seedCheckIns(page, [
      { day: "2026-05-13", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-14", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-15", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-16", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-17", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-18", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-19", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-20", habitsCompleted: [H.oats, H.walk, H.water] },
    ]);
    await page.goto("/#/progress");
    await expect(page.locator(".projection-section")).toHaveCount(0);
    // The single-panel "awaiting a second draw" copy still shows; we didn't
    // accidentally suppress the rest of the page.
    await expect(page.getByText(/awaiting a second draw/i)).toBeVisible();
  });
});

/* ========================================================================== */
/*  AC: section appears with at least one qualifying marker                   */
/*  AC: card shows latest value/unit/date, tier label, N of 14, time-to-      */
/*      effect copy, and a thermometer with the projected band overlay        */
/*  AC: zero new Anthropic calls during render                                */
/* ========================================================================== */

test.describe("Projection · single qualifying marker", () => {
  test("ferritin card renders with band overlay, tier label, time-to-effect", async ({ page }) => {
    // Male profile (onboard default) → ferritin_m is the curated marker.
    const { stats } = await setupWithPanel(page, {
      drawnAt: "2026-05-01",
      values: [["ferritin_m", "18"]],
    });
    // 7 of 7 most-recent-week → easy tier.
    await seedCheckIns(page, [
      { day: "2026-05-13", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-14", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-15", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-16", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-17", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-18", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-19", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-20", habitsCompleted: [H.oats, H.walk, H.water] },
    ]);

    const callsBefore = {
      plan: stats.planCalls, meals: stats.mealsCalls,
      extract: stats.extractCalls, swap: stats.swapCalls,
    };

    await page.goto("/#/progress");

    const section = page.locator(".projection-section");
    await expect(section).toBeVisible();
    await expect(section).toContainText(/between draws/i);
    await expect(section).toContainText(/what we'd expect/i);

    const card = section.locator(".projection-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(/ferritin/i);
    // Latest value + unit + draw date.
    await expect(card).toContainText("18");
    await expect(card).toContainText(/ng\/mL/i);
    await expect(card).toContainText("2026-05-01");
    // Tier label — easy / moderate / advanced.
    await expect(card).toContainText(/easy|moderate|advanced/i);
    // N-of-14 tally — at least one digit before "of 14".
    await expect(card).toContainText(/\d+\s*of\s*14/i);
    // Time-to-effect copy.
    await expect(card).toContainText(/8.{1,4}12\s*weeks|weeks to/i);
    // The band overlay rectangle has its own class on the SVG.
    await expect(card.locator(".therm__projection-band")).toBeVisible();

    // Zero Anthropic calls during render.
    expect(stats.planCalls   - callsBefore.plan).toBe(0);
    expect(stats.mealsCalls  - callsBefore.meals).toBe(0);
    expect(stats.extractCalls- callsBefore.extract).toBe(0);
    expect(stats.swapCalls   - callsBefore.swap).toBe(0);
  });
});

/* ========================================================================== */
/*  AC: adherence-below-threshold → editorial empty branch                    */
/* ========================================================================== */

test.describe("Projection · below adherence threshold", () => {
  test("near-zero adherence → 'hold the easy tier' empty branch", async ({ page }) => {
    await setupWithPanel(page, {
      drawnAt: "2026-05-01",
      values: [["ferritin_m", "18"]],
    });
    // Only a single check-in over the 14-day window, with one habit logged —
    // far below the 30%-of-habit-stack-days threshold.
    await seedCheckIns(page, [
      { day: "2026-05-19", habitsCompleted: [H.oats] },
    ]);

    await page.goto("/#/progress");

    const section = page.locator(".projection-section");
    await expect(section).toBeVisible();
    const card = section.locator(".projection-card");
    await expect(card).toHaveCount(1);
    // Empty branch — no band, editorial copy.
    await expect(card.locator(".therm__projection-band")).toHaveCount(0);
    await expect(card).toContainText(/hold the easy tier/i);
  });
});

/* ========================================================================== */
/*  AC: tap card → slideover with rule evidence + closing sentence            */
/* ========================================================================== */

test.describe("Projection · slideover", () => {
  test("tapping a projection card opens slideover with rule evidence", async ({ page }) => {
    await setupWithPanel(page, {
      drawnAt: "2026-05-01",
      values: [["ferritin_m", "18"]],
    });
    await seedCheckIns(page, [
      { day: "2026-05-13", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-14", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-15", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-16", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-17", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-18", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-19", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-20", habitsCompleted: [H.oats, H.walk, H.water] },
    ]);

    await page.goto("/#/progress");
    await page.locator(".projection-card").first().click();

    const slideover = page.locator(".slideover-root");
    await expect(slideover).toBeVisible();
    // Rule evidence — names a tier and references the days-held tally.
    await expect(slideover).toContainText(/easy|moderate|advanced/i);
    await expect(slideover).toContainText(/days held|of\s*14/i);
    // Editorial time-to-effect citation phrasing.
    await expect(slideover).toContainText(/functional|sustained|practice/i);
    // Closing sentence — exact phrase.
    await expect(slideover).toContainText(
      /this is a plausible range,? not a prediction\..*next draw is the only ground truth/i,
    );
  });
});

/* ========================================================================== */
/*  AC: post-new-panel evaluation row                                         */
/* ========================================================================== */

test.describe("Projection · evaluation after a new panel", () => {
  test("uploading a new panel replaces the prior projection with a landed row", async ({ page }) => {
    // First panel + adherence pattern → a projection snapshot persists.
    const { stats } = await setupWithPanel(page, {
      drawnAt: "2026-05-01",
      values: [["ferritin_m", "18"]],
    });
    await seedCheckIns(page, [
      { day: "2026-05-13", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-14", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-15", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-16", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-17", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-18", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-19", habitsCompleted: [H.oats, H.walk, H.water] },
      { day: "2026-05-20", habitsCompleted: [H.oats, H.walk, H.water] },
    ]);
    // Render progress once so the snapshot path has been observed at least
    // by the user (we do this through the UI even though the snapshot is
    // actually persisted at panel-upload time — proves the section renders
    // before the new panel arrives).
    await page.goto("/#/progress");
    await expect(page.locator(".projection-card")).toHaveCount(1);

    // Now upload a second panel — the panel-insert hook computes a snapshot
    // for the PRIOR latest panel and persists it. Wait for the projections
    // store to commit before we re-render Progress.
    await addPanelWith(page, "2026-05-20", [["ferritin_m", "42"]]);
    await waitForDb(page, "panels", (n) => n >= 2);

    await page.goto("/#/progress");
    // The evaluation row replaces the prior projection card — it lives in
    // the same section.
    const evalRow = page.locator(".projection-eval");
    await expect(evalRow).toBeVisible();
    await expect(evalRow).toContainText(/ferritin/i);
    // Landed value + an "in range" / "under range" / "over range" verdict.
    await expect(evalRow).toContainText(/42/);
    await expect(evalRow).toContainText(/in range|under range|over range/i);

    // We added one panel via the UI; that's two extraction-style API calls
    // worth of plan re-render in principle, but the projection module never
    // touches Anthropic. Sanity: no swap / extraction call resulted from the
    // upload of a manual panel.
    expect(stats.swapCalls).toBe(0);
    expect(stats.extractCalls).toBe(0);
  });
});

/* ========================================================================== */
/*  AC: Dexie v5 → v6 schema migration is additive (no data loss)             */
/* ========================================================================== */

test.describe("Projection · v5 → v6 schema migration", () => {
  test("v5 panels survive the v6 upgrade; the projections store becomes available", async ({ page }) => {
    // Pre-seed a v5 database BEFORE the SPA opens its own (v6) connection.
    // We acknowledge consent first (so the SPA's welcome gate doesn't
    // intercept the later #/progress visit), then close the SPA's Dexie
    // connection via the exported handle, delete the database, and seed a
    // pristine v5 schema. The next page navigation re-opens the DB at v6,
    // triggering Dexie's additive upgrade against our v5 seed — exactly the
    // migration path the ticket calls out.
    await page.clock.setFixedTime(WED_2026_05_20);
    await installMocks(page);
    // Acknowledge consent so the welcome gate doesn't intercept later.
    // Wait for the welcome route to actually paint — the bootstrap redirect
    // races the initial `page.goto("/")` resolution on a cold load.
    await page.goto("/");
    await page.locator("#consent").waitFor({ state: "visible" });
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    // Wait for the redirect to onboarding so we know consent is persisted
    // before we tear down the DB.
    await expect(page).toHaveURL(/#\/onboarding/);

    // Run the delete + v5 seed INSIDE the SPA origin. The SPA's Dexie
    // instance is reachable via the global it's mounted on (we attach it
    // for the test harness via window.__almanacDb) — close it first so the
    // delete isn't blocked, then re-open at v5 and seed. We do the entire
    // seed-then-close inside a single `page.evaluate` so the open-version
    // race is bounded; the v5 connection only outlives the seeded inserts
    // and is explicitly closed before resolving.
    const seedResult = await page.evaluate(async () => {
      // Close any existing Dexie connection. The SPA's `db` is reachable via
      // a side-channel hook installed only in the dev/test build.
      const w = window as unknown as { __almanacDb?: { close(): void } };
      try { w.__almanacDb?.close(); } catch { /* no-op */ }

      await new Promise<void>((resolve) => {
        const del = indexedDB.deleteDatabase("almanac");
        del.onsuccess = () => resolve();
        del.onerror   = () => resolve();
        del.onblocked = () => resolve();
      });

      await new Promise<void>((resolve, reject) => {
        // Dexie scales schema versions by 10 internally, so a Dexie-created
        // DB at version(5) lives at IDB version 50. The migration test
        // must seed at IDB v50 (not raw 5) to look like the production v5
        // state Dexie produced for real users — otherwise Dexie runs the
        // v1→v2 step which drops the legacy `entries`/`pages`/`summaries`/
        // `settings` stores and would silently wipe data on first upgrade.
        const req = indexedDB.open("almanac", 50);
        req.onerror = () => reject(req.error ?? new Error("v5 open failed"));
        req.onupgradeneeded = () => {
          const db = req.result;
          // Match the v5 schema EXACTLY (mirror of src/db.ts version 5).
          db.createObjectStore("profile",      { keyPath: "id" });
          const panels = db.createObjectStore("panels",       { keyPath: "id", autoIncrement: true });
          panels.createIndex("drawnAt", "drawnAt");
          panels.createIndex("createdAt", "createdAt");
          const plans = db.createObjectStore("plans",        { keyPath: "id", autoIncrement: true });
          plans.createIndex("generatedAt", "generatedAt");
          const meals = db.createObjectStore("mealPlans",    { keyPath: "id", autoIncrement: true });
          meals.createIndex("planId", "planId");
          meals.createIndex("weekStart", "weekStart");
          meals.createIndex("generatedAt", "generatedAt");
          const checkins = db.createObjectStore("checkins",     { keyPath: "id", autoIncrement: true });
          checkins.createIndex("day", "day", { unique: true });
          checkins.createIndex("createdAt", "createdAt");
          const ec = db.createObjectStore("extractCache", { keyPath: "hash" });
          ec.createIndex("createdAt", "createdAt");
          const um = db.createObjectStore("userMarkers",  { keyPath: "key" });
          um.createIndex("createdAt", "createdAt");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["profile", "panels"], "readwrite");
          tx.objectStore("profile").put({
            id: "singleton",
            ownerName: "Migration Test",
            sex: "male",
            goals: "test",
            conditions: "none",
            dietPattern: "halal",
            anthropicKey: "sk-ant-test-fake-key",
            model: "claude-sonnet-4-6",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          tx.objectStore("panels").add({
            drawnAt: "2026-05-01",
            source: "manual",
            results: [
              { markerKey: "ferritin_m", value: 18, unit: "ng/mL",
                optimalRange: { low: 70, high: 150 }, flag: "low" },
            ],
            createdAt: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("seed failed")); };
        };
      });

      // Reopen v5 read-only and verify the rows landed before we hand back.
      // Catches any silent transaction failure in the seed.
      return await new Promise<{ panels: number; profile: number; version: number }>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error ?? new Error("verify open failed"));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["profile", "panels"], "readonly");
          const pCount = tx.objectStore("panels").count();
          const prCount = tx.objectStore("profile").count();
          let panels = -1, profile = -1;
          pCount.onsuccess  = () => { panels  = pCount.result; };
          prCount.onsuccess = () => { profile = prCount.result; };
          tx.oncomplete = () => {
            const version = db.version;
            db.close();
            resolve({ panels, profile, version });
          };
        };
      });
    });
    // The seed must have landed a profile + panel into the v5 database.
    // Dexie scales schema versions by 10 internally — IDB v50 == Dexie v5.
    expect(seedResult.version).toBe(50);
    expect(seedResult.panels).toBe(1);
    expect(seedResult.profile).toBe(1);

    // Visit the SPA — opens the DB at v6, runs the additive upgrade. The
    // SPA gates on profile; if migration preserved it, we land on progress;
    // if it wiped it, we'd be redirected to /#/onboarding.
    await page.goto("/#/progress");
    // Force Dexie open via the exposed handle: `db.open()` returns a Promise
    // that resolves once the version chain has completed. Without this, the
    // first lazy operation triggers open and a race against our read.
    const openResult = await page.evaluate(async () => {
      const w = window as unknown as { __almanacDb?: { open(): Promise<unknown> } };
      try {
        await w.__almanacDb?.open();
        return { ok: true, err: null as string | null };
      } catch (e) {
        return { ok: false, err: (e as Error)?.message ?? String(e) };
      }
    });
    // Surface any open error in the assertion message so the failure is debuggable.
    expect(openResult, JSON.stringify(openResult)).toMatchObject({ ok: true });

    // Verify the seeded data actually survived the v6 upgrade. Read
    // straight from IndexedDB so the assertion is independent of UI gating.
    const postUpgrade = await page.evaluate(() => {
      return new Promise<{
        version: number;
        hasProjections: boolean;
        panels: number;
        profile: number;
      }>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve({ version: -1, hasProjections: false, panels: -1, profile: -1 });
        req.onsuccess = () => {
          const db = req.result;
          const hasProjections = db.objectStoreNames.contains("projections");
          const hasProfile     = db.objectStoreNames.contains("profile");
          const hasPanels      = db.objectStoreNames.contains("panels");
          if (!hasProfile || !hasPanels) {
            db.close();
            resolve({ version: db.version, hasProjections, panels: -1, profile: -1 });
            return;
          }
          const tx = db.transaction(["profile", "panels"], "readonly");
          let panels = 0, profile = 0;
          tx.objectStore("panels").count().onsuccess  = (e) => { panels  = (e.target as IDBRequest<number>).result; };
          tx.objectStore("profile").count().onsuccess = (e) => { profile = (e.target as IDBRequest<number>).result; };
          tx.oncomplete = () => {
            const version = db.version;
            db.close();
            resolve({ version, hasProjections, panels, profile });
          };
        };
      });
    });

    // Dexie scales its version numbers by 10 internally (so v5 → IDB v50,
    // v6 → IDB v60). The upgrade ran iff the IDB version is the v6 marker.
    expect(postUpgrade.version).toBe(60);
    expect(postUpgrade.hasProjections).toBe(true);   // new store materialized
    expect(postUpgrade.profile).toBe(1);             // v5 profile survived
    expect(postUpgrade.panels).toBe(1);              // v5 panel survived
  });
});

// Suppress unused-symbol lint for helpers wired but only used by some tests.
void panelIdsOldestFirst;
void isoLocal;
