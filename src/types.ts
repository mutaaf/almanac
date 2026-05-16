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
  signals?: { sleepHours?: number; mood?: 1|2|3|4|5; energy?: 1|2|3|4|5 };
  note?: string;
  createdAt: number;
}
