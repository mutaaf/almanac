---
id: 0062
title: Did it work? — a per-draw protocol window on Progress showing adherence versus marker movement between the last two draws
status: proposed
priority: P2
area: progress
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user who has uploaded a second blood draw and composed my new plan, I want to see — for the period between my last two draws — how consistent I was with each plan habit, alongside whether each of the targeted markers moved in the right direction, so I can answer the question the app has never asked for me: "did sticking to the things the plan assigned actually change my numbers?"

## Why now (four lenses)

### Product Owner

The app holds all three pieces of data needed to answer this question: the check-in history across the inter-draw period (from the `checkins` store), the plan's habit stack with its per-habit `markerKeys`, and the marker values at both draws. Today those live on different pages — Progress for trends, Today for check-in history — and the user has to mentally join them. The smallest meaningful unit of value is a "Did it work?" section on the Progress page, visible only when ≥2 panels exist at least 14 days apart AND adherence data spans that window. For each plan habit, it shows the adherence percentage over the inter-draw window and a one-line direction note for each associated marker (`improved / unchanged / declined`, with the start→end delta). No LLM call. No new inference. A deterministic join of the check-in store and the marker series already rendered on the page.

### Stakeholder

This is the deepest moat-widener in the P2 queue. The **adherence loop** only compounds when the user can see the loop closing — and today the loop is never explicitly closed. "You kept up with the walk 80% of the time; your ApoB dropped 12 points in that window" is a sentence no chat box can produce: it requires the persistent check-in timeline, the structured habit-marker mapping, and the two-draw trend. Those are exclusively Almanac's. The user who sees this correlation is the user who trusts the protocol for the next 90 days; the one who can't see it is the one who shrugs and quietly stops. Showing the correlation (with the honest framing that it is correlation, not proof of causation) also deepens the "this is structured data, not a chat" posture the product's editorial voice is built around. And it is privacy-clean: a pure render over `MARKERS[]`, the local check-ins, and the local panels; no egress, no inference.

### User (at 7am on the phone)

My second draw is in. My new plan is composed. On Progress, below the trend cards, there is a new section: "Protocol window — March 1 to May 30." Three habit rows. "Leafy greens daily — 74%. Ferritin: 28 → 41 (↑ in range)." "Walk 20 min daily — 68%. Fasting insulin: 9.2 → 7.8 (↓ improved)." "Cold shower — 40%. No directly targeted marker." It is honest. The cold shower didn't stick and it shows. The things that did stick moved in the right direction and I can see it. That's the protocol working. One screen, no narration, just my data joined to my adherence. It makes me want to do the next 90 days.

### Growth

This is the "show me it works" artifact for the engaged, multi-cycle user — the person who has been in the product long enough to have a result. (Hypothesis: a user who sees their adherence correlated with a marker moving in the right direction is significantly more likely to continue using the product and to recommend it to a friend facing the same marker concern — because "I stuck to the plan and my ApoB dropped 12 points" is a concrete, repeatable claim the user can forward to someone with the same concern; back-of-envelope from how outcome evidence drives protocol-based product retention and referral in the health-data space; treat as untested without remote analytics, which we will never add.) The "show me" moment is a screenshot of the section: real adherence percentages next to real marker deltas in one plain grid is the artifact that makes the friend with the same "normal" ferritin ask "wait, what shows you that correlation?"

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/progress/protocol-window.ts` (new) exports `buildProtocolWindow(plan: Plan, panels: Panel[], checkIns: CheckIn[]): ProtocolWindow | null`. Returns non-null when: ≥2 panels exist; the two most-recent panels (`sortedByDate.slice(-2)`) are ≥14 calendar days apart; ≥1 check-in exists with a `day` between (inclusive) the two drawn dates. The window spans `[panels[-2].drawnAt, panels[-1].drawnAt]`. For each habit in `plan.habitStack.habits`: `adherencePct` = days in the window with `habitsCompleted.includes(habit.id)` ÷ total days in the window × 100, rounded to the nearest integer. For each `markerKey` in `habit.markerKeys ?? []`: find the marker's value in `panels[-2]` and `panels[-1]` via the existing result-matching pattern; compute `direction: 'improved' | 'unchanged' | 'declined'` using the marker's directional flag from `src/data/markers.ts` (see engineering notes). Pure: no DOM, no Dexie, no network. Asserted by passing known panels, check-ins, and a plan and confirming adherence percentages, directions, and null/non-null edge cases.
- [ ] The Progress page (`src/pages/progress.ts`) renders the "Did it work?" section when `buildProtocolWindow(...)` is non-null, showing: the window date span ("Protocol window: [start] – [end]"), one row per habit (habit name, adherence bar, adherence %, marker direction and delta for each `markerKey`), and the honest "No directly targeted marker" note for habits with empty `markerKeys`. Asserted by seeding the required data and confirming the section renders with the correct habit row content.
- [ ] The direction label for each marker is deterministic and uses the marker's directionality: a delta that moves a "higher-is-better" marker up is `improved`; a delta that moves a "lower-is-better" marker down is `improved`; a delta within a ±5% tolerance band is `unchanged`. Asserted with at least one "lower is better" marker (fasting insulin) and one "higher is better" marker (ferritin).
- [ ] The section is ABSENT when fewer than 2 panels exist, or when the two most-recent panels are < 14 days apart, or when no check-in data falls in the inter-draw window. Each edge case asserted independently.
- [ ] No LLM call and no network call are made to build or render the section. Asserted by rendering the section and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the section or any intermediate string. Asserted with a sentinel key.
- [ ] The section does NOT appear in tour mode (0014) or shared-view mode (0017). Asserted in both modes.
- [ ] The existing Progress flows — the trend cards, latest-value rows, the compare-two-draws flow, the improvement card (0047), and the marker deep-dive (0059 if shipped) — are unchanged in behavior. The new section is purely additive, placed after the existing trend content. Asserted by exercising the existing Progress flows and confirming they are unchanged.
- [ ] Renders on both **chromium and mobile-webkit**. The adherence bar and marker delta fit the 390 px viewport; long habit names respect `min-width: 0`; adherence %-text does not overflow its column. Asserted on both projects.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — no new hostnames.
- [ ] Schema migration: **no** — reads the existing `plans`, `panels`, and `checkins` stores; adds no new persisted types.
- [ ] New `tests/e2e/protocol-window.spec.ts` covers: the pure-function null/non-null edge cases (< 2 panels, < 14 days apart, no check-ins in window), correct adherence % for a known window, correct direction for a "lower is better" (fasting insulin, delta ↓) and a "higher is better" (ferritin, delta ↑) marker, the "no targeted marker" row, the section present and absent, tour/shared-view absence, zero Anthropic + zero network, the key never appears, mobile rendering.

## Out of scope

- A causal claim. The section frames everything as observed data: the direction icon and the delta are plain numbers. There is no "because of your adherence, ferritin rose." The user draws the inference; the app presents the correlation.
- LLM-narrated summaries of the window ("you did well this quarter because…"). All content is deterministic. The editorial voice is the data itself.
- Adherence data outside the inter-draw window. The window is exactly the span between the two most-recent draws; older windows are not shown (a full timeline view is a future ticket).
- A "share this window" image card. A window card is a plausible future growth ticket (sibling to 0047); descoped here to keep the ticket shippable.
- A configurable habit-to-marker mapping UI. The `markerKeys` on each habit come from the plan generator. The user does not assign habits to markers in this ticket.
- Editing the plan's habit stack or the marker direction flags from this section. The section is read-only over the existing stores and marker DB.

## Engineering notes

- `src/progress/protocol-window.ts` (new) — `buildProtocolWindow(plan, panels, checkIns)`. Sort panels by `drawnAt` ascending. If `< 2`, return null. The two-panel window is `[sortedPanels.at(-2)!, sortedPanels.at(-1)!]`. Compute `windowDays`: the number of calendar days from `startDraw.drawnAt` to `endDraw.drawnAt` (inclusive). Filter `checkIns` to days in `[startDraw.drawnAt, endDraw.drawnAt]`. For each habit: `adherencePct = Math.round(daysCompleted / windowDays * 100)`. For each `markerKey`: extract the value from `startDraw.results` and `endDraw.results` using the existing result-by-key lookup pattern (same as `src/pages/progress.ts` uses for trend cards). Compute direction using the marker's `lowerIsBetter` flag (see below); if the absolute delta is within a ±5% tolerance of the start value, use `unchanged`.
- `src/data/markers.ts` — confirm or add a `lowerIsBetter?: boolean` field to `MarkerDef` (additive, code-only, no Dexie migration). Add the flag to the high-traffic directional markers: `fasting_glucose` (lower), `fasting_insulin` (lower), `hba1c` (lower), `apob` (lower), `ldl_cholesterol` (lower), `triglycerides` (lower), `ferritin` (higher), `vitamin_d` (higher), `vitamin_b12` (higher). Markers without the flag default to `direction` computed as: end value in functional range → `improved`; out of range → `declined`; within ±5% → `unchanged` (a safe neutral default for markers without a single directional truth).
- `src/types.ts` — add a `ProtocolWindow` interface with `{ windowStart: string; windowEnd: string; habits: { habitId: string; title: string; adherencePct: number; markers: { key: string; displayName: string; startValue: number | undefined; endValue: number | undefined; direction: 'improved' | 'unchanged' | 'declined' }[] }[] }`. Internal to this module; export for the page and the spec.
- `src/pages/progress.ts` — add the section after the existing trend content; gate with `!isTour() && !isSharedView()`. The page already loads `allPanels`; add a `allCheckInsInWindow(startDay, endDay)` call with the two-draw window bounds (the helper exists in `src/db.ts`).
- `src/styles.css` — `.protocol-window` (section), `.protocol-window__habit-row`, `.protocol-window__adherence-bar` (a simple `width: N%` CSS fill inside a fixed-width track), `.protocol-window__direction` (↑ / → / ↓ with `color: var(--oxblood)` for `improved`, `var(--ink-soft)` for `unchanged`, `var(--ink)` for `declined`). No new color variables.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `!isTour() && !isSharedView()` in the Progress render.
- `tests/helpers/flows.ts` — compose `seedPlan` (with habits carrying `markerKeys`) + the existing panel seeder (with results for the keyed markers) + the check-in seeder (for days between the two panels, using unique `day` values per the documented `&day` unique-index rule).
- `tests/e2e/protocol-window.spec.ts` (new) — every acceptance bullet maps to a `test()`. The direction tests seed a plan with fasting-insulin and ferritin habits, panels with known deltas, and 30 days of check-ins, then assert the direction icons render correctly.
- `tests/e2e/privacy.spec.ts` — extend to confirm zero off-allow-list egress when the protocol-window section renders.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (`lowerIsBetter` is a code-only change to `MarkerDef`, not a Dexie schema change).
- Voice spec: section eyebrow reads "Did it work?"; date span reads "Protocol window: [start date] – [end date]"; habit rows read "[Habit name] — [N]% of days"; marker direction reads "[Marker name]: [start] → [end] ↑/↓/→"; the no-marker note reads "No directly targeted marker." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the `improved` direction indicator only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
