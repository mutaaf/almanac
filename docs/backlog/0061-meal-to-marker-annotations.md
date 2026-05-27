---
id: 0061
title: The meals know what they're for — annotate each day's plate with the markers it serves
status: proposed
priority: P2
area: meals
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a user reading the week ahead on the Meals page, I want each day's breakfast / lunch / dinner to carry a small marker tag underneath — "Day 3 dinner: salmon → ApoB, omega-3 index" — so that the meal plan reads as a medical protocol I am eating my way through, instead of a generic recipe list I have to take on faith that it serves the lab numbers it was generated for.

## Why now (four lenses)

### Product Owner

The Plan's `eatList` already carries structured `markerKeys` on every food (the moat that lets the plan say "fatty fish 2× per week — for omega-3 index at 4% → target ≥8%"). The Meals page generates a 7-day plate explicitly constrained to that eat list. But the link between the two is lost at render: the user sees "Salmon with lemon and dill" on Wednesday dinner and has no way to see *why* — which marker that dinner is targeting, which entry on the eat list it is satisfying. The smallest meaningful unit of value is a small marker-tag annotation under each meal: at render time, the page walks each meal's food fragments, matches them (case-insensitive, substring) against the current plan's `eatList[].food` strings, and unions the `markerKeys` of every match. The annotation reads "→ ApoB, omega-3 index" — display names via `findMarker()`. If a meal matches no eat-list entry, no annotation is shown (silent on assembly meals). It is a pure render-time join of two existing data structures — no inference, no schema, no new content — that lifts the meal plan from "what to cook" to "what each plate is for."

### Stakeholder

This deepens the **structured eat-list + plan** moat at the most visible point: the Meals page is where the user interacts with the plan every day (choosing what to cook, logging what they ate). The `markerKeys` on `EatItem` are the product's whole thesis — the reason the plan is more than a recipe generator — but they are currently invisible to the user at the point of use. Surfacing them as a small annotation makes the structure legible. A chat box can tell you "eat salmon for omega-3"; only Almanac can cross-reference *this specific meal in your week* against *your specific panel targets* with no inference, because it holds both the structured eat list with markerKeys and the generated meal plan in the same local session. The annotation is the point where the meal plan becomes a medical protocol for the user, not just a convenience.

### User (at 7am on the phone)

I open the Meals page to review the week. Under Wednesday dinner — "Pan-seared salmon with wilted greens and lemon" — a small gray line: "→ ApoB, omega-3 index, ferritin." I can see immediately that this meal is doing three things: driving the omega-3 ratio, supporting ApoB, and hitting the iron target from the greens. I didn't need to compose again or read the eat list separately — the meal told me. On days where the annotation is blank (the quinoa salad doesn't match anything specific in my eat list), I accept the silence without worry because the annotated meals already add up. It takes three seconds to scan and costs no tap.

### Growth

This is a moat-and-retention ticket. (Hypothesis: users who can see *why* each meal exists in their protocol are more likely to cook it and less likely to swap it out, because the annotation converts a generic recipe into a personal medical instruction — and "I can see exactly which markers my dinner is targeting" is the kind of clinical-precision detail that makes the persona forward the screenshot to the friend asking "what does that app actually do?"; back-of-envelope from how context-and-reason increases adherence to prescribed behaviors in clinical nutrition research; treat as untested without remote analytics.) The "show me" frame is the annotated meals page itself: a screenshot showing "Salmon → ApoB, omega-3 index" is precisely the cross-section of food and lab science that makes the founding persona say "it actually knows what each meal is for." It is the visible link between the eat list (Protocol) and the meal plan (Meals) that the founding pitch describes but currently hides.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/meals/marker-annotations.ts` (new) exports `annotateMeals(mealPlan: MealPlan, plan: Plan): AnnotatedMealPlan` where each `Day` in the result carries each meal augmented with a `markerKeys: string[]` field. For each meal, the helper walks the meal's food-name text, matches it against `plan.eatList[].food` (case-insensitive substring), and unions the `markerKeys` of every matching eat item. Pure: no DOM, no Dexie, no network, no LLM. Asserted by passing a known meal plan (with a "salmon" dinner) and a known plan (with an eat item `{ food: "fatty fish", markerKeys: ["apob", "omega3_index"] }`), and confirming the dinner carries `markerKeys: ["apob", "omega3_index"]`.
- [ ] A meal whose food text matches NO eat-list entry produces an empty `markerKeys: []`; the Meals page renders NO annotation for that meal (silent, not an empty tag). Asserted by passing a meal with unmatched food text and confirming the annotation element is absent from the DOM.
- [ ] The Meals page (`src/pages/meals.ts`) renders each annotated meal's `markerKeys` as a small "→ [display names]" line beneath the meal title, using `findMarker()` to resolve display names from keys. Asserted by seeding a meal plan and plan with a known matched pair and confirming the annotation text renders with the correct display name(s).
- [ ] When the current plan has no `eatList` or an empty one, no annotations render — the Meals page is unchanged. Asserted on a profile with a plan that has an empty eatList.
- [ ] The annotation renders for EACH meal in the day (breakfast, lunch, dinner) independently — a breakfast that matches gets its annotation, a lunch that doesn't match gets none. Asserted by constructing a day where only one meal matches.
- [ ] The annotation makes **zero Anthropic calls** and **zero network calls** — it is a pure local join. Asserted by loading the Meals page with a meal plan + plan and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in any annotation string. Asserted by seeding a sentinel key and confirming it appears nowhere in the rendered annotations.
- [ ] Tour mode (0014) annotates against the tour fixture's plan + meal plan (read-only fixture data, no real writes). Shared-view mode (0017) renders or omits per the shared plan + meal data available; document and assert the chosen behavior.
- [ ] Renders on both **chromium and mobile-webkit**. The annotation wraps cleanly at the 390 px viewport; long marker-display names respect `min-width: 0`. Asserted on both projects.
- [ ] The existing Meals page flows — weekly view, single-meal swap (0003), grocery list, meal logging, the grocery-list portability (0030 when shipped) — are unchanged in behavior; annotations are purely additive below each meal title. Asserted by exercising the existing Meals flow and confirming it is unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — annotations are a local join with no inference; no new hostnames.
- [ ] Schema migration: **no** — the annotation is a render-time computation over existing stored structures. Nothing new is persisted.
- [ ] New `tests/e2e/meal-annotations.spec.ts` covers: `annotateMeals` produces correct markerKeys for a known pair, empty markerKeys for an unmatched meal, the page renders the annotation text for a matched meal, the page is silent for an unmatched meal, zero Anthropic + zero network, the key never appears, the existing Meals flow unchanged, tour/shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to generate, explain, or expand the annotations. The annotation is a substring match of the meal's food text against the eat list — no inference, no new Anthropic call.
- A "why this marker?" deep-dive link from the annotation. That is the marker deep-dive (0059). The annotation is a one-line tag; the full reference is a separate surface.
- Showing the eat-list item's target range or the user's current value in the annotation. That depth belongs to the marker deep-dive (0059) or the Plan page — the annotation is a compact label, not a clinical note.
- Annotating based on the avoid list. The avoid list's `markerKeys` indicate markers harmed by the food, not served by it — mixing the two in the same annotation conflates "eat this for X" with "avoid this for X" and confuses the signal. A future ticket can surface the avoid-list constraint separately.
- A new persisted field on `MealPlan` or `Meal`. The annotation is computed at render time from the existing `eatList` and `mealPlan`; nothing new is stored.
- Modifying the meal plan generation prompt or the plan composer. The annotation is purely a post-render operation over what the composer already produces.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/meals/marker-annotations.ts` (new) — `annotateMeals(mealPlan, plan)`. Walk each day's breakfast/lunch/dinner food-name text; for each, filter `plan.eatList` where `eatItem.food.toLowerCase()` is a substring of the meal name (lowercased). Union the matched items' `markerKeys`. Return the augmented meal plan. Pure; no Dexie import. (The substring match is intentionally simple — a meal named "Pan-seared salmon" matches an eat item "fatty fish" only if the string appears; if the match is too narrow for some meals, the dev may widen to a word-fragment set but must document the chosen approach in the spec.)
- `src/pages/meals.ts` — after loading the meal plan and plan, pass them through `annotateMeals()` and render each meal's `markerKeys` (non-empty only) as a small "→ [names]" annotation beneath the meal title. Use `findMarker()` for display names (handles sex-specific keys). Reuse the existing meal-card DOM structure; the annotation is an additive `<span class="meal__markers">` or equivalent.
- `src/types.ts` — no new persistent types; an `AnnotatedMeal` or augmented meal type lives in `marker-annotations.ts` or is an internal render-time type in `meals.ts`.
- `src/viz.ts` / `src/data/markers.ts` — read-only reuse of `findMarker()` for display names. No new viz primitive.
- `src/styles.css` — `.meal__markers` (the annotation line), ink-soft color, small/secondary text size, one-liner. No new colors; the "→" glyph uses ink-soft to stay visually subordinate to the meal title. Grid children `min-width: 0`.
- `tests/helpers/flows.ts` — reuse the existing meal-plan and plan seeding helpers (`seedMealPlan`, `seedPlan` patterns from the 0035/0050 specs). No new helpers needed.
- `tests/e2e/meal-annotations.spec.ts` (new) — every acceptance bullet maps to a `test()`. The pure-function test passes a constructed meal plan + plan and asserts the `markerKeys` field; the render tests seed both stores and assert the annotation text in the DOM.
- `tests/e2e/privacy.spec.ts` — extend with a Meals page visit on a seeded plan + meal plan, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the annotation reads "→ [Marker Name, Marker Name]" — display names from `findMarker()`, comma-separated. Declarative label, no verb, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink-soft; the meal title stays primary.

## Implementation log

(Appended by the implementation-dev agent during execution.)
