// The panel report card (ticket 0036).
//
// `computeReportCard(panel, markers)` is the deterministic, zero-network
// transform behind the "Against the optimum" section at the top of the
// post-extraction panel review screen (#/labs?id=N). It reduces the panel's
// already-flagged results over the existing `Flag` classification to count how
// the panel stacks up against the FUNCTIONAL optimum — not the lab floor:
//
//   optimal       inside the functional range
//   suboptimal    inside the lab range but below the functional optimum (the
//                 wedge — "normal but not optimal")
//   outOfLabRange outside the lab range entirely (low or high)
//
// A marker outside the lab range counts ONLY in `outOfLabRange`, never also in
// `suboptimal`, even though it is also outside the optimum — the flag is a
// single discriminant, so the buckets are mutually exclusive by construction.
//
// Results whose marker does not resolve to a range — no lab range and no optimal
// range to judge against — are excluded from `total` (and the card renders
// nothing when `total` is 0). The sibling of the canonicalization (0026) and
// movement (0032) receipts: this is the static at-rest picture, the only thing
// available on a first-ever upload.
//
// Pure: no DOM, no Dexie, no network. The page passes in the merged marker set
// (seed + user markers) so user-defined (0002) and sex-specific keys
// (ferritin_m / ferritin_f) classify against the correct ranges.

import type { Flag, MarkerDef, Panel, Range, Result, ReportCard } from "../types";
import { findMarker, flagFor } from "../data/markers";

/**
 * Resolve the flag for a result. Prefer the flag the extractor / manual-entry
 * path stored at draw time; otherwise classify with `flagFor()` against the
 * ranges available — the result's own stored ranges first (what the user saw at
 * draw time), falling back to the resolved marker's DB ranges.
 *
 * Returns `undefined` when there is no range to judge against — neither the
 * result nor the resolved marker carries a lab or optimal range — so the caller
 * can exclude the result from `total`. Exported so the panel-review row renderer
 * tags each row with the SAME report class the card counted it into.
 */
export function resolveResultFlag(result: Result, markers: MarkerDef[] = []): Flag | undefined {
  if (result.flag) return result.flag;

  const marker = findMarker(result.markerKey, markers);
  const lab: Range | undefined = result.labRange ?? marker?.labRange;
  const optimal: Range | undefined = result.optimalRange ?? marker?.optimalRange;

  // Nothing to classify against — an unrecognized or range-less marker.
  if (!hasBound(lab) && !hasBound(optimal)) return undefined;

  return flagFor(result.value, optimal, lab);
}

/**
 * Map a resolved flag onto one of the card's three named buckets (or null when
 * the flag is the rare in-range-without-optimum case, or undefined). Shared by
 * the card chips and the per-row `data-report-class` so a chip tap selects
 * exactly the rows the chip counted.
 */
export function reportClassFor(flag: Flag | undefined): "optimal" | "suboptimal" | "outOfLabRange" | null {
  if (flag === "optimal") return "optimal";
  if (flag === "suboptimal") return "suboptimal";
  if (flag === "low" || flag === "high") return "outOfLabRange";
  return null;
}

/** True when a range carries at least one numeric bound. */
function hasBound(r?: Range): boolean {
  return !!r && (r.low != null || r.high != null);
}

/**
 * Reduce a panel's results into the report-card tally against the functional
 * optimum. `markers` is the merged marker catalog (from `getAllMarkers()` /
 * `listUserMarkers()`); seed keys resolve from the DB, user keys from `markers`.
 */
export function computeReportCard(panel: Panel, markers: MarkerDef[] = []): ReportCard {
  let total = 0;
  let optimal = 0;
  let suboptimal = 0;
  let lowOrHigh = 0;

  for (const result of panel.results) {
    const flag = resolveResultFlag(result, markers);
    if (!flag) continue;        // range-less / unresolved — excluded from total

    // "in-range" means inside the lab range with no functional range to refine
    // against; it is classifiable (it counts toward total) but belongs to none
    // of the three named buckets. It is rare — every shipped marker carries an
    // optimal range — but a user marker defined with only a lab range can land
    // here, and excluding it from total would undercount the denominator.
    total++;
    if (flag === "optimal") optimal++;
    else if (flag === "suboptimal") suboptimal++;
    else if (flag === "low" || flag === "high") lowOrHigh++;
  }

  return {
    total,
    optimal,
    suboptimal,
    outOfLabRange: lowOrHigh,
    lowOrHigh,
  };
}

/**
 * The editorial sentence for a report card. Voice spec (ticket 0036): only the
 * non-zero clauses appear, in the order optimal → suboptimal → out-of-range. An
 * all-optimal panel reads the first clause plus a reassuring close. Declarative,
 * no exclamation, no alarm. The copy lives next to the computation it describes,
 * mirroring `moveSentence()` in the movement-receipt module.
 */
export function reportCardSentence(card: ReportCard): string {
  const clauses: string[] = [`Of ${card.total} ${plural(card.total, "marker")}, ${card.optimal} ${be(card.optimal)} optimal.`];

  if (card.suboptimal > 0) {
    clauses.push(`${card.suboptimal} ${verbSit(card.suboptimal)} inside the lab's normal range but below the functional optimum.`);
  }
  if (card.outOfLabRange > 0) {
    clauses.push(`${card.outOfLabRange} ${be(card.outOfLabRange)} outside the lab range.`);
  }
  // Nothing below the optimum and nothing out of range — close on reassurance.
  if (card.suboptimal === 0 && card.outOfLabRange === 0) {
    clauses.push("Nothing sits below the functional optimum.");
  }

  return clauses.join(" ");
}

/** "1 marker" / "2 markers" — pluralize a noun by count. */
function plural(n: number, noun: string): string {
  return n === 1 ? noun : `${noun}s`;
}

/** Subject-verb agreement for "is/are" against a count. */
function be(n: number): string {
  return n === 1 ? "is" : "are";
}

/** Subject-verb agreement for "sits/sit" against a count. */
function verbSit(n: number): string {
  return n === 1 ? "sits" : "sit";
}
