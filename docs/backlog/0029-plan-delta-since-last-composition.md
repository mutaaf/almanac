---
id: 0029
title: What changed since last time — show the delta between this plan and the one it replaced
status: in-progress
priority: P1
area: plan
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who just recomposed my plan after a new draw — my second ApoB came back lower, I held magnesium 12 of 14 days — I want the new plan to open with a short, honest account of what *changed* from the plan it replaced ("Salmon moved from 2x to 3x per week because your omega-3 index is still below target; the iron habit retired because ferritin reached the functional range; one new habit was added"), so that recomposing feels like a *progression* of one continuous protocol rather than a fresh plan that silently overwrote the old one — and so I can see that my adherence and my new labs actually moved the recommendations, which is the whole reason I bothered to retest.

## Why now (four lenses)

### Product Owner

Recomposition today produces a complete new Plan that replaces the prior one on the page. The new plan is correct, but the *transition* is invisible: the eat list, avoid list, habits, and insights all silently swap to their new state, and the user has no way to see what moved or why. The effect is that a recomposition reads as a replacement — the user loses the felt sense that this is one protocol evolving, and loses the single most motivating signal in the whole loop: proof that what they did (retested, adhered) changed what the plan recommends. The smallest meaningful unit of value is a deterministic, zero-network "since your last plan" summary rendered at the top of the Plan page when a prior plan exists: a structural diff of the two most recent plans — foods added / removed / frequency-or-portion changed on the eat list, items added / removed on the avoid list, habits added / retired, insights newly firing or now resolved — rendered as a short editorial list. It is pure computation over two Plan objects the app already stores; no inference, no new call, no schema. It turns the persistent timeline of *plans* (not just panels) into something the user can feel.

### Stakeholder

This deepens the **persistent timeline** moat along an axis it does not yet expose: the timeline of *plans*. Almanac stores every composed plan, but the user only ever sees the latest — the history of how the protocol evolved is data we hold and never surface. A plan-to-plan delta makes that history legible and, crucially, *causal*: it ties a change in the recommendation to the change in the inputs (a new draw, sustained adherence) that drove it. This is the structural argument against the "just paste it into Claude again" critique made visceral — raw Claude has no prior plan to diff against, so it cannot tell you "salmon went up because your omega-3 is still low after your last attempt." Only a product with a persistent, structured plan history can. It compounds with the adherence loop (the delta is where the loop becomes *visible* — "the iron habit retired because you held it and ferritin recovered") and with the retest surface (0028): the retest nudge gets the user to draw again; the delta rewards them for doing it. Together they close the loop and show the user it closed.

### User (at 7am on the phone)

I retested last week, the new numbers are in, I just hit recompose. The new plan loads, and instead of a wall of recommendations I have to re-read from scratch, the top of the page tells me what moved: "Since your last plan, three months ago — salmon moved from 2x to 3x per week (omega-3 index still below target). The iron-rich greens habit retired (ferritin reached the functional range). One habit was added: a 10-minute post-dinner walk. Two foods left the avoid list." I read it in fifteen seconds and I *feel* the progress — my biology changed, my effort counted, the plan responded. Then I scroll into the full plan as usual. The bad-path is graceful: if this is my first plan, there is nothing to diff and the summary simply does not appear; the page is exactly as it is today. It works offline, instantly, because both plans are already on my phone.

### Growth

This is a retention ticket with the most direct possible "your effort mattered" payoff — the single strongest driver of long-term adherence in any behavior-change product. Retention: a user who sees, in plain language, that retesting and adhering *changed their plan* has a reason to do it again; a user who sees a silent replacement does not. The delta is the reward that makes the loop self-reinforcing. (Hypothesis: surfacing the plan-to-plan delta materially raises the rate of third-and-later recompositions among users who reach a second plan, because it converts the abstract "the plan re-tunes" promise into a concrete, dated proof on their own data; back-of-envelope from how "what changed since you were last here" changelogs outperform silent updates for re-engagement — treat as untested without remote analytics.) The acquisition tail: the delta is screenshot-worthy in a way a static plan is not — "my plan literally retired a habit because my bloodwork fixed itself" is a more compelling thing to show a friend than the plan itself, because it is *evidence the system works over time*, which is the exact claim a skeptic doubts.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/plan/delta.ts` (new) exports `computePlanDelta(current: Plan, prior: Plan): PlanDelta` where `PlanDelta` is `{ eat: { added: EatItem[]; removed: EatItem[]; changed: { item: EatItem; was: string; now: string }[] }; avoid: { added: AvoidItem[]; removed: AvoidItem[] }; habits: { added: Habit[]; retired: Habit[] }; insights: { newlyFiring: string[]; resolved: string[] } }`. Items are matched across plans by a stable key (food name for eat/avoid, habit title for habits, insight id/title for insights — confirm the exact identity fields in `src/types.ts`). "changed" on the eat list captures a same-food frequency or portion change. Pure: no DOM, no Dexie, no network.
- [ ] The Plan page (`src/pages/plan.ts`) renders a "Since your last plan" summary at the top of the plan body when a prior plan exists. With exactly one plan (no prior), the summary is absent and the page is byte-for-byte unchanged from today. Asserted by composing one plan (no summary) versus seeding two plans (summary present).
- [ ] The summary's eyebrow reads "Since your last plan" and carries the elapsed span: "Since your last plan — <relative span, e.g. 'three months ago' / '6 weeks ago'>." Asserted against two plans with a known `createdAt` gap.
- [ ] An eat-list frequency change renders: "<food> moved from <was> to <now>." A removed eat item renders: "<food> retired from the eat list." An added eat item renders: "<food> was added — <frequency>." Asserted by seeding a prior plan with salmon 2x and a current plan with salmon 3x, plus one removed and one added food.
- [ ] A retired habit renders: "<habit> retired." An added habit renders: "<habit> was added." Asserted by seeding habit deltas in both directions.
- [ ] An insight that fires now but did not in the prior plan renders under a "newly noted" line; an insight present before and absent now renders under a "resolved" line: "<insight> — resolved." Asserted by seeding plans whose insight sets differ in both directions.
- [ ] When two consecutive plans are **identical** in eat/avoid/habits/insights (e.g. a re-roll with no input change), the summary renders a single honest line: "Nothing changed since your last plan — your inputs were the same." rather than an empty summary. Asserted by seeding two identical plans.
- [ ] The summary is computed with **zero network calls** — it diffs the two most recent plans read from IndexedDB. Asserted by rendering the Plan page and confirming the mock recorded zero requests during the delta computation/render.
- [ ] The delta uses the two most recent plans by `createdAt`; a third, older plan never contributes. Asserted by seeding three plans and confirming the summary diffs only the newest pair.
- [ ] Marker-tied copy resolves human marker names via `findMarker()` (e.g. "omega-3 index," not the raw key) wherever a delta line references a marker reason. Asserted by a delta whose change reason references a sex-specific or user-defined marker key.
- [ ] Renders on both **chromium and mobile-webkit**. Long food and habit names wrap cleanly at the 390 px viewport; the summary collapses gracefully (no horizontal overflow) when many items changed; it does not push the snapshot below the fold by more than one card height.
- [ ] Tour mode (0014) renders the summary against the tour's two-plan fixture if the fixture is shaped to demonstrate a delta (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the summary — the shared payload carries one protocol, not a history. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the delta is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the delta is computed on render from the existing `plans` table (which already stores every composed plan with `createdAt`). Nothing new is persisted.
- [ ] New `tests/e2e/plan-delta.spec.ts` covers: summary absent on first plan and present with a prior, eyebrow + elapsed span, eat frequency-change/add/remove copy, habit add/retire copy, insight newly-noted/resolved copy, identical-plans "nothing changed" line, newest-pair-only on three plans, marker-name resolution, zero-network during render, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated narrative of the change. The delta is a deterministic structural diff rendered in the editorial template voice; adding a Claude call to "summarize what changed" would add cost, latency, non-determinism, and a privacy egress to a feature whose value is being instant, local, and provably honest about the actual diff.
- A full version history / "view any past plan" browser. This ticket diffs the two most recent plans, at the moment the latest is shown. A timeline of all past plans is a separate, larger ticket; do not build a plan-history navigator here.
- Diffing the 7-day meal plan or grocery list. Meals are re-rolled independently and frequently (README); a meal diff would be noisy and is a different surface. Scope this to the Plan (eat/avoid/habits/insights), which changes only on recomposition.
- Editing or reverting to a prior plan from the summary. The delta is a read-only account of what changed; plan editing / reverting is not in scope and would need its own design.
- Showing the delta on Today or in the Markdown export (0027) in this ticket. The summary belongs on the Plan page at the moment the new plan is read. A "what changed" line elsewhere is a clean follow-up if this lands.
- A diff against any plan other than the immediately prior one (e.g. "compared to your first plan ever"). One step back, the most recent pair. A choose-your-baseline comparison is gold-plating.
- Visual diff styling (strikethroughs, red/green like a code diff). This is editorial prose, not a git diff — declarative lines in the almanac voice, ink and ink-soft, no color-coded add/remove.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/plan/delta.ts` (new) — `computePlanDelta(current, prior)` per the acceptance bullets. Confirm the Plan sub-shapes in `src/types.ts` first: the eat list item (`EatItem` — food/frequency/portion/marker reason), avoid item (`AvoidItem` — food/swap/reason), habit (`Habit` — title/cue/tier), and the insight shape the engine emits. Match items across plans by their natural identity field (food name, habit title, insight id/title). Resolve marker reasons to human names via `findMarker()` / `getAllMarkers`. Pure; the page passes both plans in.
- `src/pages/plan.ts` — the page already loads the latest plan and renders Dashboard / Read modes. Load the two most recent plans (`allPlans()` or the equivalent persistence helper sorted by `createdAt` desc), and when a prior exists, render the "Since your last plan" summary above the snapshot in both view modes (or at least the default mode — confirm which mode the page opens in and place the summary there; the summary must not break the Read/Dashboard toggle). Re-use existing section/eyebrow idioms.
- `src/db.ts` — read-only. Confirm the helper that returns all plans (or add a thin `recentPlans(n)` read if only `latestPlan()` exists today — a read-only convenience, no schema change). Do NOT alter the plans store.
- `src/types.ts` — add `PlanDelta` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.plan-delta` (the summary section), `.plan-delta__line` (one change line, ink-soft), re-using the existing small-caps eyebrow token. No new colors; ink and ink-soft only. Grid children get `min-width: 0` for long food/habit names (the documented overflow fix).
- `src/insights.ts` — read-only. The insight identity used for the "newly firing / resolved" diff must match how insights are stored on the Plan (by id or title); confirm the stored shape rather than re-running the engine. Do NOT re-run `insights.ts` to compute the diff — diff the insight sets already stored on the two Plan objects.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with the same `isSharedView()` / `isTour()` checks the Plan page already uses; shared-view never renders the summary, tour renders it only if the fixture provides a prior plan with a real delta.
- `tests/helpers/flows.ts` — re-use `composePlan` twice with different inputs to produce two plans; for precise control add a `seedPlan(page, plan)` helper that writes a fully-formed Plan to Dexie with a controlled `createdAt`, so the spec can construct exact deltas (salmon 2x → 3x, a retired habit, a resolved insight) without depending on generator output.
- `tests/e2e/plan-delta.spec.ts` (new) — every acceptance bullet maps to a `test()`. The frequency-change test seeds salmon at 2x in the prior plan and 3x in the current and asserts "salmon moved from 2x per week to 3x per week."
- `tests/e2e/privacy.spec.ts` — extend with a Plan-page visit carrying two plans, confirming zero off-allow-list egress during the delta render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: eyebrow "Since your last plan — <span>." Change lines are declarative: "<food> moved from <was> to <now>." / "<food> retired from the eat list." / "<habit> was added." / "<insight> — resolved." The no-change line is "Nothing changed since your last plan — your inputs were the same." No exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only; no diff coloring.

## Implementation log

- 2026-05-21 [implementation-dev] Picked up; branch `feat/0029-plan-delta`. Confirmed the
  domain sub-shapes against `src/types.ts` before writing code, and reconciled two
  ticket/code naming gaps that don't change the design:
  - The ticket's `Plan.createdAt` references map to the actual field `Plan.generatedAt`
    (the plans store is indexed on `generatedAt`). The delta uses `generatedAt` as the
    chronological key and the elapsed-span anchor.
  - The `recentPlans(n)` helper named in the engineering notes is unnecessary —
    `allPlans()` already exists and returns plans newest-first by `generatedAt`, with the
    tour/shared-view shims in place. The page reads the newest two from it; no new db helper.
  Identity fields confirmed: eat/avoid by `food`, habit by `title`, insight by `title`.
  Shared-view is excluded by construction (it never reaches the summary render path), and
  the tour fixture carries one plan only, so the tour shows no summary (never fabricated).
