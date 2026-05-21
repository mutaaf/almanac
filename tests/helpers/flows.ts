// Reusable test flows. Composable — each flow is responsible for putting
// the page in a known state and verifying the navigation happened.
//
// Every flow assumes a fresh browser context (Playwright's default).

import { expect, type Page } from "@playwright/test";

/**
 * Acknowledge the consent splash. Always starts from "/", always ends on
 * "#/onboarding". Idempotent (a no-op if consent is already acknowledged).
 */
export async function acknowledgeConsent(page: Page): Promise<void> {
  await page.goto("/");
  // If consent is already acknowledged, the welcome gate sends us to
  // /onboarding (or wherever we tried to deep-link). Detect by URL.
  if (page.url().includes("#/welcome")) {
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
  }
  await expect(page).toHaveURL(/#\/(onboarding|today|labs|plan|meals|progress|settings)/);
}

interface OnboardOverrides {
  name?: string;
  birthDate?: string;
  sex?: "male" | "female" | "intersex" | "unspecified";
  heightIn?: number;
  weightLb?: number;
  goals?: string;
  conditions?: string;
  dietPattern?: string;
  key?: string;
  model?: string;
}

/**
 * Fill onboarding with a halal-pescatarian profile. Always starts from "/",
 * always ends on the plan first-compose state at "#/plan" (ticket 0007 —
 * after saving the intake form, the user lands on the plan page so the
 * first-compose-from-intake CTA is the first thing they see).
 * Acknowledges consent along the way.
 */
export async function onboard(page: Page, overrides: OnboardOverrides = {}): Promise<void> {
  await acknowledgeConsent(page);

  // If we already onboarded earlier in the test (unlikely with fresh context
  // but defensive), there's nothing to fill.
  if (!page.url().includes("#/onboarding")) return;

  const d = {
    name: "Test User",
    birthDate: "1990-01-15",
    sex: "male" as const,
    heightIn: 70,
    weightLb: 175,
    goals: "Lower cholesterol, more afternoon energy, hold easy habits.",
    conditions: "None.",
    dietPattern: "Halal, pescatarian-leaning. South Asian + Mediterranean. Cook 3 nights, batch on Sunday.",
    key: "sk-ant-test-fake-key",
    model: "claude-sonnet-4-6",
    ...overrides,
  };

  await page.locator("#name").waitFor({ state: "visible" });
  await page.fill("#name", d.name);
  await page.fill("#birthDate", d.birthDate);
  await page.selectOption("#sex", d.sex);
  await page.fill("#heightIn", String(d.heightIn));
  await page.fill("#weightLb", String(d.weightLb));
  await page.fill("#goals", d.goals);
  await page.fill("#conditions", d.conditions);
  await page.fill("#dietPattern", d.dietPattern);
  await page.fill("#key", d.key);
  await page.selectOption("#model", d.model);

  await page.getByRole("button", { name: /^begin$/i }).click();
  await expect(page).toHaveURL(/#\/plan$/);
  // Wait for the plan first-compose state to actually paint before returning;
  // mobile-webkit can race the next page action on initial render.
  await expect(page.locator(".eyebrow, .dash-snapshot, .prose").first()).toBeVisible();
}

/**
 * Add a panel via manual entry. Fills three markers and saves. Leaves the
 * page on the panel detail.
 */
export async function addManualPanel(page: Page): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", "2026-05-01");
  await page.fill("#labName", "Test Lab");
  await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
  await page.locator(".manual-row__input[data-key='triglycerides']").fill("165");
  await page.locator(".manual-row__input[data-key='vit_d_25oh']").fill("32");
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  // Wait for the panel detail to actually paint — the URL change beats the
  // render under Mobile WebKit load.
  await expect(page.locator(".result__name").first()).toBeVisible();
}

/**
 * Poll an IndexedDB store inside the page until a predicate passes (or the
 * timeout expires). WebKit on iOS occasionally delays the commit of a Dexie
 * write past the resolution of the awaiting promise; tests that expect a row
 * immediately after the write would otherwise read empty.
 *
 * `pred` lets a caller assert "at least 2 rows" or "row with planId X"
 * instead of just "anything"; default is "at least one row exists".
 */
export async function waitForDb(
  page: Page,
  store: "plans" | "mealPlans" | "panels" | "checkins",
  pred: (rowCount: number) => boolean = (n) => n > 0,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs  = opts.timeoutMs  ?? 10_000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  // Read by opening a fresh connection to "almanac" — the same database the
  // SPA's Dexie instance uses, so we see the same rows once they've committed.
  while (Date.now() < deadline) {
    const count = await page.evaluate<number, string>((storeName) => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve(0);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(0); return; }
          const tx = db.transaction(storeName, "readonly");
          const c  = tx.objectStore(storeName).count();
          c.onerror   = () => { db.close(); resolve(0); };
          c.onsuccess = () => { db.close(); resolve(c.result as number); };
        };
      });
    }, store);

    if (pred(count)) return;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`waitForDb timed out after ${timeoutMs}ms waiting on "${store}"`);
}

/**
 * Enter the sample tour (ticket 0014). Starts from "/", taps the welcome
 * page's "Take a tour with sample data" button, and waits for the masthead
 * to settle on #/today. The tour flag (`localStorage["almanac.tour"]`) is
 * set as a side effect; the consent flag is NOT — touring is not consenting.
 *
 * Used by the sample-tour spec and the privacy-spec extension. Does not
 * touch IndexedDB; the tour reads from a hand-curated fixture.
 */
export async function enterTour(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/welcome$/);
  await page.getByRole("button", { name: /take a tour with sample data/i }).click();
  await expect(page).toHaveURL(/#\/today$/);
  // Wait for the tour banner — it's the deterministic sentinel that the
  // tour-flag-aware router has actually painted, not just that the hash
  // changed.
  await page.locator(".tour-banner").waitFor();
}

/**
 * Exit the sample tour by clicking the banner's "Start your own" link.
 * Leaves the page on #/welcome with the consent checkbox unticked. Counterpart
 * to `enterTour`. Idempotent — if the banner isn't visible, it just visits
 * /welcome and returns.
 */
export async function exitTour(page: Page): Promise<void> {
  const banner = page.locator(".tour-banner a[href='#/welcome']");
  if (await banner.isVisible().catch(() => false)) {
    await banner.click();
    await expect(page).toHaveURL(/#\/welcome$/);
    return;
  }
  await page.goto("/#/welcome");
}

/**
 * Seed the `sessions` table (ticket 0018) with a single row whose `at` is
 * `daysAgo` calendar days behind the wall clock at write time. The router on
 * the next page load records a fresh row, then reads the most-recent row
 * older than the row it just wrote — which lands on the row we seeded here.
 *
 * Writes through the same Dexie database (`almanac`) and store name
 * (`sessions`) the SPA uses, so the read inside the router sees this row.
 * The helper clears the table first so a re-seed isn't shadowed by a stale
 * row from an earlier scenario.
 */
export async function seedSessionGap(page: Page, daysAgo: number): Promise<void> {
  await page.evaluate(({ days }: { days: number }) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) {
          db.close(); resolve(); return;
        }
        const tx = db.transaction("sessions", "readwrite");
        const store = tx.objectStore("sessions");
        const clear = store.clear();
        clear.onsuccess = () => {
          store.add({ at: Date.now() - days * 86_400_000 });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, { days: daysAgo });
}

/**
 * Simulate "user opens the app at the given route" (ticket 0018). Equivalent
 * to a hard navigation: a full page reload so the SPA's module-scoped state
 * is reset and DOMContentLoaded fires fresh. Use this instead of `page.goto`
 * after seeding sessions / projections / plan rows — `page.goto` to a hash
 * URL on the same origin does NOT reload the document, so the router's
 * once-per-session cache survives and the next `route()` call reads stale
 * bookkeeping.
 */
export async function simulateAppOpen(page: Page, route: string): Promise<void> {
  await page.goto(`/${route}`);
  await page.reload();
}

/**
 * Wipe the `sessions` table (ticket 0018). The router records a new row on
 * every page load, so a spec that wants to test the "no prior session" branch
 * must clear after onboarding (which itself drove the router through several
 * loads). Quiet no-op when the store doesn't exist yet (a v6 user on a
 * pre-0018 build).
 */
export async function clearSessions(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onerror   = () => resolve();
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) { db.close(); resolve(); return; }
        const tx = db.transaction("sessions", "readwrite");
        tx.objectStore("sessions").clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); resolve(); };
      };
    });
  });
}

/**
 * Add a panel via manual entry that fires the iron-restricted erythropoiesis
 * rule (ticket 0019). A male profile with ferritin 32 ng/mL (< the functional
 * floor of 70) plus MCV 86 fL (< the functional 88) triggers
 * `iron_restricted_erythropoiesis` in the deterministic engine — the panel the
 * what-if simulator drags against. hs-CRP at 1.5 mg/L sits one signal short
 * of `inflammation_triad`, so dragging ferritin UP past 200 both retires the
 * iron rule and newly fires inflammation — one panel exercises both diff
 * directions. Leaves the page on the panel detail.
 *
 * The default `addManualPanel` panel (cholesterol / triglycerides / vit D)
 * fires none of the multi-marker RULES, so the simulator's "would no longer
 * fire" / "would newly fire" scenarios need this richer panel.
 */
export async function addIronPanel(page: Page): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", "2026-05-01");
  await page.fill("#labName", "Iron Panel");
  await page.locator(".manual-row__input[data-key='ferritin_m']").fill("32");
  await page.locator(".manual-row__input[data-key='mcv']").fill("86");
  await page.locator(".manual-row__input[data-key='hs_crp']").fill("1.5");
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  await expect(page.locator(".result__name").first()).toBeVisible();
}

/**
 * Seed a panel + a minimal composed plan directly into IndexedDB (ticket 0019
 * test support). Lets a what-if spec exercise the simulator on a known panel
 * without paying the onboard→compose round-trip, which is the slowest step and
 * the dominant flake source when the whole suite runs in parallel. The seeded
 * plan is intentionally bare: one insight (so the page has a marker chip), no
 * eat/avoid/habit content. `results` is the panel's marker readings.
 *
 * After seeding, navigate to #/plan and reload so the router reads the fresh
 * rows, then wait for the dashboard sentinel.
 */
export async function seedPlanAndPanel(
  page: Page,
  results: Array<{ markerKey: string; value: number; unit: string }>,
  insightMarkerKey: string,
): Promise<void> {
  await page.evaluate(({ rows, key }) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["panels", "plans"], "readwrite");
        const panelId = tx.objectStore("panels").add({
          drawnAt: "2026-05-01", source: "manual", createdAt: Date.now(), results: rows,
        });
        void panelId;
        tx.objectStore("plans").add({
          generatedAt: Date.now(),
          basedOnPanelIds: [1],
          snapshot: "A seeded plan for the what-if simulation test.",
          insights: [
            { markerKey: key, title: "Seeded insight", detail: "Seeded for the simulator test.", priority: "high" },
          ],
          eatList: [], avoidList: [], lifestyle: [], supplements: [],
          habitStack: { intro: "Small actions.", habits: [] }, retest: [],
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { rows: results, key: insightMarkerKey });

  await page.goto("/#/plan");
  await page.reload();
  await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Enter what-if simulation mode for a marker (ticket 0019). Taps the marker's
 * "What if?" chip on the Plan page and waits for the simulation header to
 * paint — the deterministic sentinel that the page entered simulation mode.
 * The chip is keyed by `data-marker-key` so the same marker appearing in more
 * than one place (insight supporting-marker row, panel summary) resolves to
 * the first chip for that marker.
 */
export async function enterSimulation(page: Page, markerKey: string): Promise<void> {
  await page.locator(`.sim-chip[data-marker-key="${markerKey}"]`).first().click();
  await expect(page.locator(".sim-header")).toBeVisible();
  await expect(page.locator(`.sim-slider[data-marker-key="${markerKey}"]`)).toBeVisible();
}

/**
 * Drive the simulation slider for a marker to a value (ticket 0019). The
 * slider is rendered as a number input plus +/- steppers on both projects
 * (a true touch-drag on the SVG thermometer is flake-prone on mobile-webkit),
 * with the SVG handle layered on top for chromium pointer-drag. The
 * deterministic path both projects share is setting the number input's value
 * and dispatching an `input` event, which is what this helper does — so the
 * re-render assertion is identical across chromium and mobile-webkit.
 */
export async function dragSimulationSlider(
  page: Page,
  markerKey: string,
  value: number,
): Promise<void> {
  const input = page.locator(`.sim-slider[data-marker-key="${markerKey}"] .sim-slider__input`);
  await input.fill(String(value));
  await input.dispatchEvent("input");
}

/**
 * The shape of a shared protocol payload, mirrored loosely for test seeding.
 * Only the fields the adopt-seed extractor reads (`eatList[].food`,
 * `habitStack.habits[].title`) are load-bearing; the rest is realistic noise.
 */
interface SharedPayloadInput {
  version: 1;
  eatList: Array<Record<string, unknown>>;
  avoidList: Array<Record<string, unknown>>;
  habitStack: { intro: string; habits: Array<Record<string, unknown>> };
  mealPlan?: { days: unknown[]; grocery: unknown[] };
}

/** A directly-constructed AdoptSeed for the unit-style seeding helper. */
interface AdoptSeedInput {
  version: 1;
  habitTitles: string[];
  topEatFoods: string[];
  capturedAt: number;
}

/**
 * Enter shared-view from a payload (ticket 0020) and — by default — tap the
 * banner's "Adopt as a starting point" CTA + Continue, landing on #/welcome
 * with the seed written. Encodes the payload through the SAME encoder the
 * source exposes and visits `#/shared?p=...` so the round-trip is identical to
 * a real recipient open (survives the page reload the module-scoped in-memory
 * state would not).
 *
 *   - `tapAdopt: false`  enters shared-view and stops on #/today (so a test can
 *                        assert banner contents or tap "Start your own" itself).
 *   - `fresh: false`     skips navigating to "/" first (used when the caller
 *                        deliberately keeps an existing profile + consent on the
 *                        device, e.g. the returning-user test).
 */
export async function enterSharedViewWithAdopt(
  page: Page,
  payload: SharedPayloadInput,
  opts: { tapAdopt?: boolean; fresh?: boolean } = {},
): Promise<void> {
  const tapAdopt = opts.tapAdopt ?? true;
  const fresh = opts.fresh ?? true;

  if (fresh) await page.goto("/");
  const encoded = await page.evaluate(async (p) => {
    const mod = await import("/src/share/protocol-link.ts");
    // The encoder takes a Plan + optional MealPlan. Build a synthetic Plan
    // shell carrying just the shared fields, mirroring materializeState().
    const plan = {
      id: 0, generatedAt: 0, basedOnPanelIds: [],
      snapshot: "", insights: [],
      eatList: p.eatList, avoidList: p.avoidList,
      lifestyle: [], supplements: [],
      habitStack: p.habitStack, retest: [],
    } as unknown as import("../../src/types").Plan;
    const mealPlan = p.mealPlan
      ? ({ id: 0, planId: 0, weekStart: "", generatedAt: 0, days: p.mealPlan.days, grocery: p.mealPlan.grocery } as unknown as import("../../src/types").MealPlan)
      : undefined;
    return mod.encodeProtocolPayload(plan, mealPlan);
  }, payload);

  await page.goto(`/#/shared?p=${encoded}`);
  await expect(page).toHaveURL(/#\/today$/);
  await page.locator(".tour-banner").waitFor();

  if (!tapAdopt) return;

  await page.locator(".tour-banner [data-action='adopt-protocol']").click();
  await page.locator(".adopt-modal").waitFor();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page).toHaveURL(/#\/welcome$/);
}

/**
 * Write an AdoptSeed straight into localStorage (ticket 0020) — the unit-style
 * seeding path that skips the share-view round-trip when a test only needs to
 * assert the welcome notice / onboarding prefix render from a seed.
 */
export async function seedAdoptInLocalStorage(page: Page, seed: AdoptSeedInput): Promise<void> {
  await page.evaluate((s) => {
    localStorage.setItem("almanac.adoptSeed", JSON.stringify(s));
  }, seed);
}

/* -------------------------------------------------------------------------- */
/*  Hundred-day mark seeding (ticket 0021)                                     */
/* -------------------------------------------------------------------------- */

/** One habit on a seeded plan. */
interface SeedHabit { id: string; title: string; cue?: string; why?: string }

/** One seeded plan, generated `daysAgo` days before the wall clock. */
interface SeedPlan {
  daysAgo: number;
  habits: SeedHabit[];
  /** Optional eat-list marker linkage (food-driven habit→marker link). */
  eatMarkerKeys?: string[];
}

/** One seeded check-in. `dayOffset` is days after the FIRST plan's generation. */
interface SeedCheckIn { dayOffset: number; habitsCompleted: string[] }

/** One seeded panel, drawn `dayOffset` days after the first plan. */
interface SeedPanel {
  dayOffset: number;
  results: Array<{ markerKey: string; value: number; unit: string }>;
}

/** One seeded projection snapshot computed FROM `panelDayOffset`'s panel. */
interface SeedProjection {
  markerKey: string;
  panelDayOffset: number;
  low: number;
  high: number;
}

export interface SeedHundredDayOpts {
  /** Plans the user composed during (or at the start of) the window. */
  plans: SeedPlan[];
  /** Check-ins spanning the window. */
  checkIns: SeedCheckIn[];
  /** Optional panels drawn inside the window. */
  panels?: SeedPanel[];
  /** Optional projection snapshots (joined to a panel by day-offset). */
  projections?: SeedProjection[];
}

/**
 * Seed IndexedDB with a synthetic timeline for the hundred-day surface (ticket
 * 0021): a set of plans (each generated `daysAgo` days back), check-ins spanning
 * the 100-day window, and optional panels + projection snapshots. This lets the
 * spec exercise every `computeHundredDayState()` code path without paying the
 * full onboard→compose round-trip.
 *
 * Day-offsets in `checkIns` / `panels` are measured from the FIRST plan's
 * generation day (offset 0 = the first plan's day). The helper resolves them to
 * real ISO Days off the wall clock at seed time so the in-app `now` math lines
 * up. Clears `plans`, `checkins`, `panels`, and `projections` first so a re-seed
 * isn't shadowed by a prior scenario.
 */
export async function seedHundredDayState(page: Page, opts: SeedHundredDayOpts): Promise<void> {
  await page.evaluate((o: SeedHundredDayOpts) => {
    const DAY_MS = 86_400_000;
    const now = Date.now();
    // The earliest plan is the window anchor (day 0).
    const oldestDaysAgo = Math.max(...o.plans.map((p) => p.daysAgo));
    const firstPlanAt = now - oldestDaysAgo * DAY_MS;
    const isoForOffset = (offset: number): string =>
      new Date(firstPlanAt + offset * DAY_MS).toISOString().slice(0, 10);

    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error ?? new Error("open failed"));
        req.onsuccess = () => resolve(req.result);
      });

    // Phase 1: clear the four stores, write plans + check-ins + panels, and
    // capture each panel's auto-assigned id keyed by its day-offset. We resolve
    // only on tx.oncomplete, so every id is committed before phase 2 runs —
    // no reassigning a request's onsuccess after it may already have fired.
    const writeBase = (db: IDBDatabase): Promise<Map<number, number>> =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(["plans", "checkins", "panels", "projections"], "readwrite");
        const plans = tx.objectStore("plans");
        const checkins = tx.objectStore("checkins");
        const panelsStore = tx.objectStore("panels");
        const projections = tx.objectStore("projections");
        plans.clear();
        checkins.clear();
        panelsStore.clear();
        projections.clear();

        for (const p of o.plans) {
          plans.add({
            generatedAt: now - p.daysAgo * DAY_MS,
            basedOnPanelIds: [],
            snapshot: "A seeded plan for the hundred-day surface test.",
            insights: [],
            eatList: (p.eatMarkerKeys && p.eatMarkerKeys.length)
              ? [{ id: "e1", food: "Seeded food", frequency: "weekly", portion: "1", why: "x", markerKeys: p.eatMarkerKeys }]
              : [],
            avoidList: [],
            lifestyle: [],
            supplements: [],
            habitStack: {
              intro: "Small actions.",
              habits: p.habits.map((h) => ({ id: h.id, title: h.title, cue: h.cue ?? "AM", why: h.why ?? "x" })),
            },
            retest: [],
          });
        }

        for (const c of o.checkIns) {
          checkins.add({
            day: isoForOffset(c.dayOffset),
            habitsCompleted: c.habitsCompleted,
            createdAt: now,
          });
        }

        const panelIdByOffset = new Map<number, number>();
        for (const panel of o.panels ?? []) {
          const r = panelsStore.add({
            drawnAt: isoForOffset(panel.dayOffset),
            source: "manual",
            createdAt: now,
            results: panel.results,
          });
          r.onsuccess = () => { panelIdByOffset.set(panel.dayOffset, r.result as number); };
        }

        tx.oncomplete = () => resolve(panelIdByOffset);
        tx.onerror    = () => reject(tx.error ?? new Error("base tx failed"));
      });

    // Phase 2: write projection snapshots, joining each to its source panel's
    // now-committed id. Skipped when there are no projections to seed.
    const writeProjections = (db: IDBDatabase, panelIdByOffset: Map<number, number>): Promise<void> =>
      new Promise((resolve, reject) => {
        const projs = o.projections ?? [];
        if (!projs.length) { resolve(); return; }
        const tx = db.transaction(["projections"], "readwrite");
        const store = tx.objectStore("projections");
        for (const proj of projs) {
          const panelId = panelIdByOffset.get(proj.panelDayOffset);
          if (panelId == null) continue;
          store.add({
            markerKey: proj.markerKey,
            panelId,
            low: proj.low,
            high: proj.high,
            weeksOut: [8, 12],
            createdAt: now,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error ?? new Error("projection tx failed"));
      });

    return open().then((db) =>
      writeBase(db)
        .then((ids) => writeProjections(db, ids))
        .finally(() => db.close()),
    );
  }, opts);
}

/* -------------------------------------------------------------------------- */
/*  Panel seeding (ticket 0032 movement-receipt; sibling of 0026)              */
/* -------------------------------------------------------------------------- */

/** One fully-formed panel for `seedPanel`. `drawnAt` is the ISO draw date
 *  the receipt diffs on; `results` are the marker readings. */
export interface SeedPanelInput {
  drawnAt: Day;
  labName?: string;
  results: Array<{ markerKey: string; value: number; unit: string; optimalRange?: { low?: number; high?: number } }>;
  /** Clear the `panels` store before writing this row. Default false. */
  clearFirst?: boolean;
}

/** A `Day` is just a YYYY-MM-DD string in the app's domain types. */
type Day = string;

/**
 * Write one fully-formed Panel straight into IndexedDB (ticket 0032). Lets the
 * movement-receipt spec seed exact value pairs across two panels with
 * controlled `drawnAt` so it can assert the into-range / toward / away /
 * unchanged copy without paying the extraction round-trip. Each call appends a
 * row; pass `clearFirst: true` on the FIRST seed of a scenario so a re-seed
 * isn't shadowed by a prior panel.
 *
 * The row carries each result's `optimalRange` (resolved from the marker DB by
 * the caller when it needs the receipt's range crossing to be exact) so the
 * seeded panel is shaped like a real extracted panel. After seeding, navigate
 * to `#/labs?id=N` and reload so the router reads the fresh rows.
 *
 * Returns the auto-assigned panel id so the spec can deep-link to its detail.
 */
export async function seedPanel(page: Page, panel: SeedPanelInput): Promise<number> {
  return page.evaluate((p: SeedPanelInput) => {
    return new Promise<number>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("panels", "readwrite");
        const store = tx.objectStore("panels");
        if (p.clearFirst) store.clear();
        let newId = -1;
        const add = store.add({
          drawnAt: p.drawnAt,
          ...(p.labName ? { labName: p.labName } : {}),
          source: "manual",
          createdAt: Date.now(),
          results: p.results.map((r) => ({
            markerKey: r.markerKey,
            value: r.value,
            unit: r.unit,
            ...(r.optimalRange ? { optimalRange: r.optimalRange } : {}),
          })),
        });
        add.onsuccess = () => { newId = add.result as number; };
        tx.oncomplete = () => { db.close(); resolve(newId); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, panel);
}

/* -------------------------------------------------------------------------- */
/*  Retest-due surface seeding (ticket 0028)                                   */
/* -------------------------------------------------------------------------- */

/** One retest cadence on a seeded plan. */
interface SeedRetest { markerKeys: string[]; whenWeeks: number; reason?: string }

/** One panel for the retest seed, drawn `daysAgo` calendar days back. */
interface SeedRetestPanel {
  daysAgo: number;
  results: Array<{ markerKey: string; value: number; unit: string }>;
}

export interface SeedRetestPlanOpts {
  /** How many calendar days ago the plan was generated (the cadence anchor). */
  generatedDaysAgo: number;
  /** The retest cadences the generator wrote onto the plan. */
  retest: SeedRetest[];
  /** Optional panels — used by the "card clears after a covering draw" path. */
  panels?: SeedRetestPanel[];
  /** Optional second (NEWER) plan, for the newest-plan-wins recomposition path. */
  newerPlan?: { generatedDaysAgo: number; retest: SeedRetest[] };
}

/**
 * Seed IndexedDB with a composed plan (and optionally a newer plan + panels)
 * whose retest cadence places a draw at a controlled offset from the wall
 * clock. The due date is `generatedAt + whenWeeks * 7 days`, so a spec can
 * place a draw 9 days out / 1 day out / 8 days past by choosing
 * `generatedDaysAgo` relative to `whenWeeks`.
 *
 * Clears `plans` and `panels` first so a re-seed isn't shadowed by a prior
 * scenario. Each seeded plan carries a real habit stack so the Today page
 * renders its usual surfaces around the retest card. Mirrors the
 * `seedHundredDayState` two-store write pattern; nothing here is persisted that
 * the app doesn't already persist (no schema change).
 */
export async function seedPlanWithRetest(page: Page, opts: SeedRetestPlanOpts): Promise<void> {
  await page.evaluate((o: SeedRetestPlanOpts) => {
    const DAY_MS = 86_400_000;
    const now = Date.now();
    const isoForDaysAgo = (daysAgo: number): string =>
      new Date(now - daysAgo * DAY_MS).toISOString().slice(0, 10);

    const planRow = (generatedDaysAgo: number, retest: SeedRetest[]) => ({
      generatedAt: now - generatedDaysAgo * DAY_MS,
      basedOnPanelIds: [],
      snapshot: "A seeded plan for the retest-due surface test.",
      insights: [],
      eatList: [], avoidList: [], lifestyle: [], supplements: [],
      habitStack: {
        intro: "Small actions.",
        habits: [{ id: "h1", title: "Walk after dinner", cue: "PM", why: "x" }],
      },
      retest: retest.map((r) => ({
        markerKeys: r.markerKeys,
        whenWeeks: r.whenWeeks,
        reason: r.reason ?? "Re-test on the next draw.",
      })),
    });

    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["plans", "panels"], "readwrite");
        const plans = tx.objectStore("plans");
        const panels = tx.objectStore("panels");
        plans.clear();
        panels.clear();

        plans.add(planRow(o.generatedDaysAgo, o.retest));
        if (o.newerPlan) plans.add(planRow(o.newerPlan.generatedDaysAgo, o.newerPlan.retest));

        for (const panel of o.panels ?? []) {
          panels.add({
            drawnAt: isoForDaysAgo(panel.daysAgo),
            source: "manual",
            createdAt: now,
            results: panel.results,
          });
        }

        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, opts);
}

/**
 * Compose the plan. Mocks must already be installed. Leaves the page on /plan.
 *
 * The previous version of this helper had a `page.reload()` to dodge a
 * WebKit-only race where the post-compose render read latestPlan() before
 * IndexedDB had committed. The real fix lives in src/pages/plan.ts
 * (compose() now polls `latestPlan()` after the save and `await route()`s
 * the re-render). This helper waits for the page to settle into one of two
 * shapes — empty state with the Compose button, or dashboard with a plan —
 * before deciding what to do. `isVisible()` is an instantaneous snapshot
 * and would race the page's initial render on Mobile WebKit, which is why
 * this used to swallow the click on a slow boot.
 */
export async function composePlan(page: Page): Promise<void> {
  await page.goto("/#/plan");
  // Wait for the plan page to actually paint into one of its two shapes.
  // On Mobile WebKit the bootstrap can lag behind Playwright's `load` event
  // by 200–400ms; without this wait the next `isVisible()` is a coin flip.
  await page.locator(".dash-snapshot, .prose, #compose").first().waitFor();

  const composeBtn = page.locator("#compose");
  if (await composeBtn.isVisible().catch(() => false)) {
    await composeBtn.click();
    // The save has to complete (1 row in `plans`) before the dashboard
    // can paint. Polling the row count is robust to Mobile Safari's
    // slightly-delayed commit visibility under parallel load.
    await waitForDb(page, "plans", (n) => n >= 1, { timeoutMs: 30_000 });
  }
  await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
}

/* -------------------------------------------------------------------------- */
/*  Plan-to-plan delta seeding (ticket 0029)                                    */
/* -------------------------------------------------------------------------- */

/** A partial eat item — only the identity + diffed fields need supplying. */
interface SeedEat {
  id?: string;
  food: string;
  frequency?: string;
  portion?: string;
  why?: string;
  markerKeys?: string[];
}

/** A partial avoid item — identity is `food`. */
interface SeedAvoid { id?: string; food: string; why?: string; swap?: string }

/** A partial habit — identity is `title`. */
interface SeedHabitDelta { id?: string; title: string; cue?: string; why?: string }

/** A partial insight — identity is `title`. */
interface SeedInsight {
  title: string;
  detail?: string;
  priority?: "high" | "medium" | "low";
  markerKey?: string;
}

/**
 * One fully-formed Plan for `seedPlan`. `generatedDaysAgo` controls the row's
 * `generatedAt` (the chronological key the delta diffs on); the section arrays
 * default to empty so a spec supplies only the fields its scenario diffs.
 */
export interface SeedPlanInput {
  generatedDaysAgo: number;
  snapshot?: string;
  eatList?: SeedEat[];
  avoidList?: SeedAvoid[];
  habits?: SeedHabitDelta[];
  insights?: SeedInsight[];
  /** Clear the `plans` store before writing this row. Default false. */
  clearFirst?: boolean;
}

/**
 * Write one fully-formed Plan straight into IndexedDB with a controlled
 * `generatedAt` (ticket 0029). Lets the plan-delta spec construct exact
 * deltas — salmon 2x → 3x, a retired habit, a resolved insight — across two
 * (or three) plans without depending on generator output. Each call appends a
 * row; pass `clearFirst: true` on the FIRST seed of a scenario so a re-seed
 * isn't shadowed by a prior plan. The row is shaped exactly like a composed
 * Plan so the page's normal render path (and the delta render above it) read it
 * with no special-casing.
 *
 * After seeding the rows a spec wants live, navigate to #/plan and reload so
 * the router reads the fresh rows — `seedPlan` itself does not navigate.
 */
export async function seedPlan(page: Page, plan: SeedPlanInput): Promise<void> {
  await page.evaluate((p: SeedPlanInput) => {
    const DAY_MS = 86_400_000;
    const now = Date.now();
    const row = {
      generatedAt: now - p.generatedDaysAgo * DAY_MS,
      basedOnPanelIds: [] as number[],
      snapshot: p.snapshot ?? "A seeded plan for the plan-delta test.",
      insights: (p.insights ?? []).map((i) => ({
        title: i.title,
        detail: i.detail ?? "Seeded insight detail.",
        priority: i.priority ?? "medium",
        ...(i.markerKey ? { markerKey: i.markerKey } : {}),
      })),
      eatList: (p.eatList ?? []).map((e, idx) => ({
        id: e.id ?? `e${idx + 1}`,
        food: e.food,
        frequency: e.frequency ?? "weekly",
        portion: e.portion ?? "1 serving",
        why: e.why ?? "Seeded reason.",
        markerKeys: e.markerKeys ?? [],
      })),
      avoidList: (p.avoidList ?? []).map((a, idx) => ({
        id: a.id ?? `a${idx + 1}`,
        food: a.food,
        why: a.why ?? "Seeded reason.",
        ...(a.swap ? { swap: a.swap } : {}),
      })),
      lifestyle: [],
      supplements: [],
      habitStack: {
        intro: "Small actions.",
        habits: (p.habits ?? []).map((h, idx) => ({
          id: h.id ?? `h${idx + 1}`,
          title: h.title,
          cue: h.cue ?? "AM",
          why: h.why ?? "Seeded reason.",
        })),
      },
      retest: [],
    };

    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("plans", "readwrite");
        const store = tx.objectStore("plans");
        if (p.clearFirst) store.clear();
        store.add(row);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  }, plan);
}
