// What-if marker simulator — the pure core (ticket 0019).
//
// The deterministic insight engine (src/insights.ts) is the structural moat:
// curated, multi-marker, threshold-aware rules that run before any LLM call.
// 0013 made its output auditable; 0016 carried that onto paper. This module
// makes it *interactive* — we run the SAME `computeInsights()` path twice,
// once on the live panel and once on a hypothetical panel where one or more
// marker values are dragged, then diff the two rule-output sets by id.
//
// The discipline that makes this cheap: there is exactly one rule engine.
// We do not maintain a parallel set of rules for "what-if" — we clone the
// panel, mutate the cloned result's value, and call `computeInsights()`.
// Everything is pure: no DOM, no Dexie, no network, no persistence. The drag
// fires zero Anthropic calls because the answer is computed locally in ~1-5ms.

import type { Panel, Profile, SimulationDiff, SimulationOverride } from "../types";
import { computeInsights, type PreComputedInsight } from "../insights";

export interface SimulationResult {
  current: PreComputedInsight[];
  hypothetical: PreComputedInsight[];
  diff: SimulationDiff;
}

/**
 * Re-run the insight engine over a hypothetical version of the user's panels
 * where `overrides` replace the named markers' values on the LATEST panel, and
 * return the live output, the hypothetical output, and the id-keyed diff.
 *
 * `panels` is NEWEST FIRST (the convention everywhere else). Overrides apply
 * to the most-recent panel — the one the user is dragging — so for trend rules
 * the dragged value is treated as a hypothetical *new* draw at the head of the
 * series. The function deep-clones the panels (structured-clone semantics) so
 * the caller's live data is never mutated; calling it twice with different
 * overrides can never contaminate state because each call starts from a fresh
 * clone.
 */
export function simulateInsights(
  panels: Panel[],
  profile: Profile,
  overrides: SimulationOverride[],
): SimulationResult {
  const current = computeInsights(panels, profile);

  const cloned = clonePanels(panels);
  // Apply each override to the latest (newest-first ⇒ index 0) panel's results.
  const latest = cloned[0];
  if (latest) {
    for (const ov of overrides) {
      for (const r of latest.results) {
        if (r.markerKey === ov.markerKey) r.value = ov.value;
      }
    }
  }
  const hypothetical = computeInsights(cloned, profile);

  return { current, hypothetical, diff: diffInsights(current, hypothetical) };
}

/** Id-keyed set difference between the live and hypothetical rule outputs. */
export function diffInsights(
  current: PreComputedInsight[],
  hypothetical: PreComputedInsight[],
): SimulationDiff {
  const currentIds = new Set(current.map(i => i.id));
  const hypoIds    = new Set(hypothetical.map(i => i.id));
  return {
    stillFires:        [...hypoIds].filter(id => currentIds.has(id)),
    wouldNoLongerFire: [...currentIds].filter(id => !hypoIds.has(id)),
    wouldNewlyFire:    [...hypoIds].filter(id => !currentIds.has(id)),
  };
}

/**
 * Deep-clone the panels so a simulation never mutates the caller's live data.
 * Uses `structuredClone` when available (browsers + Node 17+); falls back to
 * a JSON round-trip, which is sufficient here because a Panel's `results` are
 * plain numeric/string objects (the `fileBlobs` field is irrelevant to the
 * rule engine and is dropped by the JSON path — that's fine).
 */
function clonePanels(panels: Panel[]): Panel[] {
  if (typeof structuredClone === "function") {
    // structuredClone chokes on Blobs in some engines; strip them first.
    return panels.map(p => {
      const { fileBlobs: _b, ...rest } = p;
      return structuredClone(rest) as Panel;
    });
  }
  return panels.map(p => {
    const { fileBlobs: _b, ...rest } = p;
    return JSON.parse(JSON.stringify(rest)) as Panel;
  });
}
