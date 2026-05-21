---
id: 0034
title: You earned the next tier — show the user the adherence that promoted a habit when the plan recomposes
status: groomed
priority: P2
area: plan
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who held the easy tier reliably for three weeks and just recomposed my plan, I want the new plan to tell me — at the moment a habit steps up in difficulty — that *my own adherence is why* ("You held the post-dinner walk 16 of the last 21 days, so the plan moved it from a 10-minute to a 25-minute walk"), so that the central promise of the adherence loop — that what I actually do shapes what the plan asks of me next — stops being an invisible mechanism described in the README and becomes a dated, earned acknowledgment on my own data, the moment it happens.

## Why now (four lenses)

### Product Owner

The adherence loop is the product's signature mechanism: the last fourteen check-ins feed the next composition, and a reliably-held easy tier lets the next plan promote to moderate. It works — and it is completely invisible. The user holds a habit, recomposes, and the new habit quietly arrives at a harder tier with no acknowledgment that *they earned it*. The single most motivating fact in the whole loop — "your effort changed what the plan asks" — is silently swallowed. The plan-delta (0029) shows *what* changed; this shows *why a step-up was earned*, which is a distinct and more emotional signal. The smallest meaningful unit of value is a deterministic, zero-network "earned" annotation on the plan-delta's habit lines: when a habit's tier increased between the prior plan and the current one, and the user's adherence on that habit cleared a threshold over the relevant window, render one line tying the promotion to the held days — "<habit> stepped up from <easy> to <moderate> — you held it <N> of the last <M> days." It reads the check-ins and the two plans, all already on the device. It depends on 0029 for the habit-diff plumbing but carries its own self-contained value.

### Stakeholder

This is the **adherence loop** moat made legible at the exact instant it pays off — the structural answer to "why isn't this just a Claude wrapper?" rendered on the user's own behavior. Raw Claude has no record of what the user did; it cannot say "you held this, so I promoted it," because it never saw the holding. Only a product with a persistent check-in history and a persistent plan history can tie a promotion to an earned adherence. This compounds three moat assets at once — the adherence loop (the held days), the persistent timeline (the prior plan to diff against), and the structured artifact (the tier field on the habit) — into one sentence the competitor structurally cannot write. It is the highest-density proof of the loop's value the product can produce, and it lands at the moment of maximum receptivity: the user is reading their fresh plan, wondering whether their effort mattered. A backend product could compute this, but on data the user shipped to its server; Almanac computes it from check-ins that never left the device.

### User (at 7am on the phone)

I retested, recomposed, the new plan loads. The "since your last plan" summary (0029) is at the top, and one of its habit lines reads differently from the rest: "The post-dinner walk stepped up from 10 to 25 minutes — you held it 16 of the last 21 days." I feel it land — not "the plan changed," but "I did this; the plan responded to me." It is the difference between being prescribed to and being met. A habit I let slip is honest too: it did not promote, and nothing pretends I earned a step-up I did not. The whole thing rendered instantly, offline, because my check-ins and both plans are already on my phone — no call, no wait.

### Growth

This is the purest "your effort mattered" payoff in the product, and that is the single strongest driver of long-term behavior-change retention. Retention: a user who is shown, in plain language and on their own data, that holding a habit *earned a real change in their plan* has a concrete reason to hold the next one; the loop becomes self-reinforcing in a way a silent promotion never could. (Hypothesis: surfacing the earned-promotion line raises sustained habit adherence and the rate of a third recomposition among users who reach a second plan, because it converts the abstract adherence-loop promise into felt, dated proof — back-of-envelope from how progress-acknowledgment in behavior-change apps outperforms silent difficulty-scaling; treat as untested without remote analytics, which we will never add.) The "show me" frame is quietly compelling: "the app promoted my habit because I actually did it" is evidence the system adapts to *you*, which is exactly the claim a skeptic of "generic AI advice" doubts most.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/plan/earned-promotion.ts` (new) exports `computeEarnedPromotions(current: Plan, prior: Plan, checkIns: CheckIn[], now: Date): EarnedPromotion[]` where `EarnedPromotion` is `{ habitId: string; title: string; fromTier: Tier; toTier: Tier; heldDays: number; windowDays: number }`. For each habit matched across the two plans (by title — confirm the stable identity field with 0029's matcher) whose tier increased (easy → moderate, easy → advanced, moderate → advanced), it counts the days within the window (default the last 21 days ending at `now`, or the span between the two plans' `createdAt`, whichever the engineering note settles on) where the habit id appears in a `CheckIn.habitsCompleted`, and emits a row only when `heldDays / windowDays` clears a threshold (e.g. ≥ 0.66). Habits whose tier did not increase, or whose adherence did not clear the threshold, produce no row. Pure: no DOM, no Dexie, no network.
- [ ] On the Plan page, the "Since your last plan" summary (0029) renders the earned-promotion line for any qualifying habit IN PLACE OF (or directly beneath, per the engineering note's chosen layout) that habit's generic "stepped up" delta line. The line reads exactly: "<habit> stepped up from <fromTier> to <toTier> — you held it <heldDays> of the last <windowDays> days." Asserted by seeding a prior plan with a habit at `easy`, a current plan with the same habit at `moderate`, and 16 of the last 21 days of check-ins holding it.
- [ ] A habit whose tier increased but whose adherence did NOT clear the threshold renders the plain 0029 step-up line (no "you held it …" claim) — the app never credits an unearned promotion. Asserted by seeding a tier increase with only 4 of 21 held days and confirming the generic line, not the earned line.
- [ ] A habit whose tier was UNCHANGED renders exactly as 0029 renders it today — no earned annotation. Asserted by seeding two plans with an identical-tier habit.
- [ ] A NEW habit (present in current, absent in prior) renders as 0029's "added" line — a brand-new habit cannot have been "promoted." Asserted by seeding an added habit and confirming no earned line.
- [ ] When the prior plan has no matching habit id/title to compare a tier against, no earned line is computed (nothing to step up from). Asserted by a habit whose title differs across the two plans.
- [ ] The annotation is computed with **zero network calls** — it reads the two plans and the check-ins from IndexedDB only. Asserted by rendering the Plan page and confirming the mock recorded zero requests during the computation/render.
- [ ] The window and held-day counts are deterministic given a fixed `now` — the spec drives `now` via Playwright's clock API (or relative check-in seeding) so "16 of the last 21 days" is reproducible. Asserted by seeding exactly 16 of 21 days and confirming the rendered counts.
- [ ] Marker / habit names render verbatim from the plan's `habitStack` (the habit `title`); no marker-key leakage. Asserted by confirming the habit's human title renders, not its id.
- [ ] Renders on both **chromium and mobile-webkit**. Long habit titles wrap cleanly at the 390 px viewport; the earned line respects `min-width: 0` (the documented overflow fix); the line does not push the summary's other content into horizontal overflow.
- [ ] Tour mode (0014) renders an earned line only if the tour fixture provides a prior plan, a current plan with a real tier step-up, AND fixture check-ins that clear the threshold (otherwise the generic 0029 line — never fabricated). Shared-view mode (0017) does NOT render the summary at all (per 0029), so no earned line appears there. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the annotation is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — computed on render from the existing `plans` and `checkins` tables (habits already carry `tier` via the `Tier` type; check-ins already carry `habitsCompleted`). Nothing new is persisted.
- [ ] New `tests/e2e/earned-promotion.spec.ts` covers: earned line present when a tier step-up clears the adherence threshold, generic line when the step-up is unearned, no annotation on an unchanged-tier habit, no annotation on an added habit, no computation when no prior habit matches, exact held/window counts under a fixed clock, zero-network during render, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated congratulation. The line is a deterministic transform of held days + tier deltas, rendered in the editorial template voice; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose value is being instant, local, and provably honest about the actual adherence.
- Gamification — points, badges, streak-multipliers for earning a promotion. The README's no-dark-patterns / no-streaks-as-pressure rule holds; this is one calm, honest acknowledgment, not a reward loop. No confetti, no levels.
- Demoting a habit's surfaced line when adherence slipped ("you dropped to easy because you missed days"). A demotion is sensitive and risks reading as scolding; if the plan generator demotes a tier, 0029's plain step-down line already states it without an accusatory adherence annotation. This ticket only annotates earned step-UPS.
- Changing how the plan generator decides promotions. The generator's adherence-aware composition is unchanged; this ticket only *explains* a promotion that already happened, by reading the same check-in history the generator saw. It does not move the threshold or alter the prompt.
- Shipping before 0029. The earned annotation lives on 0029's habit-delta lines and reuses its habit matcher. 0029 is the prerequisite; this is the self-contained adherence layer on top. If 0029 has not shipped, this waits — but remains a single shippable unit once 0029 lands, not a multi-phase plan.
- Surfacing the earned line on Today or in the Markdown export (0027). It belongs on the Plan page within the "since your last plan" summary, at the moment the new plan is read. An echo elsewhere is a clean follow-up if it earns it.
- Carrying the annotation into the doctor PDF (0010/0016) or the share link (0017). It is a personal, dated acknowledgment of the user's own effort; it does not belong in the clinical hand-off or a shared protocol.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/plan/earned-promotion.ts` (new) — `computeEarnedPromotions(current, prior, checkIns, now)` per the acceptance bullets. Reuse 0029's habit-matching identity (title) so the earned set and the delta set agree on which habits are "the same" across plans. The `Tier` ordering (easy < moderate < advanced) is in `src/types.ts`. Settle the window: prefer the span between the two plans' `createdAt` if both are known and ≥ ~14 days, else the trailing 21 days ending at `now` — document the choice in the file and the spec. Threshold ≥ 0.66 held/window. Pure; the page passes plans + check-ins + `now` in.
- `src/plan/delta.ts` (from 0029) — read-only consumer. The Plan page composes 0029's `PlanDelta` and this module's `EarnedPromotion[]`; where a habit appears in both `delta.habits` (as a step-up) and the earned set, the renderer prefers the earned line. Do not duplicate 0029's diff logic — call it.
- `src/pages/plan.ts` — the page already renders 0029's "Since your last plan" summary. Load the check-ins (`recentCheckIns(...)` or `allCheckInsInWindow(...)` from `src/db.ts`, both already exist) plus the two most recent plans (0029's read), compute the earned set, and substitute/append the earned line on the relevant habit rows. Re-use existing section/eyebrow idioms; no new card primitive.
- `src/db.ts` — read-only. `recentCheckIns(days)` and `allCheckInsInWindow(startDay, endDay)` already exist; pick the one that matches the chosen window. Do NOT alter the checkins or plans store.
- `src/types.ts` — add `EarnedPromotion` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — reuse 0029's `.plan-delta__line`; the earned line needs no distinct color (ink-soft, like the rest of the summary). No new colors. Grid children get `min-width: 0` for long habit titles.
- `src/share/shared-state.ts` / `src/sample/state.ts` — the summary is already gated by 0029; the earned line inherits those gates. Tour renders it only when the fixture supplies the full earned setup.
- `tests/helpers/flows.ts` — reuse 0029's `seedPlan(page, plan)` helper (controlled `createdAt`, controlled habit tiers) plus a check-in seeding helper that writes exactly N of the last M days holding a habit id (mind the `&day` UNIQUE index — seed unique days, per the 0021 lesson in `docs/LESSONS.md`). Drive `now` via Playwright's clock API.
- `tests/e2e/earned-promotion.spec.ts` (new) — every acceptance bullet maps to a `test()`. The earned-line test seeds a habit `easy → moderate` and 16 of the last 21 days held, asserting "you held it 16 of the last 21 days."
- `tests/e2e/privacy.spec.ts` — extend with a Plan-page visit carrying two plans + check-ins, confirming zero off-allow-list egress during the render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the earned line reads "<habit> stepped up from <fromTier> to <toTier> — you held it <heldDays> of the last <windowDays> days." Declarative, no exclamation, no praise-words. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
