---
id: 0003
title: Single-meal swap with constraint preservation
status: shipped
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

- [x] In the meal-detail view (`#/meals?day=YYYY-MM-DD`), each `Meal` card renders a **"Swap"** button distinct from the existing "Re-roll the week" action.
- [x] Tapping **Swap** fires exactly one `POST https://api.anthropic.com/v1/messages` and the mock can distinguish it from `plan` / `meals` / `extract` calls by sniffing the system-prompt sentinel `SWAP_VOICE`.
- [x] The mock fixture (`tests/fixtures/swap.json`) returns a single `Meal` JSON; the test asserts that the returned meal's `id` reuses the original meal's id (so its slot in `DayMeals.breakfast | lunch | dinner` is unambiguous).
- [x] After the response is parsed, `latestMealPlan()` returns a `MealPlan` where: (a) the swapped meal slot now holds the new title/description/ingredients, (b) every other `DayMeals` entry across all 7 days is byte-identical to before the swap.
- [x] The persisted `MealPlan.grocery` is recomputed: an ingredient that was unique to the swapped meal is removed from grocery; an ingredient unique to the new meal is added (assert against fixture-specific ingredient strings).
- [x] A new `CallRecord` row appears in Settings → Telemetry with `kind: "swap"`.
- [x] The swap call's recorded `cacheReadTokens` is greater than its `inputTokens` (proves the static prefix — `SWAP_VOICE` + eat/avoid + profile — is being read from cache). Assert via the telemetry surface, not the wire.
- [x] Tapping Swap with no network reachable surfaces the same `errorCard()` pattern the plan generator uses — no silent failure, original meal stays intact.
- [x] All scenarios above pass on both `chromium` and `mobile-webkit` Playwright projects.
- [x] Privacy E2E still passes (no new hostnames).

## Out of scope

- Re-rolling N meals at once. (One at a time keeps the UX comprehensible.)
- "Show me 3 alternatives, pick one." (Add later if users ask. The first ask is the most common.)
- Swap with a manually-typed constraint ("but not eggs this time"). The dietary pattern in the profile is the source of constraints.

## Engineering notes

- `src/claude.ts` — add `ClaudeClient.generateMealSwap(plan, mealId, profile, panels, prevMealPlan)` returning a single `Meal`. Add a tight `SWAP_VOICE` system prompt (1-meal variant of `MEAL_VOICE`). Reuse `cache_control: ephemeral` on the static prefix (system + eat list + avoid list + dietary pattern + marker reference) so the only fresh input is the one meal being replaced and its constraints.
- `src/telemetry.ts` — extend `CallRecord["kind"]` union to `"plan" | "meals" | "extract" | "swap"`. Settings already iterates `kind`, so the new row appears for free.
- `src/pages/meals.ts` — in the day-detail view (`paint()` with `focusDay` set), each `Meal` card gains a Swap button. Handler awaits the swap, persists via `saveMealPlan` with the new days array and recomputed grocery, then re-renders via the imported `route()` (NOT `location.hash = ...`; that's the WebKit race ticket 0005 just closed). The Meal id is preserved so its slot is unambiguous.
- Grocery rebuild: prefer the deterministic path — a new pure function `recomputeGrocery(days: DayMeals[]): GrocerySection[]` in a new `src/meals/grocery.ts` that aggregates ingredient lines, groups by simple category heuristics (Produce / Protein / Pantry / Dairy / Other), and keeps the original section ordering. Avoids a second LLM call and keeps the swap snappy.
- `tests/helpers/mocks.ts` — sniff `SWAP_VOICE` in the system prompt and serve `tests/fixtures/swap.json`. Bump cache_read tokens in the fixture's `usage` to satisfy the cache-hit assertion.
- `tests/fixtures/swap.json` — one `Meal` JSON matching the day-meal slot the test taps.
- `tests/e2e/meals.spec.ts` — add the swap scenarios listed in acceptance criteria. Reuse `composePlan` and the existing `meals` fixture for setup.
- Schema migration: **no** — `MealPlan` shape is unchanged.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

- 2026-05-15 — picked up by implementation-dev agent. Branch `feat/0003-single-meal-swap` open. Approach matches engineering notes: tight `SWAP_VOICE` reusing the cached static prefix, deterministic `recomputeGrocery()`, `route()` re-render after persist. No schema migration, no egress widening, no new deps.
- 2026-05-15 — shipped via PR [#7](https://github.com/mutaaf/almanac/pull/7), squash-merged as `a68d0e7`. CI green across typecheck + build, E2E (chromium), and E2E (mobile-webkit). Commits on the feature branch:
  - `770cb7d` chore(backlog): mark 0003 in-progress
  - `e391a4c` feat(meals): swap one meal without re-rolling the week
  Files touched:
  - `src/claude.ts` — `SWAP_VOICE` system prompt, `GenerateMealSwapInput`, `ClaudeClient.generateMealSwap()`, `locateMeal()` helper. Reuses `cache_control: ephemeral` on the static prefix (system + profile + marker reference + eat/avoid) so the swap is mostly output tokens once the week generation has primed the cache.
  - `src/meals/grocery.ts` (new) — pure `recomputeGrocery(days: DayMeals[]): GrocerySection[]` aggregator with small string-based section heuristics (Produce / Protein / Pantry / Dairy / Other).
  - `src/pages/meals.ts` — Swap button rendered per `mealDetail` card with `data-action="swap"` + `data-meal-id`; `swapMeal()` handler that splices the replacement, recomputes the grocery, persists via `saveMealPlan`, and re-renders via the imported `route()`.
  - `src/telemetry.ts` — extends `CallRecord["kind"]` union to include `"swap"`.
  - `src/styles.css` — `.meal-detail__actions` / `.meal-detail__swap` styling matching the editorial almanac look.
  - `tests/helpers/mocks.ts` — sniffs `SWAP_VOICE` (BEFORE the meals branch since SWAP_VOICE includes meal-plan-shaped phrasing) and serves the swap fixture with `cacheRead = 3200` so the cache-hit-greater-than-input assertion is meaningful.
  - `tests/fixtures/swap.json` — single Meal JSON reusing id `d0-d`, unique ingredient `fresh dill` introduced, original-only ingredient `1 bunch Swiss chard` dropped.
  - `tests/e2e/meals.spec.ts` — new `describe("Meals · swap a single meal")` block with 5 scenarios mapping 1:1 to the acceptance criteria. Includes a local-date `todayIso()` helper that matches `src/db.ts today()` (UTC vs local matters near the UTC midnight boundary).
  Test scenarios added: (1) day-detail dinner card exposes a Swap button distinct from re-roll; (2) swap fires a single SWAP_VOICE call, preserves the meal id, replaces only that slot, other 6 days byte-identical; (3) grocery rebuild — unique-to-original removed, unique-to-new added; (4) telemetry records a swap CallRecord with cacheReadTokens > inputTokens; (5) network failure surfaces errorCard() and leaves the original meal intact.
  No schema migration. No egress allow-list change. No new dependencies.
