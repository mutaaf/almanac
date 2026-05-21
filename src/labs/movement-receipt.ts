// The marker-moved receipt (ticket 0032).
//
// `computeMovementReceipt(newPanel, priorPanels)` is the deterministic,
// zero-network transform behind the "Since your last draw" section on the
// post-extraction panel review screen. For each result in the just-resolved
// panel that also has a prior draw of the same markerKey, it diffs the most
// recent prior value against the new one and classifies the move against the
// marker's functional range:
//
//   into-range  — prior was outside the functional range, new is inside it
//   toward      — moved closer to the functional optimum but isn't inside yet
//   away        — moved further from the functional optimum
//   unchanged   — delta is exactly zero
//
// Distance-to-range is direction-agnostic: a value inside the range is at
// distance 0; below `low` the distance is `low - value`; above `high` it is
// `value - high`. Because the range bounds already encode which way is "better"
// (ferritin's functional floor, hs-CRP's functional ceiling), this single
// metric handles `higherIsBetter` markers and `lowerIsBetter` markers without a
// special case — `towardOptimal` is just "new distance < prior distance".
//
// Pure: no DOM, no Dexie, no network. The page passes in the panels it already
// loaded from IndexedDB plus the user-marker catalog so name + range resolution
// covers user-defined (0002) and sex-specific keys.

import type { MarkerDef, MarkerMove, Panel, Range, Result } from "../types";
import { findMarker } from "../data/markers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Full month name of an ISO `YYYY-MM-DD` draw date. */
function monthName(drawnAt: string): string {
  const m = Number(drawnAt.slice(5, 7));
  return MONTHS[m - 1] ?? "";
}

/**
 * Distance from `value` to the nearest edge of the functional range. Zero when
 * the value is inside the range (or the range is undefined). A smaller number
 * is "closer to optimal" regardless of which side of the range we're on.
 */
function distanceToRange(value: number, range?: Range): number {
  if (!range) return 0;
  if (range.low != null && value < range.low) return range.low - value;
  if (range.high != null && value > range.high) return value - range.high;
  return 0;
}

function withinRange(value: number, range?: Range): boolean {
  if (!range) return true;
  if (range.low != null && value < range.low) return false;
  if (range.high != null && value > range.high) return false;
  return true;
}

/**
 * Compute the movement receipt for a just-resolved panel against the user's
 * prior draws. Returns one `MarkerMove` per result with at least one earlier
 * draw of the same markerKey, in the order the results appear on `newPanel`.
 *
 * `extras` is the user-marker catalog (from `getAllMarkers` / `listUserMarkers`)
 * so user-defined keys resolve their human name; seed keys resolve from the DB.
 */
export function computeMovementReceipt(
  newPanel: Panel,
  priorPanels: Panel[],
  extras: MarkerDef[] = [],
): MarkerMove[] {
  // Only panels strictly older than the new panel's draw date can be "prior".
  // Sort newest-first so the first match per markerKey is the most recent.
  const earlier = priorPanels
    .filter((p) => p.id !== newPanel.id && p.drawnAt < newPanel.drawnAt)
    .sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));

  const moves: MarkerMove[] = [];

  for (const result of newPanel.results) {
    const prior = mostRecentPrior(earlier, result.markerKey);
    if (!prior) continue;   // first time we've seen this marker — nothing to compare

    const marker = findMarker(result.markerKey, extras);
    const canonicalName = marker?.name ?? result.markerKey;
    // Prefer the resolved marker's functional range; fall back to the value the
    // panel stored at draw time so a marker whose DB range later changed still
    // diffs against what the user actually saw.
    const range = marker?.optimalRange ?? result.optimalRange;

    const priorValue = prior.value;
    const newValue = result.value;
    const delta = round(newValue - priorValue);

    const priorInside = withinRange(priorValue, range);
    const newInside = withinRange(newValue, range);
    const crossedIntoRange = !priorInside && newInside;

    const priorDistance = distanceToRange(priorValue, range);
    const newDistance = distanceToRange(newValue, range);
    const towardOptimal = newDistance < priorDistance;

    let state: MarkerMove["state"];
    if (delta === 0) state = "unchanged";
    else if (crossedIntoRange) state = "into-range";
    else if (towardOptimal) state = "toward";
    else state = "away";

    moves.push({
      markerKey: result.markerKey,
      canonicalName,
      priorValue,
      newValue,
      unit: result.unit,
      priorMonth: monthName(prior.drawnAt),
      delta,
      towardOptimal,
      crossedIntoRange,
      state,
    });
  }

  return moves;
}

/** The most recent prior reading of `markerKey` across the earlier panels. */
function mostRecentPrior(
  earlierNewestFirst: Panel[],
  markerKey: string,
): (Result & { drawnAt: string }) | undefined {
  for (const panel of earlierNewestFirst) {
    const r = panel.results.find((x) => x.markerKey === markerKey);
    if (r) return { ...r, drawnAt: panel.drawnAt };
  }
  return undefined;
}

/** Trim binary-float dust so a 1.4 - 1.4 reads as exactly 0, and 2.1 - 1.4 as 0.7. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/* -------------------------------------------------------------------------- */
/*  Rendering                                                                  */
/* -------------------------------------------------------------------------- */
/*
 * The receipt is rendered by the labs page (`renderPanelDetail`). The copy
 * helper lives here so the voice spec stays next to the computation it
 * describes. One calm editorial line per move; ink and ink-soft only, no
 * color flourish on an into-range crossing — the satisfaction is in the
 * sentence, not the styling.
 */

/**
 * The editorial sentence for one move. Direction words agree with the sign of
 * the delta. Voice spec (ticket 0032):
 *   into-range  "<marker> came up/down from <prior> to <new> <unit> since <month> — now inside the functional range."
 *   toward      "<marker> eased/came up from <prior> to <new> <unit> since <month> — moving toward the functional range."
 *   away        "<marker> moved from <prior> to <new> <unit> since <month> — further from the functional range."
 *   unchanged   "<marker> held at <value> <unit> — unchanged since <month>."
 */
export function moveSentence(m: MarkerMove): string {
  const name = m.canonicalName;
  const prior = fmt(m.priorValue);
  const now = fmt(m.newValue);
  const rose = m.delta > 0;

  if (m.state === "unchanged") {
    return `${name} held at ${now} ${m.unit} — unchanged since ${m.priorMonth}.`;
  }
  if (m.state === "into-range") {
    const verb = rose ? "came up" : "came down";
    return `${name} ${verb} from ${prior} to ${now} ${m.unit} since ${m.priorMonth} — now inside the functional range.`;
  }
  if (m.state === "toward") {
    const verb = rose ? "came up" : "eased";
    return `${name} ${verb} from ${prior} to ${now} ${m.unit} since ${m.priorMonth} — moving toward the functional range.`;
  }
  // away — neutral verb, no euphemism.
  return `${name} moved from ${prior} to ${now} ${m.unit} since ${m.priorMonth} — further from the functional range.`;
}

/** Drop trailing-zero float noise so 80 reads "80", not "80.0". */
function fmt(n: number): string {
  return String(n);
}
