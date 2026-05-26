---
id: 0062
title: The missed-draw card — a quiet "did you get new results?" prompt on Today after the retest date passes
status: proposed
priority: P1
area: today
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user whose plan set a retest date that has now come and gone, who probably did get the bloodwork drawn but hasn't opened the app to upload it, I want a quiet, dismissible card on Today — "Your retest date was [date] — did you get new results? Tap to upload." — so that the loop the countdown started actually closes: the app asks for the new draw at the one moment it matters, instead of going silent the day the date passes.

## Why now (four lenses)

### Product Owner

Ticket 0028 (shipped) surfaces a countdown as the retest date approaches and an "overdue since…" line just after it passes. That is the front half of the loop: it gets the user to go get blood drawn. But the back half is missing. The user gets the draw, comes back to the app a few days later — and nothing asks them to upload it. The "overdue" line from 0028 is anchored to "the draw hasn't happened yet"; once the date is a week past, the user who actually got tested needs a different prompt: not "you're overdue," but "did you get results? upload them." The smallest meaningful unit of value is one card on Today that fires in a tight window — when the latest plan's retest date passed 1 to 14 days ago AND no panel exists drawn on or after that date — reading "Your retest date was [date] — did you get new results? Tap to upload," linking to the labs upload. It is dismissible (one localStorage flag, no schema), and after 14 days it disappears on its own: if the user didn't test on this cycle, the app stops asking, with no guilt. It is the closing bracket on the loop 0028 opened.

### Stakeholder

This is the keystone for the **adherence-and-retest loop** at the exact point where the loop currently leaks the most value: the gap between "got the draw" and "the draw is in the app." The persistent timeline only compounds when new panels arrive; 0028 moves the user to the lab, but a draw sitting unread in the user's inbox is worth nothing to the timeline. This card converts the moment of return into an upload prompt, computed entirely on-device from the plan's own retest cadence and the existing panels — no backend, no notification, no egress. A wrapper has no concept of "your retest date was last week and we don't see a panel that post-dates it," because it holds neither the structured retest cadence nor the panel history; this card is structurally a feature of a persistent-timeline, structured-plan app. And it is privacy-clean and free: a read over the latest plan and `allPanels()`, plus one boolean localStorage flag for the dismiss.

### User (at 7am on the phone)

Wednesday, Today page, coffee brewing. A calm line below my meals: "Your retest date was March 12 — did you get new results? Tap to upload." It is not an alarm. It is the app noticing the thing I half-forgot — the labs PDF sitting in my email since Monday — and pointing me at the place it goes. I tap it and I'm on the upload screen. If I haven't actually gotten the draw yet, I tap "not yet" and it goes away for now. And if it turns out I skipped this cycle entirely, the card just quietly stops after two weeks — no nagging, no "you missed your retest" shame. One tap to act, one tap to dismiss, and it works offline because the date and the panels are already on my phone.

### Growth

This is a retention ticket aimed at the single highest-value action in the whole product: getting the *second and later* draws into the app, where they feed the next plan and the functional score (0060). (Hypothesis: a return-moment upload prompt — fired in the post-retest window when no covering panel exists — materially lifts the rate at which a drawn panel actually gets uploaded, versus the current silence after the retest date passes; the user who got tested but never uploaded is pure leakage, and a single in-context "tap to upload" recovers it; back-of-envelope from how completion-prompting at the moment of return outperforms upstream reminders in multi-step workflows; treat as untested without remote analytics, which we will never add.) The acquisition tail is real but indirect: an uploaded second draw is what makes the improvement card (0047), the marker-moved receipt (0032), and the functional score worth screenshotting — none of those exist until the new panel lands, and this card is what lands it. It is the closing sibling of 0028: that opens the countdown, this finishes the loop the countdown can't.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] `src/today/missed-draw.ts` (new) exports `computeMissedDraw(latestPlan: Plan | undefined, panels: Panel[], now: Date): MissedDraw | null`. It reads the soonest-due retest cadence from `latestPlan` (the same cadence 0028 uses, anchored to `generatedAt + whenWeeks * 7 days`), and returns a populated value ONLY when the due date is 1–14 whole days in the past AND no panel in `panels` has a `drawnAt` on or after that due date. Returns `null` otherwise (no plan, no cadence, due date in the future, due date 0 days past, more than 14 days past, or a covering panel exists). Pure: no DOM, no Dexie, no network. Asserted by seeding cadences/panels across each branch and confirming the boundary days (1 and 14 present; 0 and 15 absent).
- [ ] The `MissedDraw` value carries the due date (for the copy) and the due markers' display names (resolved via `findMarker`, shortName preferred). Asserted by seeding a cadence with known markers and confirming the resolved names and the date.
- [ ] On the Today page (`src/pages/today.ts`), when `computeMissedDraw(...)` is non-null AND the user has NOT dismissed this draw, a card renders below the day's meals reading exactly: "Your retest date was <month day> — did you get new results? Tap to upload." Asserted by seeding a cadence due 5 days ago with no covering panel and confirming the card text and date.
- [ ] Tapping the card (or its primary action) navigates to `#/labs` (the upload surface). Asserted by tapping the card and confirming navigation to the labs route.
- [ ] The card carries a dismiss affordance ("Not yet" / a close control). Dismissing it sets a single localStorage flag keyed to the specific due date (e.g. `almanac.missedDraw.dismissed.<dueDateISO>`), and the card does not render again for that due date on re-render or reload. Asserted by dismissing, reloading, and confirming the card is absent.
- [ ] Dismissal is scoped to the due date, not global: a LATER plan with a new retest date (a new due date) shows the card again even after a prior due date was dismissed. Asserted by dismissing one due date, then seeding a newer plan with a different due date in-window, and confirming the card returns.
- [ ] The card disappears automatically once the due date is more than 14 days past, with no dismissal required and no guilt copy. Asserted by seeding a cadence due 15 days ago and confirming the card is absent.
- [ ] The card does NOT render when a panel drawn on or after the due date exists (the user already uploaded the new draw). Asserted by seeding an in-window overdue cadence, adding a panel drawn after the due date, and confirming the card is absent.
- [ ] The card does NOT render when there is no plan, or the latest plan carries no retest cadence. Asserted on a profile with no plan and on a plan with an empty `retest`.
- [ ] The card makes ZERO Anthropic calls and ZERO network calls — it reads the latest plan and panels from IndexedDB and writes only the dismiss flag to localStorage. Asserted by rendering Today and confirming the Anthropic mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string. Asserted by seeding a sentinel key, rendering the card, and confirming the key appears nowhere.
- [ ] Renders on both **chromium and mobile-webkit**: the card fits the 390 px viewport, the tap target is the full card (or a ≥44×44 css px action, min-height ≥45 px per the 0017 sub-pixel lesson), the dismiss control is a separate ≥44×44 tap target, and long marker lists / the date wrap cleanly with `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT render the card (tour/shared-view have no real upload destination; the existing Today gating with `isTour()` / `isSharedView()` applies). Asserted in both modes.
- [ ] The existing Today surfaces — the meals row, the habit stack, the streak strip, the retest countdown (0028), the pre-draw primer (0051), the quiet-day / recap / quarterly cards — are unchanged in behavior; the missed-draw card is purely additive at a documented slot, and it does not double up with the 0028 overdue line for the same draw (document the precedence so only one retest-related card shows for a given draw). Asserted by exercising the existing Today flow and confirming a single, consistent retest-related card.
- [ ] New `tests/e2e/missed-draw.spec.ts` covers: `computeMissedDraw` window math (1 and 14 present, 0 and 15 absent), the covering-panel suppression, the resolved marker names + date, the card copy and tap-to-labs, dismiss persists per due date and is absent on reload, dismissal is due-date-scoped (a newer draw re-shows), the no-plan / no-cadence absence, zero Anthropic + zero network, the key never appears (sentinel), tour/shared-view absence, the precedence with the 0028 card, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- A push notification, web-push, badge, or service-worker reminder. AGENTS.md forbids the server side; the card appears only when the app is opened. No interruption.
- A new Dexie store or schema field. The dismiss is ONE localStorage boolean flag keyed by due date — no migration. The card reads the existing plan and panels.
- Booking a lab, integrating a provider, or fetching results from anywhere. The card links to the on-device upload surface; the user brings the PDF they obtained themselves.
- Guilt or streak-loss framing. After 14 days the card simply disappears — no "you missed your retest," no "you broke the cadence." The copy is a neutral question, never a reprimand.
- Replacing or restyling the 0028 retest countdown / overdue line. This card is a distinct surface for a distinct window (the post-date upload prompt). Define the precedence so the two never stack for the same draw; do not rewrite 0028's logic.
- A configurable window or a per-marker missed-draw card. The window is fixed at 1–14 days past the due date; the card is one prompt for the soonest-due cadence, matching 0028's single-card discipline.
- Re-anchoring the due date to anything other than the plan's `generatedAt + whenWeeks * 7` that 0028 already uses. Reuse 0028's anchor (and its `soonestCadenceDue` helper) so the two cards agree on the date.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/missed-draw.ts` (new) — `computeMissedDraw(latestPlan, panels, now)`. Reuse `soonestCadenceDue(plan)` / the due-date math from `src/today/retest.ts` (0028) so the anchor matches: `dueDate = generatedAt + whenWeeks * 7 days`. Compute whole days past = floor((now - dueDate)/86_400_000); return null unless `1 <= daysPast <= 14`. Suppress when any `panel.drawnAt >= dueDateDay` (compare as YYYY-MM-DD `Day` strings). Resolve marker names via `findMarker`. Pure; no Dexie import.
- `src/types.ts` — add a `MissedDraw` interface (`dueDate: Date`, `dueDay: Day`, `markers: string[]`). Render-time only; additive; NO Dexie change.
- `src/pages/today.ts` — the page already reads `latestPlan()` and `allPanels()` and renders the 0028 retest card and the 0051 pre-draw card in the adaptive-surface region below meals. Add the missed-draw card in that region, gated on `computeMissedDraw(...)` non-null AND not-dismissed. Define precedence relative to the 0028 overdue line so only one retest-related card shows for a given draw (recommended: while a covering panel is absent, the missed-draw card supersedes the 0028 "overdue since" line once the date is 1+ days past, since "did you upload?" is the more actionable ask). Document the chosen precedence in code.
- The dismiss flag — mirror the existing per-key localStorage dismissal pattern already used by the recap card (`almanac.recap.dismissed.<isoWeek>`) and the quarterly card (`almanac.hundredDay.dismissed.q<N>`). Use `almanac.missedDraw.dismissed.<dueDateISO>` so a new due date is a new key. Guard localStorage access in try/catch like the existing helpers.
- `src/today/retest.ts` — read-only reuse of the due-date anchor / `soonestCadenceDue`. Do NOT change 0028's module.
- `src/db.ts` — read-only reuse of `latestPlan()` and `allPanels()`. No new helper.
- `src/styles.css` — `.missed-draw` card, reusing the existing Today adaptive-card idiom (the `.retest-card` and `.recap-card` blocks are templates). The card body is the tap-to-upload target; the dismiss is a separate control. `box-sizing: border-box; min-height: 45px` for tap targets. Ink and ink-soft only — no oxblood/alarm (this is calm). Grid children `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the card with the same `isTour()` / `isSharedView()` checks the rest of Today uses; neither mode renders it.
- `tests/helpers/flows.ts` — reuse `seedPlanWithRetest` (from the 0028 spec) to place the due date precisely relative to a controlled `now`, and the existing panel-seeding helper to add (or omit) a covering panel. Drive `now` via Playwright's clock API or a controlled createdAt, mirroring the 0028 spec's approach.
- `tests/e2e/missed-draw.spec.ts` (new) — every acceptance bullet maps to a `test()`. The window tests seed `generatedAt` such that the due date lands 1, 14, 0, and 15 days past; the dismiss test dismisses, reloads, and asserts absence, then seeds a newer due date and asserts the card returns.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying an in-window missed draw, rendering and dismissing the card, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — the dismiss is one localStorage flag; the card reads existing stores.
- Voice spec: the card reads "Your retest date was <month day> — did you get new results? Tap to upload." The dismiss reads "Not yet." Declarative, neutral, no guilt, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only; no oxblood.

## Implementation log

(Appended by the implementation-dev agent during execution.)
