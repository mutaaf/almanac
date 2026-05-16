// Deterministic grocery rebuild for the meal plan.
//
// When the user swaps a single meal (ticket 0003), the LLM only re-generates
// the one Meal. The grocery list, however, must reflect the whole week. Doing
// a second LLM round-trip just to re-bucket pantry items would be slow,
// wasteful, and non-deterministic. Instead we aggregate ingredient lines
// across all 7 days here and group them by a small set of category heuristics
// that match the section names the meal generator already uses
// (Produce / Protein / Pantry / Dairy / Other).
//
// The function is pure — same input always yields the same output — so it
// composes cleanly with the swap handler and is trivially testable.

import type { DayMeals, GrocerySection, GroceryItem } from "../types";

/** Canonical section order. Matches the meal generator's output and what the
 *  grocery page already renders, so a deterministic rebuild reads as a
 *  drop-in replacement rather than a re-skinning. */
const SECTION_ORDER = ["Produce", "Protein", "Pantry", "Dairy", "Other"] as const;
type Section = typeof SECTION_ORDER[number];

/**
 * Aggregate ingredient lines across every meal in the week and bucket them
 * into the standard sections. Each unique ingredient line yields one row.
 * The line text is preserved verbatim — the meal generator already writes
 * shoppable strings (e.g. "12 oz wild salmon"); re-parsing them risks losing
 * the quantity.
 *
 * Duplicate lines (same string across multiple meals) collapse into one row
 * with a `forMeals` list of the meal ids that referenced it. The first time
 * a line is seen wins on order within its section.
 */
export function recomputeGrocery(days: DayMeals[]): GrocerySection[] {
  // Map<sectionName, Map<lineText, GroceryItem>>. Inner map preserves first-
  // seen order — exactly what JavaScript Map iteration gives us.
  const buckets = new Map<Section, Map<string, GroceryItem>>();
  for (const s of SECTION_ORDER) buckets.set(s, new Map());

  for (const dm of days) {
    for (const meal of mealsOf(dm)) {
      for (const raw of meal.ingredients) {
        const line = raw.trim();
        if (!line) continue;
        const section = categorize(line);
        const inner = buckets.get(section)!;
        const existing = inner.get(line);
        if (existing) {
          if (!existing.forMeals!.includes(meal.id)) existing.forMeals!.push(meal.id);
        } else {
          inner.set(line, { name: line, forMeals: [meal.id] });
        }
      }
    }
  }

  // Drop empty sections so the UI doesn't render a hollow "Dairy" header
  // when the week happens to be vegan.
  const out: GrocerySection[] = [];
  for (const name of SECTION_ORDER) {
    const inner = buckets.get(name)!;
    if (inner.size === 0) continue;
    out.push({ name, items: Array.from(inner.values()) });
  }
  return out;
}

function mealsOf(dm: DayMeals) {
  return dm.snack
    ? [dm.breakfast, dm.lunch, dm.dinner, dm.snack]
    : [dm.breakfast, dm.lunch, dm.dinner];
}

/* ============================================================================
   Section heuristics
   ----------------------------------------------------------------------------
   The classifier is intentionally small and string-based. The meal generator
   writes plain, recognizable food names — a token-match is enough. Order
   matters here: PROTEIN beats PRODUCE for "salmon" (a fish, not a vegetable).
   ============================================================================ */

const PROTEIN_PATTERNS = [
  "salmon", "sardine", "mackerel", "tuna", "anchov", "trout", "cod", "haddock",
  "halibut", "sea bass", "branzino", "fish", "shrimp", "prawn", "crab", "lobster",
  "scallop", "mussel", "clam", "oyster", "squid", "octopus",
  "chicken", "turkey", "duck", "beef", "lamb", "veal", "venison", "bison",
  "pork", "sausage", "bacon", "ham", "prosciutto",
  "egg", "tofu", "tempeh", "seitan", "edamame",
];

const DAIRY_PATTERNS = [
  "milk", "yogurt", "yoghurt", "kefir", "butter", "cream", "cheese", "ghee",
  "labneh", "paneer", "feta", "ricotta", "parmesan", "mozzarella", "halloumi",
];

const PRODUCE_PATTERNS = [
  "kale", "spinach", "chard", "lettuce", "arugula", "rocket", "greens",
  "cabbage", "bok choy", "broccoli", "cauliflower", "kohlrabi", "brussels",
  "asparagus", "artichoke", "celery", "fennel",
  "onion", "shallot", "garlic", "leek", "scallion", "chive",
  "carrot", "parsnip", "turnip", "radish", "beet", "rutabaga",
  "potato", "sweet potato", "yam", "squash", "pumpkin", "zucchini", "cucumber",
  "tomato", "pepper", "chili", "chile", "eggplant", "okra",
  "berry", "berries", "apple", "pear", "banana", "orange", "lemon", "lime",
  "grapefruit", "mango", "papaya", "pineapple", "peach", "plum", "apricot",
  "cherry", "grape", "melon", "watermelon", "avocado",
  "mushroom", "ginger", "herb", "parsley", "cilantro", "dill", "mint",
  "basil", "thyme", "rosemary", "sage", "tarragon", "oregano", "bay",
  "fresh ",
];

const PANTRY_PATTERNS = [
  "oil", "vinegar", "salt", "pepper", "spice", "seasoning", "powder",
  "rice", "quinoa", "barley", "farro", "bulgur", "oats", "oatmeal",
  "pasta", "noodle", "bread", "tortilla", "flour", "cornmeal", "polenta",
  "bean", "lentil", "dal", "chickpea", "garbanzo", "split pea",
  "nut", "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut",
  "seed", "chia", "flax", "sesame", "tahini", "peanut",
  "broth", "stock", "sauce", "tamari", "soy", "miso", "tomato paste",
  "honey", "syrup", "sugar", "molasses",
  "cumin", "turmeric", "coriander", "paprika", "cinnamon", "cardamom",
  "saffron", "masala", "curry", "chili powder", "cayenne", "nutmeg", "clove",
  "olive", "caper", "anchovy paste",
  "canned", "can ", "tin ", "jar ",
];

function categorize(line: string): Section {
  const s = line.toLowerCase();
  // Protein before produce so "wild salmon" lands in Protein, not Other.
  if (matchAny(s, PROTEIN_PATTERNS)) return "Protein";
  if (matchAny(s, DAIRY_PATTERNS))   return "Dairy";
  if (matchAny(s, PRODUCE_PATTERNS)) return "Produce";
  if (matchAny(s, PANTRY_PATTERNS))  return "Pantry";
  return "Other";
}

function matchAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) if (haystack.includes(n)) return true;
  return false;
}
