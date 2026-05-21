---
id: 0028
title: The draw is due — surface the retest cadence the plan already wrote, as a quiet countdown that brings you back
status: proposed
priority: P1
area: today
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user three months into a protocol, who was told by my plan to "recheck ferritin and ApoB in 12 weeks" — a line I read once when the plan composed and have not seen since — I want the app to quietly carry that retest cadence forward and tell me, on the surface I open every morning, when a draw is coming due ("Ferritin and ApoB are due for a recheck in 9 days — the protocol set this on Feb 26") and when it has passed ("Your ApoB recheck has been due since last week"), so that the single most consequential action in precision health — actually going back and getting the blood drawn — stops being a sentence buried in a plan I never reopen, and becomes a calm, dated nudge that closes the loop the whole product depends on.

## Why now (four lenses)

### Product Owner

Every composed plan already carries a `retest` cadence — specific markers, a number of weeks, a reason — written by the generator and rendered once on the Plan page. After that, it is inert. The user reads "recheck ApoB in 12 weeks" the day the plan composes, and then the line sits on a page they rarely reopen; twelve weeks later nothing reminds them, and the draw that would feed the next plan never happens. This is the quiet death of the entire adherence-and-retest loop: no new draw means no new panel means no recomposition means the plan slowly goes stale and the user drifts off. The smallest meaningful unit of value is a deterministic, zero-network retest surface on Today: take the most recent plan's `retest` entries, anchor each to the plan's `createdAt` (or the cohort of markers' last draw date, whichever the schema supports), compute "due in N days" / "due since N days ago," and render a single calm card — "<markers> due for a recheck in N days" — that links to the labs upload. No new data, no inference, no notification permission. It is a read over data the user already owns, surfaced where they already look.

### Stakeholder

This is the keystone that makes two moat assets actually compound instead of decay. The **persistent timeline** is only valuable if it keeps growing — a timeline frozen at one or two draws is a screenshot, not a moat. The **adherence loop** only re-tunes the plan when a new panel arrives. Both depend on the user coming back to *draw blood again*, and nothing in the app currently moves them toward that. The retest surface is the missing pump: it converts the plan's own retest cadence — which is structured data we already generate — into the recurring re-engagement that keeps the timeline alive. A backend-shaped competitor would solve this with a push notification from a server; we cannot and will not. But we do not need to: the user opens Today as a daily ritual, so the nudge belongs *in* that ritual, computed locally, surfaced at the moment of attention. This is the rare ticket that deepens the moat by activating capacity the product already paid to build.

### User (at 7am on the phone)

Tuesday morning, Today page, coffee not yet made. Below the day's meals, a quiet line in the almanac voice: "Ferritin and ApoB are due for a recheck in 9 days — the protocol set this draw on February 26." It is not an alarm, not a red badge, not a push that woke me at midnight. It is a dated, calm reminder that the thing I half-remembered I was supposed to do is now close. I tap it; it takes me to the labs page so when I have the new results I know where they go. The bad-path version is just as calm: if the draw is already overdue, the line reads "Your ferritin recheck has been due since last week — when you have the new draw, it goes here," with the same single tap. No guilt, no streak-breaking, no pressure — the same no-dark-patterns register the streak strip already holds. It works offline, instantly, because the due date is computed from a plan already on my device.

### Growth

This is a retention ticket first, but it carries a quiet acquisition tail. Retention: the single biggest predictor of a precision-health user staying is whether they get a *second* draw — a one-panel user is a tourist, a three-panel user across a year is a resident. Nothing currently nudges the second draw; this does, using the plan's own cadence, which means the nudge is credible (the user set it, via the protocol) rather than nagging. (Hypothesis: surfacing the retest due-date on Today lifts the rate of second-and-later draws materially among users past their first plan's cadence window — the loop's central conversion — by removing the "I forgot I was supposed to retest" failure mode entirely; back-of-envelope from how habit apps' due-date surfacing outperforms calendar reminders the user has to set themselves — treat as untested without remote analytics, which we will never add.) The acquisition tail: a user who actually retests and watches a marker move is the user who screenshots the trend (0011) and tells a friend "look, my ferritin actually came up" — the second draw is what makes the marker-hero card worth sharing in the first place.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/retest.ts` (new) exports `computeRetestStatus(latestPlan: Plan, now: Date): RetestStatus | null` where `RetestStatus` is `{ markers: string[]; dueDate: Date; daysUntil: number; state: "upcoming" | "due-soon" | "overdue"; setOn: Date }`. It reads the latest plan's `retest` cadence (markers + weeks + reason), anchors the due date to the plan's `createdAt` plus the cadence weeks, and classifies: `overdue` when `daysUntil < 0`, `due-soon` when `0 <= daysUntil <= 14`, `upcoming` otherwise. Returns `null` when the plan has no retest cadence. Pure: no DOM, no Dexie, no network.
- [ ] On the Today page (`src/pages/today.ts`), when the latest plan's retest status is `due-soon` or `overdue`, a single retest card renders below the day's meals and above the habit stack. With status `upcoming` (more than 14 days out) the card is absent. Asserted by seeding a plan whose retest cadence places the due date 9 days out (card present) versus 60 days out (card absent).
- [ ] The `due-soon` card reads exactly: "<markers joined with ' and '> due for a recheck in <N> days — the protocol set this draw on <month day>." Singular/plural agree ("in 1 day"). Asserted by seeding a cadence due in 9 days and a cadence due in 1 day.
- [ ] The `overdue` card reads: "Your <markers> recheck has been due since <relative phrase: 'yesterday' / 'N days ago' / 'last week'> — when you have the new draw, it goes here." No alarm styling, no oxblood (overdue is calm, not an error). Asserted by seeding a cadence due 8 days in the past.
- [ ] The card is a single tap to `#/labs` (the upload surface). Asserted by tapping the card and confirming navigation to the labs route.
- [ ] When no plan exists yet, or the latest plan carries no retest cadence, NO retest card renders and the Today page is byte-for-byte unchanged from today's behavior. Asserted by loading Today with a plan that has an empty `retest` and confirming the card is absent.
- [ ] When a NEWER plan has been composed (recomposition), the retest card reads from the newest plan's cadence only — a superseded plan's stale retest line never shows. Asserted by composing two plans with different cadences and confirming only the newest drives the card.
- [ ] After the user uploads a NEW panel that covers the due markers (drawn on or after the plan's `createdAt`), the retest card for those markers disappears (the draw happened). Asserted by seeding an overdue cadence, then adding a panel containing those markers drawn after the plan date, and confirming the card clears.
- [ ] The card is computed with **zero network calls** — it reads the latest plan and panels from IndexedDB only. Asserted by rendering Today and confirming the mock recorded zero requests during the card's computation/render.
- [ ] Renders on both **chromium and mobile-webkit**. The card tap target is the full card width and ≥44 css px tall; the marker list wraps cleanly at the 390 px viewport when several markers are due; the card does not push the meals above the fold.
- [ ] Tour mode (0014) surfaces the retest card against the tour's fixture plan if the fixture cadence places a draw in the due window (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the retest card — the surface is the owner's Today, not a shared protocol. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the due date is computed from the existing plan's `createdAt` + `retest` cadence and existing panel draw dates. Nothing new is persisted.
- [ ] New `tests/e2e/retest-due.spec.ts` covers: card present in the due window and absent when far out, exact due-soon and overdue copy with singular/plural, single-tap to labs, no card without a plan or cadence, newest-plan-wins on recomposition, card clears after a covering draw, zero-network during render, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Push notifications, web-push, or any OS-level alert. The nudge lives inside the app's daily ritual surface; we do not request notification permission and we do not run a service worker that wakes the user. The whole point is calm in-app surfacing, not interruption.
- A standalone "retest schedule" page or a calendar view of all future draws. The card is one line on Today, at the moment it matters. A full schedule view is a separate ticket if users ask.
- Booking a lab, integrating with a lab provider, or any path that touches a third party. We have no backend and no partner; the card links to the upload surface where the user brings the results they obtain themselves.
- Editing or overriding the retest cadence from the card. The cadence is the plan's; if the user wants a different date, that belongs to a future plan-edit surface, not a one-off override here. The card is a read-only nudge.
- A streak-style "you've retested N quarters in a row" counter. No gamification of medical draws — the no-dark-patterns rule (README) holds; this is a calm reminder, not a retention loop.
- Anchoring the due date to anything other than the plan's `createdAt` + cadence if the schema does not support a per-marker last-draw anchor. If a richer anchor (the actual last draw date of each due marker) is cheaply available from existing panel data, prefer it; otherwise the plan-creation anchor is the honest, shippable default. Do not add schema to support a fancier anchor in this ticket.
- Carrying the retest nudge into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). The nudge is a live, dated, on-device surface; it does not belong in static artifacts.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/retest.ts` (new) — `computeRetestStatus(latestPlan, now)` per the acceptance bullets. The plan's `retest` shape lives in `src/types.ts` (the Plan type carries the retest cadence the generator writes — confirm the field name and the weeks/markers/reason shape there before coding). Resolve marker display names via `findMarker()` / `getAllMarkers` so user-defined and sex-specific keys render their human name. Pure; the page passes in the latest plan and `now`.
- `src/pages/today.ts` — Today already renders the day's meals, the habit stack, and the streak strip, and already branches for quiet-day (0015), lapse (0018), and Sunday recap (0008) surfaces. Insert the retest card in the same adaptive-surface region, below meals and above the habit stack, gated on `computeRetestStatus(...)` returning a `due-soon`/`overdue` status. Re-use the existing card idioms; do not invent a new card primitive.
- The "card clears after a covering draw" logic — read `allPanels()` and check whether any panel drawn on/after the plan's `createdAt` contains all the due markers (by `markerKey`). If so, the retest for those markers is satisfied and the card suppresses. Re-use the existing panel-loading helper the Today/Progress pages already use.
- `src/types.ts` — add `RetestStatus` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.retest-card` styled to match the existing Today adaptive cards (quiet-day, recap). Ink and ink-soft only; no oxblood (overdue is calm). The whole card is the tap target. Reuse the small-caps eyebrow token for any label.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate the card with the same `isSharedView()` / `isTour()` checks the rest of Today uses; shared-view never renders it, tour renders it only if the fixture cadence lands in-window.
- `tests/helpers/flows.ts` — re-use `composePlan` to produce a plan with a retest cadence; if the fixture plan's cadence weeks are fixed, add a `seedPlanWithRetest(page, { markers, weeks, createdAt })` helper that writes a Plan straight to Dexie so the spec can place the due date precisely relative to a controlled `now`. Drive `now` via Playwright's clock API or by passing a fixed date into the page if the page exposes one for testing; otherwise seed `createdAt` relative to the real `Date.now()`.
- `tests/e2e/retest-due.spec.ts` (new) — every acceptance bullet maps to a `test()`. The due-window tests seed `createdAt` such that `createdAt + cadenceWeeks` lands 9 days out, 1 day out, and 8 days past, and assert the exact copy and presence/absence.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying a due cadence, confirming zero off-allow-list egress during the card render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: due-soon reads "<markers> due for a recheck in <N> days — the protocol set this draw on <month day>." Overdue reads "Your <markers> recheck has been due since <relative> — when you have the new draw, it goes here." Declarative, no exclamation, no alarm. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only; no oxblood.

## Implementation log

(Appended by the implementation-dev agent during execution.)
