// Pre-draw primer — pure function, no DOM, no Dexie, no network (ticket 0051).
//
// The day-before half of the retest loop. Where the 0028 retest-due card says
// "a draw is coming" weeks out, this says "here's how to draw it well" in the
// 48 hours before the draw. It reads the next-draw date (the soonest retest
// cadence's due instant, computed by the caller exactly as the 0028 card does)
// and, for each retest marker, resolves the human name via `findMarker()` and
// the deterministic pre-analytical note via the static `DRAW_PREP` lookup.
//
// The window is HOUR-precise: the card is live ONLY when the draw is in the
// future (or right now) AND within 48 hours — `0 <= nextDrawDate − now <= 48h`.
// This differs from 0028's `isDrawDay`/calendar-day rounding because "schedule
// the draw for the morning and hold breakfast" is a same-day, hour-scale action.
//
// Date source (documented per the ticket): 0031 (a concrete per-plan `drawDate`)
// has NOT shipped, so the caller passes the 0028-computed due date (the soonest
// cadence's `generatedAt + whenWeeks*7days`). If 0031 later persists a concrete
// draw instant, prefer it as the caller's `nextDrawDate` — this function does
// not change.

import type { MarkerDef, PreDrawPrep, PreDrawMarker } from "../types";
import { findMarker } from "../data/markers";
import { DRAW_PREP } from "../data/draw-prep";

const HOUR_MS = 3_600_000;
const WINDOW_MS = 48 * HOUR_MS;

/** Shown for a retest marker that has no curated DRAW_PREP note. Never omitted. */
const NEUTRAL_NOTE = "No special prep needed.";

/**
 * Compute the pre-draw primer, or `null` when the card should not surface.
 * Pure: no I/O, no `Date.now()` (the caller passes `now`).
 *
 * Returns null when:
 *   - there is no next-draw date (no plan / no retest cadence), OR
 *   - the draw is in the past (`nextDrawDate < now`), OR
 *   - the draw is more than 48 hours out, OR
 *   - the retest carries no marker keys.
 *
 * `extras` is the merged marker catalog (seed + user-defined). The page passes
 * `getAllMarkers()` so a user-defined or sex-specific key renders its human
 * name; the default keeps the function callable against the seed catalog alone.
 */
export function prepForDraw(
  nextDrawDate: Date | null,
  retestMarkerKeys: string[],
  now: Date,
  extras: MarkerDef[] = [],
): PreDrawPrep | null {
  if (!nextDrawDate) return null;
  if (!retestMarkerKeys.length) return null;

  const deltaMs = nextDrawDate.getTime() - now.getTime();
  // Past draws and draws beyond the 48h window do not surface.
  if (deltaMs < 0 || deltaMs > WINDOW_MS) return null;

  const markers: PreDrawMarker[] = retestMarkerKeys.map((key) => {
    const marker = findMarker(key, extras);
    const name = marker?.shortName ?? marker?.name ?? key;
    const note = DRAW_PREP[key] ?? NEUTRAL_NOTE;
    return { key, name, note };
  });

  return { hoursOut: Math.floor(deltaMs / HOUR_MS), markers };
}
