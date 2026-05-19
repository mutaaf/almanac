---
id: 0015
title: Quiet-day card on Today — a reason to open the app on a Wednesday
status: in-progress
priority: P1
area: today
created: 2026-05-18
owner: gtm-innovation
---

## User story

As a user three weeks into the protocol, opening Almanac on a Wednesday morning when nothing is otherwise happening, I want a single editorial card at the top of the Today screen that surfaces the most useful between-cadence note about my actual state — the marker projection closest to its expected window, the adherence streak that's about to break, the meal slot I've skipped two weeks running — so that the daily surface gives me a reason to read it on the days when the recap hasn't fired and a new lab hasn't arrived, instead of feeling like a checklist I'm overdue on.

## Why now (four lenses)

### Product Owner

We have shipped four cadences: daily (Today), weekly (Recap, ticket 0008), mid-protocol (Projection, ticket 0012), per-lab (Plan recompose). Today is the most-opened surface in the app — it's where the daily ritual lives — but its content is structurally identical every weekday: three meals, the habit stack, the streak strip, an optional feelings panel. The Sunday recap card (also from 0008) is the only thing that ever changes about Today, and it only changes on the seventh of seven days. The smallest meaningful unit of value here is one card slot at the top of Today that, on any non-Sunday day, surfaces *the one note that is most useful right now*, computed deterministically from local data. The note has a precedence order — adherence-at-risk wins over projection-window-open wins over meal-skipped-pattern wins over nothing — and renders zero, one, or never two cards. The card is the editorial line ("Two more days like this week and your magnesium habit goes from 'held' to 'slipping'.") plus a single tap-target that routes to the surface where the user can act on it. No LLM call. No new schema (the card composes existing primitives: `recentCheckIns`, `latestPlan`, `getProjectionsFor`, `latestMealPlan`). One new pure function: `pickQuietDayNote(state) → QuietDayNote | null`.

### Stakeholder

This is the surface that turns the **adherence loop** moat into a load-bearing daily mechanic. Today, the adherence loop is consumed once at plan-composition time (the `formatAdherence` block in `src/claude.ts`) and once on Sundays (the recap). That means a user's daily check-ins only materially affect what they see *next week* or *next compose*. With the quiet-day card, every individual check-in changes what the user sees the next morning — the card's precedence and copy are derived from the same `recentCheckIns(14)` series the prompt reads. This is the compounding shape we want: the daily input has a same-day daily output. It also widens the surface where the deterministic insight engine and the projection module (0012) demonstrate their value — projections that have been quietly sitting on `#/progress` now get surfaced on the surface the user actually opens. None of this is reproducible by a Claude wrapper: the wrapper doesn't have the longitudinal check-ins, the projection snapshots, the meal-eaten history, or the rule precedence baked in.

### User (at 7am on the phone)

Wednesday, week 3. I open the app. A small card sits above Today's meals, in the same slot the Sunday recap occupies on Sundays: "You've held the magnesium habit 4 of 7 days this week. Two skipped days from now and the 14-day average drops below the easy tier — the plan will need to re-rank it." Below the line: a small "Open habits" link that scrolls down to the habit stack on this same page. I read it. I tap a habit. Tomorrow morning the same card might be missing (because I held the line) or might show a different note ("Your ferritin projection window opens this week — your next draw would be the first useful one."). I don't ever see a card that fires for no reason. On a day where I'm doing fine and nothing is due, the card simply isn't there, and Today reads exactly as it does now.

### Growth

This is the retention feature, plain and stated. The recap (0008) was the weekly retention lever. The projection (0012) was the between-draws lever for the Progress surface. The quiet-day card is the **daily** between-cadences lever — it makes Today different on enough mornings that the user's reflex to open the app survives the 30+ days between lab uploads, which is the period in which most precision-health apps lose their users. It is also the surface that produces the next class of share-worthy artifact: an editorial one-liner ("Your ferritin projection window opens this week — your next draw would be the first useful one.") in the editorial almanac voice, dropped on a Today screen above three meal cards. Nobody else in the category renders that sentence because nobody else has the local-only adherence + projection + meal-history substrate to compute it from. (Hypothesis: a daily surface that varies its lead card based on real-time local state lifts the 14-day retention rate by 8–15% relative to a static Today; this is back-of-envelope from comparable patterns in Streaks and Bear — treat as untested until we have the local-only telemetry to compare against the pre-0015 baseline.)

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/quiet-card.ts` (new) exports a pure `pickQuietDayNote(state: QuietDayState): QuietDayNote | null` where `QuietDayState` is `{ today: Day; plan: Plan; checkins14: CheckIn[]; mealPlan?: MealPlan; projections: ProjectionSnapshot[]; sampleWeekStart: Day }` and `QuietDayNote` is `{ kind: "adherence-at-risk" | "projection-window" | "meal-skipped-pattern"; headline: string; body: string; cta: { label: string; href: string } }`. The function returns `null` when no note qualifies (the empty state — the card is fully omitted from the page, not rendered with a placeholder).
- [ ] Precedence order: `adherence-at-risk` > `projection-window` > `meal-skipped-pattern`. Only the first match returns; the function does not stack notes. A test passes a state that satisfies two kinds and asserts the higher-precedence one is what's returned.
- [ ] `adherence-at-risk` fires when at least one habit in `plan.habitStack.habits` has held fewer than `Math.ceil(0.5 * 14) = 7` of the last 14 days AND the most-recent 7 of those 14 days are trending worse than the prior 7 (more skipped days in the latest week than the prior one — the "you were doing it then, you're slipping now" signal). The headline names the habit by title; the body is one editorial sentence; the CTA is "Open habits" and routes to `#/today` with a `data-scroll="habits"` attribute the page reads to scroll the habit stack into view.
- [ ] `projection-window` fires when at least one `ProjectionSnapshot` row exists for a marker AND today's date falls within the `[weeksOut[0], weeksOut[1]]` window measured from the snapshot's `createdAt`. The headline names the marker; the body says "Your next draw would be the first useful one"; the CTA is "Plan a retest" and routes to `#/plan` (the retest block lives there; future ticket can deep-link).
- [ ] `meal-skipped-pattern` fires when the same meal slot (breakfast / lunch / dinner) on the same weekday across two consecutive weeks shows `mealsAte` NOT containing the meal id from `mealPlan.days[slot]`. The headline names the day and slot; the body says "Two weeks of this slot have slipped. Want to swap it permanently?"; the CTA is "Swap this slot" and routes to `#/meals?day=YYYY-MM-DD` for the upcoming instance of the slot.
- [ ] The Today screen renders the quiet-day card in the slot currently occupied by the Sunday recap card on Sundays. On Sundays, the recap card takes precedence — the quiet-day card is suppressed entirely. On Monday–Saturday, the quiet-day card renders when `pickQuietDayNote()` returns non-null. When both Sunday-recap-dismissed AND a quiet-note would fire on a Sunday, the Sunday recap still wins (the recap is a calendar-aligned ritual; the quiet card is the everyday fallback).
- [ ] The card is dismissable for the day: tapping the small "Not today" link sets `localStorage["almanac.quiet.dismissed." + today()]` to `"true"`. Dismissed cards do not reappear the same day. The next morning a fresh computation runs and a card may or may not appear based on the new state.
- [ ] The card renders entirely from local data with **zero Anthropic calls**. Assert against the mock's request count over a full Today page load + render.
- [ ] On the **sample tour** (ticket 0014), the quiet-day card renders against the tour's sample state — exercising the same code path against the canned fixture. The tour's fixture is shaped so a known card type fires deterministically (the simplest: an adherence-at-risk habit baked into the sample). This validates that the card works for the demo audience too, not only real users.
- [ ] Privacy E2E still passes — no new hostnames, no new requests.
- [ ] Renders on both **chromium and mobile-webkit**. The card layout reflows via the existing breakpoint pattern.
- [ ] New `tests/e2e/quiet-card.spec.ts` covers: empty-state (no card on Today for a fresh user with no projections / no adherence concerns / no meal pattern); adherence-at-risk fires and the CTA scrolls to habits; projection-window fires and the CTA routes to plan; meal-skipped-pattern fires and the CTA routes to the right meal day; precedence resolves correctly when two kinds qualify; the card is dismissed for the day via localStorage; Sunday recap wins over the quiet card; tour state surfaces a card; zero-network assertion across a full page load.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated daily note. The whole point is that the note is deterministic, lives in the same editorial voice on the same day for the same data, and works without network. A second LLM call on every Today render would also bloat token spend on the surface the user opens most.
- A push notification or browser notification version of this card. No notifications API; no backend; the card lives on the surface the user already opens, not on a surface the app tries to reach the user through. The whole point of an "open the app on Wednesday" lever is that it pays off when the user opens the app, not when we ping them.
- Stacking multiple notes. The card is one note, one CTA. Stacking turns it into a dashboard and defeats the editorial discipline.
- A general "tips for the day" card with curated content (e.g. "drink water"). The card only fires when there is a *real, computed* signal from the user's own data. Generic content is filler.
- Personalized timing ("show this card at 7am only"). The card is render-time, not schedule-time. It computes whenever the user happens to open Today.
- A history page of past notes. Notes are computed fresh each render; they are not persisted. If a user reopens later in the day the same note might still fire (until dismissed for the day).
- Extending the quiet card to surface insights from the rule engine (`src/insights.ts`). Those live on the Plan page already; surfacing them on Today would mean two surfaces compete for the same content. Different cadence, different home.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/quiet-card.ts` (new) — exports `pickQuietDayNote(state)` (pure) and `QuietDayState` / `QuietDayNote` types. The three rule predicates live as private helpers inside this module so the precedence ordering is a single linear chain at the top — easy to reason about, easy to extend (a future ticket might add a `compose-overdue` or `meal-plan-stale` kind; the discipline is one new helper + one new line in the precedence chain).
- `src/types.ts` — add the `QuietDayNote` shape. The `QuietDayState` shape can stay private to the module (it's a function argument, not a stored type).
- `src/pages/today.ts` — read `latestPlan` / `latestMealPlan` / `recentCheckIns(14)` / `getProjectionsFor(latestPanel.id)` (the helper exists, ticket 0012 added it) and pass them to `pickQuietDayNote()`. Render the returned note in the same DOM slot the recap card uses today; suppress the quiet card on Sundays when the recap card is rendering. Wire the dismiss link and the CTA. The scroll-to-habits CTA uses `document.querySelector("[data-scroll='habits']")?.scrollIntoView({ behavior: "smooth", block: "start" })`; tag the habit stack section with `data-scroll="habits"` so the selector is stable.
- `src/styles.css` — re-use the existing `.recap-card` block as the foundation; add a `.recap-card--quiet` variant for the dismissal-line styling. No new colors. The card eyebrow reads "A note for today" in small caps, matching the Sunday recap card's "A Sunday note" eyebrow.
- `src/db.ts` — `getProjectionsFor()` already exists (ticket 0012). No change needed unless the projection module needs a "snapshots whose window covers today" filter helper, in which case add a one-liner `projectionWindowOpenToday(snapshots)` that the quiet-card module imports.
- `src/sample/fixture.ts` (from ticket 0014) — when 0014 lands first, the tour fixture's check-in pattern needs at least one habit that satisfies the adherence-at-risk predicate so the quiet card fires on the tour. If 0015 ships first, this is a sibling concern documented for the 0014 dev to pick up; if 0014 ships first, this ticket's PR adjusts the fixture in the same commit.
- `tests/helpers/flows.ts` — add `seedCheckInsForAdherenceAtRisk(page)` and `seedProjectionWindowOpen(page)` helpers that write the right `checkins` / `projections` rows via `page.evaluate` against Dexie so the spec can drive each rule deterministically without having to drive 14 days of the UI.
- `tests/e2e/quiet-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. Re-uses `composePlan` / `addManualPanel` / the seed helpers. The zero-network assertion follows the same pattern as the recap spec.
- `tests/e2e/recap.spec.ts` — extend with one new scenario: "Sunday recap card wins over a quiet-day-note state". The existing recap tests stay untouched.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for the card copy: editorial, declarative, no exclamation, no "amazing/journey/exciting". One sentence in the body, one CTA. The card never says "click here" — the CTA names what happens ("Open habits", "Plan a retest", "Swap this slot"). Examples in the acceptance bullets are the canonical voice.

## Implementation log

### 2026-05-18 — implementation-dev

Picked up. Branch `feat/0015-quiet-day-card`. Status flipped to in-progress.
