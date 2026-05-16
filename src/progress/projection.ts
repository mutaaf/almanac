// Between-draws projection — pure math, no DOM, no Dexie (ticket 0012).
//
// Two exports:
//
//   computeProjection(marker, latestResult, checkins14d, plan)
//     → a {low, high, weeksOut} band when the marker has a curated
//       responsiveness entry AND the user's 14-day adherence cleared the
//       minimum-engagement threshold (≥30% of habit-stack-days held).
//     → null otherwise.
//
//   evaluateLanded(snapshot, currentValue)
//     → "in-range" | "under-range" | "over-range" given a stored snapshot
//       and the value the next panel actually carried.
//
// The band is deliberately editorial: tier governs how much of the curated
// magnitude window we project onto the user's likely move. We do NOT pretend
// to model statistical confidence intervals — that is exactly the
// false-precision the editorial voice rejects. The band IS the literature
// consensus, scaled by adherence; it is a plausible range, not a prediction.

import type { CheckIn, MarkerDef, Plan, ProjectionSnapshot, Result } from "../types";
import { tierForCheckIns } from "../claude";

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

export interface ProjectionBand {
  /** Plausible-low edge of the band, in the marker's canonical unit. */
  low: number;
  /** Plausible-high edge of the band, in the marker's canonical unit. */
  high: number;
  /** The marker's typical move window in weeks (curated, not user-specific). */
  weeksOut: [number, number];
  /** The adherence tier that scaled the projection (for the slideover). */
  tier: "easy" | "moderate" | "advanced";
  /**
   * Distinct days in the 14-day window where the user logged at least one
   * habit. Used in the editorial "N of 14 days" tally — this is what the
   * user reads on the card. Differs from the tier-derivation math, which
   * scores against habit-stack-days (days × habits).
   */
  daysHeld: number;
  /** Always 14 in practice; surfaced so the renderer can write "{N} of {14}". */
  daysPossible: number;
}

/** The minimum adherence (held / possible) the projection module requires.
 *  Below this we return null so the UI can render the editorial empty-state. */
export const PROJECTION_MIN_ADHERENCE = 0.30;

/* -------------------------------------------------------------------------- */
/*  computeProjection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Project the band the marker is plausibly in at the user's next draw.
 *
 *   marker        — the curated MarkerDef (must carry `responsiveness`).
 *   latestResult  — the most recent Result for this marker.
 *   checkins      — last 14 days of CheckIn rows (any subset; the function
 *                   doesn't trim, it just uses them).
 *   plan          — the active Plan; needed to read habit ids for the tier
 *                   derivation. When absent, returns null.
 *
 * Returns null when:
 *   - the marker has no curated `responsiveness` entry
 *   - there is no plan to score adherence against
 *   - 14-day adherence is below PROJECTION_MIN_ADHERENCE
 *
 * The sign of the projected move is determined by the marker's `direction`
 * field combined with the user's current side of the optimal range:
 *
 *   - "decrease": always pushes the value down (apoB, hs-CRP, fasting
 *     insulin, hba1c — markers where lower-is-better when above optimum).
 *   - "increase": always pushes the value up (vit D, omega-3, free T3,
 *     mag-RBC — markers where higher-is-better when below optimum).
 *   - "either":   the projection moves toward the nearest edge of the
 *     optimal range (ferritin can be too low OR too high; the same applies
 *     to markers where both extremes carry meaning).
 */
export function computeProjection(
  marker: MarkerDef,
  latestResult: Result,
  checkins: CheckIn[],
  plan: Plan | undefined,
): ProjectionBand | null {
  const r = marker.responsiveness;
  if (!r) return null;

  const adherence = tierForCheckIns(checkins, plan);
  if (!adherence) return null;
  if (adherence.percent < PROJECTION_MIN_ADHERENCE) return null;

  // Human-readable "N of 14 days" tally: count distinct days in the window
  // where at least one habit was logged. We always quote the denominator as
  // 14 — that's the editorial promise on the card, and the window is fixed.
  // (The tier math uses habit-stack-days; the card surfaces calendar days.)
  const daysHeldSet = new Set<string>();
  for (const c of checkins) {
    if (c.habitsCompleted.length > 0) daysHeldSet.add(c.day);
  }
  const daysHeld = daysHeldSet.size;

  // Scale the curated magnitude window by the adherence tier. The bottom
  // edge of the band is anchored to the tier-appropriate move; the top edge
  // is always the curated maximum. The intent: a moderate-tier user sees
  // a more conservative low edge than an advanced-tier user, but the
  // upper bound of plausibility doesn't shrink (the literature ceiling is
  // the literature ceiling).
  const scale =
    adherence.tier === "advanced" ? 1.0 :
    adherence.tier === "easy"     ? 0.8 :
                                    0.5;

  const magLow  = r.magnitude.low  * scale;
  const magHigh = r.magnitude.high;

  const sign = directionalSign(marker, latestResult.value, r.direction);

  // Apply the signed move to the current value. The "low" and "high" labels
  // refer to the BAND's edges, not which is numerically smaller — when the
  // marker is decreasing (sign === -1), the high edge of the band is
  // numerically below the low edge. Normalize so consumers can rely on
  // band.low <= band.high.
  const a = latestResult.value + sign * magLow;
  const b = latestResult.value + sign * magHigh;
  const low  = Math.min(a, b);
  const high = Math.max(a, b);

  return {
    low,
    high,
    weeksOut: r.weeksToEffect,
    tier: adherence.tier,
    daysHeld,
    daysPossible: 14,
  };
}

/**
 * For "either"-direction markers, the projection moves the value toward the
 * nearest edge of the optimal range. For "increase" / "decrease" markers,
 * we honor the curated direction verbatim — the user being above the
 * optimum on a "decrease" marker is exactly the case where the projection
 * is informative; flipping direction there would mute the signal.
 */
function directionalSign(
  marker: MarkerDef,
  currentValue: number,
  direction: "increase" | "decrease" | "either",
): number {
  if (direction === "increase") return +1;
  if (direction === "decrease") return -1;

  // direction === "either": move toward the nearest edge of the optimal range.
  const opt = marker.optimalRange;
  if (opt?.low != null && currentValue < opt.low)  return +1;
  if (opt?.high != null && currentValue > opt.high) return -1;
  // Already inside (or no usable bounds): no projected move.
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  evaluateLanded                                                            */
/* -------------------------------------------------------------------------- */

export type LandedVerdict = "in-range" | "under-range" | "over-range";

/**
 * Compare a value that just arrived in a fresh panel against the snapshot
 * we showed the user last. Editorial verdicts only — no statistical claims.
 */
export function evaluateLanded(snapshot: ProjectionSnapshot, value: number): LandedVerdict {
  if (value < snapshot.low)  return "under-range";
  if (value > snapshot.high) return "over-range";
  return "in-range";
}
