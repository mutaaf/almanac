---
id: 0019
title: Protocol-anniversary milestone card — Day 30, 60, 90 since plan composition
status: proposed
priority: P2
area: today
created: 2026-05-19
owner: gtm-innovation
---

## User story

As a user who has been holding the same protocol for a full calendar month — past the novelty, before the next retest — I want a single editorial milestone card on Today on the day my plan turns 30 days old (and again at 60, 90, 180, 365), naming the longest-held habit in my stack with the exact streak length, the count of meals on-plan over the milestone window, and a one-line editorial cue that reads "this is what holding the line for a month actually looks like" — so that the day my protocol turns a month old feels like a moment in the app instead of an arbitrary Tuesday.

## Why now (four lenses)

### Product Owner

The Today screen now has three between-cadence surfaces: the Sunday recap card (ticket 0008), the quiet-day card on Mon–Sat (ticket 0015), and the daily ritual itself (meals + habits + streak strip). What's missing is a *calendar-anchored* surface that fires on protocol-anniversary days. The recap is week-aligned (always a Sunday). The quiet card is real-time-state-derived (fires when adherence is at risk, projection is in-window, or a meal slot is slipping). Neither fires on a day specifically because the *protocol itself* has reached a meaningful age. The smallest meaningful unit of value is a fourth precedence tier above the quiet card and below the Sunday recap: a `MilestoneCard` that fires on Day 30, 60, 90, 180, 365 since `latestPlan().generatedAt`, computing from local data the longest-held habit's streak (with the exact day count), the meals-on-plan count over the milestone window, and a one-line editorial cue derived from the magnitude. Like the quiet card, it's a pure function over local state — `pickMilestoneNote(state) → MilestoneNote | null`. Zero LLM call, zero new schema, zero new dep. Adds one new module and one precedence-chain line. The card is one tier higher precedence than the quiet card on those specific days (and one tier lower than the Sunday recap, so a Day-30 that lands on a Sunday is still the recap card, with the milestone subtly noted in the recap's eyebrow).

### Stakeholder

This widens the **adherence loop** moat into the protocol-age dimension that no Claude wrapper can replicate. The wrapper doesn't know when the user's protocol was composed; it doesn't know the user has held the same habit stack for 47 consecutive days; it cannot compose the editorial sentence "47 days of fish twice a week — your longest run yet." We can, deterministically, on local data, with zero network. The milestone surface also creates the *first* moment in the product where a user's *patience* — the property the editorial voice is structurally trying to reward — is recognized by name. The product's whole thesis is that biology moves slowly and the protocol you hold for 90 days is the protocol that works. The milestone card is the surface that makes that thesis legible from inside the daily ritual, which is the surface most likely to keep the user from churning during the slow weeks. It also produces a third class of share-worthy artifact: a screenshot of an editorial card that reads "Day 90 of your protocol — the omega-3 habit has held 78 of 90 days, your longest run by 31 days" with the cream-on-ink type from the rest of the app. Nobody else in the category renders that sentence; nobody else can.

### User (at 7am on the phone)

Wednesday, the day my plan turns 30. I open Almanac. Above today's meals, in the slot where a quiet card would normally sit, there's a different card — slightly taller, with a "Day 30" eyebrow in small caps. Headline: "Thirty days of the same protocol." Body: "Your longest-held habit is *omega-3 at lunch* — 26 of 30 days. You ate 21 of 30 meals on plan. Hold the same stack for the next 30 and the labs will start to tell a different story." Two small links underneath: "See the week's recap" (routes to `#/recap`) and "Plan a retest" (routes to `#/plan`). I read it. I tap "Plan a retest." Tomorrow morning the milestone card is gone (Day 31 doesn't fire); the quiet card or nothing renders in its slot. On Day 60 a different card with a different headline ("Two months of the same protocol — long enough for the slow markers to move") fires again, computed from the same local data with the updated counts.

### Growth

This is a retention feature for users 30+ days in — the cohort that has the most invested and the most to lose. The dropout curve in precision-health apps is steep between Day 30 and Day 90 (the gap between "novel" and "results"); a calendar-anchored surface that recognizes the patience explicitly is the cheapest single mechanic to flatten that curve. It also compounds with two earlier shipped features in a way the user feels: the quiet card (0015) was the daily reason-to-open mechanic, the recap (0008) was the weekly mechanic, and the milestone card is the *protocol-age* mechanic. Together they cover every cadence the user lives in. Hypothesis: a milestone surface fires on 4–6 mornings over the first 365 days of a protocol — small enough to feel earned, frequent enough to compound. Back-of-envelope from the Bear app's habit-streak surfaces and Headspace's "30 days of meditation" badges — treat as untested until we see whether users screenshot one of these cards. The viral angle is genuine: a Day-90 card that names the longest-held habit with the exact streak length is the editorial sentence a happy user will text a friend.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/milestone-card.ts` (new) exports a pure `pickMilestoneNote(state: MilestoneState): MilestoneNote | null` where `MilestoneState` is `{ today: Day; plan: Plan; checkins: CheckIn[]; mealPlan?: MealPlan }` and `MilestoneNote` is `{ kind: "day-30" | "day-60" | "day-90" | "day-180" | "day-365"; eyebrow: string; headline: string; body: string; ctas: Array<{ label: string; href: string }> }`. The function returns `null` when today's date is not one of the milestone days for the latest plan's `generatedAt`. Milestone day = `addDays(planGeneratedDay, N)` where N ∈ {30, 60, 90, 180, 365} and `planGeneratedDay` is the local date of `latestPlan().generatedAt`.
- [ ] The card fires on exactly one local date per milestone — the *day* matches, not a window. A user who opens the app on Day 29 sees no card; Day 31 sees no card; Day 30 sees the card. (Real-world skips happen — a user who opens on Day 32 missed the Day-30 surface. The card is a moment, not a backlog. The quiet card or nothing fires on Day 32 instead.)
- [ ] The `body` text names the longest-held habit by `habit.title` and reports the exact streak as "{hit} of {windowDays} days" where `windowDays` is the milestone N. The longest-held habit is computed by counting, for each habit in `plan.habitStack.habits`, the number of distinct days in the window `[planGeneratedDay, today]` where `checkin.habitsCompleted.includes(habit.id)`. Ties broken by habit list order in `plan.habitStack.habits`.
- [ ] The `body` text also reports the count of meals on plan over the window: "{ate} of {planned} meals on plan." Computed from check-ins' `mealsAte` joined against `mealPlan.days[*].breakfast.id|lunch.id|dinner.id`. When no mealPlan covers the window, the meals-on-plan sentence is omitted (not rendered with a zero).
- [ ] The `eyebrow` is small caps "Day {N}" (e.g. "Day 30"). The `headline` is one editorial sentence per milestone, hand-written, in the voice:
  - day-30:  "Thirty days of the same protocol."
  - day-60:  "Two months of the same protocol — long enough for the slow markers to move."
  - day-90:  "Three months. The point at which biology starts to tell the story back."
  - day-180: "Six months. This is the cadence labs were always going to reward."
  - day-365: "A year of the same protocol. Almost nothing else in your day has held this long."
- [ ] The `ctas` array always contains exactly two entries: `{ label: "See the week's recap", href: "#/recap" }` and `{ label: "Plan a retest", href: "#/plan" }`. The CTAs are stable across all five milestones — the editorial restraint is part of the spec; this is one card, two actions, never more.
- [ ] Precedence on the Today screen: on Sundays the Sunday recap card wins; on Mon–Sat, the milestone card wins over the quiet card (the quiet card is suppressed entirely on milestone days). On a Sunday that is also a milestone day, the Sunday recap card renders as today, AND its eyebrow gains a milestone-aware suffix (e.g. "A Sunday note · Day 30") — the recap renderer reads `pickMilestoneNote()` once and conditionally appends.
- [ ] The card is dismissable for the day with the same mechanism the quiet card uses (`localStorage["almanac.milestone.dismissed." + today()] = "true"`). Dismissed cards do not reappear the same day. The next milestone (Day 60 from a Day-30 dismissal) fires on its own day independently.
- [ ] The card renders entirely from local data with **zero Anthropic calls**. Assert against the mock's request count over a full Today page load + render.
- [ ] On the **sample tour** (ticket 0014), the sample fixture's `Plan.generatedAt` is configured so that the tour's "today" lands exactly on a Day-30 milestone — the tour now demonstrates this card to pre-consent visitors the same way ticket 0015's quiet card was demonstrated. The fixture adjustment is minimal: change `generatedAt` to the tour's frozen-today minus 30 days; the existing fixture's other dates do not need to shift.
- [ ] Privacy E2E still passes — no new hostnames, no new requests.
- [ ] Renders on both **chromium and mobile-webkit**. The card uses the same `.recap-card` foundation the quiet card uses; layout reflows via the existing breakpoint pattern.
- [ ] New `tests/e2e/milestone-card.spec.ts` covers: card fires on Day 30 with the correct headline + body + CTAs; card does NOT fire on Day 29 or Day 31; card fires on Day 60 with the Day-60 headline; the longest-held habit is named correctly when two habits have different streaks; ties resolve by habit-list order; meals-on-plan sentence is omitted when no mealPlan covers the window; Sunday recap card wins precedence over milestone card on a Day-30-that-is-Sunday and the recap eyebrow includes the milestone suffix; quiet card is suppressed on milestone days; dismiss-for-the-day persists across same-day reloads; tour state surfaces a Day-30 card; zero-network assertion across a full page load.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated milestone message. The headline per milestone is hand-written; the body is computed deterministically. A second LLM call on the most-opened surface is exactly what the editorial voice rejects (see 0015's same anti-goal).
- A "milestone history" page or a per-milestone archive. The card is a moment, not a record. If a user opens the app on Day 32, the Day-30 card is gone — and that is the design.
- A push notification or browser notification for milestone days. No notifications API; no backend; the surface lives on the screen the user already opens.
- A "share this milestone" PNG generator like the marker share card (ticket 0011). The card's body includes the user's habit titles which could leak personal preferences; v1 is screen-only. A future ticket could ship a redacted share-card variant if asked for.
- Custom milestone days set by the user ("remind me on Day 45"). The milestones are fixed: 30, 60, 90, 180, 365. Editorial restraint; the user does not configure the cadence.
- A "compose a new plan" CTA on the milestone card. The card's two CTAs are recap and retest — both are right-sized for "the protocol is still holding." A "recompose" CTA at Day 30 would push users to churn the protocol exactly when patience is the point.
- Trend visualization within the milestone card (mini sparklines, mood-over-the-window graphs). The card is one sentence + two CTAs. Visualizations belong on `#/progress` or `#/recap`.
- A milestone for the meal plan's age. The meal plan re-rolls independently of the Plan; a meal-plan-anniversary is a different cadence and would dilute the editorial moment. If meal-plan staleness becomes a real concern, it gets its own ticket.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/milestone-card.ts` (new) — exports `pickMilestoneNote(state)` (pure) and `MilestoneState` / `MilestoneNote` types. The five milestone definitions live as a single `const MILESTONES: Array<{ n: number; headline: string }>` at the top of the module so adding a new milestone (say, Day 14 or Day 730) is one line of edit + one acceptance bullet. The function iterates `MILESTONES`, picks the one whose `addDays(planGeneratedDay, n)` equals `today`, and returns the computed note; returns `null` when no milestone matches.
- `src/types.ts` — add the `MilestoneNote` / `MilestoneKind` shapes alongside the `QuietDayNote` types from 0015.
- `src/pages/today.ts` — read `latestPlan` / `latestMealPlan` / `recentCheckIns(365)` and pass them to `pickMilestoneNote()`. (Note: the existing `recentCheckIns(14)` window from the quiet card is not enough; the milestone card needs the full protocol window. Add a `recentCheckIns(N)` overload if not already present — it is, since 0008 already calls `recentCheckIns(21)`.) Render the returned note in the same DOM slot the quiet card and the recap card use. Apply the precedence chain: Sunday recap → milestone → quiet → nothing.
- `src/pages/recap.ts` — when `pickMilestoneNote()` returns non-null on a Sunday that is a milestone day, the recap's eyebrow conditionally appends "· Day {N}" alongside its existing "A Sunday note" label. This is the only change to `recap.ts` — the rest of the recap renderer is untouched.
- `src/today/quiet-card.ts` — the quiet card's precedence stays the same; the page-layer chain in `today.ts` is what suppresses the quiet card on milestone days. No change needed inside the quiet-card module itself.
- `src/styles.css` — re-use `.recap-card` as the foundation; add `.recap-card--milestone` for the slightly taller layout and the eyebrow's small-caps "Day N" tag. No new color tokens.
- `src/db.ts` — `latestPlan()` already returns `generatedAt`; no change. `addDays()` and `today()` are already exported (used by recap + projection). No new helpers needed.
- `src/sample/fixture.ts` — adjust `Plan.generatedAt` so that today − generatedAt = 30 days for the tour. Document the adjustment in a comment inside the fixture so future curators understand why the date is offset.
- `tests/helpers/flows.ts` — add `seedPlanGeneratedDaysAgo(page, days)` that writes a Plan with `generatedAt` set to today − N days via `page.evaluate` against Dexie. Re-use in the milestone spec for each of the five milestone variants. The pattern mirrors `seedCheckInsForAdherenceAtRisk` from 0015.
- `tests/e2e/milestone-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. Re-use `composePlan` then call `seedPlanGeneratedDaysAgo(page, 30)` to position the test panel at the milestone. Use `page.clock.setFixedTime` to anchor today to a known weekday (Wednesday for the Mon–Sat tests, Sunday for the Sunday-recap-wins test) — the same trick the recap spec uses (see 0008's implementation log for the `install` deadlock gotcha).
- `tests/e2e/recap.spec.ts` — extend with one scenario asserting the eyebrow suffix appears on a Day-30-that-is-Sunday. Existing scenarios stay untouched.
- `tests/e2e/quiet-card.spec.ts` — extend with one scenario asserting the quiet card is suppressed on a milestone day even when its predicate would otherwise fire. Existing scenarios stay untouched.
- `tests/e2e/sample-tour.spec.ts` — extend with one scenario asserting the milestone card renders for the tour. Existing scenarios stay untouched.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for the headlines: editorial, declarative, no exclamation, no "amazing/journey/exciting", no emoji. The five headlines in the acceptance bullets are the canonical voice — the dev may tweak punctuation but not tone.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0019-milestone-card` opened
- YYYY-MM-DD — failing tests added in `tests/e2e/milestone-card.spec.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
