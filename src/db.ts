// Local-first storage. All persistence lives here.
//
// Schema v1 (the v0 prose-journal schema) is dropped on upgrade — we never
// shipped v0 publicly, and anyone who poked at it locally will just re-onboard.

import Dexie, { type Table } from "dexie";
import type { Profile, Panel, Plan, CheckIn, Day } from "./types";

class AlmanacDB extends Dexie {
  profile!:  Table<Profile, "singleton">;
  panels!:   Table<Panel,   number>;
  plans!:    Table<Plan,    number>;
  checkins!: Table<CheckIn, number>;

  constructor() {
    super("almanac");

    // v1 — the original prose-journal schema. Kept here only so Dexie can
    // upgrade existing local databases without throwing.
    this.version(1).stores({
      entries:   "++id, day, createdAt",
      pages:     "++id, &day, generatedAt",
      summaries: "++id, day, createdAt",
      settings:  "id",
    });

    // v2 — the precision-health schema. Drops every v1 table; data was
    // experimental and is replaced by a richer model.
    this.version(2).stores({
      entries:   null,
      pages:     null,
      summaries: null,
      settings:  null,

      profile:   "id",
      panels:    "++id, drawnAt, createdAt",
      plans:     "++id, generatedAt",
      checkins:  "++id, &day, createdAt",
    });
  }
}

export const db = new AlmanacDB();

/* -------------------------------------------------------------------------- */
/*  Day helpers                                                               */
/* -------------------------------------------------------------------------- */

export function today(): Day {
  const d = new Date();
  return iso(d);
}

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

export async function getPanel(id: number): Promise<Panel | undefined> {
  return db.panels.get(id);
}

export async function allPanels(): Promise<Panel[]> {
  // newest first
  return db.panels.orderBy("drawnAt").reverse().toArray();
}

export async function deletePanel(id: number): Promise<void> {
  await db.panels.delete(id);
}

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
/*  Check-ins                                                                 */
/* -------------------------------------------------------------------------- */

export async function checkInFor(day: Day): Promise<CheckIn | undefined> {
  return db.checkins.where("day").equals(day).first();
}

export async function upsertCheckIn(c: Omit<CheckIn, "id" | "createdAt">): Promise<void> {
  await db.transaction("rw", db.checkins, async () => {
    const existing = await db.checkins.where("day").equals(c.day).first();
    if (existing?.id != null) {
      await db.checkins.update(existing.id, { ...c });
    } else {
      await db.checkins.add({ ...c, createdAt: Date.now() });
    }
  });
}

export async function recentCheckIns(days = 14): Promise<CheckIn[]> {
  return db.checkins.orderBy("day").reverse().limit(days).toArray();
}

/* -------------------------------------------------------------------------- */
/*  Export / import / wipe                                                    */
/* -------------------------------------------------------------------------- */

export interface AlmanacExport {
  version: 2;
  exportedAt: number;
  profile?: Profile;
  panels: Panel[];
  plans: Plan[];
  checkins: CheckIn[];
}

export async function exportAll(): Promise<AlmanacExport> {
  const [profile, panels, plans, checkins] = await Promise.all([
    getProfile(),
    db.panels.orderBy("drawnAt").toArray(),
    db.plans.orderBy("generatedAt").toArray(),
    db.checkins.orderBy("day").toArray(),
  ]);
  // Strip blobs from export by default — they balloon the file. The user can
  // opt to include them later via an explicit "include source files" toggle.
  const lean = panels.map(p => { const { fileBlob: _f, ...rest } = p; return rest; });
  return {
    version: 2, exportedAt: Date.now(),
    ...(profile ? { profile } : {}),
    panels: lean,
    plans, checkins,
  };
}

export async function importAll(data: AlmanacExport, mode: "replace" | "merge" = "merge"): Promise<void> {
  if (data.version !== 2) throw new Error(`Unsupported export version: ${(data as any).version}`);
  await db.transaction("rw", db.profile, db.panels, db.plans, db.checkins, async () => {
    if (mode === "replace") {
      await Promise.all([db.panels.clear(), db.plans.clear(), db.checkins.clear()]);
    }
    if (data.profile) await db.profile.put(data.profile);
    if (data.panels.length)   await db.panels.bulkAdd(data.panels.map(stripId));
    if (data.plans.length)    await db.plans.bulkAdd(data.plans.map(stripId));
    if (data.checkins.length) await db.checkins.bulkAdd(data.checkins.map(stripId));
  });
}

function stripId<T extends { id?: number }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}

export async function wipeAll(): Promise<void> {
  await db.transaction("rw", db.profile, db.panels, db.plans, db.checkins, async () => {
    await Promise.all([
      db.profile.clear(),
      db.panels.clear(),
      db.plans.clear(),
      db.checkins.clear(),
    ]);
  });
}
