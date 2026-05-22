// Most-improved marker selection for the improvement card (ticket 0047).
//
// `selectMostImproved(panels, profile)` finds the user's single best
// favorable move toward a functional optimum across the whole timeline —
// the marker the improvement card celebrates. It is the marker-side sibling
// of the marker-hero card's per-row selection (0011): 0011 takes a marker you
// already picked on the compare view; this one PICKS the marker for you,
// honestly, from your dated draws.
//
// Pure: no DOM, no Dexie, no network. The page passes `allPanels()` + the
// profile; everything else is computed here.
//
// ---------------------------------------------------------------------------
// Scoring + normalization (the honesty contract)
// ---------------------------------------------------------------------------
// For each marker with ≥ 2 draws we take its OLDEST and NEWEST value (the
// timeline endpoints, the way the Progress sparkline reads). A move counts
// only when it is *favorable* — i.e. the newest value is strictly closer to
// the functional optimum than the oldest (distance-to-range strictly
// decreased). Markers that moved away from, or parallel to, the optimum are
// not candidates: the card never claims a regression as a win.
//
// To compare markers on different scales fairly (ferritin in the tens of
// ng/mL vs ApoB in the tens of mg/dL vs hs-CRP near 1 mg/L), we normalize the
// favorable distance closed by a per-marker SCALE:
//
//   scale = optimal-range width (opt.high - opt.low)        when both bounds set
//         = |the defined optimal bound|                     when one-sided
//         = |oldest value| (a last-resort relative scale)   when no optimum
//
// score = (distanceToRange(oldest) - distanceToRange(newest)) / scale
//
// A marker that closed half its optimal-range-width of distance scores 0.5; a
// marker that fully crossed in from one range-width out scores ≥ 1.0. This is
// a deterministic, literature-free normalization — documented here so the
// selection is auditable, not a fitted model. Ties (same score) break toward
// the larger absolute favorable delta, then by marker key for stability.

import type { Day, MarkerDef, Panel, Profile } from "../types";
import { findMarker } from "../data/markers";

export interface ImprovedMarker {
  markerKey: string;
  /** Human display name resolved via the marker DB (sex-specific + user keys). */
  name: string;
  unit: string;
  startValue: number;
  startDay: Day;
  nowValue: number;
  nowDay: Day;
  /** True when the start value was outside the functional optimum and the now value is inside it. */
  movedIntoRange: boolean;
}

interface Series {
  markerKey: string;
  /** Oldest → newest. */
  points: { day: Day; value: number }[];
}

/** A marker with at least two draws, scored and ready to compare. */
interface Candidate extends ImprovedMarker {
  score: number;
  absDelta: number;
}

/**
 * Select the single most-improved marker across the panels, or `null` when no
 * marker has ≥ 2 draws or none moved favorably toward its optimum.
 *
 * `extras` lets a caller pass user-defined markers into name + range
 * resolution (ticket 0002); the page passes `getAllMarkers()`. The `profile`
 * is read only for marker-name resolution context — never for the key.
 */
export function selectMostImproved(
  panels: Panel[],
  _profile: Profile,
  extras: MarkerDef[] = [],
): ImprovedMarker | null {
  void _profile;

  // Build per-marker series oldest → newest, the same way the Progress page
  // collects trends (sort panels by drawnAt ascending, then push results).
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
  const seriesMap = new Map<string, Series>();
  for (const p of ordered) {
    for (const r of p.results) {
      if (!seriesMap.has(r.markerKey)) seriesMap.set(r.markerKey, { markerKey: r.markerKey, points: [] });
      seriesMap.get(r.markerKey)!.points.push({ day: p.drawnAt, value: r.value });
    }
  }

  const candidates: Candidate[] = [];
  for (const s of seriesMap.values()) {
    if (s.points.length < 2) continue;

    const marker = findMarker(s.markerKey, extras);
    if (!marker) continue;
    const opt = marker.optimalRange;
    if (!opt || (opt.low == null && opt.high == null)) continue; // nothing to improve toward

    const first = s.points[0]!;
    const last  = s.points[s.points.length - 1]!;
    if (first.value === last.value) continue;

    const distStart = distanceToRange(first.value, opt);
    const distNow   = distanceToRange(last.value, opt);
    // Favorable only: the value got strictly closer to the optimum.
    const closed = distStart - distNow;
    if (closed <= 0) continue;

    const scale = scaleFor(marker, first.value);
    if (scale <= 0) continue;
    const score = closed / scale;

    candidates.push({
      markerKey: marker.key,
      name: displayName(marker),
      unit: marker.unit,
      startValue: first.value,
      startDay: first.day,
      nowValue: last.value,
      nowDay: last.day,
      movedIntoRange: distStart > 0 && distNow === 0,
      score,
      absDelta: Math.abs(last.value - first.value),
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.absDelta !== a.absDelta) return b.absDelta - a.absDelta;
    return a.markerKey.localeCompare(b.markerKey);
  });

  const best = candidates[0]!;
  // Strip the internal scoring fields — the page + card see only the public shape.
  return {
    markerKey: best.markerKey,
    name: best.name,
    unit: best.unit,
    startValue: best.startValue,
    startDay: best.startDay,
    nowValue: best.nowValue,
    nowDay: best.nowDay,
    movedIntoRange: best.movedIntoRange,
  };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The bare human name for the card: the full `name` with a trailing
 * sex-qualifier parenthetical stripped ("Ferritin (Male)" → "Ferritin"), so a
 * sex-specific key reads as the marker, not the variant. User-defined markers
 * (0002) and markers without a parenthetical are returned as-is.
 */
function displayName(marker: MarkerDef): string {
  return marker.name.replace(/\s*\((male|female|intersex)\)\s*$/i, "").trim();
}

/** Distance from `v` to the optimal range; 0 when inside. Mirrors compare.ts. */
function distanceToRange(v: number, r: { low?: number; high?: number }): number {
  if (r.low  != null && v < r.low)  return r.low - v;
  if (r.high != null && v > r.high) return v - r.high;
  return 0;
}

/**
 * Per-marker normalization scale. Prefer the optimal-range width; fall back to
 * the magnitude of the single defined bound; last-resort the magnitude of the
 * starting value so a one-sided marker with no usable bound still compares on
 * a relative basis.
 */
function scaleFor(marker: MarkerDef, startValue: number): number {
  const opt = marker.optimalRange;
  if (opt.low != null && opt.high != null && opt.high > opt.low) {
    return opt.high - opt.low;
  }
  const bound = opt.high ?? opt.low;
  if (bound != null && Math.abs(bound) > 0) return Math.abs(bound);
  return Math.abs(startValue) || 1;
}
