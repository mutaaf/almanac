---
id: 0003
title: Single-meal swap with constraint preservation
status: proposed
priority: P1
area: meals
created: 2026-05-14
owner: gtm-innovation
---

## User story

As a user looking at Tuesday's salmon dinner with no salmon in the house, I want to swap that single meal for an alternative that hits the same biomarkers and respects all my dietary constraints — without re-rolling the entire week and losing the meals I already planned around.

## Why now

### Product Owner
The current "re-roll the week" button is a sledgehammer for what's usually a one-meal nudge. Swap one meal, keep the rest. That's the difference between "the meal plan is a wall of text I tolerate" and "the meal plan is a working document I actually use."

### Stakeholder
Each swap is a tiny LLM call (one Meal worth of output) that consumes our prompt-caching infrastructure beautifully — the eat list, avoid list, dietary pattern, marker reference are all already cached from the original week generation, so the swap call is mostly output tokens. This deepens the "fast and cheap" feeling and showcases the cache stats in Settings.

### User
"I don't have salmon." Tap the meal. Tap "Swap." 4 seconds later: "Sardines on whole-grain toast with chickpea-cucumber salad — same omega-3 hit, same prep time, same effort." Tap "Use this." Done. Tuesday's salmon line is now sardines, Wednesday hasn't changed.

### Growth
The swap UX is the single screenshot that demonstrates "this app actually thinks." Every meal-plan competitor is a static plan. Almanac is a living one. That difference is hard to articulate in marketing copy but obvious in a 5-second screen-recording of a single swap.

## Acceptance criteria

- [ ] In the meal-detail view (`/meals?day=YYYY-MM-DD`), each Meal has a **"Swap"** button.
- [ ] Tapping Swap fires a new Anthropic call (a third generator: `generateMealSwap`) that returns ONE Meal honoring: eat list, avoid list, dietary pattern, household size, effort budget *of the original meal* (or looser, but not heavier).
- [ ] The mock fixture exercises the swap path; CI verifies the path is hit and the response is parsed.
- [ ] The new meal replaces the original in the persisted MealPlan; other days/meals are unchanged.
- [ ] The grocery list is **recomputed automatically** from the new week (deletions of orphaned ingredients, additions for new ones).
- [ ] Telemetry records the swap as its own kind (`swap`) — visible in Settings.
- [ ] Cache stats: the swap call should show a high `cache_read` because the system prompt + eat/avoid + profile are reused; only the "this single meal" instruction is fresh.
- [ ] Test in `tests/e2e/meals.spec.ts` covering tap → mock returns → meal replaced → grocery updated.
- [ ] Privacy E2E still passes.

## Out of scope

- Re-rolling N meals at once. (One at a time keeps the UX comprehensible.)
- "Show me 3 alternatives, pick one." (Add later if users ask. The first ask is the most common.)
- Swap with a manually-typed constraint ("but not eggs this time"). The dietary pattern in the profile is the source of constraints.

## Engineering notes

- New method `ClaudeClient.generateMealSwap(plan, mealId, profile, panels, prevMealPlan)` in `src/claude.ts`.
- New `SWAP_VOICE` system prompt that's a tight 1-meal variant of `MEAL_VOICE`.
- Re-use `cache_control: ephemeral` blocks; only the volatile part changes (the single meal id + its slot).
- Grocery rebuild: a function `recomputeGrocery(plan, meals)` that aggregates ingredients across all 7 days. Keep grouped sections by re-grouping with the same logic Claude used originally — or, simpler, just regenerate the grocery JSON via a tiny LLM call too. Choose whichever is cheaper.
- New telemetry kind: extend `CallRecord["kind"]` to include `"swap"`.
- `tests/fixtures/swap.json` — single Meal JSON.

## Implementation log

(empty — pick up via `/ship 0003`)
