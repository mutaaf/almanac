---
id: 0035
title: Keep the meals that stuck — carry the dishes you actually ate into the next week's re-roll
status: groomed
priority: P2
area: meals
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who re-rolls the week's meal plan every Sunday, I want the dishes I actually ate and marked — the salmon bowl, the lentil breakfast — to be offered as "keepers" I can pin into next week before I re-roll, so that the meal plan learns from what stuck in my real kitchen instead of handing me seven fresh dishes every week and quietly discarding the three I had finally gotten into a rhythm with — which is the exact churn that made me abandon every other meal-planning app.

## Why now (four lenses)

### Product Owner

The meal plan is the most-repeated surface in the product — re-rolled weekly by design — and it has total amnesia. Every re-roll produces seven new dishes, even the ones the user ate every day last week and actually liked. The check-in already records `mealsAte` (the ids of meals eaten), so the app *knows* which dishes stuck — and throws that knowledge away on the next generation. The result is the precise fatigue that kills meal-planning apps: you find a rhythm, the app resets it, you re-decide everything weekly until you stop. The smallest meaningful unit of value is a "keepers" affordance on the meals re-roll: before generating the next week, surface the dishes the user marked eaten ≥ N times last week as pinnable "keep these," carry the kept dishes into the generation prompt as fixed anchors ("retain these exact dishes; vary the rest"), and let the user re-roll only the unkept days. It reads check-ins and the current meal plan, both already on the device; the only new inference is that the keepers are pinned in the existing meal-generation call, not a new one.

### Stakeholder

This deepens the **adherence loop** on the side it has never touched — meals. The loop reads habit adherence into plan composition, but the meal plan re-rolls independently and ignores `mealsAte` entirely. Wiring eaten-meal history into the re-roll closes that gap: the meal plan starts to converge on the user's actual kitchen rather than re-proposing from scratch, which is the difference between a tool that fights the user's habits and one that compounds them. It also strengthens the **structured artifact** moat — a meal plan that remembers what you ate is structurally impossible for a chat box, which has no record of your `mealsAte` and would re-propose a fresh week every prompt. A backend product could persist meal history server-side; Almanac persists it in the check-ins already on the device and feeds it into the user's own BYOK call. The convergence-over-time property is exactly the kind of compounding state that makes the product harder to leave the longer it is used.

### User (at 7am on the phone)

Sunday, time to plan the week. Before I re-roll, the meals page shows me what stuck: "You ate the salmon-and-lentil bowl 4 days last week and the overnight oats 5. Keep them?" I tap both — they pin. I hit "re-roll the rest," and the new week comes back with my two keepers exactly where they were and five fresh dishes around them. I did not have to re-decide the things that were already working; I only chose among what was new. It feels like the plan is finally learning my kitchen instead of resetting it. It worked on a flaky connection because the keeper detection is local — only the generation of the new dishes touches the network, exactly as a normal re-roll always did.

### Growth

This is a retention ticket aimed straight at the meal-fatigue churn that the target persona has felt in every prior app. Retention: the single most-cited reason people abandon meal planners is the weekly re-decision tax; letting the plan keep what stuck removes that tax and converts the re-roll from a chore into a refinement. (Hypothesis: carrying eaten-meal keepers into the re-roll raises week-over-week meal-plan re-generation rate and lengthens the meals-surface retention curve, because a plan that remembers your kitchen is one you keep using — back-of-envelope from how recipe apps with "cook again" / favorites memory show higher repeat-planning than those that reset weekly; treat as untested without remote analytics.) The acquisition tail is word-of-mouth specific to the persona: "it actually keeps the meals I liked instead of resetting every week" is the exact complaint about MyFitnessPal/Mealime that this answers, and answering a known pain by name is the most credible recommendation a friend can make.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/meals/keepers.ts` (new) exports `computeKeepers(mealPlan: MealPlan, checkIns: CheckIn[]): Keeper[]` where `Keeper` is `{ mealId: string; title: string; ateCount: number }`. It counts, across the supplied check-ins, how many distinct days each `Meal.id` in the current plan appears in `CheckIn.mealsAte`, and returns the dishes that clear a threshold (default ≥ 2 days), ordered by `ateCount` descending. Pure: no DOM, no Dexie, no network.
- [ ] The meals page (`src/pages/meals.ts`) renders a "keepers" section above the re-roll action when `computeKeepers(...)` returns at least one dish, listing each keeper with its title and ateCount and a pin toggle ("Keep" / kept). With zero keepers (a fresh week, or no eaten meals logged), the section is absent and the page is byte-for-byte unchanged from today. Asserted by seeding a plan + check-ins where two dishes clear the threshold (section present) versus none (absent).
- [ ] Each keeper row reads: "<dish title> — you ate it <N> days last week. Keep?" Singular/plural agree ("1 day"). Tapping "Keep" pins the dish; the pinned set is held in page state for the pending re-roll. Asserted by pinning two keepers and confirming both are marked kept.
- [ ] The re-roll action, when one or more keepers are pinned, reads "Re-roll the rest" and generates a new MealPlan in which the pinned dishes are retained on their existing days and only the unpinned days are re-generated. The generation call instructs the model to retain the kept dishes verbatim and vary the rest. Asserted via `mocks.lastPromptBody()` containing the kept dish titles as fixed anchors and the resulting plan retaining them.
- [ ] With NO keepers pinned, the re-roll action reads as today ("Re-roll the week" or the existing label) and generates a full fresh week exactly as the current behavior — the keepers feature is purely additive when unused. Asserted by re-rolling with nothing pinned and confirming the prompt and result match today's full-week generation.
- [ ] The keeper detection is computed with **zero network calls** — it reads the current meal plan and check-ins from IndexedDB; only the re-roll generation itself (an existing, expected Anthropic call) touches the network. Asserted by rendering the keepers section and confirming zero requests during detection, then exactly one generation request on re-roll.
- [ ] The grocery list re-derives correctly for the mixed (kept + new) week — the kept dishes' ingredients remain in the section-organized list alongside the new dishes'. Asserted by confirming a kept dish's ingredients appear in the post-re-roll grocery list.
- [ ] Keepers respect the dietary pattern and avoid list exactly as a normal generation does — a kept dish is retained as-is (the user already ate it), and the newly-generated dishes still honor the constraints. Asserted by confirming the new dishes contain nothing on the avoid list while the kept dishes are untouched.
- [ ] Renders on both **chromium and mobile-webkit**. The keeper rows and pin toggles are ≥44×44 css px touch targets; long dish titles wrap cleanly at the 390 px viewport; the section does not push the re-roll action below the fold.
- [ ] Tour mode (0014) surfaces keepers against the tour fixture if the fixture provides eaten-meal check-ins clearing the threshold (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the meals re-roll surface (meal generation is the owner's, not the recipient's), so keepers are absent there. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — keeper detection is local-only; the re-roll uses the existing `api.anthropic.com` BYOK egress; no new hostnames.
- [ ] Schema migration: **no** — keeper detection reads the existing `mealPlans` and `checkins` tables (`CheckIn.mealsAte` and `Meal.id` already exist). The pinned set is page-state only for the pending re-roll; it is not persisted (the re-rolled plan persists as a normal MealPlan).
- [ ] New `tests/e2e/meal-keepers.spec.ts` covers: keepers section present when dishes clear the threshold and absent otherwise, exact "you ate it N days" copy with singular/plural, pinning carries dishes into the re-roll prompt as anchors, no-keepers re-roll matches today's full-week behavior, zero-network during detection + one call on re-roll, grocery re-derivation includes kept ingredients, constraints honored, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A persistent "favorites" library of dishes across all weeks. This ticket scopes to carrying *last week's eaten dishes* into *next week's re-roll* — a one-step memory, not a recipe box. A standing favorites collection is a larger, separate ticket with its own storage design.
- Auto-keeping dishes without the user's confirmation. The keeper is *offered*; the user pins it. Silently retaining last week's meals would remove agency and risk staleness the user did not choose. The pin is the consent.
- Editing a kept dish's recipe before re-roll. A keeper is retained verbatim because the user already ate it; per-dish editing is a different surface (the single-meal swap, 0003, handles in-week swaps). Do not build a recipe editor here.
- A second Anthropic call for keepers. Keeper detection is local; the kept dishes ride in the existing single re-roll generation call as fixed anchors. No extra inference, no extra cost.
- Reading `mealsAte` into the *plan* composition (eat list / habits). That is a richer, separate adherence-into-plan question; this ticket scopes strictly to the meal-plan re-roll. The plan loop reads habit adherence today; meal-into-plan is a future ticket.
- A "you skipped these, drop them?" inverse affordance. The honest, low-pressure move is to offer keepers, not to flag skips (which reads as scolding). Unkept dishes simply re-roll; nothing calls out what was skipped.
- Carrying keepers into the share link (0017) or any static artifact. Keepers are a live re-roll-time affordance computed from the owner's own eating history; they do not travel.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/meals/keepers.ts` (new) — `computeKeepers(mealPlan, checkIns)` per the acceptance bullets. Count distinct days each `Meal.id` (from `mealPlan.days[].breakfast/lunch/dinner/snack`) appears in `CheckIn.mealsAte`. Threshold ≥ 2 days. Pure; the page passes the current plan + the relevant check-ins in.
- `src/pages/meals.ts` — the page renders the 7-day grid, the grocery list, and the re-roll action. Before the re-roll action, render the keepers section when `computeKeepers(...)` is non-empty; hold the pinned `mealId` set in page state. On re-roll, branch: with pins, call the existing meal generator with the kept dishes injected as fixed anchors (retain verbatim, vary the rest) and only the unpinned days re-generated; without pins, the existing full-week path unchanged. Re-use the existing transient-confirmation and action idioms.
- `src/claude.ts` — `MEAL_VOICE` / the meal-generation prompt builder gains a small, conditional "retain these exact dishes on their days; vary the remaining days" block when keepers are pinned. The block is byte-absent when no keepers are pinned (the no-keepers prompt is identical to today's). Bump `tests/fixtures/meals.json` only if the response shape changes (it should not — same MealPlan shape).
- `src/db.ts` — read-only. `latestMealPlan()` and `recentCheckIns(...)` / `allCheckInsInWindow(...)` already exist; use them to gather the current plan and last week's check-ins. The re-rolled plan persists via the existing meal-plan save path. Do NOT alter the mealPlans or checkins store.
- `src/types.ts` — add `Keeper` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.meal-keepers` (the section), `.meal-keeper__row` (one keeper with its pin toggle, ≥44×44 css px), re-using the existing meals-page action styling. No new colors; ink and ink-soft.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with `isSharedView()` (absent) / `isTour()` (present only if the fixture supplies eaten-meal check-ins).
- `tests/helpers/flows.ts` — re-use the meal-generation flow; add (or reuse) a check-in seeding helper that writes `mealsAte` for N distinct days referencing the seeded plan's `Meal.id`s (mind the `&day` UNIQUE index — seed unique days, per the 0021 lesson in `docs/LESSONS.md`). A `seedMealPlan(page, mealPlan)` helper (if not already present from 0030) gives the spec a deterministic plan whose meal ids the check-ins can reference.
- `tests/e2e/meal-keepers.spec.ts` (new) — every acceptance bullet maps to a `test()`. The anchor test pins a dish eaten 4 days and asserts its title appears as a fixed anchor in `mocks.lastPromptBody()` and is retained in the re-rolled plan.
- `tests/e2e/privacy.spec.ts` — extend with a keepers-detection + re-roll invocation confirming zero off-allow-list egress and a single `api.anthropic.com` call on re-roll.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the keeper row reads "<dish title> — you ate it <N> days last week. Keep?" The re-roll action reads "Re-roll the rest" when keepers are pinned, the existing label otherwise. Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
