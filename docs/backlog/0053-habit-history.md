---
id: 0053
title: Habit history — a full check-in calendar grid on Progress showing every logged day per habit, like a contribution graph
status: groomed
priority: P2
area: progress
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a user who has been marking my habits most days for a couple of months, I want a "consistency record" on Progress — a calendar grid per habit, one small cell per day, filled where I held the habit and empty where I logged the day but skipped it — so that the slow, real shape of my adherence is one thing I can see at a glance, the way I would read a contribution graph, instead of being flattened into a fourteen-dot strip that only ever shows the last two weeks.

## Why now (four lenses)

### Product Owner

The check-in is the daily ritual the whole protocol reads from, and the user can see almost none of it. The Today strip shows the last fourteen days; the milestone surface (0041, groomed) acknowledges a run at thresholds; the earned-promotion line (0034, groomed) explains a tier step-up. None of them let the user *see the whole shape* of their adherence — the months of held and missed days, per habit, at a glance. The check-in data is rich (every day's `habitsCompleted`) and almost entirely invisible. The smallest meaningful unit of value is a "Your consistency record" section on Progress: for each active habit in the current plan, a labeled row showing a 90-day calendar grid (or from the first check-in to today, whichever is shorter — pick one and document it), one cell per day in three states — filled (checked in with that habit marked), empty (the day was logged but the habit was not marked), absent (no check-in that day). The grid renders as a CSS grid (or SVG) of small squares in the existing palette (ink / oxblood / cream — no new colors). Tapping a cell shows the day's date, or nothing — mobile-simple is fine. It is a pure, deterministic render of the local check-in data; no inference, no network. It turns the write-only check-in stream into a legible, ownable picture of consistency.

### Stakeholder

This deepens the **adherence loop** and **persistent timeline** moats by making the loop's own input visible as an artifact — the months of daily work the loop reads but never reflects back at full resolution. A contribution-graph-shaped view of every logged day per habit is a thing only a product with a persistent, per-day, per-habit check-in store can render; a chat box has no record that you held a habit yesterday, let alone a 90-day shape of it. It compounds the surfaces it sits beside without duplicating them: the milestone (0041) acknowledges *that* you kept a run, the earned-promotion line (0034) explains *what* a run unlocked, and this shows *the whole pattern* — one source of truth (the `checkins` table) rendered three ways for three jobs. The compounding-state lock-in the moat depends on is most visceral when the user can see the months they have invested: a dense grid of held days is a record that exists nowhere else and gets harder to abandon the longer it fills in. And it does it inside the privacy contract — a pure render of IndexedDB data, no egress, no new schema, reading the existing `checkins` table.

### User (at 7am on the phone)

A quiet Sunday, two months in. On Progress, below my marker trends, a new section: "Your consistency record." For each habit, a little grid of squares — the post-dinner walk, mostly filled, a clean run with a couple of gaps where I traveled; the magnesium, nearly solid; the morning sunlight, patchier, which is honest and which I can see I should work on. It is the shape of my actual effort, not a number and not a streak that shames me for one missed day — just the real pattern, held and missed, laid out like a calendar I can read in a second. If a grid overflows my phone's width it scrolls sideways. I tap a square and it shows me the date. It rendered instantly, offline, because every check-in is already on my phone — nothing was fetched, nothing was sent.

### Growth

This is a retention-and-moat ticket whose audience is the resident — the user with enough logged days that the grid is worth reading. Retention: a user who can see two months of held days laid out has the invested time made tangible and ownable, which is the gentlest, most honest reason to keep the daily ritual going — without the loss-framed pressure of a consecutive-day streak the README forbids. (Hypothesis: a full-resolution consistency grid raises long-run check-in retention, because seeing the accumulating shape of one's effort sustains a habit where a fourteen-dot window cannot show enough to feel like progress — the same pull that retains users of contribution-graph and habit-grid views; treat as untested without remote analytics, which we will never add.) The "show me" frame is the grid itself: a clean, typed, two-month consistency record in the editorial palette is a screenshot the persona is quietly proud to post — "this is 90 days of holding a protocol" — and unlike a generic streak counter it is the real, gapped, honest pattern, which is the kind of evidence-shaped artifact a friend asks about. It is the visual-history sibling of the milestone (0041): the milestone speaks at thresholds, this shows the whole picture.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/progress/habit-history.ts` (new) exports `buildHabitGrid(habitId: string, checkIns: CheckIn[], now: Date): { day: Day; state: "filled" | "empty" | "absent" }[]`. For each day in the rendered span (from the first check-in to `now`, capped at the most recent 90 days — document the chosen span and cap), it returns the cell state: `filled` when a check-in exists for that day AND `habitId` is in its `habitsCompleted`; `empty` when a check-in exists for that day but `habitId` is NOT in `habitsCompleted`; `absent` when no check-in exists for that day. Pure: no DOM, no Dexie, no network. Asserted by seeding a known mix of held / logged-but-not-held / unlogged days and confirming each cell's state.
- [ ] The Progress page (`src/pages/progress.ts`) renders a "Your consistency record" section below the marker trends. For each habit in the current plan's `habitStack`, a labeled row renders the grid from `buildHabitGrid(...)` — one cell per day. Asserted by seeding a plan with two habits and check-ins, and confirming two labeled grid rows render with the correct cell counts.
- [ ] The cell states render distinctly using only the existing palette (ink / oxblood / cream — confirm the exact tokens): filled, empty, and absent are visually distinguishable with NO new colors introduced. Asserted by confirming the three cell states map to three distinct existing-palette classes and that no new color token is added to `src/styles.css`.
- [ ] The grid shows exactly the days from the first check-in to today, capped at 90 days (the documented span) — a user with 40 days of history shows 40 cells from their first check-in; a user with 200 days shows the most recent 90. Asserted by seeding 40 days (40 cells) and seeding 200 days (90 cells), confirming the cell counts.
- [ ] The "Your consistency record" section is ABSENT when there are no check-ins, or when there is no current plan (no habits to grid). The existing Progress page is byte-for-byte unchanged in that state. Asserted on a profile with a plan but no check-ins, and on a profile with check-ins but no plan.
- [ ] Tapping a cell shows the day's date (a tooltip or inline label) — OR the cells are non-interactive (mobile-simple). Pick one and document it; the spec asserts the chosen behavior. Asserted by the documented tap behavior (date shown, or no-op confirmed).
- [ ] The grid is computed and rendered with **zero Anthropic calls** and **zero network calls** — it is a pure render of the local `checkins` table against the current plan's habits. Asserted by rendering Progress and confirming the mock recorded zero requests during the grid computation/render.
- [ ] The Anthropic key NEVER appears in the section or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the consistency-record section.
- [ ] The existing Progress marker trends (sparklines with the functional-range band, and any movement/projection surfaces) are byte-for-byte unchanged in behavior — the consistency record is purely additive below them. Asserted by exercising the existing marker trends and confirming they are unchanged.
- [ ] Renders on both **chromium and mobile-webkit**. The grid is horizontally scrollable when it overflows the 390 px viewport (a 90-cell row must not break the layout or clip silently — it scrolls); habit labels wrap cleanly; tap targets, if interactive, are reachable on mobile-webkit. Asserted by confirming a 90-day grid scrolls horizontally at the mobile viewport without overflowing the page.
- [ ] Tour mode (0014) renders the consistency record against the tour fixture's check-ins if the fixture carries them (otherwise the section is absent — never fabricated). Shared-view mode (0017) does NOT render it — the shared payload carries no check-in history. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the grid is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the grid reads the existing `checkins` table (`CheckIn.day` and `CheckIn.habitsCompleted` already exist) and the current plan's `habitStack`. Nothing new is persisted.
- [ ] New `tests/e2e/habit-history.spec.ts` covers: the grid renders for each habit in the current plan, filled / empty / absent states correct given the seeded check-in data, the documented span (first-check-in-to-today capped at 90), absent with no check-ins and absent with no plan, the documented tap behavior, the existing marker trends unchanged, zero Anthropic + zero network calls, the key never appears (sentinel), horizontal scroll on overflow at the mobile viewport, tour vs shared-view behavior.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A consecutive-day streak counter or any "don't break your streak" framing on the grid. The README's no-streaks-as-pressure rule holds: the grid shows held and missed days honestly, with gaps visible and unpunished. No streak number, no reset-on-miss, no loss-framed copy.
- A new color or palette token for the cell states. The three states (filled / empty / absent) map to the existing ink / oxblood / cream palette only. Introducing a green-to-red heatmap would both break the editorial aesthetic and import the gamified contribution-graph affect the product avoids.
- An aggregate "consistency score" or percentage over the grid. The grid IS the artifact; a single number flattens it. The milestone (0041) already carries the "N of the last M days" count for the threshold moments; this is the full, un-summarized shape.
- A new dependency for the grid render. It is a CSS grid (or hand-drawn SVG) of small squares — no charting library, no calendar-heatmap package. Reuse the existing viz/SVG helpers in `src/viz.ts` if a square-grid primitive is cleaner there.
- Per-day detail beyond the date (mood/energy/sleep, meals eaten) on cell tap. The cell shows at most the date; the day-level detail lives on Today. A rich per-day popover is a separate, larger design.
- Gridding habits that are not in the current plan (e.g. a habit from a prior plan the user has since retired). The section grids the *current* plan's habits only; historical-habit gridding is a possible follow-up but is not the minimum value and risks a cluttered, confusing surface.
- Carrying the consistency grid into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). The Markdown export (0027) already carries an adherence summary in text; this is the in-app visual surface. (An image-share of the grid is a plausible future growth ticket, sibling to the improvement card 0047, but is out of scope here.)

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/habit-history.ts` (new) — `buildHabitGrid(habitId, checkIns, now)` per the acceptance bullets. Determine the span: the earliest `CheckIn.day` to `now`, capped to the most recent 90 days (document the cap). Iterate the span day by day, mapping each to `filled` / `empty` / `absent` from the check-in for that day and whether `habitId` is in its `habitsCompleted`. Identify the habit by the stable id `habitsCompleted` references (confirm whether check-ins store the habit id or title — match whatever the adherence loop and 0034 use). Pure; the page passes the check-ins + `now`.
- `src/pages/progress.ts` — render the "Your consistency record" section below the existing marker trends, one labeled row per habit in `latestPlan().habitStack.habits`. Read the check-ins via the existing reader (`recentCheckIns(90)` or `allCheckInsInWindow(addDays(today(), -90), today())` — pick the one matching the documented span). Reuse the existing Progress section/eyebrow idioms. Render the grid as a CSS grid of small `<span>`/`<div>` cells (or via a `src/viz.ts` square-grid helper), wrapped in a horizontally-scrollable container.
- `src/viz.ts` — read-only or lightly extended. If a small square-grid SVG primitive is cleaner than a CSS grid, add it here alongside the sparkline/thermometer helpers; do not add a charting dependency.
- `src/db.ts` — read-only. `recentCheckIns(days)` and `allCheckInsInWindow(startDay, endDay)` already exist; the grid reads existing check-in data. Do NOT alter the checkins store.
- `src/types.ts` — add the internal grid-cell render type (additive). No persistent schema change.
- `src/styles.css` — `.habit-history` (the section), `.habit-history__row` (one habit + its label), `.habit-history__grid` (the horizontally-scrollable grid container), `.habit-history__cell--filled` / `--empty` / `--absent` (the three states mapped to existing ink / oxblood / cream tokens). NO new colors. The grid container scrolls horizontally on overflow (`overflow-x: auto`); grid children get `min-width: 0` where needed. Tap targets, if interactive, ≥44×44 css px — or document non-interactive cells.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `isSharedView()` (absent) / `isTour()` (present only if the fixture supplies check-ins).
- `tests/helpers/flows.ts` — reuse the check-in seeding helper (the one the recap 0008 / hundred-day 0021 / milestone 0041 specs use) to write a controlled mix of held / logged-but-not-held / unlogged days referencing the seeded plan's habit ids (mind the `&day` UNIQUE index — seed unique days, per the 0021 lesson in `docs/LESSONS.md`). Drive `now` via Playwright's clock API so the span and cell counts are deterministic.
- `tests/e2e/habit-history.spec.ts` (new) — every acceptance bullet maps to a `test()`. The state test seeds a habit held on days 1–3, logged-but-not-held on day 4, and no check-in on day 5, and asserts the four cell states (filled×3, empty, absent). The cap test seeds 200 days and asserts 90 cells.
- `tests/e2e/privacy.spec.ts` — extend with a Progress visit carrying check-ins, confirming zero off-allow-list egress during the grid render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — reads the existing `checkins` table.
- Voice spec: the section eyebrow reads "Your consistency record"; each row is labeled with the habit title. No streak copy, no exclamation, no praise-words. Banned: "amazing," "exciting," "journey," "great." Ink / oxblood / cream only — no new colors.

## Implementation log

(Appended by the implementation-dev agent during execution.)
