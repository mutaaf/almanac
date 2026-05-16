---
id: 0008
title: Weekly recap — "this week in your protocol"
status: in-progress
priority: P1
area: today
created: 2026-05-15
owner: gtm-innovation
---

## User story

As a user who's been on the protocol for two weeks, I want to open Almanac on a Sunday morning and see a single-page recap of what I actually did — habits held, meals eaten, sleep / mood / energy trends, the one thing that moved most, and the one thing to try next week — so I have a reason to come back on the day of the week I'm most likely to plan.

## Why now (four lenses)

### Product Owner
We have a Today screen that's perfect for the daily ritual and a Plan screen that's perfect for the long-form protocol, but nothing for the weekly cadence — and weekly is the cadence most behavior-change research suggests actually works. The recap is the smallest meaningful unit of value because it composes existing primitives (CheckIn rows, habit stack, meals eaten) into a single artifact users want to revisit. Nothing new gets stored; one new view collects what's already there.

### Stakeholder
This deepens the **adherence loop** moat. The more reasons a user has to open the app, the more `CheckIn` rows accumulate, and the richer the next plan compose is (because `formatAdherence` reads from `recentCheckIns`). Sunday is the highest-leverage weekly touchpoint — it's when humans plan the week ahead. Owning that touchpoint without sending an email (we can't — no backend) is the local-first version of the weekly digest every wellness app sends. The recap also produces a screenshot-friendly artifact: a clean editorial summary of "your week" that travels well in a text to a friend.

### User (at 7am on the phone)
It's Sunday. I tap the app. A new card sits above Today's meals: "Week of May 4 — 5 of 7 mornings on the magnesium habit, 18 of 21 dinners on the eat list, sleep averaged 7h12m (up 24m from last week). The thing that's moving: energy at 4pm. The thing to try next week: hold the afternoon walk on Tuesdays and Thursdays." I tap "Open recap." Full-page summary. I can dismiss it for the week. It comes back next Sunday.

### Growth
This is the retention feature, plain and stated. A daily-only app loses its weekly-only users; a weekly-only app loses its daily-only users; both surfaces matter. The Sunday recap also produces a *shareable* artifact (see ticket 0010 for the PDF version) — friends seeing "week 3 of magnesium glycinate, adherence 18 of 21 nights" in the editorial almanac voice get the show-me moment without the friend ever having to upload their own labs first.

## Acceptance criteria

- [ ] A new route `#/recap` renders a single-page summary of the **completed** ISO week (Monday–Sunday). When opened on a Sunday it shows the current week (which is ending); on any other day it shows the most recent completed week.
- [ ] The Today screen shows a **Recap card** at the top of the page on Sundays only (local time, based on `new Date().getDay() === 0`). The card links to `#/recap`. The card is suppressed for the rest of the week.
- [ ] The recap surfaces six sections, in order:
  - **Adherence** — for each habit in the current `Plan.habitStack`, "N of 7" tallies computed from `CheckIn.habitsCompleted` over the week.
  - **Meals on plan** — count of `CheckIn.mealsAte` entries that match a meal id in the active `MealPlan` that week, vs total meals planned (e.g. "18 of 21").
  - **Signals** — averages for `signals.sleepHours`, `signals.mood`, `signals.energy` for the week, each with delta vs the prior week ("+24 min vs last week").
  - **What moved most** — the signal with the largest absolute week-over-week delta. Editorial sentence ("Sleep led the week: up 24 minutes per night on average.").
  - **The thing to try next week** — the lowest-adherence habit (if < 5/7) or the most-skipped meal slot (if any). Rendered as a single editorial sentence, no LLM call.
  - **The week in numbers** — date range, day count with at least one logged habit, day count with no check-in.
- [ ] The recap renders entirely from local data with **zero Anthropic calls**. Assert against the mock's request count.
- [ ] If there are fewer than 3 check-ins in the week, the recap shows an editorial empty state: "Not enough was logged this week to draw a picture. Tap Today and log what you remember." No broken averages.
- [ ] The Sunday recap card on Today can be dismissed; dismissal is stored in localStorage keyed by ISO week (`almanac.recap.dismissed.<isoWeek>`). Dismissed cards do not reappear the same week; the next Sunday a new card appears.
- [ ] Recap renders on both chromium and mobile-webkit. On mobile, the six sections stack; on desktop they use a two-column grid.
- [ ] Privacy E2E still passes (no new hostnames).
- [ ] New `tests/e2e/recap.spec.ts` covers: empty week, partial week, full week with deltas, Sunday card appearance + dismissal, navigation.

## Out of scope

- An LLM-generated weekly narrative. The recap is deterministic — that's part of the appeal (it shows up at 7am Sunday whether Anthropic is reachable or not).
- Email or push notifications. No backend. No notifications API.
- Multi-week comparison view ("last 4 weeks at a glance"). Future ticket if users ask.
- A "share this recap" button. That's ticket 0010 (printable one-page PDF).
- Editing past check-ins from the recap. The recap is a read view.

## Engineering notes

- `src/pages/recap.ts` — new file. Pure function: `computeRecap(weekStart: Day, checkins: CheckIn[], plan: Plan, mealPlan: MealPlan | undefined)` returns a `RecapSummary` object; renderer paints it.
- `src/types.ts` — add `RecapSummary` interface (six sections, no persistence — computed on read).
- `src/main.ts` — register `#/recap` route and import `renderRecap`.
- `src/chrome.ts` — add Recap to nav, but ONLY visible on Sundays OR when the user is currently on the recap page (so they can navigate back). Don't bloat the masthead the other six days a week.
- `src/pages/today.ts` — at the top of the page, when `new Date().getDay() === 0` and localStorage doesn't have the dismissed key for this ISO week, render the Recap card with a "Open recap" CTA and a "Not this week" dismiss link.
- ISO week helper: add `isoWeek(d: Date): string` (e.g. `2026-W19`) and `weekRange(d: Date): [Day, Day]` in `src/db.ts` near `today()`. Pure functions; no DB dependency.
- Adherence math: `tests/helpers/flows.ts` does not need to change. The compute function is unit-test-friendly but we test via the rendered page (the existing E2E pattern).
- Schema migration: **no** — recap is computed, not persisted.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

- 2026-05-15 — Dev agent picked up the ticket on branch `feat/0008-weekly-recap`. Status flipped to `in-progress`. Next step: failing E2E spec covering the six acceptance branches before any source change.
