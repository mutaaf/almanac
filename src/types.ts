// Domain types for Almanac.

export type Day = string;     // YYYY-MM-DD, local time
export type Sex = "male" | "female" | "intersex" | "unspecified";

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: "singleton";
  ownerName: string;
  birthDate?: Day;
  sex: Sex;
  heightIn?: number;
  weightLb?: number;

  goals: string;              // free-form
  conditions: string;         // free-form: dx, meds, allergies

  /**
   * Dietary pattern in plain English. Captures halal / vegetarian / pescatarian /
   * cuisines / dislikes / allergies in one place. Read by the meal generator.
   */
  dietPattern: string;
  householdSize?: number;     // for grocery quantities; defaults to 1

  anthropicKey: string;       // BYOK
  model: string;
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Lab markers and panels                                                    */
/* -------------------------------------------------------------------------- */

export type Flag = "low" | "high" | "in-range" | "suboptimal" | "optimal";

export interface MarkerDef {
  key: string;
  name: string;
  shortName?: string;
  category: MarkerCategory;
  unit: string;
  altUnits?: { unit: string; toCanonical: number }[];
  aliases: string[];
  labRange?: Range;
  optimalRange: Range;
  description: string;
  higherIsBetter?: boolean;
  sex?: Sex;
  /**
   * Curated time-to-effect + plausible-movement metadata, ticket 0012. Only
   * present on markers where the functional-medicine literature gives us
   * defensible numbers (ferritin, ApoB, hs-CRP, fasting insulin, hba1c,
   * vit D, omega-3 index, free T3, magnesium RBC). The projection module
   * skips markers without this field — that's the intentional gate.
   *
   *   weeksToEffect: [low, high] window in weeks over which the marker
   *                  typically moves once a relevant tier is held.
   *   direction:     which way "improvement" pushes the value. "either"
   *                  is reserved for markers where the user's starting
   *                  side of the optimal range determines the direction
   *                  (rarely used; included for completeness).
   *   magnitude:     plausible movement per protocol window in marker
   *                  units. `low`/`high` are unsigned magnitudes — the
   *                  projection module applies the sign from `direction`
   *                  and the user's current side of the optimal range.
   */
  responsiveness?: {
    weeksToEffect: [number, number];
    direction: "increase" | "decrease" | "either";
    magnitude: { low: number; high: number; unit?: string };
  };
}

export type MarkerCategory =
  | "metabolic"   | "lipids"  | "thyroid"   | "hormones"
  | "vitamins"    | "minerals"| "inflammation" | "kidney"
  | "liver"       | "blood"   | "iron"      | "cardio"
  | "other";

export interface Range { low?: number; high?: number; }

export interface Result {
  markerKey: string;
  rawName?: string;
  value: number;
  unit: string;
  labRange?: Range;
  optimalRange?: Range;
  flag?: Flag;
  notes?: string;
}

export interface Panel {
  id?: number;
  drawnAt: Day;
  labName?: string;
  /**
   * A single panel can come from many pages — lab reports often arrive as
   * several photos or screenshots of the same draw. "mixed" when the
   * staged files were a combination of PDFs and images.
   */
  source: "pdf" | "image" | "manual" | "mixed";
  fileNames?: string[];   // parallel to fileBlobs
  fileBlobs?: Blob[];     // originals, kept on-device
  results: Result[];
  notes?: string;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Plan — food-forward protocol                                              */
/* -------------------------------------------------------------------------- */

export interface Plan {
  id?: number;
  generatedAt: number;
  basedOnPanelIds: number[];
  model?: string;

  snapshot: string;                  // 1–2 short paragraphs

  insights: Insight[];               // 3–7 prioritized findings

  eatList:   EatItem[];              // foods to add — specific, with frequency + portion
  avoidList: AvoidItem[];            // foods to reduce — specific, with swap

  lifestyle:   Recommendation[];     // smaller; supportive
  supplements: Recommendation[];     // small; only when labs justify

  habitStack: HabitStack;            // 3–5 daily things, easy tier first
  retest: RetestItem[];
}

export interface Insight {
  markerKey?: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  /**
   * Optional provenance attached when this insight was emitted by the
   * deterministic rule engine in `src/insights.ts`. Carries everything the
   * Plan page needs to render the "Why this fired" slideover without going
   * back to the rule engine — the rule id, the rule category, the markers
   * that triggered the rule (with their values + units + draw date), and
   * the rule's evidence string verbatim.
   *
   * LLM-only insights (the ones Claude adds beyond what the rule engine
   * produced) carry no `provenance`; the absence is the signal.
   *
   * Ticket 0013.
   */
  provenance?: InsightProvenance;
}

export interface InsightProvenance {
  ruleId: string;
  category: "pattern" | "trend";
  supportingMarkers: Array<{
    markerKey: string;
    value: number;
    unit: string;
    drawnAt: Day;
    /** Optional plain-English threshold description, e.g. "functional floor 50 ng/mL". */
    threshold?: string;
  }>;
  evidence: string;
}

/**
 * The food prescription. Specific, frequency-and-portion driven, tied to markers.
 */
export interface EatItem {
  id: string;                        // stable id
  food: string;                      // "Fatty fish (salmon, sardines, mackerel)"
  frequency: string;                 // "2x per week"
  portion: string;                   // "~4 oz cooked, palm-sized"
  why: string;                       // tied to specific findings
  markerKeys: string[];              // which markers this addresses
  examples?: string[];               // concrete options the user can buy
  cuisineNotes?: string;             // tying back to their preferred cuisines
}

export interface AvoidItem {
  id: string;
  food: string;                      // "Industrial seed oils"
  why: string;
  markerKeys?: string[];
  swap?: string;                     // "Use olive oil, avocado oil, or ghee instead"
}

export type Tier = "easy" | "moderate" | "advanced";

export interface Recommendation {
  id: string;
  title: string;
  why: string;
  how: string;
  tier: Tier;
  expectedImpact?: string;
  caution?: string;
  /**
   * Markers this recommendation is intended to move. Optional for back-compat
   * with older plans, but the slideover's "How to move it" panel filters
   * supplements/lifestyle by this field when populated.
   */
  markerKeys?: string[];
}

export interface HabitStack {
  intro: string;
  habits: Habit[];
}

export interface Habit {
  id: string;
  title: string;
  cue: string;
  why: string;
}

export interface RetestItem {
  markerKeys: string[];
  whenWeeks: number;
  reason: string;
}

/* -------------------------------------------------------------------------- */
/*  Weekly meal plan (separate generation, separate table)                    */
/* -------------------------------------------------------------------------- */

export type Effort = "assembly" | "weeknight" | "weekend" | "batch";

export interface MealPlan {
  id?: number;
  planId: number;                    // FK → Plan.id
  weekStart: Day;                    // first day in days[]
  generatedAt: number;
  model?: string;

  days: DayMeals[];                  // exactly 7
  grocery: GrocerySection[];
}

export interface DayMeals {
  day: Day;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  snack?: Meal;
}

export interface Meal {
  id: string;                        // stable within plan; e.g. "mon-dinner"
  title: string;                     // "Salmon with lentils + sautéed kale"
  description: string;               // 1–2 sentences
  effort: Effort;
  timeMinutes: number;               // active time
  servings: number;
  ingredients: string[];             // free-form lines, e.g. "1 lb wild salmon"
  steps?: string[];                  // optional brief steps; missing = trust the user
  hits: string[];                    // markerKeys this meal contributes to
  cuisine?: string;
  tags?: string[];                   // ["high-protein", "anti-inflammatory", ...]
}

export interface GrocerySection {
  name: string;                      // "Produce", "Protein", "Pantry", "Dairy"
  items: GroceryItem[];
}

export interface GroceryItem {
  name: string;                      // "wild salmon, frozen"
  quantity?: string;                 // "1.5 lb"
  forMeals?: string[];               // meal ids this item supports
}

/* -------------------------------------------------------------------------- */
/*  Daily check-in                                                            */
/* -------------------------------------------------------------------------- */

export interface CheckIn {
  id?: number;
  day: Day;
  habitsCompleted: string[];
  mealsAte?: string[];               // ids of meals from today's plan that were eaten
  /**
   * Per-day signals. The manual fields (`sleepHours`, `mood`, `energy`) are
   * populated by the Today screen and are NEVER overwritten by the Apple
   * Health import — manual entry wins forever.
   *
   * The continuous fields (`hrvMs`, `rhrBpm`, `weightKg`, `glucoseMgDl`) are
   * populated by the Apple Health import (ticket 0004). `sleepHours` is the
   * only field both surfaces can write: manual entry wins if present;
   * otherwise the import fills it from the aggregated nightly asleep total.
   */
  signals?: {
    sleepHours?: number;
    mood?: 1|2|3|4|5;
    energy?: 1|2|3|4|5;
    /** Heart-rate variability (SDNN), milliseconds. From Apple Health import. */
    hrvMs?: number;
    /** Resting heart rate, bpm. From Apple Health import. */
    rhrBpm?: number;
    /** Body mass, kilograms. From Apple Health import. */
    weightKg?: number;
    /** Blood glucose readings for the day, mg/dL. From Apple Health import. */
    glucoseMgDl?: number[];
  };
  note?: string;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Continuous signals (ticket 0004 — Apple Health import)                    */
/* -------------------------------------------------------------------------- */

/**
 * One day's worth of continuous-signal data parsed out of an Apple Health
 * export. The Apple Health import collapses HK record streams into one row
 * per local day and then merges those rows into the per-day `CheckIn.signals`
 * structure — this type is the intermediate the worker returns.
 *
 * All numeric fields are optional because Apple Health exports are sparse:
 * a user might wear an Apple Watch but never step on a connected scale, or
 * wear a Dexcom but no watch.
 */
export interface ContinuousSignal {
  day: Day;
  /** Heart-rate variability (SDNN), milliseconds. Averaged across the day. */
  hrvMs?: number;
  /** Resting heart rate, bpm. Averaged across the day. */
  rhrBpm?: number;
  /** Total nightly asleep time in hours, attributed to the wake-up day. */
  sleepHours?: number;
  /** Body mass, kilograms. Latest reading of the day. */
  weightKg?: number;
  /** All blood-glucose readings for the day, mg/dL, in time order. */
  glucoseMgDl?: number[];
}

/* -------------------------------------------------------------------------- */
/*  Weekly recap (ticket 0008)                                                */
/* -------------------------------------------------------------------------- */
/*
 * Computed read-only summary of one ISO week. Nothing here is persisted;
 * `computeRecap()` builds a fresh `RecapSummary` from the current Plan +
 * MealPlan + checkins on every render. The recap page is deterministic and
 * runs without a single Anthropic call.
 */

export interface RecapSummary {
  /** ISO 8601 week label, e.g. "2026-W19". Used as the dismissal key. */
  isoWeek: string;
  /** Inclusive [mondayIso, sundayIso] for the recapped week. */
  range: [Day, Day];
  /** Total check-in rows that fell inside `range`. Used by empty-state gating. */
  checkInCount: number;
  /** True when `checkInCount < 3` — the renderer shows the empty card and skips data sections. */
  isEmpty: boolean;

  /** Days in the week with at least one habit logged (0..7). */
  daysWithHabit: number;
  /** Days in the week with no check-in row at all (0..7). */
  daysWithoutCheckIn: number;

  /** One row per habit in the active plan. Always present (may be empty list). */
  adherence: RecapAdherenceRow[];

  /** Meals counted vs total planned. Undefined when no meal plan covered the week. */
  meals?: { ate: number; planned: number };

  /** Sleep / mood / energy averages + week-over-week deltas. Undefined when no signals were logged. */
  signals?: RecapSignals;

  /** Largest absolute signal mover, if any. The renderer phrases the editorial line from this. */
  mover?: RecapMover;

  /** "The thing to try next week" — a single editorial sentence, no LLM. */
  suggestion?: string;
}

export interface RecapAdherenceRow {
  habitId: string;
  /** Human-readable habit title — taken from the plan's habit stack. */
  title: string;
  /** Days in the week where this habit appears in CheckIn.habitsCompleted. */
  hit: number;
  /** Always 7 — surfaced so the renderer can read "{hit} of {of}". */
  of: 7;
}

export interface RecapSignals {
  sleepHoursAvg?: number;    // hours
  moodAvg?: number;          // 1..5
  energyAvg?: number;        // 1..5
  /** Deltas: thisWeekAvg - lastWeekAvg. Undefined when last week had no data. */
  sleepHoursDelta?: number;
  moodDelta?: number;
  energyDelta?: number;
}

export interface RecapMover {
  kind: "sleep" | "mood" | "energy";
  delta: number;             // signed; same units as the signal it refers to
  direction: "up" | "down";  // sign of `delta`
}

/* -------------------------------------------------------------------------- */
/*  Projection snapshots (ticket 0012)                                        */
/* -------------------------------------------------------------------------- */
/*
 * One row per qualifying marker per panel upload. The row records the
 * projected band the user was looking at at the time the new panel was
 * uploaded, so the post-upload Progress page can render an evaluation
 * ("Projected 35–55. Landed at 42 — within range.") against ground truth.
 *
 * `panelId` is the id of the panel the projection was computed FROM (the
 * prior-latest panel). On a new upload, evaluation joins this row against
 * the just-arrived panel's value for the same markerKey.
 */
export interface ProjectionSnapshot {
  id?: number;
  markerKey: string;
  panelId: number;
  low: number;
  high: number;
  weeksOut: [number, number];
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/*  Quiet-day note (ticket 0015)                                              */
/* -------------------------------------------------------------------------- */
/*
 * Returned by `pickQuietDayNote()` (in `src/today/quiet-card.ts`) when a
 * between-cadence note should surface above Today's meals on a Mon–Sat
 * morning. One note, one CTA — never two. The precedence chain enforces a
 * single kind per render so the card stays editorial.
 *
 * The shape is intentionally pure-presentational: a kind tag for analytics-
 * free debugging, a one-line headline, a one-sentence body in the editorial
 * voice, and exactly one CTA with a stable label + href. The page layer
 * renders this without re-deriving anything.
 */
export type QuietDayNoteKind =
  | "adherence-at-risk"
  | "projection-window"
  | "meal-skipped-pattern";

export interface QuietDayNote {
  kind: QuietDayNoteKind;
  headline: string;
  body: string;
  cta: { label: string; href: string };
}

/* -------------------------------------------------------------------------- */
/*  Shareable protocol link (ticket 0017)                                     */
/* -------------------------------------------------------------------------- */
/*
 * The bytes that travel in the URL hash when a user shares their protocol.
 * Exactly the fields named below; everything else (profile, labs, insights,
 * retest, check-ins, projections, the API key) is excluded by construction.
 *
 * The encoder JSON-stringifies an instance of this interface, gzips the
 * string via CompressionStream("gzip"), and base64url-encodes the bytes.
 * The decoder reverses the chain. Schema/version drift returns `null` from
 * the decoder; the router routes such requests back to #/welcome with the
 * "did not decode" inline notice.
 *
 * Versioned (`version: 1`) so a future schema bump can either reject older
 * links (return null on a version mismatch) or migrate them in place.
 */
export interface SharedProtocolPayload {
  version: 1;
  eatList: EatItem[];
  avoidList: AvoidItem[];
  habitStack: HabitStack;
  mealPlan?: SharedMealPlan;
}

/**
 * The trimmed-down meal plan that travels in the share link. Carries only
 * `days` and `grocery` — the host's `planId`, `weekStart`, `generatedAt`,
 * and `model` are not part of the recipient's view of "what was shared".
 */
export interface SharedMealPlan {
  days: DayMeals[];
  grocery: GrocerySection[];
}

/**
 * The in-memory shape held by the shared-state module after a successful
 * decode. The decoded `SharedProtocolPayload` is wrapped in a partial Plan
 * + MealPlan facade so the existing render functions on Today / Plan / Meals
 * can read from it without a per-page conditional.
 *
 * `plan` is a synthetic, mostly-empty Plan whose only populated fields are
 * the ones the payload carries. The Plan page's renderEditorial / renderDashboard
 * read snapshot / insights / lifestyle / supplements / retest and gracefully
 * skip when they're empty — the shared-view render bypasses those sections.
 */
export interface SharedProtocolState {
  payload: SharedProtocolPayload;
  /** Synthetic Plan shell built from the payload's eat / avoid / habit fields. */
  plan: Plan;
  /** Synthetic MealPlan shell, only when the payload carries one. */
  mealPlan?: MealPlan;
}
