// Hand-curated sample dataset for the pre-consent tour (ticket 0014).
//
// One fictional 38-year-old male, halal-pescatarian, with a two-panel iron
// + lipid history chosen so the deterministic insight engine fires the
// `iron_restricted_erythropoiesis` rule and the 0012 projection cards have a
// prior panel to evaluate against. Every field type-checks against
// `src/types.ts`; any future schema change will break this file at typecheck
// time, not at runtime.
//
// Dates are computed at import time so the streak strip, recap, and projection
// arithmetic always land on a "this month / last month" interval relative to
// when the visitor opens the tour. The dataset is deterministic in *content*
// (same markers, same values, same insights every time) but the *temporal
// anchor* shifts with the calendar, which is what we want — a year-old draw
// would look stale to a visitor in May 2027.
//
// The fixture is imported lazily by `src/sample/state.ts` (`await import(...)`)
// so production bundles for non-tour visitors carry no fixture bytes.

import type {
  CheckIn, Day, MealPlan, Panel, Plan, Profile, Result,
} from "../types";
import { findMarker } from "../data/markers";

/* -------------------------------------------------------------------------- */
/*  Date anchors                                                              */
/* -------------------------------------------------------------------------- */
/*
 * `today()` returns a Day in local time; `addDays` shifts forward/backward.
 * We don't import from `src/db.ts` here because that module brings the Dexie
 * connection along for the ride — the tour must touch no IndexedDB.
 */

function isoDay(d: Date): Day {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function today(): Day { return isoDay(new Date()); }

function addDays(day: Day, n: number): Day {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/* -------------------------------------------------------------------------- */
/*  Result builder                                                            */
/* -------------------------------------------------------------------------- */
/*
 * Helper that resolves the canonical MarkerDef so the Result row carries the
 * right lab/optimal ranges and `flag`. Defaulting these per-row would couple
 * the fixture to internal range numbers; routing through `findMarker` lets a
 * future range edit show up on the tour without a fixture update.
 */

function result(key: string, value: number, unit?: string): Result {
  const m = findMarker(key);
  if (!m) throw new Error(`sample fixture references unknown marker: ${key}`);
  const opt = m.optimalRange;
  const lab = m.labRange;
  // Same flagFor logic as data/markers.ts: prefer the optimal band; if the
  // value sits outside the lab range, it's low/high; if inside lab but
  // outside optimal, suboptimal; otherwise optimal.
  let flag: Result["flag"];
  const within = (v: number, r?: { low?: number; high?: number }) => {
    if (!r) return true;
    if (r.low != null && v < r.low)   return false;
    if (r.high != null && v > r.high) return false;
    return true;
  };
  if (lab && !within(value, lab)) flag = value < (lab.low ?? -Infinity) ? "low" : "high";
  else if (within(value, opt))    flag = "optimal";
  else                            flag = "suboptimal";

  return {
    markerKey: key,
    value,
    unit: unit ?? m.unit,
    ...(lab ? { labRange: lab } : {}),
    ...(opt ? { optimalRange: opt } : {}),
    flag,
  };
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                   */
/* -------------------------------------------------------------------------- */
/*
 * "Sample Reader" — a 38-year-old male, halal-pescatarian. The API key is the
 * literal placeholder `sk-ant-SAMPLE`; the tour code is structured so this
 * value is never read by any network code path, but we set it to a recognizable
 * non-functional string for belt-and-braces (any attempt to send it produces
 * a 401 from Anthropic if it ever escaped the tour guard).
 */

const PROFILE: Profile = {
  id: "singleton",
  ownerName: "Sample Reader",
  birthDate: "1988-03-12",
  sex: "male",
  heightIn: 70,
  weightLb: 178,
  goals: "Lower cholesterol, more afternoon energy",
  conditions: "None.",
  dietPattern: "Halal pescatarian. South Asian + Mediterranean. Cook three weeknights, batch on Sunday.",
  householdSize: 2,
  anthropicKey: "sk-ant-SAMPLE",
  model: "claude-sonnet-4-6",
  createdAt: Date.UTC(2026, 0, 8),    // Vol/Issue label reads sensibly
  updatedAt: Date.UTC(2026, 0, 8),
};

/* -------------------------------------------------------------------------- */
/*  Panels                                                                    */
/* -------------------------------------------------------------------------- */
/*
 * Two panels four months apart. The earlier panel sits below functional
 * targets across iron + lipid + vit D + hs-CRP; the later panel shows
 * partial movement so the comparison view tells a credible "improving"
 * story but the iron picture is still present (ferritin 42 vs the male
 * functional floor of 70 → iron-restricted erythropoiesis still fires).
 *
 * Markers chosen so the following rules / surfaces all light up:
 *   - iron_restricted_erythropoiesis  (ferritin_m + mcv + mch)
 *   - atherogenic_dyslipidemia        (apoB + TG + HDL + TG/HDL ratio)
 *   - inflammation_triad              (hs-CRP + ferritin_m)
 *   - projection cards on apo_b, hs_crp, ferritin_m, vit_d_25oh, fasting_insulin
 */

function buildPanels(): Panel[] {
  const prior: Panel = {
    id: 1,
    drawnAt: addDays(today(), -120),
    labName: "Sample Diagnostics",
    source: "manual",
    createdAt: Date.UTC(2026, 0, 8),
    results: [
      result("apo_b", 102),
      result("ldl_c", 138),
      result("hdl_c", 38),
      result("triglycerides", 168),
      result("total_cholesterol", 222),
      result("ferritin_m", 32),
      result("mcv", 86),
      result("mch", 27),
      result("hemoglobin_m", 14.1),
      result("hs_crp", 2.4),
      result("vit_d_25oh", 24),
      result("fasting_insulin", 9.4),
      result("fasting_glucose", 96),
      result("hba1c", 5.5),
    ],
  };
  const recent: Panel = {
    id: 2,
    drawnAt: addDays(today(), -14),
    labName: "Sample Diagnostics",
    source: "manual",
    createdAt: Date.now() - 14 * 86400_000,
    results: [
      result("apo_b", 88),
      result("ldl_c", 118),
      result("hdl_c", 46),
      result("triglycerides", 132),
      result("total_cholesterol", 198),
      result("ferritin_m", 42),
      result("mcv", 88),
      result("mch", 28),
      result("hemoglobin_m", 14.4),
      result("hs_crp", 1.6),
      result("vit_d_25oh", 34),
      result("fasting_insulin", 7.2),
      result("fasting_glucose", 92),
      result("hba1c", 5.3),
    ],
  };
  return [prior, recent];
}

/* -------------------------------------------------------------------------- */
/*  Plan                                                                      */
/* -------------------------------------------------------------------------- */
/*
 * Hand-curated plan with at least one insight carrying `provenance` so the
 * 0013 chip + slideover render. Modeled on `tests/fixtures/plan-with-
 * provenance.json` so a future Plan-shape edit breaks both this file AND
 * that fixture at typecheck/parse time.
 *
 * The plan's `basedOnPanelIds: [1, 2]` ties it to the two fixture panels.
 */

function buildPlan(): Plan {
  return {
    id: 1,
    generatedAt: Date.now() - 13 * 86400_000,
    basedOnPanelIds: [1, 2],
    model: "claude-sonnet-4-6",
    snapshot:
      "Ferritin still sits below the male functional floor and red-cell indices are running small — the picture lines up with iron-restricted erythropoiesis even with hemoglobin in range. Lipids are walking back from a high-risk profile but ApoB has more room to give.\n\nThe second observation: the cheapest habit available is a ten-minute walk after dinner. It moves post-meal glucose and triglyceride disposal in the right direction, and it goes into the stack as the second move.",
    insights: [
      {
        title: "Iron-restricted erythropoiesis pattern",
        detail:
          "Ferritin at 42 ng/mL sits well below the male functional floor of 70, and MCV at 88 fL is at the functional border. Even with hemoglobin in range, this is the picture that often presents as afternoon fatigue and exercise intolerance.",
        priority: "high",
        markerKey: "ferritin_m",
        provenance: {
          ruleId: "iron_restricted_erythropoiesis",
          category: "pattern",
          supportingMarkers: [
            { markerKey: "ferritin_m", value: 42, unit: "ng/mL", drawnAt: addDays(today(), -14), threshold: "functional floor 70 ng/mL (male)" },
            { markerKey: "mcv",         value: 88, unit: "fL",    drawnAt: addDays(today(), -14), threshold: "functional 88–92 fL" },
            { markerKey: "mch",         value: 28, unit: "pg",    drawnAt: addDays(today(), -14) },
          ],
          evidence: "ferritin 42 ng/mL · MCV 88 fL · MCH 28 pg",
        },
      },
      {
        title: "ApoB walking down but still above the functional ceiling",
        detail:
          "ApoB dropped from 102 to 88 — a real move in twelve weeks. Soluble fiber and omega-3 keep going; particle count is still above the 80 mg/dL target for someone optimizing cardiovascular risk.",
        priority: "medium",
        markerKey: "apo_b",
      },
      {
        title: "Post-meal walking is the cheapest cardiometabolic lever",
        detail:
          "Independent of the iron picture, a ten-minute walk after dinner consistently moves post-meal glucose and triglyceride disposal in the right direction. Worth pinning as a daily habit while iron repletion runs its course.",
        priority: "medium",
      },
    ],
    eatList: [
      {
        id: "red-meat",
        food: "Lean red meat or liver (when the dietary pattern allows)",
        frequency: "2x per week",
        portion: "4–5 oz cooked",
        why: "Most absorbable form of iron; addresses ferritin directly. Sample Reader's pattern is halal pescatarian, so this slot is fish-and-egg-yolk forward.",
        markerKeys: ["ferritin_m"],
        examples: ["wild salmon", "sardines", "egg yolks", "lamb (when in the rotation)"],
      },
      {
        id: "lentils-vitc",
        food: "Lentils paired with a vitamin-C produce (bell pepper, tomato, citrus)",
        frequency: "3x per week",
        portion: "1 cup cooked lentils + 1 cup of the produce",
        why: "Non-heme iron with vitamin C at the same meal multiplies absorption.",
        markerKeys: ["ferritin_m"],
        examples: ["dal with roasted tomato", "lentil salad with red pepper", "lentil soup with lemon"],
      },
      {
        id: "fatty-fish",
        food: "Fatty fish — salmon, sardines, mackerel",
        frequency: "3x per week",
        portion: "4–6 oz cooked",
        why: "EPA + DHA reduce ApoB and triglycerides; vitamin D moves with consistent intake.",
        markerKeys: ["apo_b", "triglycerides", "vit_d_25oh"],
        examples: ["roasted salmon", "sardines on toast", "mackerel salad bowl"],
      },
      {
        id: "soluble-fiber",
        food: "Soluble-fiber forward grains and legumes",
        frequency: "Daily",
        portion: "1 cup cooked",
        why: "Soluble fiber binds bile acids and lowers ApoB. Oats, barley, lentils, chickpeas all qualify.",
        markerKeys: ["apo_b", "ldl_c"],
        examples: ["steel-cut oats", "barley pilaf", "chana masala"],
      },
    ],
    avoidList: [
      {
        id: "tea-with-meals",
        food: "Strong tea or coffee within an hour of an iron-rich meal",
        why: "Tannins blunt non-heme iron absorption substantially.",
        swap: "Tea between meals; water or sparkling water at the table.",
      },
      {
        id: "seed-oils",
        food: "Industrial seed oils (soybean, corn, cottonseed)",
        why: "High intake associates with inflammation markers and lipid oxidation.",
        markerKeys: ["hs_crp", "apo_b"],
        swap: "Olive oil, avocado oil, or ghee for cooking.",
      },
    ],
    lifestyle: [
      {
        id: "post-meal-walk",
        title: "10-minute walk after dinner",
        why: "Improves post-meal glucose and triglyceride disposal.",
        how: "Right after eating, around the block or up and down the stairs.",
        tier: "easy",
        expectedImpact: "Steadier afternoons within two weeks.",
        markerKeys: ["triglycerides", "fasting_insulin"],
      },
      {
        id: "lift-twice-weekly",
        title: "Two short resistance sessions per week",
        why: "Skeletal muscle is the largest insulin-sensitive tissue; lifting moves fasting insulin down.",
        how: "Two 30-minute sessions — compound lifts only, no junk volume.",
        tier: "moderate",
        markerKeys: ["fasting_insulin", "apo_b"],
      },
    ],
    supplements: [],
    habitStack: {
      intro: "Three small actions that compound across the week.",
      habits: [
        { id: "h-fish",    title: "Plan one fatty-fish dinner",      cue: "When you write the week's meals", why: "Locks in the EPA/DHA + vitamin D dose." },
        { id: "h-walk",    title: "10-min walk after dinner",         cue: "Right after the last bite",       why: "Cheapest post-meal glucose lever there is." },
        { id: "h-citrus",  title: "Vitamin-C produce with lentils",   cue: "On lentil nights",                why: "Multiplies non-heme iron absorption." },
      ],
    },
    retest: [
      { markerKeys: ["ferritin_m", "mcv", "mch"], whenWeeks: 12, reason: "Iron repletion through food typically resolves the pattern over 8–12 weeks." },
      { markerKeys: ["apo_b", "hs_crp"],          whenWeeks: 12, reason: "Lipid + inflammation re-test on the same draw." },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Meal plan                                                                 */
/* -------------------------------------------------------------------------- */
/*
 * Seven days — breakfast / lunch / dinner — built around the eat list. The
 * weekStart is set to today so the Today page finds today's meal slot.
 */

function buildMealPlan(): MealPlan {
  const weekStart = today();
  const day = (n: number) => addDays(weekStart, n);
  return {
    id: 1,
    planId: 1,
    weekStart,
    generatedAt: Date.now() - 86400_000,
    model: "claude-sonnet-4-6",
    days: [
      {
        day: day(0),
        breakfast: { id: "d0-b", title: "Steel-cut oats with berries + walnuts", description: "Slow-cooked oats topped with mixed berries and a small handful of walnuts.", effort: "assembly", timeMinutes: 8, servings: 1, ingredients: ["1/2 cup steel-cut oats", "1 cup mixed berries", "2 tbsp walnuts", "cinnamon"], hits: ["ldl_c", "apo_b"], cuisine: "Mediterranean", tags: ["high-fiber"] },
        lunch:     { id: "d0-l", title: "Lentil dal with brown rice + greens",   description: "Toor dal tempered with cumin and ginger, served over brown rice with sautéed spinach.", effort: "weeknight", timeMinutes: 30, servings: 4, ingredients: ["1 cup toor dal", "1 cup brown rice", "2 cups spinach", "cumin", "ginger", "turmeric"], hits: ["ferritin_m", "folate_rbc"], cuisine: "South Asian" },
        dinner:    { id: "d0-d", title: "Roasted salmon with lemon + chard",     description: "Wild salmon roasted with lemon and olive oil, side of sautéed Swiss chard.", effort: "weeknight", timeMinutes: 25, servings: 2, ingredients: ["12 oz wild salmon", "1 lemon", "1 bunch Swiss chard", "olive oil", "garlic"], hits: ["triglycerides", "vit_d_25oh"], cuisine: "Mediterranean" },
      },
      {
        day: day(1),
        breakfast: { id: "d1-b", title: "Greek yogurt with chia + berries",      description: "Full-fat Greek yogurt, chia seeds, frozen berries.", effort: "assembly", timeMinutes: 3, servings: 1, ingredients: ["1 cup Greek yogurt", "2 tbsp chia", "1 cup frozen berries"], hits: ["ldl_c"], cuisine: "Mediterranean" },
        lunch:     { id: "d1-l", title: "Chickpea + kale salad",                  description: "Chickpeas, lacinato kale, lemon, tahini, olive oil.", effort: "assembly", timeMinutes: 10, servings: 1, ingredients: ["1 can chickpeas", "1 bunch kale", "2 tbsp tahini", "lemon"], hits: ["apo_b", "ferritin_m"], cuisine: "Mediterranean" },
        dinner:    { id: "d1-d", title: "Sardine pasta with capers",              description: "Whole-wheat pasta with sardines, capers, lemon, and parsley.", effort: "weeknight", timeMinutes: 20, servings: 2, ingredients: ["8 oz whole-wheat pasta", "2 tins sardines", "capers", "lemon", "parsley"], hits: ["triglycerides", "vit_d_25oh"], cuisine: "Mediterranean" },
      },
      {
        day: day(2),
        breakfast: { id: "d2-b", title: "Vegetable masala omelet",                description: "Three-egg omelet with onion, tomato, spinach, turmeric.", effort: "weeknight", timeMinutes: 15, servings: 1, ingredients: ["3 eggs", "1/2 onion", "1 tomato", "handful spinach", "turmeric"], hits: ["ferritin_m"], cuisine: "South Asian" },
        lunch:     { id: "d2-l", title: "Mackerel salad bowl",                    description: "Smoked mackerel over mixed greens with olive oil and lemon.", effort: "assembly", timeMinutes: 8, servings: 1, ingredients: ["6 oz smoked mackerel", "4 cups mixed greens", "olive oil", "lemon"], hits: ["triglycerides", "vit_d_25oh"], cuisine: "Mediterranean" },
        dinner:    { id: "d2-d", title: "Chana masala with brown rice",           description: "Chickpea curry with onion, tomato, and warming spices.", effort: "weeknight", timeMinutes: 35, servings: 4, ingredients: ["1 can chickpeas", "1 onion", "2 tomatoes", "ginger", "garam masala"], hits: ["apo_b", "ldl_c"], cuisine: "South Asian" },
      },
      {
        day: day(3),
        breakfast: { id: "d3-b", title: "Overnight oats with chia",               description: "Steel-cut oats soaked overnight with chia and almond milk.", effort: "batch", timeMinutes: 5, servings: 1, ingredients: ["1/2 cup oats", "2 tbsp chia", "1 cup almond milk"], hits: ["ldl_c"], cuisine: "Mediterranean" },
        lunch:     { id: "d3-l", title: "Sardines on whole-grain toast",          description: "Tinned sardines mashed with lemon on whole-grain toast.", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: ["1 can sardines", "2 slices whole-grain bread", "lemon", "arugula"], hits: ["triglycerides", "vit_d_25oh"], cuisine: "Mediterranean" },
        dinner:    { id: "d3-d", title: "Pan-seared cod with lentils",            description: "Cod on a bed of brown lentils with a lemon-olive vinaigrette.", effort: "weeknight", timeMinutes: 30, servings: 2, ingredients: ["12 oz cod", "1 cup brown lentils", "olive oil", "lemon"], hits: ["ferritin_m", "apo_b"], cuisine: "Mediterranean" },
      },
      {
        day: day(4),
        breakfast: { id: "d4-b", title: "Avocado + egg on rye",                   description: "Sliced avocado and a poached egg on rye toast.", effort: "assembly", timeMinutes: 8, servings: 1, ingredients: ["1 avocado", "2 eggs", "2 slices rye"], hits: ["hdl_c"], cuisine: "Mediterranean" },
        lunch:     { id: "d4-l", title: "Lentil soup + greens",                   description: "Hearty lentil soup with sautéed chard.", effort: "batch", timeMinutes: 10, servings: 1, ingredients: ["1 cup leftover lentil soup", "1 bunch chard"], hits: ["ferritin_m", "apo_b"], cuisine: "Mediterranean" },
        dinner:    { id: "d4-d", title: "Salmon with quinoa + roasted vegetables", description: "Wild salmon, quinoa, and a tray of roasted vegetables.", effort: "weeknight", timeMinutes: 35, servings: 2, ingredients: ["12 oz wild salmon", "1 cup quinoa", "1 zucchini", "1 bell pepper", "olive oil"], hits: ["triglycerides", "vit_d_25oh"], cuisine: "Mediterranean" },
      },
      {
        day: day(5),
        breakfast: { id: "d5-b", title: "Yogurt parfait with oats + walnuts",     description: "Greek yogurt layered with rolled oats and walnuts.", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: ["1 cup Greek yogurt", "1/4 cup oats", "2 tbsp walnuts"], hits: ["ldl_c"], cuisine: "Mediterranean" },
        lunch:     { id: "d5-l", title: "Saag with paneer-free option",           description: "Spinach curry; paneer optional, swap for chickpeas to keep iron load.", effort: "weeknight", timeMinutes: 35, servings: 2, ingredients: ["1 bag spinach", "1 can chickpeas", "cumin", "ginger"], hits: ["ferritin_m"], cuisine: "South Asian" },
        dinner:    { id: "d5-d", title: "Slow-cooked Mediterranean fish stew",    description: "White fish, tomatoes, fennel, saffron — Saturday batch.", effort: "weekend", timeMinutes: 60, servings: 4, ingredients: ["1.5 lb white fish", "2 cans tomatoes", "1 fennel bulb", "saffron", "olive oil"], hits: ["triglycerides"], cuisine: "Mediterranean" },
      },
      {
        day: day(6),
        breakfast: { id: "d6-b", title: "Smoked salmon + avocado bowl",           description: "Smoked salmon, avocado, capers, lemon.", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: ["4 oz smoked salmon", "1 avocado", "capers", "lemon"], hits: ["vit_d_25oh", "hdl_c"], cuisine: "Mediterranean" },
        lunch:     { id: "d6-l", title: "Leftover fish stew",                     description: "Saturday's fish stew reheated.", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: ["1 bowl fish stew"], hits: ["triglycerides"], cuisine: "Mediterranean" },
        dinner:    { id: "d6-d", title: "Egg + lentil curry",                     description: "Boiled eggs simmered in a quick lentil curry.", effort: "weeknight", timeMinutes: 25, servings: 2, ingredients: ["4 eggs", "1 cup red lentils", "1 onion", "tomato", "curry leaves"], hits: ["ferritin_m"], cuisine: "South Asian" },
      },
    ],
    grocery: [
      { name: "Protein", items: [
        { name: "wild salmon, frozen", quantity: "2 lb" },
        { name: "white fish, fillets", quantity: "1.5 lb" },
        { name: "cod, fresh",          quantity: "12 oz" },
        { name: "smoked mackerel",     quantity: "6 oz" },
        { name: "smoked salmon",       quantity: "4 oz" },
        { name: "canned sardines in olive oil", quantity: "3 tins" },
        { name: "eggs",                quantity: "1 dozen" },
        { name: "Greek yogurt",        quantity: "2 lb" },
      ]},
      { name: "Produce", items: [
        { name: "mixed berries", quantity: "2 lb" },
        { name: "spinach",       quantity: "2 bags" },
        { name: "Swiss chard",   quantity: "1 bunch" },
        { name: "lacinato kale", quantity: "1 bunch" },
        { name: "avocados",      quantity: "3" },
        { name: "lemons",        quantity: "5" },
        { name: "onions",        quantity: "3" },
        { name: "tomatoes",      quantity: "4" },
        { name: "fennel",        quantity: "1 bulb" },
        { name: "bell peppers",  quantity: "2" },
        { name: "zucchini",      quantity: "1" },
      ]},
      { name: "Pantry", items: [
        { name: "steel-cut oats", quantity: "1 bag" },
        { name: "brown rice",     quantity: "1 bag" },
        { name: "quinoa",         quantity: "1 cup" },
        { name: "brown lentils",  quantity: "1 cup" },
        { name: "red lentils",    quantity: "1 cup" },
        { name: "toor dal",       quantity: "1 cup" },
        { name: "chickpeas, canned", quantity: "3 cans" },
        { name: "whole-wheat pasta", quantity: "8 oz" },
        { name: "whole-grain bread", quantity: "1 loaf" },
        { name: "rye bread",      quantity: "1/2 loaf" },
        { name: "almond milk",    quantity: "1 qt" },
        { name: "chia seeds",     quantity: "1/4 cup" },
        { name: "walnuts",        quantity: "1/2 cup" },
        { name: "olive oil",      quantity: "1 bottle" },
        { name: "tahini",         quantity: "1 jar" },
        { name: "capers",         quantity: "1 jar" },
        { name: "saffron",        quantity: "1 pinch" },
        { name: "curry leaves",   quantity: "1 sprig" },
        { name: "garam masala",   quantity: "1 jar" },
      ]},
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Check-ins                                                                 */
/* -------------------------------------------------------------------------- */
/*
 * Ten check-ins spanning the last fourteen days so the streak strip half-fills,
 * the recap (on a Sunday tour) has data, and the projection-card adherence
 * gate (≥30% of habit-stack-days) clears for at least one marker. Habits are
 * a deliberate mix — h-fish twice, h-walk many days, h-citrus a handful —
 * mirroring a real-feeling rhythm.
 */

function buildCheckIns(): CheckIn[] {
  const days = [1, 2, 3, 4, 5, 7, 8, 10, 11, 13];  // 10 of the last 14, with two gaps
  // The matrix is shaped so the quiet-day card's adherence-at-risk predicate
  // (ticket 0015) fires on the tour: `h-fish` is held only in the PRIOR 7
  // days (n in {8, 11, 13}) and not in the most-recent 7 (n in {1..7}), so
  // recent-week skips strictly exceed prior-week skips. Total hits are 3 of
  // 14 — below the 7-day threshold. Together those satisfy "slipping now",
  // which is exactly the editorial line the card surfaces.
  const habitMatrix: Record<number, string[]> = {
    1:  ["h-walk", "h-citrus"],
    2:  ["h-walk"],
    3:  ["h-walk"],
    4:  ["h-walk", "h-citrus"],
    5:  ["h-walk", "h-citrus"],
    7:  ["h-walk"],
    8:  ["h-walk", "h-citrus", "h-fish"],
    10: ["h-walk"],
    11: ["h-walk", "h-fish"],
    13: ["h-walk", "h-citrus", "h-fish"],
  };
  return days.map<CheckIn>((n, i) => ({
    id: i + 1,
    day: addDays(today(), -n),
    habitsCompleted: habitMatrix[n] ?? [],
    signals: {
      sleepHours: 6.8 + ((n % 3) * 0.3),
      mood: ((n % 5) + 1) as 1|2|3|4|5,
      energy: ((n % 4) + 2) as 2|3|4|5,
    },
    createdAt: Date.now() - n * 86400_000,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Sample state assembly                                                     */
/* -------------------------------------------------------------------------- */

export interface SampleState {
  profile: Profile;
  panels: Panel[];
  plan: Plan;
  mealPlan: MealPlan;
  checkins: CheckIn[];
}

/**
 * Build the in-memory sample state. Called by `src/sample/state.ts` lazily
 * (via dynamic import) so non-tour visitors never pay for these bytes at
 * page load.
 *
 * Returns fresh objects on every call so callers that mutate the returned
 * arrays (e.g. a page sorting `mealPlan.days`) don't poison subsequent reads.
 */
export function buildSampleState(): SampleState {
  return {
    profile: { ...PROFILE },
    panels: buildPanels(),
    plan: buildPlan(),
    mealPlan: buildMealPlan(),
    checkins: buildCheckIns(),
  };
}
