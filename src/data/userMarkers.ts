// User-extensible marker catalog.
//
// The seed in `markers.ts` ships ~70 markers. Specialty panels (Lp-PLA2,
// ceruloplasmin, hs-troponin, fasting C-peptide, mainland-Asian-lab
// translations) routinely include rows we don't ship with — and we can't
// curate the long tail ourselves. This module lets the user define those
// markers locally; the rest of the app (matchers, panel review UI, plan
// + meal prompt assembly) reads them transparently alongside the seed.
//
// Storage lives in the Dexie `userMarkers` table (schema v5). The canonical
// `key` is the primary key; on collision with a seed entry, the USER entry
// wins (matches the ticket's "you can override our defaults by defining a
// same-key user marker" promise).

import { db, type UserMarker } from "../db";
import { MARKERS } from "./markers";
import type { MarkerDef } from "../types";

/** List every user-defined marker, oldest-first (creation order). */
export async function listUserMarkers(): Promise<UserMarker[]> {
  return db.userMarkers.orderBy("createdAt").toArray();
}

/**
 * Persist a new user marker. If a `key` collision happens the new entry
 * overwrites the old one — by design, since users edit their own entries
 * by re-saving them.
 */
export async function addUserMarker(
  m: Omit<UserMarker, "createdAt"> & Partial<Pick<UserMarker, "createdAt">>,
): Promise<void> {
  await db.userMarkers.put({ ...m, createdAt: m.createdAt ?? Date.now() });
}

/** Remove a user marker by canonical key. No-op if it doesn't exist. */
export async function deleteUserMarker(key: string): Promise<void> {
  await db.userMarkers.delete(key);
}

/**
 * Return the merged marker catalog: every user-defined marker followed by
 * every seed marker MINUS any seed entry whose key was overridden by a user
 * entry. Callers that need to score a free-form lab name use this — the
 * scorer in `markers.ts` will see user markers first (they're prepended)
 * and prefer them on ties.
 */
export async function getAllMarkers(): Promise<MarkerDef[]> {
  const user = await listUserMarkers();
  const userKeys = new Set(user.map(u => u.key));
  // User entries first (so an alias scored equally against both still
  // returns the user one), then seed entries that weren't overridden.
  return [
    ...user.map(stripCreatedAt),
    ...MARKERS.filter(m => !userKeys.has(m.key)),
  ];
}

function stripCreatedAt(u: UserMarker): MarkerDef {
  const { createdAt: _c, ...rest } = u;
  return rest;
}
