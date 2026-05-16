// Local-first storage. All persistence lives here.

import Dexie, { type Table } from "dexie";
import type { Profile, Panel, Plan, MealPlan, CheckIn, Day, MarkerDef } from "./types";

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
  }
}

export const db = new AlmanacDB();

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
  return db.profile.get("singleton");
}

export async function saveProfile(
  p: Omit<Profile, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Profile, "createdAt">>,
): Promise<void> {
  const existing = await getProfile();
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
  return db.panels.add({ ...p, createdAt: Date.now() });
}
export async function updatePanel(id: number, p: Partial<Panel>): Promise<void> {
  await db.panels.update(id, p);
}
export async function getPanel(id: number): Promise<Panel | undefined> { return db.panels.get(id); }
export async function allPanels(): Promise<Panel[]> {
  return db.panels.orderBy("drawnAt").reverse().toArray();
}
export async function deletePanel(id: number): Promise<void> { await db.panels.delete(id); }

/* -------------------------------------------------------------------------- */
/*  Plans                                                                     */
/* -------------------------------------------------------------------------- */

export async function latestPlan(): Promise<Plan | undefined> {
  return db.plans.orderBy("generatedAt").reverse().first();
}
export async function savePlan(p: Omit<Plan, "id">): Promise<number> {
  return db.plans.add(p);
}
export async function allPlans(): Promise<Plan[]> {
  return db.plans.orderBy("generatedAt").reverse().toArray();
}

/* -------------------------------------------------------------------------- */
/*  Meal plans                                                                */
/* -------------------------------------------------------------------------- */

export async function latestMealPlan(): Promise<MealPlan | undefined> {
  return db.mealPlans.orderBy("generatedAt").reverse().first();
}
export async function mealPlanForPlan(planId: number): Promise<MealPlan | undefined> {
  return db.mealPlans.where("planId").equals(planId).reverse().sortBy("generatedAt").then(a => a[0]);
}
export async function saveMealPlan(m: Omit<MealPlan, "id">): Promise<number> {
  return db.mealPlans.add(m);
}
export async function allMealPlans(): Promise<MealPlan[]> {
  return db.mealPlans.orderBy("generatedAt").reverse().toArray();
}

/* -------------------------------------------------------------------------- */
/*  Check-ins                                                                 */
/* -------------------------------------------------------------------------- */

export async function checkInFor(day: Day): Promise<CheckIn | undefined> {
  return db.checkins.where("day").equals(day).first();
}
export async function upsertCheckIn(c: Omit<CheckIn, "id" | "createdAt">): Promise<void> {
  await db.transaction("rw", db.checkins, async () => {
    const existing = await db.checkins.where("day").equals(c.day).first();
    if (existing?.id != null) await db.checkins.update(existing.id, { ...c });
    else                       await db.checkins.add({ ...c, createdAt: Date.now() });
  });
}
export async function recentCheckIns(days = 14): Promise<CheckIn[]> {
  return db.checkins.orderBy("day").reverse().limit(days).toArray();
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
  await db.transaction("rw", [db.profile, db.panels, db.plans, db.mealPlans, db.checkins, db.userMarkers], async () => {
    await Promise.all([
      db.profile.clear(), db.panels.clear(), db.plans.clear(),
      db.mealPlans.clear(), db.checkins.clear(), db.userMarkers.clear(),
    ]);
  });
}
