// Local-first storage. Dexie wraps IndexedDB with a typed, promise-based API.
// Nothing in this file makes a network call — and nothing else in the app
// should bypass these helpers when persisting user data.

import Dexie, { type Table } from "dexie";
import type { Entry, Page, HistorySummary, Settings, Day } from "./types";

class AlmanacDB extends Dexie {
  entries!:    Table<Entry, number>;
  pages!:      Table<Page, number>;
  summaries!:  Table<HistorySummary, number>;
  settings!:   Table<Settings, "singleton">;

  constructor() {
    super("almanac");
    this.version(1).stores({
      entries:   "++id, day, createdAt",
      pages:     "++id, &day, generatedAt",   // unique day — one page per day
      summaries: "++id, day, createdAt",
      settings:  "id",
    });
  }
}

export const db = new AlmanacDB();

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function today(): Day {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function yesterday(): Day {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get("singleton");
}

export async function saveSettings(s: Omit<Settings, "id" | "createdAt"> & Partial<Pick<Settings, "createdAt">>): Promise<void> {
  const existing = await getSettings();
  await db.settings.put({
    id: "singleton",
    createdAt: existing?.createdAt ?? Date.now(),
    ...s,
  });
}

export async function appendEntry(e: Omit<Entry, "id" | "createdAt">): Promise<number> {
  return db.entries.add({ ...e, createdAt: Date.now() });
}

export async function entriesForDay(day: Day): Promise<Entry[]> {
  return db.entries.where("day").equals(day).sortBy("createdAt");
}

export async function recentEntries(limit = 14): Promise<Entry[]> {
  // Most recent N entries, newest first.
  return db.entries.orderBy("createdAt").reverse().limit(limit).toArray();
}

export async function entriesBetween(fromDay: Day, toDay: Day): Promise<Entry[]> {
  return db.entries.where("day").between(fromDay, toDay, true, true).sortBy("createdAt");
}

export async function pageFor(day: Day): Promise<Page | undefined> {
  return db.pages.where("day").equals(day).first();
}

export async function savePage(p: Omit<Page, "id">): Promise<void> {
  // Upsert by day. If a page already exists for this day, replace it.
  await db.transaction("rw", db.pages, async () => {
    const existing = await db.pages.where("day").equals(p.day).first();
    if (existing?.id != null) await db.pages.delete(existing.id);
    await db.pages.add(p);
  });
}

export async function allPages(): Promise<Page[]> {
  return db.pages.orderBy("day").reverse().toArray();
}

export async function latestSummary(): Promise<HistorySummary | undefined> {
  return db.summaries.orderBy("createdAt").reverse().first();
}

export async function saveSummary(s: Omit<HistorySummary, "id" | "createdAt">): Promise<void> {
  await db.summaries.add({ ...s, createdAt: Date.now() });
}

/* -------------------------------------------------------------------------- */
/*  Export / import — the only way data leaves the device                     */
/* -------------------------------------------------------------------------- */

export interface AlmanacExport {
  version: 1;
  exportedAt: number;
  settings: Settings | undefined;
  entries: Entry[];
  pages: Page[];
  summaries: HistorySummary[];
}

export async function exportAll(): Promise<AlmanacExport> {
  const [settings, entries, pages, summaries] = await Promise.all([
    getSettings(),
    db.entries.orderBy("createdAt").toArray(),
    db.pages.orderBy("day").toArray(),
    db.summaries.orderBy("createdAt").toArray(),
  ]);
  return { version: 1, exportedAt: Date.now(), settings, entries, pages, summaries };
}

export async function importAll(data: AlmanacExport, mode: "replace" | "merge" = "merge"): Promise<void> {
  if (data.version !== 1) throw new Error(`Unsupported export version: ${data.version}`);
  await db.transaction("rw", db.entries, db.pages, db.summaries, db.settings, async () => {
    if (mode === "replace") {
      await Promise.all([db.entries.clear(), db.pages.clear(), db.summaries.clear()]);
    }
    if (data.settings) await db.settings.put(data.settings);
    if (data.entries.length)   await db.entries.bulkAdd(data.entries.map(stripId));
    if (data.pages.length)     await db.pages.bulkAdd(data.pages.map(stripId));
    if (data.summaries.length) await db.summaries.bulkAdd(data.summaries.map(stripId));
  });
}

function stripId<T extends { id?: number }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}

export async function wipeAll(): Promise<void> {
  await db.transaction("rw", db.entries, db.pages, db.summaries, db.settings, async () => {
    await Promise.all([
      db.entries.clear(),
      db.pages.clear(),
      db.summaries.clear(),
      db.settings.clear(),
    ]);
  });
}
