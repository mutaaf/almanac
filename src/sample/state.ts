// Sample-tour state module (ticket 0014).
//
// Tiny boundary between the rest of the app and the hand-curated fixture:
//
//   - `isTour()`           reads the localStorage sentinel
//   - `enterTour()`        flips it on
//   - `exitTour()`         flips it off + clears the in-memory cache
//   - `tourProfile()`,
//     `tourPanels()`,
//     `tourPlan()`,
//     `tourMealPlan()`,
//     `tourCheckIns()`,
//     `tourPanel(id)`,
//     `tourProjectionsFor(panelId)`
//                          getter shims that return DEEP CLONES of the fixture
//
// The fixture is imported lazily — `await import("./fixture")` — so the
// production bundle for non-tour visitors carries none of the fixture bytes.
// The first tour-getter call hydrates the cache; subsequent calls reuse it,
// then deep-clone before returning so a page that mutates the result (e.g.
// the meals page sorting `mealPlan.days`) doesn't poison subsequent reads.

import type {
  CheckIn, MealPlan, Panel, Plan, Profile, ProjectionSnapshot,
} from "../types";

const TOUR_KEY = "almanac.tour";

/* -------------------------------------------------------------------------- */
/*  Sentinel                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * True when the tour flag is set in localStorage. Cheap to call; safe to call
 * from every page render. Guards against the rare environment where
 * localStorage throws on access (private-mode Safari with quota exceeded);
 * in that case we fall back to "not touring" and the user gets the real gate.
 */
export function isTour(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "true"; }
  catch { return false; }
}

/**
 * Flip the tour sentinel on. Wired to the welcome page's "Take a tour with
 * sample data" button. Does NOT also set the consent flag — that's the
 * whole point of the ticket.
 */
export function enterTour(): void {
  try { localStorage.setItem(TOUR_KEY, "true"); }
  catch { /* private mode: the next isTour() call returns false */ }
}

/**
 * Flip the tour sentinel off and drop any cached fixture state. Wired to
 * the masthead banner's "Start your own →" link via the router. Idempotent.
 */
export function exitTour(): void {
  try { localStorage.removeItem(TOUR_KEY); }
  catch { /* nothing to do */ }
  _cache = null;
}

/* -------------------------------------------------------------------------- */
/*  Fixture cache + getters                                                   */
/* -------------------------------------------------------------------------- */

interface FixtureModule {
  buildSampleState: () => {
    profile: Profile; panels: Panel[]; plan: Plan;
    mealPlan: MealPlan; checkins: CheckIn[];
  };
}

let _cache: ReturnType<FixtureModule["buildSampleState"]> | null = null;

/**
 * Hydrate the in-memory fixture cache on first access. Dynamic `import()`
 * keeps the fixture out of the production bundle for non-tour visitors; the
 * tour pays a one-time round-trip on first call and then everything is sync.
 *
 * `loadFixture()` is intentionally NOT exposed — callers use the typed
 * getters below so the cache isolation stays honest.
 */
async function loadFixture(): Promise<NonNullable<typeof _cache>> {
  if (_cache) return _cache;
  const mod = (await import("./fixture")) as unknown as FixtureModule;
  _cache = mod.buildSampleState();
  return _cache;
}

/**
 * Deep-clone via structuredClone. This is what guarantees a page that mutates
 * the returned array (the meals page sorting `days`, the labs page pushing
 * onto `results`) cannot poison the fixture for subsequent reads.
 *
 * structuredClone is in every browser we target; the only thing it choked on
 * historically was Blob, and the fixture carries no Blob fields.
 */
function clone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  // Defensive fallback — JSON roundtrip is fine for the fixture's shape
  // (plain numbers, strings, arrays, objects). Never reached in modern targets.
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ---- typed getters ----------------------------------------------------- */

export async function tourProfile(): Promise<Profile> {
  const s = await loadFixture();
  return clone(s.profile);
}

export async function tourPanels(): Promise<Panel[]> {
  const s = await loadFixture();
  // Mirror `allPanels()` — newest first by drawnAt.
  return clone(s.panels).sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
}

export async function tourPanel(id: number): Promise<Panel | undefined> {
  const s = await loadFixture();
  const p = s.panels.find(x => x.id === id);
  return p ? clone(p) : undefined;
}

export async function tourPlan(): Promise<Plan> {
  const s = await loadFixture();
  return clone(s.plan);
}

export async function tourAllPlans(): Promise<Plan[]> {
  const s = await loadFixture();
  return [clone(s.plan)];
}

export async function tourMealPlan(): Promise<MealPlan> {
  const s = await loadFixture();
  return clone(s.mealPlan);
}

export async function tourCheckIns(limit: number): Promise<CheckIn[]> {
  const s = await loadFixture();
  // Mirror `recentCheckIns()` — newest first by `day`, limited.
  const sorted = clone(s.checkins).sort((a, b) => b.day.localeCompare(a.day));
  return sorted.slice(0, limit);
}

export async function tourCheckInFor(day: string): Promise<CheckIn | undefined> {
  const s = await loadFixture();
  const c = s.checkins.find(x => x.day === day);
  return c ? clone(c) : undefined;
}

/**
 * No persisted projections in the fixture — the projection module computes
 * its bands directly from the plan + check-ins. Returning [] mirrors the
 * "no prior snapshot" code path on the Progress page.
 */
export async function tourProjectionsFor(_panelId: number): Promise<ProjectionSnapshot[]> {
  void _panelId;
  return [];
}
