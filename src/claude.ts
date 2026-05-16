// Claude integration. Two generators:
//   1. generatePlan      — protocol with eat/avoid lists, plus lifestyle, supplements,
//                          habit stack, retest cadence
//   2. generateMealPlan  — separate API call: 7-day meals + grocery list, derived
//                          from the eat/avoid lists, dietary pattern, and the
//                          findings from the Plan
//
// BYOK from the browser. Prompt caching is wired so re-rolls within 5 minutes
// only re-pay for the freshest content.

import Anthropic from "@anthropic-ai/sdk";
import type {
  Profile, Panel, Plan, CheckIn, Result, MealPlan, Meal, Day, MarkerDef,
} from "./types";
import { findMarker } from "./data/markers";
import { getAllMarkers } from "./data/userMarkers";
import { age, addDays } from "./db";
import { computeInsights, formatInsightsForPrompt } from "./insights";
import { recordCall } from "./telemetry";

/* ============================================================================
   PLAN GENERATION
   ============================================================================ */

const PLAN_VOICE = `
You are the editor of Almanac — a private, longitudinal precision-health
protocol for one reader. The protocol is FOOD-FIRST: nutrition is the spine,
lifestyle and supplements are supporting players.

Tone:
  - Editorial. Plain English. No medical jargon without a one-line gloss.
  - Second person ("you"), warm but exacting.
  - Never sycophantic. Never use "journey", "amazing", or "exciting".
  - You are not a coach yelling encouragement and you are not a chatbot
    hedging every claim. You are a careful reader of biology, prescribing
    food first.

Operating principles:
  1. Food before pills.  Whatever a supplement could do, a food can usually
     do better — recommend the food. Reach for supplements only when a lab
     finding clearly justifies one (low D below 30 ng/mL, low B12 etc.) or
     dosing a food to therapeutic level is impractical.
  2. Specificity wins.  An eatItem must say WHAT food, HOW MUCH, HOW OFTEN,
     and link to the marker that justifies it. "Eat more leafy greens" is
     useless; "2 packed cups cooked greens (kale, chard, spinach) 4 days/wk —
     for folate-RBC at 320 ng/mL → target ≥600" is the bar.
  3. Functional > lab range.  The Marker Reference includes both lab and
     functional ranges. Reason against the FUNCTIONAL range; the lab's
     "in-range" is a floor, not a target.
  4. Easy-tier first.  HabitStack is exactly 3–5 daily things, every one a
     tired person can do without thinking. Promote to moderate/advanced
     only when adherence justifies it.
  5. Tie everything to a finding.  No generic recommendations.
  6. Honor the reader's diet pattern.  If they're halal, no pork or
     non-halal meat anywhere. If pescatarian, no land animals. If they
     listed cuisines, the avoidList shouldn't accidentally rule out core
     staples of those cuisines.
  7. This is informational, not medical advice.  Use phrases like
     "tracks with", "is consistent with", "warrants discussion with your
     clinician". Don't diagnose.

Output format:
  Return ONLY a single JSON object with no prose, no markdown fences:

  interface Plan {
    snapshot: string;          // 2 short paragraphs, plain language

    insights: Array<{
      markerKey?: string;
      title: string;
      detail: string;          // 1–3 sentences
      priority: "high" | "medium" | "low";
    }>;                        // 3–7 items, ordered high→low

    eatList: Array<{
      id: string;              // stable kebab-case id, unique within plan
      food: string;            // e.g. "Fatty fish (salmon, sardines, mackerel)"
      frequency: string;       // e.g. "2x per week"
      portion: string;         // e.g. "~4 oz cooked, palm-sized"
      why: string;             // tied to specific findings, name the marker
      markerKeys: string[];    // canonical keys from the Marker Reference
      examples?: string[];     // concrete buyable items, 2–4 strings
      cuisineNotes?: string;   // optional, ties back to their cuisines
    }>;                        // 5–10 items

    avoidList: Array<{
      id: string;
      food: string;            // e.g. "Industrial seed oils"
      why: string;
      markerKeys?: string[];
      swap?: string;           // a 1-line replacement
    }>;                        // 3–6 items

    lifestyle:   Recommendation[];   // 2–4 items
    supplements: Recommendation[];   // 0–4 items, only when justified

    habitStack: {
      intro: string;           // 1 sentence
      habits: Array<{
        id: string; title: string; cue: string; why: string;
      }>;                      // exactly 3–5
    };

    retest: Array<{
      markerKeys: string[]; whenWeeks: number; reason: string;
    }>;
  }

  interface Recommendation {
    id: string; title: string; why: string; how: string;
    tier: "easy" | "moderate" | "advanced";
    expectedImpact?: string;
    caution?: string;          // required for supplements
  }
`.trim();

/* ============================================================================
   INTAKE-ONLY PLAN GENERATION
   ============================================================================ */

// INTAKE_PLAN_VOICE is the system prompt for the "first plan from intake
// alone" path (ticket 0007). It's a strict variant of PLAN_VOICE: same
// output schema, same editorial register, same food-first stance — but
// the model is told plainly that no lab data exists, and that the plan
// must be defensible for a generic adult of this sex / age / dietary
// pattern. The first retest item must invite the user to upload labs and
// name the markers the next pass would benefit from. The literal token
// "INTAKE_PLAN_VOICE" is included verbatim so the test mock (and any
// future review tooling) can sniff it from the system prompt.
const INTAKE_PLAN_VOICE = `
[INTAKE_PLAN_VOICE]

You are the editor of Almanac — a private, longitudinal precision-health
protocol for one reader. This is the reader's FIRST plan, composed before
they have uploaded any labs. You are writing from intake answers alone:
their stated goals, existing conditions and medications, dietary pattern,
sex, and age.

Constraints unique to this path:
  - There is no lab data. Do NOT invent marker values, flags, or ranges.
  - Insights must NOT cite specific marker readings. They may name a
    pattern (e.g. "afternoon energy crash") and the food / lifestyle
    levers that most often move it, but every "high" priority insight
    must be defensible without a panel in hand.
  - Every eatItem and avoidItem must be defensible for a generic adult
    of this reader's sex, age, and dietary pattern. No claim like "for
    your LDL of X" — there is no X yet.
  - markerKeys on eatItems are OPTIONAL on this path. Use [] when you
    cannot tie a food to a specific marker the user has on file.
  - The first retest item is the most important line of the plan:
    invite the reader to upload their most recent labs, and name 4-8
    markers (canonical keys like total_cholesterol, triglycerides,
    ldl_c, hdl_c, vit_d_25oh, ferritin_m, hba1c) the next pass would
    most benefit from. Set whenWeeks to 0 — the action is "do this now",
    not "wait 12 weeks". The reason field must mention uploading labs.

Voice is identical to PLAN_VOICE:
  - Editorial. Plain English. No medical jargon without a one-line gloss.
  - Second person ("you"), warm but exacting.
  - Never sycophantic. Never use "journey", "amazing", or "exciting".
  - Food before pills.
  - Honor the reader's dietary pattern absolutely (no pork if halal,
    no land animals if pescatarian, etc.).
  - Informational, not medical advice. Use "tracks with", "is consistent
    with", "warrants discussion with your clinician".

Snapshot rule (important for this path):
  - The snapshot must read back at least one phrase the reader supplied
    in their goals or dietary pattern, in their own words or close to it.
    This is what makes the artifact feel theirs on day one.

Output format:
  Return ONLY a single JSON object with no prose, no markdown fences.
  The shape is identical to PLAN_VOICE's Plan interface:

  interface Plan {
    snapshot: string;          // 2 short paragraphs, plain language
    insights: Array<{
      markerKey?: string;
      title: string;
      detail: string;
      priority: "high" | "medium" | "low";
    }>;                        // 3-5 items on this path
    eatList: Array<{
      id: string; food: string; frequency: string; portion: string;
      why: string; markerKeys: string[];
      examples?: string[]; cuisineNotes?: string;
    }>;                        // 4-7 items
    avoidList: Array<{
      id: string; food: string; why: string;
      markerKeys?: string[]; swap?: string;
    }>;                        // 2-4 items
    lifestyle:   Recommendation[];   // 2-3 items
    supplements: Recommendation[];   // 0-1 items, only when intake clearly justifies
    habitStack: {
      intro: string;
      habits: Array<{ id: string; title: string; cue: string; why: string }>;
    };                         // exactly 3-5 habits
    retest: Array<{
      markerKeys: string[]; whenWeeks: number; reason: string;
    }>;                        // first item invites uploading labs
  }

  interface Recommendation {
    id: string; title: string; why: string; how: string;
    tier: "easy" | "moderate" | "advanced";
    expectedImpact?: string;
    caution?: string;          // required for supplements
  }
`.trim();

/* ============================================================================
   MEAL-PLAN GENERATION
   ============================================================================ */

const MEAL_VOICE = `
You are composing a 7-day meal plan for the reader of an Almanac protocol.

Inputs you'll receive:
  - The reader's profile (age, sex, body composition, conditions/meds, goals)
  - Their dietary pattern (halal / pescatarian / cuisines / dislikes / allergies)
  - Cooking capacity (varies — some days they cook real meals, some days they
    can only assemble; one day per week may include a longer cook)
  - The Plan's eatList (foods to add, with frequency + portion targets)
  - The Plan's avoidList (foods to reduce or replace)
  - The relevant Marker findings (so each meal can be tied to biology)

Operating principles:
  1. Hit the eatList with real food, real portions, across 7 days. If an
     eatItem says "fatty fish 2x/wk" then exactly two dinners (or lunches)
     this week feature fatty fish. If it says "leafy greens 4x/wk" then
     four meals across the week include them.
  2. Honor avoidList. No meal contains anything from it. Use the swap.
  3. Honor the dietary pattern absolutely. Halal means no pork, no
     non-halal meat anywhere — including stocks, broths, lard, gelatin,
     bacon as topping. Pescatarian means no land animals. Etc.
  4. Distribute effort sanely:
       - "batch"     — Sunday or another off-day, 60–90 min cook that
                       produces multiple portions for the week
       - "weekend"   — one ambitious dish (60+ min), Saturday or Sunday
       - "weeknight" — 25–45 min cook, real meal
       - "assembly"  — <15 min, no cooking or near-zero (salads, bowls,
                       reheats from the batch)
     Mix these across 21 meals so the week is realistic.
  5. Keep cuisine variety AND respect their listed preferences. Lean into
     the cuisines they named; don't ignore them. Don't make 7 days of the
     same dish family.
  6. Each meal lists CONCRETE ingredients with quantities a person can
     shop with. No "some greens" — write "1 bunch lacinato kale".
  7. Each meal lists which markerKeys it supports in "hits".

Output format:
  Return ONLY a single JSON object, no prose, no fences:

  interface MealPlan {
    days: Array<{
      day: "YYYY-MM-DD";
      breakfast: Meal;
      lunch:     Meal;
      dinner:    Meal;
      snack?:    Meal;     // optional; include if a marker target needs an extra hit
    }>;                    // exactly 7 days, in chronological order matching the
                           // weekStart provided in the user message

    grocery: Array<{
      name: string;        // section name: "Produce", "Protein", "Pantry",
                           //               "Dairy & eggs", "Frozen", "Spices",
                           //               "Pharmacy / health" if needed
      items: Array<{
        name: string;      // "wild salmon, frozen"
        quantity?: string; // "1.5 lb"
        forMeals?: string[]; // meal ids this item supports
      }>;
    }>;
  }

  interface Meal {
    id: string;            // stable kebab-case, e.g. "mon-dinner"
    title: string;         // 5–10 words
    description: string;   // 1–2 sentences
    effort: "assembly" | "weeknight" | "weekend" | "batch";
    timeMinutes: number;   // active time
    servings: number;
    ingredients: string[]; // each line shoppable
    steps?: string[];      // optional; brief, max 6 lines, numbered
    hits: string[];        // markerKey ids from the Marker Reference
    cuisine?: string;      // "Mediterranean", "South Asian", etc.
    tags?: string[];       // ["high-protein", "anti-inflammatory", ...]
  }
`.trim();

/* ============================================================================
   MEAL-SWAP GENERATION (single meal replacement)
   ============================================================================ */

// SWAP_VOICE is a tight 1-meal variant of MEAL_VOICE. It re-uses the same
// editorial register and the same dietary-pattern / eat-list / avoid-list
// constraints, but asks for exactly one Meal back instead of the whole week.
// The string literal "SWAP_VOICE" is included verbatim so the test mock and
// the future review agent can sniff it from the system prompt.
const SWAP_VOICE = `
[SWAP_VOICE]

You are replacing exactly one meal in an already-composed 7-day Almanac plan
for the reader. The other 20 meals stay as they are.

Inputs you'll receive:
  - The reader's profile (age, sex, body composition, conditions/meds, goals)
  - Their dietary pattern (halal / pescatarian / cuisines / dislikes / allergies)
  - The Plan's eatList and avoidList (already cached from the original week
    generation — re-read; do not invent new constraints)
  - The relevant Marker findings (so the replacement can be tied to biology)
  - The current week's other meals (for variety — do not echo a title that
    already appears elsewhere in the week)
  - The ONE meal being replaced, with its slot label
    (breakfast / lunch / dinner / snack) and the markerKeys it had been
    hitting, plus a reason for the swap if the reader supplied one

Operating principles (identical to the week generator, applied to one meal):
  1. Honor the dietary pattern absolutely. No pork if halal, no land animals
     if pescatarian, etc. The avoidList is non-negotiable.
  2. Match the slot. A breakfast swap returns a breakfast, not a dinner.
  3. Preserve the markerKeys the original meal was hitting unless biology
     genuinely says otherwise — the rest of the week was balanced around
     this slot covering those targets.
  4. Match the effort tier and approximate time of the original. A weeknight
     dinner should not be replaced by a 90-minute weekend braise.
  5. Concrete ingredients with shoppable quantities. No "some greens".
  6. Vary from the rest of the week's titles. Don't repeat a dish the
     reader already has scheduled.

Output format:
  Return ONLY a single JSON object representing the replacement Meal —
  no prose, no markdown fences, no wrapping object. The shape is exactly:

  interface Meal {
    id: string;            // REUSE the id of the meal being replaced
                           //   (so the day slot stays unambiguous)
    title: string;         // 5–10 words
    description: string;   // 1–2 sentences
    effort: "assembly" | "weeknight" | "weekend" | "batch";
    timeMinutes: number;
    servings: number;
    ingredients: string[]; // each line shoppable
    steps?: string[];      // brief; max 6 lines, numbered
    hits: string[];        // markerKey ids
    cuisine?: string;
    tags?: string[];
  }
`.trim();

/* ============================================================================
   Public API
   ============================================================================ */

export interface GeneratePlanInput {
  profile: Profile;
  panels: Panel[];          // newest first
  previousPlan?: Plan;
  recentCheckIns: CheckIn[];
}

export interface GenerateMealPlanInput {
  profile: Profile;
  plan: Plan;
  weekStart: Day;
  panels: Panel[];          // for the marker reference
  previousMealPlan?: MealPlan;
}

export interface GenerateMealSwapInput {
  profile: Profile;
  plan: Plan;
  panels: Panel[];          // for the marker reference
  prevMealPlan: MealPlan;   // the current week (we read the slot + variety from it)
  mealId: string;           // id of the Meal being replaced
}

/**
 * Input for `generatePlanFromIntake` — the first-plan path for a brand-new
 * user who hasn't uploaded any labs yet. Only the profile (intake answers)
 * is required; `userMarkers` is the local marker catalog so the retest
 * suggestion can reference canonical keys.
 */
export interface GeneratePlanFromIntakeInput {
  profile: Profile;
  userMarkers?: MarkerDef[];     // optional — used only to enrich the retest hint
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(private profile: Profile) {
    if (!profile.anthropicKey) throw new Error("No Anthropic key set.");
    this.client = new Anthropic({
      apiKey: profile.anthropicKey,
      dangerouslyAllowBrowser: true,
    });
  }

  /* ---------- generatePlan ------------------------------------------------ */

  async generatePlan(input: GeneratePlanInput): Promise<{
    plan: Omit<Plan, "id" | "generatedAt" | "basedOnPanelIds">;
    model: string;
    raw: string;
  }> {
    const model = this.profile.model || "claude-sonnet-4-6";

    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: PLAN_VOICE, cache_control: { type: "ephemeral" } },
    ];

    // Fetch user-defined markers — they're authoritative ranges for any
    // marker the user has defined locally and must appear in the Marker
    // Reference block alongside seed entries.
    const catalog = await getAllMarkers();

    const profileBlock = formatProfile(input.profile);
    const markerRef    = formatMarkerReference(input.panels, catalog);
    const preamble = [profileBlock, markerRef].join("\n\n");

    const panelsBlock = formatPanels(input.panels, catalog);
    const adherence   = formatAdherence(input.recentCheckIns, input.previousPlan);
    const priorPlan   = input.previousPlan ? formatPriorPlan(input.previousPlan) : "";

    // Pre-computed pattern + trend insights — the part Claude.app can't
    // replicate. These run deterministically over the panel timeline and
    // get fed in as authoritative findings.
    const programmatic = computeInsights(input.panels, input.profile);
    const insightsBlock = formatInsightsForPrompt(programmatic);

    const fresh = [
      panelsBlock,
      adherence,
      priorPlan,
      insightsBlock,
      `# Task`,
      `Generate today's Plan in the JSON shape specified by the system message.`,
      `The eatList is the centerpiece — be specific (food, frequency, portion, why).`,
      `Honor the reader's dietary pattern absolutely (no pork if halal, etc.).`,
      `Reason against FUNCTIONAL ranges. Tie every recommendation to a finding.`,
      programmatic.length
        ? `Incorporate every pre-computed insight from the section above into your insights array; you may refine wording but never contradict the pattern.`
        : "",
      `Return only JSON, no prose.`,
    ].filter(Boolean).join("\n\n");

    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: [
        { type: "text", text: preamble, cache_control: { type: "ephemeral" } },
        { type: "text", text: fresh },
      ],
    }];

    const resp = await this.client.messages.create({
      model, max_tokens: 16000, system, messages,
    });

    recordCall("plan", model, resp);
    assertNotTruncated(resp);
    const raw = textOf(resp);
    const parsed = parseJson(raw);
    const plan = normalizePlan(parsed);
    return { plan, model, raw };
  }

  /* ---------- generatePlanFromIntake ------------------------------------- */

  /**
   * Compose the user's FIRST plan from intake answers alone — no labs.
   *
   * Same Plan JSON shape as `generatePlan`; same telemetry kind ("plan");
   * different system prompt (INTAKE_PLAN_VOICE) so the model knows not to
   * invent marker readings. Cache discipline mirrors `generatePlan`: the
   * voice and a generic-adult marker reference are cacheable, the only
   * volatile fragment is the per-user intake summary.
   *
   * Ticket: docs/backlog/0007-narrative-onboarding-first-plan.md
   */
  async generatePlanFromIntake(input: GeneratePlanFromIntakeInput): Promise<{
    plan: Omit<Plan, "id" | "generatedAt" | "basedOnPanelIds">;
    model: string;
    raw: string;
  }> {
    const model = this.profile.model || "claude-sonnet-4-6";

    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: INTAKE_PLAN_VOICE, cache_control: { type: "ephemeral" } },
    ];

    // No panels to format — but we still surface a short "generic adult"
    // marker reference so the retest suggestion uses canonical keys the
    // app recognizes on import (total_cholesterol, vit_d_25oh, etc.).
    const catalog = input.userMarkers ?? (await getAllMarkers());
    const profileBlock = formatProfile(input.profile);
    const markerHint   = formatIntakeMarkerHint(catalog);
    const preamble = [profileBlock, markerHint].join("\n\n");

    const fresh = [
      `# Task`,
      `Compose this reader's FIRST plan from their intake answers alone.`,
      `No lab data is available. Do not cite marker readings you do not have.`,
      `Honor the dietary pattern absolutely (no pork if halal, etc.).`,
      `The eatList carries the plan; be specific (food, frequency, portion).`,
      `The snapshot must read back at least one phrase the reader gave in`,
      `their goals or dietary pattern.`,
      `The first retest item must invite the reader to upload their most`,
      `recent labs and name the markers (canonical keys) the next pass`,
      `would most benefit from. Set whenWeeks to 0.`,
      `Return only JSON, no prose.`,
    ].join("\n\n");

    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: [
        { type: "text", text: preamble, cache_control: { type: "ephemeral" } },
        { type: "text", text: fresh },
      ],
    }];

    const resp = await this.client.messages.create({
      model, max_tokens: 16000, system, messages,
    });

    // Re-use the "plan" telemetry kind — per ticket 0007, the surfaces that
    // consume CallRecord don't need to distinguish intake-only plans from
    // panel-grounded ones; the persisted `basedOnPanelIds: []` carries that.
    recordCall("plan", model, resp);
    assertNotTruncated(resp);
    const raw = textOf(resp);
    const parsed = parseJson(raw);
    const plan = normalizePlan(parsed);
    return { plan, model, raw };
  }

  /* ---------- generateMealPlan ------------------------------------------- */

  async generateMealPlan(input: GenerateMealPlanInput): Promise<{
    mealPlan: Omit<MealPlan, "id" | "generatedAt" | "planId">;
    model: string;
    raw: string;
  }> {
    const model = this.profile.model || "claude-sonnet-4-6";

    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: MEAL_VOICE, cache_control: { type: "ephemeral" } },
    ];

    // Same as plan generation — user-defined markers count as authoritative
    // ranges for the meal generator too.
    const catalog = await getAllMarkers();

    const profileBlock = formatProfile(input.profile);
    const markerRef    = formatMarkerReference(input.panels, catalog);
    const eatAvoid     = formatEatAvoid(input.plan);

    const preamble = [profileBlock, markerRef, eatAvoid].join("\n\n");

    const days: Day[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(input.weekStart, i));

    const fresh = [
      `# Week`,
      `Week starts: ${input.weekStart} (Day 0). Generate 7 days, chronological:`,
      ...days.map((d, i) => `  - Day ${i + 1}: ${d}`),
      ``,
      input.previousMealPlan
        ? `# Last week's titles (for variety — do not repeat too closely)\n${
            input.previousMealPlan.days.flatMap(dm => [
              `  ${dm.day} breakfast: ${dm.breakfast.title}`,
              `  ${dm.day} lunch:     ${dm.lunch.title}`,
              `  ${dm.day} dinner:    ${dm.dinner.title}`,
            ]).join("\n")
          }`
        : "",
      ``,
      `# Task`,
      `Compose a 7-day meal plan that hits the eatList frequencies, never`,
      `includes anything from avoidList, and respects the dietary pattern.`,
      `Distribute effort across the week (mix batch / weekend / weeknight /`,
      `assembly). Generate a grocery list aggregating ingredients across all`,
      `meals, grouped by section. Return JSON only.`,
    ].filter(Boolean).join("\n");

    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: [
        { type: "text", text: preamble, cache_control: { type: "ephemeral" } },
        { type: "text", text: fresh },
      ],
    }];

    const resp = await this.client.messages.create({
      model, max_tokens: 16000, system, messages,
    });

    recordCall("meals", model, resp);
    assertNotTruncated(resp);
    const raw = textOf(resp);
    const parsed = parseJson(raw);
    const mealPlan = normalizeMealPlan(parsed, days);
    return { mealPlan, model, raw };
  }

  /* ---------- generateMealSwap ------------------------------------------- */

  /**
   * Replace a single Meal in an existing week's plan. The id of the original
   * is preserved so the day-slot it lives in stays unambiguous. The static
   * prefix — system prompt + eat list + avoid list + profile + marker
   * reference — is identical to what `generateMealPlan` cached during the
   * original week generation, so the swap call is mostly output tokens.
   */
  async generateMealSwap(input: GenerateMealSwapInput): Promise<{
    meal: Meal;
    model: string;
    raw: string;
  }> {
    const model = this.profile.model || "claude-sonnet-4-6";

    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: SWAP_VOICE, cache_control: { type: "ephemeral" } },
    ];

    const catalog = await getAllMarkers();

    const profileBlock = formatProfile(input.profile);
    const markerRef    = formatMarkerReference(input.panels, catalog);
    const eatAvoid     = formatEatAvoid(input.plan);

    // Same shape and order as the meal-plan generator's preamble — that's
    // what lets the swap call read from the cache primed by the earlier
    // `generateMealPlan`. If you reorder or edit either site, keep them in
    // lock-step or the cache hit evaporates.
    const preamble = [profileBlock, markerRef, eatAvoid].join("\n\n");

    // Find the slot + original meal so we can give Claude the exact context.
    const { dayMeals, slot, original } = locateMeal(input.prevMealPlan, input.mealId);

    const otherTitles = input.prevMealPlan.days.flatMap(dm => [
      dm.breakfast.id !== input.mealId ? `  ${dm.day} breakfast: ${dm.breakfast.title}` : "",
      dm.lunch.id     !== input.mealId ? `  ${dm.day} lunch:     ${dm.lunch.title}`     : "",
      dm.dinner.id    !== input.mealId ? `  ${dm.day} dinner:    ${dm.dinner.title}`    : "",
      dm.snack && dm.snack.id !== input.mealId ? `  ${dm.day} snack:     ${dm.snack.title}` : "",
    ].filter(Boolean)).join("\n");

    const fresh = [
      `# The meal to replace`,
      `Day:    ${dayMeals.day}`,
      `Slot:   ${slot}`,
      `Id:     ${original.id}   (keep this exact id in your response)`,
      `Original title:       ${original.title}`,
      `Original description: ${original.description}`,
      `Original effort:      ${original.effort} · ${original.timeMinutes} min · ${original.servings} serving${original.servings === 1 ? "" : "s"}`,
      original.cuisine ? `Original cuisine:     ${original.cuisine}` : "",
      `Markers it was hitting: ${original.hits.join(", ") || "(none recorded)"}`,
      ``,
      `# Other meals already scheduled this week (do not repeat a title)`,
      otherTitles,
      ``,
      `# Task`,
      `Return a single Meal JSON (no prose, no fences) that replaces the meal`,
      `above. Reuse the id "${original.id}". Match the slot (${slot}) and a`,
      `comparable effort tier. Hit the same markers unless you have a clear`,
      `nutritional reason to switch. Honor the eat list, the avoid list, and`,
      `the dietary pattern absolutely.`,
    ].filter(Boolean).join("\n");

    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: [
        { type: "text", text: preamble, cache_control: { type: "ephemeral" } },
        { type: "text", text: fresh },
      ],
    }];

    // max_tokens kept tight — one meal is a few hundred tokens of output, not
    // sixteen thousand. Cheaper, snappier, fewer truncation risks.
    const resp = await this.client.messages.create({
      model, max_tokens: 2000, system, messages,
    });

    recordCall("swap", model, resp);
    assertNotTruncated(resp);
    const raw = textOf(resp);
    const parsed = parseJson(raw);
    // normalizeMeal returns a value structurally identical to Meal — its
    // conditional spreads keep optional fields off when absent. Cast at the
    // boundary; the runtime guarantees are in normalizeMeal itself.
    const meal = normalizeMeal(parsed, original.id) as Meal;
    // Force the id to the original — the system prompt asks for it, but a
    // belt-and-braces overwrite costs nothing and removes the only failure
    // mode that would otherwise orphan the slot.
    meal.id = original.id;
    return { meal, model, raw };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helper for the swap path                                                  */
/* -------------------------------------------------------------------------- */

function locateMeal(mp: MealPlan, mealId: string): {
  dayMeals: MealPlan["days"][number];
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  original: Meal;
} {
  for (const dm of mp.days) {
    if (dm.breakfast.id === mealId) return { dayMeals: dm, slot: "breakfast", original: dm.breakfast };
    if (dm.lunch.id     === mealId) return { dayMeals: dm, slot: "lunch",     original: dm.lunch };
    if (dm.dinner.id    === mealId) return { dayMeals: dm, slot: "dinner",    original: dm.dinner };
    if (dm.snack && dm.snack.id === mealId) return { dayMeals: dm, slot: "snack", original: dm.snack };
  }
  throw new Error(`Meal id "${mealId}" not found in current week.`);
}

/* -------------------------------------------------------------------------- */
/*  Custom error so the UI can present a useful message when the model        */
/*  hits the output ceiling instead of "Could not parse JSON".                */
/* -------------------------------------------------------------------------- */

export class TruncatedResponseError extends Error {
  constructor(public model: string, public raw: string) {
    super(
      `The response was cut off before completing the JSON. ` +
      `This is almost always max_tokens being too tight — try again, ` +
      `or simplify the scope (fewer panels, or a smaller model).`,
    );
    this.name = "TruncatedResponseError";
  }
}

function assertNotTruncated(resp: Anthropic.Message): void {
  if (resp.stop_reason === "max_tokens") {
    const raw = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text).join("\n");
    throw new TruncatedResponseError(resp.model, raw);
  }
}

/* ============================================================================
   Formatters
   ============================================================================ */

function formatProfile(p: Profile): string {
  const a = age(p.birthDate) ?? "?";
  return [
    `# Reader`,
    `Name:    ${p.ownerName}`,
    `Age:     ${a}`,
    `Sex:     ${p.sex}`,
    p.heightIn ? `Height:  ${p.heightIn} in (${formatHeight(p.heightIn)})` : "",
    p.weightLb ? `Weight:  ${p.weightLb} lb` : "",
    p.householdSize ? `Household size: ${p.householdSize}` : "",
    ``,
    `# Goals`,
    p.goals || "(none stated)",
    ``,
    `# Existing conditions / medications / allergies`,
    p.conditions || "(none stated)",
    ``,
    `# Dietary pattern`,
    p.dietPattern || "(none stated — assume omnivore, no constraints)",
  ].filter(Boolean).join("\n");
}

/**
 * A short marker hint for the intake-only path. The reader has no panels,
 * but the retest suggestion must use canonical marker keys the app
 * recognizes on import. We surface a handful of high-value, broadly useful
 * markers (lipids, vitamin D, ferritin, HbA1c) from the catalog — enough
 * to let the model write a plausible "what to upload next" line.
 */
function formatIntakeMarkerHint(catalog: MarkerDef[]): string {
  const PREFERRED = [
    "total_cholesterol", "ldl_c", "hdl_c", "triglycerides",
    "vit_d_25oh", "ferritin_m", "ferritin_f", "hba1c", "hs_crp",
    "tsh", "vit_b12",
  ];
  const found = PREFERRED
    .map(k => findMarker(k, catalog))
    .filter((m): m is MarkerDef => !!m);
  if (found.length === 0) {
    return `# Marker Reference\n(no marker catalog available — use plain English in the retest hint)`;
  }
  const lines = [
    `# Marker Reference (canonical keys for the retest suggestion only)`,
    `These are NOT readings the user has uploaded; they are the keys the`,
    `app uses for the most common follow-up markers. Use them inside the`,
    `retest item's markerKeys array.`,
  ];
  for (const m of found) {
    lines.push(`- ${m.name} [${m.key}] · unit ${m.unit} — ${m.description}`);
  }
  return lines.join("\n");
}

function formatMarkerReference(panels: Panel[], catalog: MarkerDef[]): string {
  const keys = new Set<string>();
  for (const p of panels) for (const r of p.results) keys.add(r.markerKey);
  if (keys.size === 0) return `# Marker Reference\n(no markers on file yet)`;

  // Separate user-defined entries from seed entries — the prompt flags the
  // user ones as authoritative so the model treats their ranges as given
  // rather than inventing functional opinions about specialty markers.
  const userKeys = new Set(
    catalog
      .filter(m => m.key.startsWith("user_"))
      .map(m => m.key),
  );

  const lines = [`# Marker Reference (functional ranges + descriptions)`];
  for (const k of keys) {
    const m = findMarker(k, catalog);
    if (!m) continue;
    const lab     = m.labRange     ? rangeStr(m.labRange,     m.unit) : "—";
    const optimal = rangeStr(m.optimalRange, m.unit);
    const yours = userKeys.has(m.key) ? " (user-defined; treat these ranges as authoritative)" : "";
    lines.push(`- ${m.name} [${m.key}] · unit ${m.unit} · lab ${lab} · functional ${optimal}${yours} — ${m.description}`);
  }
  return lines.join("\n");
}

function formatPanels(panels: Panel[], catalog: MarkerDef[]): string {
  if (!panels.length) return `# Panels\n(no labs entered yet)`;
  const lines = [`# Panels (newest first)`];
  for (const p of panels) {
    lines.push(`\n## ${p.drawnAt}${p.labName ? ` · ${p.labName}` : ""} (${p.source})`);
    for (const r of p.results) lines.push(`  - ${formatResult(r, catalog)}`);
    if (p.notes) lines.push(`  notes: ${p.notes}`);
  }
  return lines.join("\n");
}

function formatResult(r: Result, catalog: MarkerDef[] = []): string {
  const m = findMarker(r.markerKey, catalog);
  const name = m?.shortName ?? m?.name ?? r.markerKey;
  const lab     = r.labRange     ? rangeStr(r.labRange,     r.unit) : "—";
  const optimal = r.optimalRange ? rangeStr(r.optimalRange, r.unit) : "—";
  const flag = r.flag ? ` [${r.flag}]` : "";
  return `${name}: ${r.value} ${r.unit} · lab ${lab} · functional ${optimal}${flag}`;
}

/** Friendly height like 5'11". Helps Claude reason without doing the math. */
function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return `${ft}'${inch}"`;
}

function rangeStr(r: { low?: number; high?: number }, unit: string): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high} ${unit}`;
  if (r.low != null)  return `≥ ${r.low} ${unit}`;
  if (r.high != null) return `≤ ${r.high} ${unit}`;
  return `— ${unit}`;
}

function formatEatAvoid(plan: Plan): string {
  const eat = plan.eatList.length === 0
    ? "(empty — generate freely against the markers)"
    : plan.eatList.map(e =>
        `- [${e.id}] ${e.food} — ${e.frequency}, ${e.portion} — for ${e.markerKeys.join(", ")} — ${e.why}`,
      ).join("\n");

  const avoid = plan.avoidList.length === 0
    ? "(no specific avoidances)"
    : plan.avoidList.map(a =>
        `- [${a.id}] ${a.food} — ${a.why}${a.swap ? ` (swap: ${a.swap})` : ""}`,
      ).join("\n");

  return [
    `# Plan eatList (you MUST hit these frequencies across the 7 days)`,
    eat,
    ``,
    `# Plan avoidList (NEVER include these in any meal)`,
    avoid,
  ].join("\n");
}

/**
 * Derive an editorial adherence tier from a 14-day check-in window + the
 * active plan's habit stack. Extracted as a pure helper (ticket 0012) so the
 * Progress page's projection card and the plan-generation prompt agree on
 * what "easy / moderate / advanced" means without drifting.
 *
 *   - "easy"     when ≥ 70% of habit-stack-days are held
 *   - "moderate" when ≥ 40%
 *   - "advanced" when ≥ 90% (overrides easy; this is the "running it tight" tier)
 *
 * Returns null when there's no prior plan or no check-ins to score against —
 * the caller decides what to render in that branch.
 *
 * "Habit-stack-days" = days in the window × habits in the stack. A 14-day
 * window with a 5-habit stack has 70 possible hits.
 */
export function tierForCheckIns(
  checkins: CheckIn[],
  prior?: Plan,
): { tier: "easy" | "moderate" | "advanced"; held: number; possible: number; percent: number } | null {
  if (!prior || !checkins.length) return null;
  const habits = prior.habitStack.habits;
  if (habits.length === 0) return null;

  const habitIds = new Set(habits.map(h => h.id));
  let held = 0;
  for (const c of checkins) {
    for (const id of c.habitsCompleted) if (habitIds.has(id)) held++;
  }
  const possible = checkins.length * habits.length;
  if (possible === 0) return null;
  const percent = held / possible;

  // The tier is the most generous level the user clears. Order matters:
  // advanced overrides easy when both are true.
  let tier: "easy" | "moderate" | "advanced";
  if      (percent >= 0.9) tier = "advanced";
  else if (percent >= 0.7) tier = "easy";
  else                     tier = "moderate";

  return { tier, held, possible, percent };
}

function formatAdherence(checkins: CheckIn[], prior?: Plan): string {
  // The continuous-signals rolling-averages block ALWAYS runs when there's
  // import data — it's useful with or without a prior plan to compare habits
  // against. Habit adherence still requires a prior plan to score against.
  const signalsBlock = formatContinuousSignalRollingAvg(checkins);

  if (!checkins.length || !prior) {
    return [`# Adherence\n(no check-ins on the prior plan yet)`, signalsBlock]
      .filter(Boolean).join("\n\n");
  }
  const habits = prior.habitStack.habits;
  const counts = new Map<string, number>();
  for (const c of checkins) for (const h of c.habitsCompleted) counts.set(h, (counts.get(h) ?? 0) + 1);
  const lines = [`# Adherence (last ${checkins.length} days)`];
  for (const h of habits) {
    const hit = counts.get(h.id) ?? 0;
    const pct = Math.round((hit / checkins.length) * 100);
    lines.push(`  - "${h.title}" — ${hit}/${checkins.length} days (${pct}%)`);
  }
  return [lines.join("\n"), signalsBlock].filter(Boolean).join("\n\n");
}

/**
 * Per ticket 0004: surface 7-day rolling averages of HRV / sleep / resting
 * heart rate so the plan generator can write things like "your HRV trends
 * down on weeks you don't hold the habit stack". Returns "" when there's
 * no continuous-signal data — that's the import-not-yet-run case and we
 * don't want to fill the prompt with empty scaffolding.
 *
 * The block is fed into the same `# Adherence` neighborhood of the prompt
 * because it asks the same question (how the user is doing day-to-day),
 * just from a different sensor.
 */
function formatContinuousSignalRollingAvg(checkins: CheckIn[]): string {
  if (!checkins.length) return "";
  // recentCheckIns gives us newest-first; flip to chronological so the
  // "this week vs last week" framing reads in the prompt the way humans
  // think about time.
  const chrono = [...checkins].sort((a, b) => a.day.localeCompare(b.day));

  // Bucket into "last 7 days on file" and "the 7 days before that".
  const last7 = chrono.slice(-7);
  const prev7 = chrono.slice(-14, -7);

  const stats = (rows: CheckIn[]) => {
    const hrv: number[] = [], rhr: number[] = [], sleep: number[] = [];
    for (const c of rows) {
      const s = c.signals;
      if (!s) continue;
      if (typeof s.hrvMs      === "number") hrv.push(s.hrvMs);
      if (typeof s.rhrBpm     === "number") rhr.push(s.rhrBpm);
      if (typeof s.sleepHours === "number") sleep.push(s.sleepHours);
    }
    return { hrv: avg(hrv), rhr: avg(rhr), sleep: avg(sleep) };
  };
  const cur = stats(last7);
  const prv = stats(prev7);

  // If we have nothing, return nothing. The prompt is allergic to empty
  // sections with editorial preambles.
  if (cur.hrv == null && cur.rhr == null && cur.sleep == null) return "";

  const lines = [
    `# Continuous signals (7-day rolling averages from Apple Health import)`,
  ];
  if (cur.hrv != null) {
    lines.push(`  - HRV (SDNN):         ${cur.hrv.toFixed(1)} ms${
      prv.hrv != null ? ` (prior 7d ${prv.hrv.toFixed(1)} ms, Δ ${signed(cur.hrv - prv.hrv, 1)} ms)` : ""}`);
  }
  if (cur.rhr != null) {
    lines.push(`  - Resting heart rate: ${cur.rhr.toFixed(1)} bpm${
      prv.rhr != null ? ` (prior 7d ${prv.rhr.toFixed(1)} bpm, Δ ${signed(cur.rhr - prv.rhr, 1)} bpm)` : ""}`);
  }
  if (cur.sleep != null) {
    lines.push(`  - Sleep:              ${cur.sleep.toFixed(2)} h/night${
      prv.sleep != null ? ` (prior 7d ${prv.sleep.toFixed(2)} h, Δ ${signed(cur.sleep - prv.sleep, 2)} h)` : ""}`);
  }
  return lines.join("\n");
}

function avg(arr: number[]): number | undefined {
  if (!arr.length) return undefined;
  return arr.reduce((n, v) => n + v, 0) / arr.length;
}

function signed(n: number, decimals: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}`;
}

function formatPriorPlan(p: Plan): string {
  return [
    `# Previous Plan (for continuity — iterate, don't overwrite)`,
    `## Snapshot`, p.snapshot,
    `## Habit Stack`,
    ...p.habitStack.habits.map(h => `  - [${h.id}] ${h.title} (cue: ${h.cue})`),
  ].join("\n");
}

/* ============================================================================
   Parsing + normalization
   ============================================================================ */

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text).join("\n").trim();
}

function parseJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = (start >= 0 && end > start) ? candidate.slice(start, end + 1) : candidate;
  try { return JSON.parse(slice); }
  catch (err) { throw new Error(`Could not parse JSON.\n--- raw ---\n${text}`); }
}

function normalizePlan(parsed: Record<string, unknown>): Omit<Plan, "id" | "generatedAt" | "basedOnPanelIds"> {
  const stack = (parsed.habitStack ?? {}) as any;
  return {
    snapshot: String(parsed.snapshot ?? "").trim(),
    insights: Array.isArray(parsed.insights) ? parsed.insights as Plan["insights"] : [],
    eatList:    Array.isArray(parsed.eatList)    ? parsed.eatList    as Plan["eatList"]    : [],
    avoidList:  Array.isArray(parsed.avoidList)  ? parsed.avoidList  as Plan["avoidList"]  : [],
    lifestyle:   Array.isArray(parsed.lifestyle)   ? parsed.lifestyle   as Plan["lifestyle"]   : [],
    supplements: Array.isArray(parsed.supplements) ? parsed.supplements as Plan["supplements"] : [],
    habitStack: {
      intro: String(stack.intro ?? "").trim(),
      habits: Array.isArray(stack.habits) ? stack.habits as Plan["habitStack"]["habits"] : [],
    },
    retest: Array.isArray(parsed.retest) ? parsed.retest as Plan["retest"] : [],
  };
}

function normalizeMealPlan(parsed: Record<string, unknown>, expectedDays: Day[]): Omit<MealPlan, "id" | "generatedAt" | "planId"> {
  const rawDays = Array.isArray(parsed.days) ? parsed.days as any[] : [];
  // Trust the model's days field, but if it's missing or short, fill with placeholders.
  const days = expectedDays.map((day, i) => {
    const d = rawDays[i] ?? {};
    return {
      day,
      breakfast: normalizeMeal(d.breakfast, `${dayKey(day)}-breakfast`),
      lunch:     normalizeMeal(d.lunch,     `${dayKey(day)}-lunch`),
      dinner:    normalizeMeal(d.dinner,    `${dayKey(day)}-dinner`),
      ...(d.snack ? { snack: normalizeMeal(d.snack, `${dayKey(day)}-snack`) } : {}),
    };
  });
  return {
    weekStart: expectedDays[0]!,
    days,
    grocery: Array.isArray(parsed.grocery) ? parsed.grocery as MealPlan["grocery"] : [],
  };
}

function normalizeMeal(raw: any, fallbackId: string) {
  const r = raw ?? {};
  return {
    id: String(r.id ?? fallbackId),
    title: String(r.title ?? "—"),
    description: String(r.description ?? ""),
    effort: (["assembly","weeknight","weekend","batch"].includes(r.effort) ? r.effort : "weeknight") as
      "assembly" | "weeknight" | "weekend" | "batch",
    timeMinutes: Number.isFinite(Number(r.timeMinutes)) ? Number(r.timeMinutes) : 30,
    servings: Number.isFinite(Number(r.servings)) ? Number(r.servings) : 1,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : [],
    ...(Array.isArray(r.steps) ? { steps: r.steps.map(String) } : {}),
    hits: Array.isArray(r.hits) ? r.hits.map(String) : [],
    ...(r.cuisine ? { cuisine: String(r.cuisine) } : {}),
    ...(Array.isArray(r.tags) ? { tags: r.tags.map(String) } : {}),
  };
}

function dayKey(d: Day): string {
  const date = new Date(d + "T00:00:00");
  const dows = ["sun","mon","tue","wed","thu","fri","sat"];
  return dows[date.getDay()] ?? d;
}
