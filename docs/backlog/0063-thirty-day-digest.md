---
id: 0063
title: The 30-day digest — a calm mid-protocol reflection 30 days in, showing what you kept and what the trend shows
status: proposed
priority: P2
area: today
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a user who composed my first plan 31 days ago and has been logging check-ins most days, I want a quiet, one-time summary card to appear on Today that tells me what I've actually done — which habits I kept, which I skipped, and whether any of my tracked markers moved in the right direction based on my last two draws — so that I feel, concretely, that the month was worth it, and I know what to keep doing as I head into the next stretch toward my retest.

## Why now (four lenses)

### Product Owner

Thirty days is the exact midpoint where a protocol succeeds or quietly fails. The user has enough check-in data to know their adherence patterns, but not enough time to have done a retest (which typically happens at 90–120 days). In this gap, the user has no external signal that the protocol is working — no new labs, no dramatic transformation, just a string of daily check-ins. The smallest meaningful unit of value is a digest card that appears on Today exactly once, between 28 and 35 days after `plan.composedAt`, presenting three numbers: (1) habits kept rate (% of days with all habits completed, or per-habit breakdown), (2) most-consistent habit, (3) any marker deltas from the most recent two panels if available. No LLM call. Pure TypeScript over the existing `checkins` store and `panels` store. The card is dismissed once and never shown again for the same plan composition.

### Stakeholder

The 30-day digest fills the dead zone in the adherence loop — the span between composition and retest where there's no external feedback and retention most commonly fails. It keeps the app present and relevant without a push notification, a backend, or any inference call. It deepens the persistent-timeline moat because only an app that holds 30 days of check-in history and the plan's composition date can generate a personalized reflection at this exact moment; a chat app resets between sessions. And it costs nothing per use — it's a pure read over local data, no API call, and it surfaces the existing data the user already generated (their daily check-ins) in a form that makes the month feel legible and forward-looking.

### User (at 7am on the phone)

Thirty-one days in. I open Today, and there's a small card above the meals: "30 days in." Below it: "You kept your habits 22 of 31 days. Most consistent: magnesium at night (27 of 31). Skipped most: cold exposure (9 of 31)." Then a line: "Your ferritin moved from 31 to 36 since your last two draws." And a quiet closer: "Keep going — your retest window opens in about 60 days." I read it in 15 seconds. I feel seen. I tap dismiss, and it's gone. I haven't left the app for a single search. The protocol is still working.

### Growth

The 30-day digest is a high-credibility share moment: "My app told me I kept 22 of 31 days and my ferritin moved 5 points" is the exact kind of specific, personal data that makes a health-curious friend say "how does it know that?" (Hypothesis: a personalized 30-day summary, generated at the moment the user is most at-risk of protocol drift, raises 90-day retention by surfacing evidence of progress the user wouldn't otherwise quantify; treat as untested without remote analytics, which we will never add.) The digest card could also be shared as a screenshot (similar to the improvement card, 0047), making it a retroactive acquisition trigger at exactly the moment when the user is most invested in the product.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/thirty-day-digest.ts` (new) exports `computeDigest(plan: Plan, checkIns: CheckIn[], panels: Panel[], now: Date): DigestSummary | null`. Returns `null` if (a) fewer than 28 days have passed since `plan.composedAt`, (b) more than 35 days have passed (window closed), or (c) the plan has no habit stack. Returns a `DigestSummary` with: days since composition, per-habit completion rates, most-consistent habit, least-consistent habit, and optional `markerDeltas` from the two most-recent panels. Pure: no DOM, no Dexie, no network. Asserted by passing known plan + check-ins + panels with composition dates at 28, 31, and 36 days ago and confirming returns: non-null at 28–35, null at 27 and 36.
- [ ] A `digestDismissedForPlan?: string` field (the plan's composed-at ISO string or an id) on `Profile` marks a dismissed digest. When the field matches the current plan's `composedAt`, `computeDigest()` returns `null`. Asserted by seeding a profile with the dismissed plan id and confirming the card does not render. (Schema migration: **yes** if `Profile` is typed and this field is new — bump to the next Dexie version after any in-flight migrations. If the field can be stored in `localStorage` to avoid a schema bump, document the choice.)
- [ ] The Today page renders the digest card when `computeDigest()` returns non-null, showing: the day count, the per-habit breakdown (most/least consistent named), and the marker-delta section (present if ≥2 panels exist; absent with a calm "No second draw yet" note if only 1 panel). Asserted by seeding a plan with 31-days-ago composition, 3 weeks of check-ins, and 2 panels, and confirming all three sections render.
- [ ] The card's dismiss button writes `digestDismissedForPlan` and the card does not re-appear on reload. Asserted by tapping dismiss, reloading, and confirming the card is absent.
- [ ] A new plan composition (a new `composedAt` timestamp different from the dismissed one) resets the digest window — the card can appear again 28–35 days after the NEW composition. Asserted by dismissing for plan A's timestamp and confirming the card appears for plan B's timestamp (28 days later).
- [ ] The digest card makes **zero Anthropic calls** and **zero network calls**. Asserted by confirming the mock recorded zero requests after the card renders.
- [ ] The Anthropic key NEVER appears in the digest card. Asserted by seeding a sentinel key.
- [ ] The card is ABSENT outside the 28–35 day window, when there is no plan, when the plan has no habits, and when dismissed. Asserted for each case.
- [ ] The existing Today flows — meals, habit check-ins, streak strip, pre-draw primer, retest-due card, quiet-day card, welcome-back card — are unchanged. Asserted by exercising the existing Today flows and confirming they are unchanged.
- [ ] Renders on both **chromium and mobile-webkit**: the card fits the 390 px viewport, dismiss is a ≥44×44 css px tap target (min-height ≥45 px), and all text respects `min-width: 0`. Asserted on both projects.
- [ ] Privacy E2E still passes — no new hostnames.
- [ ] New `tests/e2e/thirty-day-digest.spec.ts` covers: `computeDigest` window (28–35, null outside), the rendered sections (habit rates, marker delta, absent delta note), the dismiss writes the dismissed flag + card absent on reload, a new plan composition resets the window, zero Anthropic/network, sentinel key, absent-state cases, existing Today flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- An LLM-generated narrative or "insights" for the digest. All content is computed from local check-in data and local panel data — no Anthropic call.
- A push notification or scheduled reminder to read the digest. It appears passively when the app is opened in the window.
- A digest at 60 days, 90 days, or any other cadence. 30 days is the one window; the hundred-day mark (0021) covers the longer horizon.
- Editing or annotating the digest from within the card. It is read-only; the user can only dismiss it.
- Sharing the digest as a card image (similar to the improvement card). A plain text card on Today is the scope; a share-card export is a possible follow-on.
- Showing the digest outside Today (e.g., on Progress or in Settings). Today is the one surface.
- A "how did I do vs. last plan" comparison. The digest is about THIS plan's first 30 days, not a cross-plan delta (that is 0042's territory).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/thirty-day-digest.ts` (new): `computeDigest(plan, checkIns, panels, now)`. Derive `composedAt` from `plan.composedAt` (or equivalent — grep `src/types.ts` for the field name on the `Plan` type). Window check: `daysAgo = differenceInCalendarDays(now, composedAt)` (implement inline or reuse any date util already in the codebase; do NOT add a date library). Filter `checkIns` to the window `[composedAt, now]`. For each habit in `plan.habitStack.habits`, count days where the habit's id appears in `checkIn.habitsCompleted`. Build `markerDeltas` by finding the two most-recent panels and diffing shared markers (the same delta logic as 0009 and 0029; reuse or reference the helper they use). Return `DigestSummary | null`.
- `src/pages/today.ts` — reads the current plan, `allCheckInsInWindow(composedAt, today)`, and the full `panels` store (already read by 0012 and 0021). Pass to `computeDigest`. Render the card at the Today card slot (above or below meals — document the chosen position). Dismiss handler writes `digestDismissedForPlan = plan.composedAt` via `db.updateProfile(...)` (or localStorage — document the choice and assert consistency with the window-reset logic).
- `src/types.ts` — add `digestDismissedForPlan?: string` to `Profile` if stored there (additive). If using `localStorage` instead (to avoid a Dexie bump), document the key name.
- `src/styles.css` — `.thirty-day-digest` (the card); reuse the quiet-day card or welcome-back card idioms. Dismiss is an `×` button in the top-right corner, min-height 45px. No new colors.
- `tests/helpers/flows.ts` — add `seedCheckInsRange(page, startDay, endDay, habitIds)` if a range-seeder isn't already shared; the 0053 and 0058 specs may have one to reuse. Seed panels via the existing `seedPanel` helper.
- New deps: **no** (no date library).
- Egress allow-list change: **no**.
- Schema migration: **conditional** — if `digestDismissedForPlan` is added to `Profile`, bump Dexie to the next version after any in-flight migrations; if stored in `localStorage`, no schema change.
- Voice: card eyebrow reads "30 days in"; habit line reads "You kept your habits X of Y days"; the closer reads "Keep going — your retest window opens in about N days." Neutral, declarative, no streak-shaming, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood for the most-consistent habit highlight only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
