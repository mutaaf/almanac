// Retest-due status — pure function, no DOM, no Dexie, no network (ticket 0028).
//
// Every composed plan carries a `retest` cadence (markers + weeks + reason)
// written once by the generator. This module carries that cadence forward: it
// anchors each cadence's due date to the plan's `generatedAt` + the cadence
// weeks, classifies how close the soonest draw is, and resolves the cadence's
// markers to their human display names. The Today page passes in the latest
// plan, `now`, and the merged marker catalog; nothing else reads this.
//
// The honest anchor (per the ticket's out-of-scope note) is the plan's creation
// timestamp plus the cadence weeks — the schema carries no per-marker last-draw
// anchor and this ticket does not add one. The Plan type's creation field is
// `generatedAt` (ms epoch); `RetestStatus.setOn` is that date.

import type { MarkerDef, Plan, RetestStatus } from "../types";
import { findMarker } from "../data/markers";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Inside [0, DUE_SOON_DAYS] inclusive a draw is "due soon". */
const DUE_SOON_DAYS = 14;

/**
 * Compute the retest status for the latest plan, or `null` when the plan has no
 * retest cadence. Pure: no I/O, no `Date.now()` (the caller passes `now`).
 *
 * When a plan carries several retest cadences, the soonest-due one wins so the
 * single-card discipline holds — the most consequential draw is the one closest
 * to (or furthest past) due.
 *
 * `extras` is the merged marker catalog (seed + user-defined). The page passes
 * `getAllMarkers()` so a user-defined or sex-specific key renders its human
 * name; the default keeps the function callable against the seed catalog alone.
 */
export function computeRetestStatus(
  latestPlan: Plan,
  now: Date,
  extras: MarkerDef[] = [],
): RetestStatus | null {
  const cadences = latestPlan.retest ?? [];
  if (!cadences.length) return null;

  const generatedAt = latestPlan.generatedAt;
  const nowMs = now.getTime();

  // The soonest-due cadence drives the card. "Soonest" = smallest due-date ms;
  // an overdue cadence (due in the past) sorts ahead of an upcoming one.
  let soonest: { due: number; markerKeys: string[] } | null = null;
  for (const c of cadences) {
    if (!c.markerKeys?.length) continue;
    const due = generatedAt + c.whenWeeks * WEEK_MS;
    if (!soonest || due < soonest.due) soonest = { due, markerKeys: c.markerKeys };
  }
  if (!soonest) return null;

  const daysUntil = Math.ceil((soonest.due - nowMs) / DAY_MS);
  const state: RetestStatus["state"] =
    daysUntil < 0 ? "overdue" :
    daysUntil <= DUE_SOON_DAYS ? "due-soon" :
    "upcoming";

  return {
    markers: soonest.markerKeys.map(k => markerLabel(k, extras)),
    dueDate: new Date(soonest.due),
    daysUntil,
    state,
    setOn: new Date(generatedAt),
  };
}

/** Human display name for a marker key — short name preferred, key as last resort. */
function markerLabel(key: string, extras: MarkerDef[]): string {
  const marker = findMarker(key, extras);
  return marker?.shortName ?? marker?.name ?? key;
}
