// Domain types for Almanac.
// Stored verbatim in IndexedDB; also the shape of the .almanac.json export.

export type Day = string;     // YYYY-MM-DD, local time
export type Sex = "male" | "female" | "intersex" | "unspecified";

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: "singleton";
  ownerName: string;
  birthDate?: Day;            // YYYY-MM-DD; we derive age from this
  sex: Sex;                   // for sex-specific reference ranges
  heightCm?: number;
  weightKg?: number;
  goals: string;              // free-form, fed to plan generation
  conditions: string;         // free-form: existing dx, medications, allergies
  anthropicKey: string;       // BYOK; never leaves the device except → api.anthropic.com
  model: string;              // claude-sonnet-4-6 by default
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Lab markers and panels                                                    */
/* -------------------------------------------------------------------------- */

export type Flag = "low" | "high" | "in-range" | "suboptimal" | "optimal";

/**
 * A definition for a single biomarker we know about. Lives in markers.ts as a
 * static seed; user-added markers get persisted under the same shape.
 *
 * `key` is the canonical identifier (slug-style). Aliases are the strings we
 * accept from lab reports during extraction.
 */
export interface MarkerDef {
  key: string;
  name: string;               // human-readable: "Vitamin D, 25-Hydroxy"
  shortName?: string;         // "Vitamin D"
  category: MarkerCategory;
  unit: string;               // canonical unit
  altUnits?: { unit: string; toCanonical: number }[];   // multiplier into canonical
  aliases: string[];          // common report names + LOINC if useful
  labRange?: Range;           // typical lab "normal" if no per-lab range arrived
  optimalRange: Range;        // functional / optimal target
  description: string;        // 1–2 sentence plain-language summary
  higherIsBetter?: boolean;   // for one-sided markers; default false (range-bound)
  sex?: Sex;                  // restrict to a sex if applicable
}

export type MarkerCategory =
  | "metabolic"   | "lipids"  | "thyroid"   | "hormones"
  | "vitamins"    | "minerals"| "inflammation" | "kidney"
  | "liver"       | "blood"   | "iron"      | "cardio"
  | "other";

export interface Range { low?: number; high?: number; }

/**
 * A single result inside a panel: one marker, one value, both ranges captured.
 * `labRange` is what THIS lab reported for this draw; it can differ slightly
 * from the marker's typical labRange. Functional range comes from the seed DB.
 */
export interface Result {
  markerKey: string;          // FK to MarkerDef.key
  rawName?: string;           // exactly what appeared on the report
  value: number;
  unit: string;
  labRange?: Range;
  optimalRange?: Range;
  flag?: Flag;
  notes?: string;
}

/**
 * A drawn panel — the output of one blood draw or lab visit. Multiple results.
 * If we extracted from a PDF/image, we keep the original blob locally so the
 * user can revisit the source. The blob never leaves IndexedDB.
 */
export interface Panel {
  id?: number;
  drawnAt: Day;               // date of draw
  labName?: string;           // "Quest Diagnostics", etc.
  source: "pdf" | "image" | "manual";
  fileName?: string;
  fileBlob?: Blob;            // original PDF/image, kept on-device
  results: Result[];
  notes?: string;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Plan — the living protocol                                                */
/* -------------------------------------------------------------------------- */

export interface Plan {
  id?: number;
  generatedAt: number;
  basedOnPanelIds: number[];
  model?: string;

  snapshot: string;           // 1–2 paragraphs, plain language

  insights: Insight[];        // 3–7 specific findings, prioritized

  nutrition: Recommendation[];
  lifestyle: Recommendation[];
  supplements: Recommendation[];

  habitStack: HabitStack;     // 3–5 daily things, the easy tier

  retest: RetestItem[];
}

export interface Insight {
  markerKey?: string;         // optional — some insights span markers
  title: string;              // "Iron stores are low-normal"
  detail: string;             // 1–3 sentences
  priority: "high" | "medium" | "low";
}

export type Tier = "easy" | "moderate" | "advanced";

export interface Recommendation {
  id: string;                 // stable id for adherence tracking
  title: string;              // "Eat fatty fish 2x/week"
  why: string;                // tied to a specific finding
  how: string;                // concrete: foods, doses, times
  tier: Tier;
  expectedImpact?: string;    // "↑ omega-3 index, ↓ hsCRP over ~12 weeks"
  caution?: string;           // for supplements: interactions, monitoring
}

export interface HabitStack {
  intro: string;              // 1 sentence framing
  habits: Habit[];            // exactly 3–5
}

export interface Habit {
  id: string;                 // stable id (matches CheckIn entries)
  title: string;              // short imperative: "10g creatine with breakfast"
  cue: string;                // when/where it lives in the day
  why: string;                // one sentence linking it to a marker or goal
}

export interface RetestItem {
  markerKeys: string[];
  whenWeeks: number;          // re-test in N weeks
  reason: string;
}

/* -------------------------------------------------------------------------- */
/*  Daily check-in                                                            */
/* -------------------------------------------------------------------------- */

export interface CheckIn {
  id?: number;
  day: Day;
  habitsCompleted: string[];  // habit ids that were done today
  signals?: { sleepHours?: number; mood?: 1|2|3|4|5; energy?: 1|2|3|4|5 };
  note?: string;              // optional one-liner
  createdAt: number;
}
