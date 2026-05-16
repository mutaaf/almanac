// Pure comparison logic for "side-by-side draw comparison" (ticket 0009).
//
// `computeComparison(earlier, later, markers)` returns one row per marker
// that appears in BOTH panels — the intersection. Rows carry the canonical
// marker name, unit, both values, the signed delta, the rounded percent
// change, an arrow glyph, a `crossing` field for cross-optimal-boundary
// badges ("improved" / "regressed" / null), and the marker category +
// signed-percent magnitude used for ordering.
//
// The module has zero DOM and zero IndexedDB. Easy to reason about; easy
// to swap into a Vitest unit later. For now exercised through the
// `compare.spec.ts` Playwright suite.

import type { MarkerDef, Panel } from "../types";
import { findMarker } from "../data/markers";

export type CrossingKind = "improved" | "regressed" | null;

export interface ComparisonRow {
  marker: MarkerDef;
  /** Canonical display name (shortName when defined, else name). */
  name: string;
  unit: string;
  earlier: number;
  later: number;
  /** later - earlier; sign-preserving. */
  delta: number;
  /** ((later - earlier) / earlier) * 100, rounded to one decimal. */
  pctChange: number;
  /** "↑" when later > earlier; "↓" when later < earlier; "→" when equal. */
  arrow: "↑" | "↓" | "→";
  /**
   * `"improved"` when the marker was outside optimal at the earlier draw
   * and inside at the later. `"regressed"` is the inverse. `null` when
   * both draws are on the same side of the optimal range, or when the
   * marker has no defined optimal range.
   */
  crossing: CrossingKind;
}

export interface ComparisonSummary {
  /** Intersection size. */
  count: number;
  improved: number;
  regressed: number;
  /** Already-ordered rows: by category, then by |pctChange| desc within category. */
  rows: ComparisonRow[];
}

/**
 * Build the comparison summary for two panels against a marker catalog
 * (seed + user-defined). The caller is responsible for choosing which panel
 * is `earlier` (i.e. swapping when the URL params arrived reversed).
 */
export function computeComparison(
  earlier: Panel,
  later: Panel,
  markers: MarkerDef[] = [],
): ComparisonSummary {
  // Index later results by markerKey so the join is O(n).
  const laterByKey = new Map<string, number>();
  for (const r of later.results) laterByKey.set(r.markerKey, r.value);

  const rows: ComparisonRow[] = [];
  for (const er of earlier.results) {
    const lv = laterByKey.get(er.markerKey);
    if (lv == null) continue;

    // Resolve the marker definition (user marker wins on key collision —
    // see findMarker's `extras` semantics in data/markers.ts).
    const m = findMarker(er.markerKey, markers);
    if (!m) continue;

    const earlierVal = er.value;
    const laterVal   = lv;
    const delta      = laterVal - earlierVal;
    const arrow: ComparisonRow["arrow"] =
      delta === 0 ? "→" : delta > 0 ? "↑" : "↓";

    // Percent change against the earlier draw. When the earlier value is
    // zero we report 0% rather than Infinity — the row still tells the
    // story through delta + arrow, and an editorial "∞%" badge would be
    // a worse read than a quiet zero.
    const pctChange = earlierVal === 0
      ? 0
      : Math.round((delta / earlierVal) * 1000) / 10;

    rows.push({
      marker: m,
      name: m.shortName ?? m.name,
      unit: m.unit,
      earlier: earlierVal,
      later: laterVal,
      delta,
      pctChange,
      arrow,
      crossing: classifyCrossing(earlierVal, laterVal, m.optimalRange),
    });
  }

  // Ordering: group by category so the page reads like a panel report,
  // then within each category surface the biggest absolute movers first.
  rows.sort((a, b) => {
    const ca = a.marker.category;
    const cb = b.marker.category;
    if (ca !== cb) return ca.localeCompare(cb);
    return Math.abs(b.pctChange) - Math.abs(a.pctChange);
  });

  let improved = 0, regressed = 0;
  for (const r of rows) {
    if (r.crossing === "improved")  improved++;
    if (r.crossing === "regressed") regressed++;
  }

  return { count: rows.length, improved, regressed, rows };
}

/**
 * Classify a value transition relative to the marker's optimal range.
 *
 *   - "improved"  — outside optimal at earlier, inside at later
 *   - "regressed" — inside optimal at earlier, outside at later
 *   - null        — both on the same side, OR no optimal range defined
 *
 * The optimal range is open on either end (low or high may be undefined),
 * matching `MarkerDef`'s `Range` shape. Equality with a bound counts as
 * inside the range — same convention used by `flagFor()` in data/markers.ts.
 */
function classifyCrossing(
  earlier: number,
  later:   number,
  opt:     { low?: number; high?: number } | undefined,
): CrossingKind {
  if (!opt) return null;
  if (opt.low == null && opt.high == null) return null;
  const inE = inside(earlier, opt);
  const inL = inside(later, opt);
  if (inE === inL) return null;
  return inL ? "improved" : "regressed";
}

function inside(v: number, r: { low?: number; high?: number }): boolean {
  if (r.low  != null && v < r.low)  return false;
  if (r.high != null && v > r.high) return false;
  return true;
}
