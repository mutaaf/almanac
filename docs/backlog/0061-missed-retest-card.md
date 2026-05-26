---
id: 0061
title: The missed draw card — a Today card that surfaces when the retest date has passed with no new panel, naming the targeted markers and linking directly to Labs
status: proposed
priority: P1
area: today
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user whose plan said "retest in 90 days" and whose retest date has now passed by more than a week with no new panel uploaded, I want a gentle card on Today that acknowledges the retest is overdue, names the specific markers my plan was watching, and puts a one-tap path to the Labs upload flow right in front of me — so that the feedback loop the protocol was built around doesn't silently break without me noticing, without any push notification, without nagging, just a visible checkpoint that says "you're ready to close this loop."

## Why now (four lenses)

### Product Owner

The retest countdown (0028, shipped) lives on Today as a quiet countdown toward the draw date. The pre-draw primer (0051, shipped) activates 48 hours before the date with marker-specific prep. But there is no follow-through surface: when the retest date passes and no new panel arrives, Today goes quiet — the countdown card disappears, no replacement appears, and the protocol loop is silently broken. The smallest meaningful unit of value is a "Your retest is overdue" card that activates when `(today − plan.retestDate) > 7 calendar days` AND no panel has been uploaded with a `drawnAt` date ≥ the plan's retest date. It shows the day count overdue, names the markers the plan was targeting (from the plan's insight keys and habit/eat `markerKeys`, capped at 5), and carries a "Add a new draw" CTA that navigates to the Labs route. The 7-day grace window prevents badgering a user who drew blood the day after their target date and hasn't uploaded yet. The card disappears automatically once a qualifying panel is added.

### Stakeholder

This closes the **adherence loop** at its most consequential failure point: the gap between the end of one protocol cycle and the start of the next. The retest draw is what makes Almanac a compounding timeline rather than a snapshot product — without the second draw there is no plan delta (0029), no improvement card (0047), no trend on Progress. A user who never uploads a second panel is a user who never experiences the product's core value proposition. The missed-draw card is the retention primitive that converts a one-cycle user into a multi-cycle user — the compounding the product is built around. It respects the privacy contract: no notification, no server-side scheduling, just a quiet local-state card that reads the `plans` and `panels` stores and presents a hash-link CTA. No new schema, no new egress, no new inference.

### User (at 7am on the phone)

My 90-day retest date came and went. I forgot about it — a busy week, and the quiet countdown on Today just disappeared. Two weeks later I open Today and there it is, calm above my meals: "Your retest is 14 days overdue." Below: "Your plan was watching ferritin, vitamin D, and fasting insulin." One tap — "Add a new draw" — and I'm in the Labs upload flow. It doesn't lecture me. It doesn't count a streak against me. It just says: the thing you were working toward is waiting, here's the door. I book the draw that afternoon and schedule the upload. Wet hands, one tap, no guilt trip.

### Growth

This is a pure retention ticket for the highest-intent user segment: people who composed a protocol, followed it through 90 days, and are now at the exact moment where the product either compounds (new draw → new plan → continued engagement) or goes permanently quiet. (Hypothesis: a missed-retest surface raises the rate of second-panel uploads among users with a passed retest date, because the marginal cost of "remember the draw exists" collapses to zero when the app presents it in context; back-of-envelope from how in-context re-engagement at an actionable decision point recovers lapsed users better than ambient nudges or silent friction; treat as untested without remote analytics, which we will never add.) The user who uploads a second draw is the user who gets to see the improvement card (0047), the plan delta (0029), and the trend on Progress — those retention artifacts drive word-of-mouth. The missed-draw card is the bridge to all of them.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/missed-retest.ts` (new) exports `computeMissedRetest(plan: Plan | undefined, panels: Panel[], now: Date): { daysPast: number; targetedMarkers: string[] } | null`. Returns non-null when: `plan` is defined; `plan.retestDate` is defined and parses to a date more than 7 calendar days before `now`; no panel in `panels` has a `drawnAt` date ≥ `plan.retestDate`. `targetedMarkers` is the deduplicated list of display names (via `findMarker(key).displayName`) collected from `plan.insights.flatMap(i => i.markerKeys ?? [])`, `plan.eatList.flatMap(e => e.markerKeys ?? [])`, and `plan.habitStack.habits.flatMap(h => h.markerKeys ?? [])`, capped at 5. Returns null in all other cases. Pure: no DOM, no Dexie, no network. Asserted by seeding known plans and panels and confirming null/non-null for each edge case (no plan, no retestDate, future date, date ≤7 days past, qualifying panel present) and the correct daysPast and targetedMarkers values.
- [ ] The Today page (`src/pages/today.ts`) calls `computeMissedRetest(latestPlan, allPanels, now)` and renders the "Missed retest" card when the result is non-null. The card shows: eyebrow "Your retest is overdue"; body copy "N days past your retest date. Your plan was watching: [marker 1], [marker 2], ..."; a "Add a new draw" CTA. Asserted by seeding a plan with a retestDate 30 days in the past, no qualifying panel, and confirming the card renders with the correct day count and marker names.
- [ ] The "Add a new draw" CTA is an `<a href="#/labs">` hash-link (the same nav idiom as the masthead Labs link) — no new route, no modal. Asserted by clicking the CTA and confirming navigation to the Labs view.
- [ ] The card DISAPPEARS once a panel with `drawnAt >= plan.retestDate` is present in the `panels` store. Asserted by seeding a plan with a past retestDate and no qualifying panel (card renders), then seeding a qualifying panel and re-rendering Today (card absent).
- [ ] The card is ABSENT for each of the following edge cases: no plan; plan with no `retestDate`; `retestDate` in the future; `retestDate` passed by ≤7 days (grace window); a qualifying panel already uploaded. Each asserted independently.
- [ ] The card does NOT appear in tour mode (0014) or shared-view mode (0017). Asserted in both modes.
- [ ] The existing Today cards — the retest countdown (0028), the pre-draw primer (0051), the quiet-day card (0015), the weekly-recap (0008), the lapse-aware welcome-back (0018), the missed-draw-day card (0031) — are unchanged in behavior; the missed-retest card is purely additive and does not conflict with or duplicate the retest countdown card (they are logically exclusive: the countdown shows before the date; this shows after). Asserted by exercising the existing Today flows and confirming they are unchanged.
- [ ] Renders on both **chromium and mobile-webkit**. The "Add a new draw" CTA is a ≥44×44 css px tap target (min-height ≥45 px). Long marker names respect `min-width: 0`. Asserted on both projects.
- [ ] The card makes ZERO Anthropic calls and ZERO network calls. Asserted by rendering the card and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string. Asserted with a sentinel key.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — no new hostnames.
- [ ] Schema migration: **no** — reads the existing `plans` and `panels` stores; adds no new fields.
- [ ] New `tests/e2e/missed-retest.spec.ts` covers: the pure-function edge cases (no plan, no retestDate, future date, ≤7-day grace, qualifying panel present), the card present with daysPast and marker names, the CTA navigates to Labs, the card disappears after a qualifying panel, the existing Today cards unchanged, tour/shared-view absence, zero Anthropic + zero network, the key never appears, mobile rendering.

## Out of scope

- A push notification, web-push alert, service-worker badge, or scheduled reminder. No server, no notification API. The card appears only when the user opens the app.
- A "log a new draw manually" or "paste results" path from this card. The CTA links to the Labs route; manual entry, file upload, and paste flows are already present there.
- Guilt-framed or streak-shaming copy. "Your retest is overdue" and "N days past your retest date" are neutral observations. No "you're falling behind," no "don't lose your progress," no consecutive-day pressure.
- Editing or resetting the retest date from this card. If the user's circumstances changed, the plan recomposes with a new date. This card is read-only on the plan.
- A card that activates within the 7-day grace window. 1–7 days past the retest date is still "just uploaded late" territory. The 7-day window prevents nagging a user who got their blood drawn the day of and hasn't imported the PDF yet.

## Engineering notes

- `src/today/missed-retest.ts` (new) — `computeMissedRetest(plan, panels, now)`. Parse `plan.retestDate` as a local `Day` string (`YYYY-MM-DD`) using the same day-parsing idiom `src/db.ts` uses. Compute the day offset via the same `daysBetween(a, b)` helper or an equivalent used by the retest-countdown card (0028). Return non-null only when offset > 7 AND `!panels.some(p => p.drawnAt >= plan.retestDate)`. Build `targetedMarkers` by collecting display names from the plan's insight markerKeys, eatList markerKeys, and habitStack habit markerKeys, resolving each via `findMarker(key)?.displayName ?? key`, deduplicating, capping at 5. Pure; no Dexie import.
- `src/pages/today.ts` — add a `computeMissedRetest` call after the existing plan + panels loads. Render the card at the documented slot (below the habit stack, consistent with where the retest-countdown card appears). Gate with `!isTour() && !isSharedView()`. The CTA is `<a href="#/labs" class="missed-retest__cta">Add a new draw</a>`.
- `src/db.ts` — read-only reuse of `latestPlan()` and the panels query. No new helpers needed.
- `src/styles.css` — `.missed-retest` card (eyebrow + body + CTA), reusing the quiet-card idioms from 0028/0031 (the same eyebrow + body + link-button structure). CTA `min-height: 45px; box-sizing: border-box` per the sub-pixel tap-target rule. No new color variables.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the card with `!isTour() && !isSharedView()` in the Today render.
- `tests/helpers/flows.ts` — reuse `seedPlan(page, plan)` (with a `retestDate` field set to a date in the past) and the existing panel-seeding helper to control whether a qualifying panel is present.
- `tests/e2e/missed-retest.spec.ts` (new) — every acceptance bullet maps to a `test()`. The grace-period test seeds `retestDate = today − 3` (card absent); the overdue test seeds `retestDate = today − 30` (card renders, day count = 30, marker names present); the disappear test seeds a qualifying panel after confirming card present and then asserts card absent. The CTA-navigation test clicks the link and asserts the Labs view renders.
- `tests/e2e/privacy.spec.ts` — extend to confirm zero off-allow-list egress when the missed-retest card renders.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: eyebrow reads "Your retest is overdue"; body reads "N days past your retest date. Your plan was watching: [marker 1], [marker 2], [...]"; CTA reads "Add a new draw." Declarative, neutral, no streak-shame, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the CTA button.

## Implementation log

(Appended by the implementation-dev agent during execution.)
