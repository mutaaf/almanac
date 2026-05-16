---
id: 0012
title: Calm streak summary — your longest stretch, your last gap, no nagging
status: proposed
priority: P1
area: today
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a user who's been checking in for several weeks, I want a short, editorial summary above the 14-day strip — current stretch, longest stretch, last gap, days logged this month — so I can see what I'm actually doing without the app gamifying my biology with a streak counter that punishes me when I miss Tuesday.

## Why now (four lenses)

### Product Owner
The 14-day strip on Today is calm by design — it shows yesterday's adherence as a filled cell, not a flame emoji — but it doesn't summarize. A user with 30 days of check-ins has no way to answer "what's my longest run been?" or "when did I last miss?" without scanning the strip with their eyes. The smallest meaningful unit of value is four numbers, computed once on render, written in the editorial voice the rest of the app uses. Nothing new gets stored. The strip stays where it is.

### Stakeholder
The adherence loop is the moat — `formatAdherence` already feeds 14 days of `CheckIn` rows into the plan generator. Making the user *see* their own adherence with the same gentleness the LLM does deepens trust in the loop. It also says something specific about Almanac's editorial position: the calm summary is the anti-Duolingo, the anti-Snapchat, the anti-Streaks-app. The screenshot of "Your longest stretch: 11 days · Last gap: 3 days ago · Logged 22 of 31 days in May" reads like a journal entry, not a notification.

### User (at 7am on the phone)
I open the app on day 19. Above the streak strip, two lines in the body font: `On a 4-day stretch. Your longest this year was 11 days, back in March.` Below, smaller and quieter: `Logged 14 of the last 14 days · last gap was a Saturday.` That's it. No exclamation marks. No "keep going!" — that's a different app. If the run is 1 day, the line just says `Day one. The strip below fills in as you go.` If there's no current streak (a gap in the last 24 hours), the line says `Picked back up after a 3-day gap.` and shrugs.

### Growth
The retention play, plainly. A user who can see their longest run is more likely to come back to extend it. The "calm streak" framing also gives us a distinctive copywriting moment that travels well — it's the kind of UI screenshot that gets reposted in the "apps that don't manipulate you" conversation, which is exactly the audience we want. Hypothesis: surfacing the longest-stretch number adds roughly one extra check-in per user per week (measurable locally via `recentCheckIns(30).length` deltas before / after this ships, with no telemetry leaving the device).

## Acceptance criteria

- [ ] On Today, immediately above the existing `.streak-strip`, a new `.streak-summary` block renders two lines: a primary editorial sentence (display font, ~22ch max-width, no all-caps), and a single quiet sub-line in the body font with three facts joined by middots.
- [ ] The primary sentence is one of these deterministic templates, no LLM:
  - Current stretch `>= 2` and unbroken through today: `On a ${n}-day stretch. Your longest this year was ${m} days${m_when}.` — where `m_when` is `, back in ${monthName}` when the longest run wasn't the current one, else empty.
  - Current stretch `= 1` (today only): `Day one. The strip below fills in as you go.`
  - No check-in today, last gap `< 7` days: `Picked back up after a ${g}-day gap.` (uses the *previous* run's length implicitly by phrasing).
  - Zero check-ins ever: `No streak yet. Save today's check-in to begin.`
- [ ] The quiet sub-line shows three facts: `Logged ${x} of the last ${y} days` (where `y = 14` when there are >= 14 days of history, else the user's tenure), `last gap was a ${weekdayName}` (omitted if no gap in the last 14 days — sub-line collapses to two facts), and `longest run · ${m} days` (omitted on the first day).
- [ ] All four values come from a pure function `computeStreakSummary(checkins: CheckIn[], today: Day): StreakSummary` in a new `src/today/streak.ts`. The function is fully exercised through the E2E spec — no Vitest. A "checked in" day is defined as a `CheckIn` row with `habitsCompleted.length >= 1` (writing zero habits explicitly does not count, matching the existing strip's behavior).
- [ ] Renders identically on chromium and mobile-webkit; on mobile the primary sentence wraps to two lines without breaking the layout.
- [ ] Zero new Anthropic calls, zero new localStorage keys, zero new IndexedDB tables.
- [ ] Privacy E2E still passes.
- [ ] The block is **suppressed entirely** when the user has zero check-ins — the existing empty state on Today keeps its current behavior. (Regression assertion.)
- [ ] No emoji. No "🔥". No "keep going!". The acceptance test grep's the rendered HTML for those strings and asserts none are present.
- [ ] New `tests/e2e/today.spec.ts` scenarios cover each of the four sentence templates by seeding `db.checkins` with the relevant pattern via `page.evaluate` before opening Today.

## Out of scope

- A separate "streaks" page or detail view. The summary is two lines above the strip. That's the discipline.
- Notifications, sounds, or any kind of cross-day nudge. We have no notification surface and we don't want one.
- A "freeze" or "shield" mechanic that protects a streak across a missed day. The whole point is the strip already tolerates gaps — no rescue mechanic needed.
- Persistent storage of the longest-ever stretch. Recompute on every render; if a user wipes their data, the number resets — that's the right contract.
- Adjusting `formatAdherence` in `claude.ts`. The plan generator already gets the raw rows; it doesn't need the summarized form.

## Engineering notes

- `src/today/streak.ts` — new module, exports `computeStreakSummary(checkins: CheckIn[], today: Day): StreakSummary` and the `StreakSummary` shape. Pure; no DB import. The function walks the checkins newest-first and computes: `currentRun`, `longestRun`, `longestRunEndDay`, `daysLoggedRecent`, `windowDays`, `lastGapDays`, `lastGapWeekday`.
- `src/types.ts` — add the `StreakSummary` interface near the existing `RecapSummary` family (computed, not persisted).
- `src/pages/today.ts` — call `computeStreakSummary(recent, today())` where `recent` is already in scope (a slightly larger window than 14 is fine — pass `recentCheckIns(60)` instead of 14 so the longest-this-year number isn't truncated; rename the local variable to keep the streak strip math unchanged). Render the `.streak-summary` block immediately above the existing strip.
- `src/styles.css` — one new block `.streak-summary` with a `.streak-summary__line` (display font) and `.streak-summary__quiet` (body font, `--ink-faint`). Use the existing oxblood / ink tokens.
- `tests/e2e/today.spec.ts` — add a describe block `Today · streak summary` with one scenario per template, plus the regression for zero check-ins and the emoji-absence assertion.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

(empty — pick up via `/ship 0012`)
