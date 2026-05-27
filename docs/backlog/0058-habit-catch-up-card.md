---
id: 0058
title: The habit catch-up card — retroactively log the past week from a compact grid on Today
status: groomed
priority: P1
area: today
created: 2026-05-23
owner: gtm-innovation
---

## User story

As a user who opened Today on Sunday and hasn't logged a check-in since Monday, I want a compact "catch up on this week" grid right on Today that lets me tap to mark what I actually did across the past several days, so that I can honestly close the gap in one place instead of either marking everything done out of guilt or — far more likely — abandoning the check-in entirely because logging four missed days one screen at a time isn't worth it.

## Why now (four lenses)

### Product Owner

The daily check-in is the primary retention mechanism — it's what the adherence loop reads, and it's the reason to open the app on a day with no new labs. But it has a brittle failure mode: it only ever lets you log *today*. A user who misses three days comes back to a Today screen that silently forgot the gap, and the realistic responses are bad ones — mark everything done in a guilt-driven sweep, or give up on the streak strip and stop checking in at all. There's no honest middle. The smallest meaningful unit of value is a "Catch up on this week" card that appears on Today *only* when there's a real gap (≥2 of the past 7 calendar days have no check-in for any habit). It shows a compact 7-day × N-habit grid — like a mini contribution graph — where every cell is a tap-to-toggle checkbox that retroactively writes (or clears) that habit's completion on that day. A one-line tally reads "You have N unchecked days this week — mark what you actually did." When every one of the past 7 days has at least one habit checked, the card disappears. It turns four screens of friction into one grid, and it's honest because the user is in control of each cell.

### Stakeholder

This hardens the **adherence loop** moat at its leakiest joint: the loop only compounds if check-in data keeps arriving, and the single biggest cause of it stopping is a multi-day gap the user can't cheaply repair. A retroactive grid keeps the timeline dense and the loop's input alive — and it does it without the one tool a no-backend product is forbidden from using: a push notification. The card is the privacy-clean re-engagement primitive — it does nothing until the user opens the app, then offers a one-tap repair instead of a guilt trip. A chat box has no per-day, per-habit check-in store to back-fill, no concept of "the days you missed this week," and nothing to render a grid against; this is structurally a feature of a persistent, per-day adherence timeline. And because it reads and writes the existing `checkins` store with no new schema, it deepens the moat for free — denser adherence data feeds smarter recompositions, which is the compounding the loop depends on.

### User (at 7am on the phone)

Sunday morning, coffee not yet made. I open Today and there it is, calm and small above my meals: "Catch up on this week — you have 4 unchecked days." A little grid: my three habits down the side, the last seven days across the top, the cells I already logged on Monday filled in, the rest empty. I tap the squares for the walks I actually took Wednesday and Thursday, the magnesium I remembered most nights, and skip the days I genuinely missed — because the point is what's true, not a clean row. Each tap fills the cell instantly. When I've marked the week honestly, the card just goes away; the strip below shows my real shape. Wet hands, no typing, no four-screen slog — one grid, a handful of taps, done. It worked offline because it's all my own data on my own phone.

### Growth

This is a pure retention ticket aimed squarely at the failure mode that kills the daily ritual: the multi-day lapse that turns into a permanent one. (Hypothesis: a one-tap catch-up grid raises the rate at which a lapsed user resumes daily check-ins, versus a Today screen that only logs the current day and silently drops the gap — because the marginal cost of repairing four missed days collapses from four screens to one, and an honest, in-your-control repair carries none of the shame that makes users abandon a broken streak; back-of-envelope from how low-friction back-fill and "you can fix this in one place" mechanics retain habit-app users through lapses; treat as untested without remote analytics, which we will never add.) The "show me" frame is quieter than a share card but real: "it let me just fill in the week I missed, honestly, in one grid — no guilt, no nagging notification" is exactly the considered, anti-pressure detail the persona cites when recommending the app over the tracking apps that burned them out. It is the lapse-repair sibling of the welcome-back surface (0018): that re-orients a long-absent user, this lets a recently-slipped one close the small gap before it becomes a long one.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/catch-up.ts` (new) exports `computeCatchUp(habits: Habit[], checkIns: CheckIn[], now: Date): { days: { day: Day; cells: { habitId: string; done: boolean }[] }[]; uncheckedDayCount: number } | null`. It builds the 7-day × N-habit grid for the past 7 calendar days (the documented span: the 7 days ending today, inclusive), reading each cell's `done` from whether `habitId` is in that day's `CheckIn.habitsCompleted`. `uncheckedDayCount` is the number of those 7 days with ZERO habit completions. Returns `null` (no card) when `uncheckedDayCount < 2`. Pure: no DOM, no Dexie, no network. Asserted by seeding known check-ins and confirming the grid contents and the unchecked-day count, and that fewer than 2 empty days returns null.
- [ ] The Today page (`src/pages/today.ts`) reads the past 7 days of check-ins (via `allCheckInsInWindow`) and renders the "Catch up on this week" card when `computeCatchUp(...)` is non-null. The card shows the compact grid: habit names as row labels, the 7 calendar dates as column labels, and a tap-to-toggle checkbox per cell. Asserted by seeding a plan with 2+ habits and a gap of ≥2 empty days, and confirming the grid renders with the right row/column labels and cell states.
- [ ] The card's tally line reads "You have N unchecked days this week — mark what you actually did." with N equal to `uncheckedDayCount`. Asserted by seeding a known gap and confirming the tally text and number.
- [ ] Tapping a cell that is OFF adds the habit id to that day's `CheckIn.habitsCompleted` (creating the check-in row for that day if none exists), and the cell reflects `done` on re-render. Asserted by tapping an empty cell, re-reading, and confirming the persisted check-in and the filled cell.
- [ ] Tapping a cell that is ON removes the habit id from that day's `habitsCompleted` (leaving the row, possibly empty, or removing it per the documented rule), and the cell reflects the cleared state on re-render. Asserted by tapping a filled cell and confirming the cleared persisted state and empty cell.
- [ ] The card DISAPPEARS once every one of the past 7 days has at least one habit checked (i.e. `uncheckedDayCount` drops below 2, then to 0). Asserted by toggling cells until each day has a completion and confirming the card is absent on re-render.
- [ ] The card is ABSENT when fewer than 2 of the past 7 days are empty — including the common case of a user who checks in most days. Asserted on a profile with check-ins on 6 of the past 7 days (the card does not render).
- [ ] The card is ABSENT when there is no composed plan / no habit stack (nothing to grid). Asserted on a profile with no plan.
- [ ] Retroactive writes go through the SAME `upsertCheckIn` path the daily check-in uses (read the day's existing row, merge the habit id, write) — no second persistence mechanism, and the `&day` unique index is respected (one row per day). Asserted by toggling cells across multiple days and confirming exactly one check-in row per affected day.
- [ ] The existing daily check-in on Today — today's habit rows, the meal cards, the streak strip, the retest/quiet-day/pre-draw cards — is unchanged in behavior; the catch-up card is purely additive and sits at the documented slot (above or below the meals). Asserted by exercising the existing Today check-in flow and confirming it is unchanged, and that today's column in the grid stays in sync with the live habit rows.
- [ ] Renders on both **chromium and mobile-webkit**. The 7-day grid fits the 390 px viewport (scrolls sideways if needed, per the 0053 grid pattern); each cell is a ≥44×44 css px tap target where layout allows, or the documented compact-cell exception with an accessible hit area; long habit names respect `min-width: 0`. Asserted on both projects.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string, and the card makes **zero Anthropic calls** and **zero network calls** — it is a pure read/write of the local `checkins` store. Asserted by seeding a sentinel key, rendering the card, toggling cells, and confirming the key appears nowhere and the mock recorded zero requests.
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT render the card (tour/shared-view have no real timeline and `upsertCheckIn` already short-circuits them with the inline notice). Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is a local read/write with no inference; no new hostnames.
- [ ] Schema migration: **no** — the card reads and writes the existing `checkins` store via the existing helpers. Nothing new is persisted.
- [ ] New `tests/e2e/habit-catch-up.spec.ts` covers: the grid contents + unchecked-day count, the card present at ≥2 empty days and absent below 2, the tally copy/number, toggling on/off persists via `upsertCheckIn` (one row per day), the card disappears when the week is covered, absent with no plan, the existing Today check-in unchanged, tour/shared-view absence, zero Anthropic + zero network, the key never appears (sentinel), mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A push notification, web-push, badge, or service-worker reminder to "catch up." AGENTS.md forbids the server side and the README's no-pressure posture forbids nag mechanics. The card appears only when the app is opened; it never reaches out.
- A "mark all done" bulk button. The honesty of the feature is per-cell control — the user marks what is true, not a guilt-driven sweep. No "fill the week" shortcut.
- Editing the day's mood / energy / sleep signals retroactively. The grid is habit completions only (the `habitsCompleted` array). Back-filling signals is a separate, larger surface.
- Logging meals (`mealsAte`) retroactively from this card. The catch-up grid is habits only; meals are tied to the meal plan's per-day rows and belong to the existing Today meal cards.
- A span longer than 7 days, or a configurable window. The card covers exactly the past 7 calendar days — the "this week" the copy promises. The full-history view is the 0053 consistency grid on Progress (a separate ticket); do not duplicate it here.
- Streak-shaming or loss-framed copy. The tally is a neutral count ("you have N unchecked days"), never "you broke your streak" or "don't lose your progress." No consecutive-day pressure.
- A second persistence path or a new check-in store. The card reuses `upsertCheckIn` and `allCheckInsInWindow`; do not introduce a new write helper or schema.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/catch-up.ts` (new) — `computeCatchUp(habits, checkIns, now)`. Build the 7 day strings ending at `now` (local YYYY-MM-DD, the same `Day` format `db.ts` uses). For each day, map each habit to `{ habitId, done: row?.habitsCompleted.includes(habitId) ?? false }`. `uncheckedDayCount` = days where no habit is done. Return null when `uncheckedDayCount < 2`. Pure; no Dexie import.
- `src/pages/today.ts` — the page already reads `recentCheckIns(14)` for the streak strip and `checkInFor(day)` for today; add an `allCheckInsInWindow(start, end)` read for the past 7 days (the helper exists in `src/db.ts` from 0021) and pass it + `plan.habitStack.habits` + `now` to `computeCatchUp`. Render the card at the documented slot. Each cell's tap handler reads the target day's existing check-in (`checkInFor(day)`), merges/removes the habit id, and writes via `upsertCheckIn` (the SAME upsert the live check-in uses at the bottom of `bindCheckIn`). Re-render the card (and keep today's column in sync with the live habit rows) after each toggle.
- `src/db.ts` — read-only reuse: `allCheckInsInWindow(startDay, endDay)`, `checkInFor(day)`, `upsertCheckIn(...)` already exist and handle the `&day` unique index, tour, and shared-view short-circuits. Do NOT add a new helper.
- `src/types.ts` — no new persistent types; cells are an internal type in `catch-up.ts`. `CheckIn.habitsCompleted: string[]` is the field read/written.
- `src/styles.css` — `.catch-up` (the card), `.catch-up__grid` (the 7×N grid), reusing the 0053 habit-grid cell idioms if 0053 has shipped (otherwise a small CSS grid of squares). Sideways-scroll on overflow at 390 px. Cells use only ink / oxblood / cream — no new colors. Grid children `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the card with `!isTour() && !isSharedView()`; `upsertCheckIn` already short-circuits both, but the card itself should not render in either mode.
- `tests/helpers/flows.ts` — reuse the existing check-in-seeding helper (the per-day `checkins` seed used by 0021/0053 specs; respect the `&day` unique index — seed unique days, per the documented LESSON). Add a `seedCheckIns(page, rows)` helper if one isn't already shared.
- `tests/e2e/habit-catch-up.spec.ts` (new) — every acceptance bullet maps to a `test()`. The toggle test taps a cell, re-reads the `checkins` store, and asserts the persisted `habitsCompleted` change and exactly one row per day; the disappear test toggles until each day has a completion and asserts the card is gone.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying a gap, rendering and toggling the card, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — reuses the existing `checkins` store.
- Voice spec: the card eyebrow reads "Catch up on this week"; the tally reads "You have N unchecked days this week — mark what you actually did." Declarative, neutral, no streak-shame, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the filled-cell state.

## Implementation log

(Appended by the implementation-dev agent during execution.)
