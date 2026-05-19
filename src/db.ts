// Local-first storage. All persistence lives here.
//
// Sample-tour shim (ticket 0014): every read used by the page layer consults
// `isTour()` first and returns the in-memory fixture's value when the flag
// is set. Every write checks `isTour()` at the top and surfaces an inline
// notice instead of touching Dexie. The shim is thin on purpose — we want
// the existing call sites in the page layer to keep their signatures so a
// reviewer can read the diff and see "the read just got a tour branch".

import Dexie, { type Table } from "dexie";
import type { Profile, Panel, Plan, MealPlan, CheckIn, Day, MarkerDef, ProjectionSnapshot, SessionRow } from "./types";
import {
  isTour,
  tourProfile, tourPanels, tourPanel, tourPlan, tourAllPlans,
  tourMealPlan, tourCheckIns, tourCheckInFor, tourProjectionsFor,
} from "./sample/state";
import {
  isSharedView,
  sharedPlan, sharedMealPlan, sharedProfile,
} from "./share/shared-state";
import { surfaceInlineTourNotice } from "./ui";

export interface ExtractCacheEntry {
  hash: string;            // SHA-256 of the staged files (in order)
  result: unknown;         // ExtractionResult — typed at the call site
  createdAt: number;
}

/**
 * A user-defined marker. Same shape as the built-in seed (see `MarkerDef` in
 * `types.ts`) plus a `createdAt` timestamp so we can list them in order.
 * Stored in the `userMarkers` Dexie table (v5).
 */
export interface UserMarker extends MarkerDef {
  createdAt: number;
}

class AlmanacDB extends Dexie {
  profile!:       Table<Profile,           "singleton">;
  panels!:        Table<Panel,             number>;
  plans!:         Table<Plan,              number>;
  mealPlans!:     Table<MealPlan,          number>;
  checkins!:      Table<CheckIn,           number>;
  extractCache!:  Table<ExtractCacheEntry, string>;
  userMarkers!:   Table<UserMarker,        string>;
  projections!:   Table<ProjectionSnapshot, number>;
  sessions!:      Table<SessionRow,         number>;

  constructor() {
    super("almanac");

    // v1 — original prose-journal schema, kept for clean upgrade.
    this.version(1).stores({
      entries: "++id, day, createdAt", pages: "++id, &day, generatedAt",
      summaries: "++id, day, createdAt", settings: "id",
    });

    // v2 — precision-health schema.
    this.version(2).stores({
      entries: null, pages: null, summaries: null, settings: null,
      profile:  "id",
      panels:   "++id, drawnAt, createdAt",
      plans:    "++id, generatedAt",
      checkins: "++id, &day, createdAt",
    });

    // v3 — adds the meal plan table. Existing v2 data is preserved.
    this.version(3).stores({
      profile:   "id",
      panels:    "++id, drawnAt, createdAt",
      plans:     "++id, generatedAt",
      mealPlans: "++id, planId, weekStart, generatedAt",
      checkins:  "++id, &day, createdAt",
    });

    // v4 — adds extraction cache. Re-pasting the same lab files reuses
    // the previously extracted result instead of re-billing Claude Vision.
    this.version(4).stores({
      profile:      "id",
      panels:       "++id, drawnAt, createdAt",
      plans:        "++id, generatedAt",
      mealPlans:    "++id, planId, weekStart, generatedAt",
      checkins:     "++id, &day, createdAt",
      extractCache: "hash, createdAt",
    });

    // v5 — adds the user-extensible marker table. Specialty panels (Lp-PLA2,
    // ceruloplasmin, hs-troponin, etc.) that aren't in our curated seed can
    // be defined by the user once and reused across panels. User entries
    // win over seed entries when keys collide. Additive over v4.
    this.version(5).stores({
      profile:      "id",
      panels:       "++id, drawnAt, createdAt",
      plans:        "++id, generatedAt",
      mealPlans:    "++id, planId, weekStart, generatedAt",
      checkins:     "++id, &day, createdAt",
      extractCache: "hash, createdAt",
      userMarkers:  "&key, createdAt",
    });

    // v6 — adds the projections table for the between-draws "what we'd
    // expect" cards on #/progress (ticket 0012). One row per qualifying
    // marker per panel upload, keyed by [markerKey+panelId] so a re-upload
    // of the same panel doesn't double-record. Additive over v5; existing
    // v5 data is preserved (see the migration test in projection.spec.ts).
    this.version(6).stores({
      profile:      "id",
      panels:       "++id, drawnAt, createdAt",
      plans:        "++id, generatedAt",
      mealPlans:    "++id, planId, weekStart, generatedAt",
      checkins:     "++id, &day, createdAt",
      extractCache: "hash, createdAt",
      userMarkers:  "&key, createdAt",
      projections:  "++id, &[markerKey+panelId], panelId, markerKey, createdAt",
    });

    // v7 — adds the `sessions` table (ticket 0018). One row per full-page
    // load with shape `{ id?: number; at: number }` — nothing else. The
    // router writes a row on every load and reads the most-recent row OLDER
    // than the row it just wrote to compute the lapse gap that drives the
    // welcome-back redirect. Additive over v6; existing data is preserved.
    // Privacy contract on this table: only the wall-clock `at` and the auto
    // id — no user-agent, no IP, no per-page tracking. That minimum is what
    // makes lapse detection possible without widening the contract.
    this.version(7).stores({
      profile:      "id",
      panels:       "++id, drawnAt, createdAt",
      plans:        "++id, generatedAt",
      mealPlans:    "++id, planId, weekStart, generatedAt",
      checkins:     "++id, &day, createdAt",
      extractCache: "hash, createdAt",
      userMarkers:  "&key, createdAt",
      projections:  "++id, &[markerKey+panelId], panelId, markerKey, createdAt",
      sessions:     "++id, at",
    });
  }
}

export const db = new AlmanacDB();

// In dev/test only, expose the Dexie handle on `window` so the v5→v6 schema
// migration spec can close the connection before deleting the database to
// re-seed it at the older version. Vite replaces `import.meta.env.DEV` at
// build time; in production this branch evaluates to false and gets dropped
// from the bundle, so no global is ever attached.
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __almanacDb?: AlmanacDB }).__almanacDb = db;
}

/* -------------------------------------------------------------------------- */
/*  Day helpers                                                               */
/* -------------------------------------------------------------------------- */

export function today(): Day { return iso(new Date()); }

export function iso(d: Date): Day {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function age(birthDate: Day | undefined, now = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate + "T00:00:00");
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

export function addDays(day: Day, n: number): Day {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}

/**
 * ISO 8601 week label: "YYYY-Www". Weeks run Monday → Sunday and the week
 * that contains the year's first Thursday is week 01. We use this label as
 * the localStorage key for the weekly recap's dismissal flag, so two
 * sessions on the same calendar week land on the same key regardless of
 * locale or time-of-day.
 *
 * The math is the canonical algorithm: pivot to the nearest Thursday, then
 * the week number is the round-trip distance from Jan 4 (which is always
 * in week 1).
 */
export function isoWeek(d: Date): string {
  // Copy to UTC midnight so DST shifts in the source don't move the date.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;                  // Sun = 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);     // nearest Thursday
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * The Monday → Sunday Day window enclosing `d` (inclusive on both ends).
 * Returns `[mondayIso, sundayIso]`. Pure; no DB dependency. The weekly recap
 * uses this to slice `recentCheckIns` into "this week" vs "last week".
 */
export function weekRange(d: Date): [Day, Day] {
  // Day-of-week with Monday = 0 ... Sunday = 6.
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (local.getDay() + 6) % 7;
  const mon = new Date(local); mon.setDate(local.getDate() - dow);
  const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

export async function getProfile(): Promise<Profile | undefined> {
  if (isSharedView()) return sharedProfile();
  if (isTour())      return tourProfile();
  return db.profile.get("singleton");
}

export async function saveProfile(
  p: Omit<Profile, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Profile, "createdAt">>,
): Promise<void> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return; }
  if (isTour())      { surfaceInlineTourNotice(); return; }
  const existing = await db.profile.get("singleton");
  await db.profile.put({
    id: "singleton",
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    ...p,
  });
}

/* -------------------------------------------------------------------------- */
/*  Panels                                                                    */
/* -------------------------------------------------------------------------- */

export async function addPanel(p: Omit<Panel, "id" | "createdAt">): Promise<number> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return -1; }
  if (isTour())      { surfaceInlineTourNotice(); return -1; }
  return db.panels.add({ ...p, createdAt: Date.now() });
}
export async function updatePanel(id: number, p: Partial<Panel>): Promise<void> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return; }
  if (isTour())      { surfaceInlineTourNotice(); return; }
  await db.panels.update(id, p);
}
export async function getPanel(id: number): Promise<Panel | undefined> {
  // Shared-view: panel detail was not part of the share. Return undefined so
  // the labs page renders the "This was not shared with you" empty state
  // without touching IndexedDB.
  if (isSharedView()) return undefined;
  if (isTour()) return tourPanel(id);
  return db.panels.get(id);
}
export async function allPanels(): Promise<Panel[]> {
  if (isSharedView()) return [];
  if (isTour()) return tourPanels();
  return db.panels.orderBy("drawnAt").reverse().toArray();
}
export async function deletePanel(id: number): Promise<void> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return; }
  if (isTour())      { surfaceInlineTourNotice(); return; }
  await db.panels.delete(id);
}

/* -------------------------------------------------------------------------- */
/*  Plans                                                                     */
/* -------------------------------------------------------------------------- */

export async function latestPlan(): Promise<Plan | undefined> {
  if (isSharedView()) return sharedPlan();
  if (isTour())      return tourPlan();
  return db.plans.orderBy("generatedAt").reverse().first();
}
export async function savePlan(p: Omit<Plan, "id">): Promise<number> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return -1; }
  if (isTour())      { surfaceInlineTourNotice(); return -1; }
  return db.plans.add(p);
}
export async function allPlans(): Promise<Plan[]> {
  if (isSharedView()) {
    const p = sharedPlan();
    return p ? [p] : [];
  }
  if (isTour()) return tourAllPlans();
  return db.plans.orderBy("generatedAt").reverse().toArray();
}

/* -------------------------------------------------------------------------- */
/*  Meal plans                                                                */
/* -------------------------------------------------------------------------- */

export async function latestMealPlan(): Promise<MealPlan | undefined> {
  if (isSharedView()) return sharedMealPlan();
  if (isTour())      return tourMealPlan();
  return db.mealPlans.orderBy("generatedAt").reverse().first();
}
export async function mealPlanForPlan(planId: number): Promise<MealPlan | undefined> {
  if (isSharedView()) {
    const mp = sharedMealPlan();
    // The shared plan's synthetic id is 0; treat any planId lookup as a
    // match so the Meals page reads the shared meal plan when present.
    return mp && (mp.planId === planId || planId === 0) ? mp : sharedMealPlan();
  }
  if (isTour()) {
    const mp = await tourMealPlan();
    return mp.planId === planId ? mp : undefined;
  }
  return db.mealPlans.where("planId").equals(planId).reverse().sortBy("generatedAt").then(a => a[0]);
}
export async function saveMealPlan(m: Omit<MealPlan, "id">): Promise<number> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return -1; }
  if (isTour())      { surfaceInlineTourNotice(); return -1; }
  return db.mealPlans.add(m);
}
export async function allMealPlans(): Promise<MealPlan[]> {
  if (isSharedView()) {
    const mp = sharedMealPlan();
    return mp ? [mp] : [];
  }
  if (isTour()) {
    const mp = await tourMealPlan();
    return [mp];
  }
  return db.mealPlans.orderBy("generatedAt").reverse().toArray();
}

/* -------------------------------------------------------------------------- */
/*  Check-ins                                                                 */
/* -------------------------------------------------------------------------- */

export async function checkInFor(day: Day): Promise<CheckIn | undefined> {
  if (isSharedView()) return undefined;
  if (isTour()) return tourCheckInFor(day);
  return db.checkins.where("day").equals(day).first();
}
export async function upsertCheckIn(c: Omit<CheckIn, "id" | "createdAt">): Promise<void> {
  if (isSharedView()) { surfaceInlineTourNotice("This is a shared protocol. Start your own to write data."); return; }
  if (isTour())      { surfaceInlineTourNotice(); return; }
  await db.transaction("rw", db.checkins, async () => {
    const existing = await db.checkins.where("day").equals(c.day).first();
    if (existing?.id != null) await db.checkins.update(existing.id, { ...c });
    else                       await db.checkins.add({ ...c, createdAt: Date.now() });
  });
}
export async function recentCheckIns(days = 14): Promise<CheckIn[]> {
  if (isSharedView()) return [];
  if (isTour()) return tourCheckIns(days);
  return db.checkins.orderBy("day").reverse().limit(days).toArray();
}

/* -------------------------------------------------------------------------- */
/*  Projection snapshots (ticket 0012)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Return every projection snapshot persisted for the given panel id (the
 * panel the projection was computed FROM, not the panel that arrived after).
 * The Progress page calls this with the prior latest panel's id to render the
 * "Projected X. Landed at Y." evaluation row.
 */
export async function getProjectionsFor(panelId: number): Promise<ProjectionSnapshot[]> {
  if (isSharedView()) return [];
  if (isTour()) return tourProjectionsFor(panelId);
  return db.projections.where("panelId").equals(panelId).toArray();
}

/**
 * Persist a batch of projection snapshots. Uses `bulkPut` so a re-upload of
 * the same panel (same `[markerKey+panelId]` unique tuple) replaces the row
 * rather than throwing — that matches the "snapshot is what we showed the
 * user last" semantic; the latest write wins.
 */
export async function saveProjections(snapshots: ProjectionSnapshot[]): Promise<void> {
  if (isSharedView()) return; // shared-view never writes
  if (isTour()) return;   // best-effort persistence — no notice (background path)
  if (!snapshots.length) return;
  await db.projections.bulkPut(snapshots);
}

/* -------------------------------------------------------------------------- */
/*  Sessions (ticket 0018)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Append one row to the `sessions` table with `at = Date.now()` and return
 * its auto-generated id. Called once at the top of the router's post-resolve
 * continuation on every full page load. Tour and shared-view mode short-
 * circuit (they have no persistent timeline).
 *
 * The row carries only `id` + `at`. No user-agent, no IP, no per-route tag.
 * That minimum is what makes the lapse-aware welcome-back surface possible
 * without widening the privacy contract.
 */
export async function recordSession(): Promise<number> {
  if (isSharedView()) return -1;
  if (isTour())      return -1;
  return db.sessions.add({ at: Date.now() });
}

/**
 * Return the `at` of the most-recent row whose id is strictly less than
 * `currentSessionId`. Returns null when no such row exists — typically the
 * very first session ever. The router uses this to derive the lapse gap that
 * drives the welcome-back redirect.
 *
 * We sort by id (not by `at`) because the id is the monotonically-incrementing
 * write order and is robust to a clock that ticked backward between sessions.
 */
export async function previousSessionAt(currentSessionId: number): Promise<number | null> {
  if (isSharedView()) return null;
  if (isTour())      return null;
  if (!Number.isFinite(currentSessionId) || currentSessionId <= 0) return null;
  const prev = await db.sessions.where(":id").below(currentSessionId).last();
  return prev?.at ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Extraction cache                                                          */
/* -------------------------------------------------------------------------- */

export async function getCachedExtraction<T>(hash: string): Promise<T | undefined> {
  const row = await db.extractCache.get(hash);
  return row?.result as T | undefined;
}

export async function cacheExtraction(hash: string, result: unknown): Promise<void> {
  await db.extractCache.put({ hash, result, createdAt: Date.now() });
}

export async function clearExtractCache(): Promise<void> {
  await db.extractCache.clear();
}

/* -------------------------------------------------------------------------- */
/*  Export / import / wipe                                                    */
/* -------------------------------------------------------------------------- */

export interface AlmanacExport {
  version: 4;
  exportedAt: number;
  profile?: Profile;
  panels: Panel[];
  plans: Plan[];
  mealPlans: MealPlan[];
  checkins: CheckIn[];
  userMarkers: UserMarker[];
}

export async function exportAll(): Promise<AlmanacExport> {
  const [profile, panels, plans, mealPlans, checkins, userMarkers] = await Promise.all([
    getProfile(),
    db.panels.orderBy("drawnAt").toArray(),
    db.plans.orderBy("generatedAt").toArray(),
    db.mealPlans.orderBy("generatedAt").toArray(),
    db.checkins.orderBy("day").toArray(),
    db.userMarkers.orderBy("createdAt").toArray(),
  ]);
  // Strip blobs from export by default — they balloon the file. Source PDFs
  // / images stay on this device; the JSON has every extracted result.
  const lean = panels.map(p => {
    const { fileBlobs: _b, ...rest } = p;
    return rest;
  });
  return {
    version: 4, exportedAt: Date.now(),
    ...(profile ? { profile } : {}),
    panels: lean, plans, mealPlans, checkins, userMarkers,
  };
}

export async function importAll(data: AlmanacExport, mode: "replace" | "merge" = "merge"): Promise<void> {
  const v = (data as any).version;
  if (v !== 4 && v !== 3 && v !== 2) {
    throw new Error(`Unsupported export version: ${v}`);
  }
  await db.transaction("rw", [db.profile, db.panels, db.plans, db.mealPlans, db.checkins, db.userMarkers], async () => {
    if (mode === "replace") {
      await Promise.all([
        db.panels.clear(), db.plans.clear(), db.mealPlans.clear(),
        db.checkins.clear(), db.userMarkers.clear(),
      ]);
    }
    if (data.profile) await db.profile.put(data.profile);
    if (data.panels?.length)    await db.panels.bulkAdd(data.panels.map(stripId));
    if (data.plans?.length)     await db.plans.bulkAdd(data.plans.map(stripId));
    if (data.mealPlans?.length) await db.mealPlans.bulkAdd(data.mealPlans.map(stripId));
    if (data.checkins?.length)  await db.checkins.bulkAdd(data.checkins.map(stripId));
    // v3 exports don't carry userMarkers; defend against that branch.
    if (Array.isArray(data.userMarkers) && data.userMarkers.length) {
      // bulkPut: on key collision, the imported row wins (matches "user wins"
      // semantics elsewhere). Doesn't need stripId — the key IS the id.
      await db.userMarkers.bulkPut(data.userMarkers);
    }
  });
}

function stripId<T extends { id?: number }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row; return rest;
}

export async function wipeAll(): Promise<void> {
  await db.transaction("rw", [db.profile, db.panels, db.plans, db.mealPlans, db.checkins, db.userMarkers, db.projections, db.sessions], async () => {
    await Promise.all([
      db.profile.clear(), db.panels.clear(), db.plans.clear(),
      db.mealPlans.clear(), db.checkins.clear(), db.userMarkers.clear(),
      db.projections.clear(), db.sessions.clear(),
    ]);
  });
}
