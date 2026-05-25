---
id: 0061
title: Marker goals — pin a target value on any suboptimal marker and watch the trend close on it
status: proposed
priority: P1
area: progress
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a user whose ferritin has been trending at 28, 31, 36 across three draws, I want to pin a personal target of 80 on that marker so that each new draw shows me not just "where I am" but "how far to go" — and when I finally cross 80, the app marks it as reached instead of silently updating the trend line.

## Why now (four lenses)

### Product Owner

The Progress page today shows where the user IS relative to functional range. It doesn't show where the user is going relative to a specific goal they set. Without a named goal, the trend is just data; with a goal, every new draw is progress-toward-something. The smallest meaningful unit of value is: (1) a "Set goal" affordance on any marker row in Progress that stores a `{ markerKey, targetValue }` pair on the user's Profile; (2) a goal-line rendered on that marker's sparkline at the target level; (3) a "goal reached" milestone card when a new draw lands a value on the right side of the target. That's one new Profile field, one new persistent type, one new UI element on an existing sparkline, and one new milestone condition — all local, all offline.

### Stakeholder

The goal mechanic turns the adherence loop into a closed loop with an explicit terminal state, which is the deepest moat-deepener available at this stage of the product: users who set a goal have a named reason to retest, a named reason to follow the protocol, and a named "proof it worked" moment that is the exact share artifact acquisition depends on. It deepens the persistent-timeline moat because the goal lives on the Profile alongside the protocol and the timeline — it's not recoverable from a chat app that has no memory of what you were trying to achieve. And it does this without a backend, a notification, or any inference: the goal is a single number per marker, set once, read by the sparkline renderer.

### User (at 7am on the phone)

On Progress, I tap my ferritin row. A small "Set a goal" field appears below the sparkline — it pre-fills with the upper end of the functional range (100) as a suggestion. I tap, type 80, tap Done. A thin horizontal line appears on the sparkline at 80. The trend is at 36. Next month I'm at 52. The line is still above me, but closer. Three months later, I'm at 84. The trend crosses the goal line, and a calm card appears: "Ferritin reached 80. Goal set 90 days ago." Then the goal auto-archives (or I can set a new one). The sense that the protocol is working, against a target I chose, is the strongest reason I've had to keep using the app.

### Growth

Goals create the most specific "show me" screenshot in the product: a trend line crossing a named goal that the user set months ago. "I set a goal of 80 for my ferritin and hit it in three draws" is the story that makes a health-curious friend ask how. (Hypothesis: users who set at least one marker goal have a materially higher 90-day retention rate than those who don't, because the goal creates a reason to retest and return; back-of-envelope from how goal-completion mechanics compound habit-app retention by anchoring the user to a specific near-future event, rather than an open-ended health journey; treat as untested without remote analytics, which we will never add.) The milestone card ("Ferritin reached 80") is the highest-confidence share artifact the product can generate — it's verifiable, specific, and personal in a way no generic health metric can be.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The Profile type (`src/types.ts`) has an optional `goals?: MarkerGoal[]` field where `MarkerGoal = { markerKey: string; targetValue: number; setAt: string; reachedAt?: string }`. Additive — existing profiles load with `goals === undefined` (treated as `[]`). Dexie bumps to v10 (or the next version after any in-flight migrations). Asserted by a migration test confirming a prior-version export imports with no profile-field loss and an empty goals array.
- [ ] A "Set goal" affordance appears on any marker row in Progress (on the detail expanded state or the trend sparkline section). Asserted by seeding a panel with a known marker, opening Progress, and confirming the set-goal affordance is present on that marker's row.
- [ ] Tapping "Set goal" shows an inline input pre-filled with the top of the marker's functional range. Asserted by tapping and confirming the input renders and carries the correct pre-fill value.
- [ ] Saving a goal persists `{ markerKey, targetValue, setAt: today }` into `Profile.goals` via the existing profile-save path. Asserted by saving a goal, reloading, and reading `Profile.goals` from IndexedDB to confirm the entry.
- [ ] The marker's sparkline on Progress renders a horizontal goal-line at `targetValue` for any marker with an active (not yet reached) goal. Asserted by seeding a goal and confirming the goal line is present in the sparkline SVG.
- [ ] When a new panel draw lands a value that crosses the goal (for a "higher is better" marker: value ≥ targetValue; for a "lower is better" marker: value ≤ targetValue), a "goal reached" milestone card appears on Progress (or Today) naming the marker, the target, and the draw date. The `goal.reachedAt` field is set on first crossing. Asserted by seeding a goal at a value below (or above) the next panel's result, adding the panel, and confirming the milestone card appears and `reachedAt` is written.
- [ ] A reached goal's sparkline shows the goal line as "reached" (visually distinct — e.g., filled/colored — vs. the pending goal line). Asserted by seeding a reached goal and confirming the visual distinction.
- [ ] Goals can be cleared (the set-goal affordance changes to "Edit goal / Clear goal" when an active goal exists). Clearing removes the entry from `Profile.goals`. Asserted by setting then clearing a goal and confirming the entry is gone.
- [ ] The "goal reached" milestone card makes **zero Anthropic calls** and **zero network calls**. Asserted by adding a crossing draw and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the goal UI or any intermediate string. Asserted by seeding a sentinel key.
- [ ] The existing Progress flows — trend cards, compare-two-draws, latest-values, improvement card (0047), marker deep-dive tap (0059 if shipped) — are unchanged in behavior. Asserted by running the existing Progress flows and confirming they are unchanged.
- [ ] Renders on both **chromium and mobile-webkit**: goal-line renders correctly on the 390 px sparkline; set-goal input is usable; milestone card respects `min-width: 0`; affordances are ≥44×44 css px tap targets (min-height ≥45 px). Asserted on both projects.
- [ ] Privacy E2E still passes — no new hostnames.
- [ ] New `tests/e2e/marker-goals.spec.ts` covers: Profile migration, set-goal input renders + saves, sparkline goal line, milestone card + reachedAt, reached visual state, goal clear, zero Anthropic/network, sentinel key, existing Progress flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- Goals on markers the app does not track (user-defined markers from 0002 are included if they have a known direction; unknown-direction markers show the input but the milestone logic must document how direction is determined).
- Shared goals or "challenge a friend" mechanics. Goals are local-only on the user's Profile.
- Goal notifications (push, email). The milestone card appears on Progress/Today when the app is opened after the crossing draw — no reaching-out.
- Automatic goal suggestion by the AI. The input pre-fills with the functional range top as a sensible default; the user types their own target. No LLM call for goal recommendation.
- A goal timeline or historical log of all goals ever set. Active and reached goals are shown; a "past goals" archive is a possible future ticket.
- Goals on meal or habit metrics (step counts, sleep scores). Marker goals are lab-value goals only.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/types.ts` — add `MarkerGoal = { markerKey: string; targetValue: number; setAt: string; reachedAt?: string }` and add `goals?: MarkerGoal[]` to `Profile`.
- `src/db.ts` — bump to Dexie v10 (or the next version after any in-flight migrations — grep for the highest `.version(N)` call). New `.version(10).stores({...})` block, additive. `Profile.goals` is optional; no data migration required for existing profiles. Migration test: seed a v9 profile (without `goals`), export, import, confirm `goals === undefined`.
- `src/pages/progress.ts` — the page already builds per-marker series maps. For markers with an active goal, pass the `targetValue` into the sparkline renderer as a new `goalLine?: number` prop. Add the set-goal affordance to the marker row (the expanded detail section, or a tap-to-expand interaction — pick one and document). Wire the save through `db.updateProfile({ goals: [...existingGoals, newGoal] })`.
- `src/viz.ts` — extend the `sparkline()` helper to accept an optional `goalLine` parameter and render a horizontal SVG `<line>` at the mapped y-position. Use a thin dashed line for "pending" and a solid line for "reached" (distinguish via a boolean `goalReached` prop). Reuse the existing functional-range band's coordinate math.
- Goal-crossing detection: after any new panel is added (the `addPanel` / `panelsFromText` / CSV path if 0062 ships), run `checkGoalCrossings(plan, profile, newPanel)` and update `goal.reachedAt` if crossed. The direction heuristic: look at the marker's `MarkerDef.functionalRange` — if `low > 0` (a "higher is better" marker) crossing is value ≥ targetValue; if the marker has only an upper bound (a "lower is better" marker) crossing is value ≤ targetValue; for two-sided ranges, default to "higher is better" and document it. A reached goal is only written once (`reachedAt` must be undefined before setting).
- Milestone card: reuse the receipt/milestone card idiom from 0032 (the marker-moved receipt) and 0021 (the hundred-day mark). A plain card on Progress (and Today if already open) reading "Ferritin goal reached. You targeted [N], your latest draw shows [M]." Ink and ink-soft; no exclamation. The card is dismissible (writes a `dismissedAt` flag or removes itself after one session).
- `tests/e2e/marker-goals.spec.ts` — seed goal via `db.updateProfile`, seed panels via `seedPanel` (the existing IndexedDB seed helper), then navigate to Progress. The sparkline goal-line test reads the SVG via `page.locator('svg line[data-goal]')` or a selector the implementation documents.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **yes** — Dexie v10, additive `Profile.goals?`.
- Voice: "Set goal" / "Edit goal" / "Clear goal" — imperative, lowercase. Milestone reads "Ferritin goal reached." No emoji, no "amazing," no "journey." Ink; oxblood for the reached milestone only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
