---
id: 0060
title: The plan recompose nudge — a quiet Today card when your protocol has gone stale, before the lapse becomes a churn
status: proposed
priority: P1
area: today
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user who composed a plan ten weeks ago, checked in faithfully for the first three, and then drifted, I want the Today screen to quietly tell me that the protocol I'm still half-following is older than the retest the plan itself recommended — and to give me one tap to recompose it — so that the moment I open the app after a quiet stretch, I land on a calm honest prompt to refresh the plan against my actual data, instead of a stale checklist that pretends nothing has aged.

## Why now (four lenses)

### Product Owner

The plan generator already writes a retest cadence into `Plan.retest` (the same field the 0028 "draw is due" card and `computeRetestStatus()` already read), and every plan carries a `generatedAt` timestamp. Today, when the soonest retest date passes, the 0028 surface points the user toward a draw — but if the user doesn't draw, nothing else on Today acknowledges that the plan itself is now older than its own self-declared horizon. The plan keeps rendering as if the day after composition. The smallest meaningful unit of value is a single Today card — "your protocol is older than the retest it set; ready to recompose?" — that appears ONLY when `computeRetestStatus()` returns `retest-overdue` AND that overdue window is ≥7 days, OR when the latest plan has no retest cadence and its `generatedAt` is ≥90 days old. One action: a "Recompose" button that navigates to `/#/plan` (which already has the compose flow). One dismiss: a "not yet" affordance that hides the card for 7 days via a local pref. The card vanishes the instant a new plan is composed. It is pure temporal logic — a `Date.now()` comparison against fields the database already stores — with no LLM call, no network, no new persistence beyond a single timestamp pref for the snooze.

### Stakeholder

This deepens the **adherence loop + retest cadence** moat exactly where the existing 0028 card stops. 0028 says "your draw is due"; this says "your *plan* is due." Together they convert the plan-and-retest pair from a one-shot artifact into a refresh ritual the app itself enforces, gently, without a server, a notification, or analytics. A chat box can't notice that a plan you composed has aged — it has no notion of "your plan's `generatedAt`" or "your retest cadence" because it has no persistent timeline. The recompose loop is the part of the moat that compounds: every refresh writes a new dated plan into the timeline that 0029 then diffs against, that 0042 will browse, that 0032 will detect "the marker moved" against. A user who recomposes once a quarter generates four dated plan revisions a year that no wrapper can replicate. And it is privacy-clean: a local read of the local plan's local timestamp, with no inference and no egress.

### User (at 7am on the phone)

I haven't opened this in a while. Today loads. Above my habits — calm, not red — sits one card: "Your protocol is older than the retest it suggested. Recompose now to refresh it against where you actually are?" One button: "Recompose." A small subtler "not yet" beneath it. No guilt, no streak-shaming, no asterisks. I tap Recompose, and I'm on the Plan page where the compose button already lives. If I tap "not yet," the card folds away for a week. If I leave the page, it's still there tomorrow. When I do compose, it's gone. Wet hands, half asleep — one tap repairs a ten-week drift.

### Growth

This is a pure retention ticket aimed at the most predictable churn pattern in any habit-and-protocol product: the silent drift after a strong first month. (Hypothesis: a calm, dated, plan-aware recompose nudge raises the rate at which a user who composed once composes a second time, versus a Today screen that never notices the plan has aged — because the cost of "should I refresh this?" collapses from a self-directed decision the user never makes to a one-tap repair the app proposes in context; back-of-envelope from how surfacing time-based maintenance prompts retains users of long-cycle products; treat as untested without remote analytics, which we will never add.) The "show me" frame is the card itself: a screenshot of "your protocol is older than the retest it set — recompose?" with a single Recompose button is exactly the kind of detail the persona forwards to the friend they introduced to the app, two months in, who hasn't opened it in a while. It is the lapse-prevention sibling of the welcome-back surface (0018) and the catch-up grid (0058): those handle "you came back" and "you slipped this week"; this handles "your whole plan is past its sell-by."

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/plan-stale.ts` (new) exports `computePlanStale(plan: Plan | undefined, retestStatus: RetestStatus | null, now: Date, snoozedUntil: number | null): { reason: "retest-overdue" | "no-retest-aged"; daysPast: number } | null`. Returns the stale state when `retestStatus.kind === "retest-overdue"` AND the overdue gap is ≥7 days; OR when `retestStatus === null` AND `(now - plan.generatedAt) / DAY_MS ≥ 90`; AND `now > snoozedUntil`. Returns `null` otherwise. Pure: no DOM, no Dexie, no network. Asserted by passing the documented combinations and confirming the return value.
- [ ] The Today page (`src/pages/today.ts`) renders the recompose nudge card when `computePlanStale(...)` is non-null. The card eyebrow reads "Protocol overdue"; the body reads "Your protocol is older than the retest it set." (for the overdue branch) or "Your protocol is N days old and has no retest set." (for the aged-no-retest branch). One primary action button reads "Recompose." A secondary affordance reads "Not yet." Asserted by seeding the two branches and confirming the copy.
- [ ] Tapping "Recompose" navigates to `/#/plan` (the existing plan page that already exposes the compose button) without modifying any persisted state. Asserted by tapping the button and confirming the location hash and that no extra writes hit Dexie.
- [ ] Tapping "Not yet" writes `snoozedUntil = now + 7 * DAY_MS` to a single key in `localStorage` (key: `almanac.planStale.snoozedUntil`) and removes the card from the page on re-render. The card does NOT reappear on a re-render within the 7-day window. Asserted by tapping the dismiss, re-rendering, and confirming the card's absence and the stored timestamp.
- [ ] The card reappears once the snooze expires (i.e. once `now > snoozedUntil`). Asserted by manipulating the stored timestamp into the past and confirming the card returns.
- [ ] Composing a NEW plan clears the stale state — the card is absent on the next Today render — because `Plan.generatedAt` is now fresh and any overdue cadence is reset against the new plan. Asserted by composing a new plan (via the existing compose path / a seeded plan) and confirming the card is absent.
- [ ] The card is ABSENT when the plan's soonest retest is in the future, or overdue by <7 days. Asserted on a plan whose `retest[0].whenWeeks * 7 days` from `generatedAt` lands in the future and on one overdue by 1 day.
- [ ] The card is ABSENT when there is no composed plan at all (nothing to be stale). Asserted on a profile with no plan.
- [ ] The card is ABSENT when the plan has no retest cadence (`retest: []`) and `generatedAt` is <90 days old. Asserted on a plan generated 60 days ago with empty `retest`.
- [ ] The card makes **zero Anthropic calls** and **zero network calls** — pure local temporal logic. Asserted by rendering the card across the documented branches and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string. Asserted by seeding a sentinel key, rendering the card, and confirming the key appears nowhere.
- [ ] Renders on both **chromium and mobile-webkit**. The card fits the 390 px viewport, both buttons are ≥44×44 css px tap targets (min-height ≥45 px per the 0017 sub-pixel lesson), and long body text wraps cleanly with `min-width: 0` on grid children. Asserted on both projects.
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT render the card — both modes use fixture data and have no real plan timeline to mark stale. Asserted in both modes.
- [ ] The existing Today surfaces — habit rows, meals, the streak strip, the 0028 retest card, the 0015 quiet-day card, the 0051 pre-draw primer, the 0058 catch-up grid — are unchanged in behavior. The stale card sits at a documented slot ABOVE the habit list (so it is the first thing read on a long-drift open). Asserted by rendering Today with the card present and confirming the existing surfaces still render with their existing behavior.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is a local read/write with no inference; no new hostnames.
- [ ] Schema migration: **no** — the snooze pref lives in `localStorage` (one key, one ms timestamp), reusing the AGENTS.md-blessed prefs path. No Dexie change.
- [ ] New `tests/e2e/plan-recompose-nudge.spec.ts` covers: `computePlanStale` for each branch and each negative case, the card renders for the two stale branches and not for the eight not-stale cases, the Recompose action navigates without writes, the "Not yet" snooze persists for 7 days and re-appears after, composing a new plan clears the card, tour/shared-view absence, zero Anthropic + zero network, the key never appears (sentinel), mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A push notification, web-push, badge, or service-worker reminder to recompose. AGENTS.md forbids the server side and the no-pressure posture forbids nag mechanics. The card appears only when the app is opened.
- An automatic recompose. The button only navigates to the plan page; the actual compose call remains a user-initiated action through the existing compose button (no surprise LLM call, no surprise spend).
- A user-configurable "stale after N days / N weeks past retest" knob. The thresholds are the documented constants (7 days past retest, or 90 days with no retest) — kept simple so the card is honest and predictable. A future ticket can revisit if data ever justifies it.
- An LLM call to summarize "what's changed since you composed" or to coach the user toward the recompose. The card is pure copy and pure temporal logic; the recompose itself uses the existing compose flow's inference.
- A new persisted store, a new Dexie version, or a stale-history table. The snooze is one `localStorage` key with a ms timestamp. The plan staleness is computed at render time against `Plan.generatedAt` and `Plan.retest`.
- Surfacing the card anywhere except Today. No Plan-page banner, no Settings indicator, no badge on the tab — Today is the daily-open surface; the card belongs there.
- Loss-framed or streak-shaming copy. The card reads "your protocol is older than the retest it set" — a neutral statement about the plan, not a verdict about the user. No "you've slipped," no "your streak is broken," no "you're behind."

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/plan-stale.ts` (new) — `computePlanStale(plan, retestStatus, now, snoozedUntil)`. Pure function over `Plan.generatedAt`, the `RetestStatus` already produced by `src/today/retest.ts::computeRetestStatus()`, the current time, and the snooze timestamp. Encodes the 7-day-overdue and 90-day-aged-no-retest thresholds as module-level constants (`STALE_OVERDUE_DAYS = 7`, `STALE_NO_RETEST_DAYS = 90`). No Dexie import.
- `src/pages/today.ts` — the page already calls `computeRetestStatus()` for the 0028 card. Reuse that result and pass it (plus the latest plan, `Date.now()`, and the read snooze) into `computePlanStale`. Render the recompose nudge above the habit list when non-null. Wire the Recompose button to `location.hash = "#/plan"`; wire "Not yet" to a single localStorage write and a re-render.
- `src/today/retest.ts` — read-only reuse of `computeRetestStatus()` and the `retest-overdue` kind. Do NOT change the retest logic; the stale card is a *sibling* surface, not a fork.
- `src/prefs.ts` (or wherever localStorage prefs already live; reuse the existing helpers — the codebase already stores small prefs like the consent gate). The snooze key is `almanac.planStale.snoozedUntil`, storing a ms-epoch number. If a prefs helper module does not exist, the read/write can inline `localStorage.getItem` / `setItem` with the documented key — but reuse any existing wrapper.
- `src/types.ts` — no new persistent types. `Plan.generatedAt: number` and `Plan.retest: RetestItem[]` already exist.
- `src/styles.css` — `.plan-stale-card` reusing the existing Today-card idioms (the 0028 retest card is the closest template). No new colors; ink, ink-soft, oxblood for the eyebrow accent. Grid children `min-width: 0`. Both buttons get the existing primary/secondary button classes, and a documented `min-height` ≥45 css px for the sub-pixel-safe tap target.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the card with `!isTour() && !isSharedView()`. Tour fixture data should not trip the staleness check; explicitly suppress regardless of the fixture plan's age.
- `tests/helpers/flows.ts` — reuse the existing `seedPlan` helper (used by 0028's specs) so the spec can seed a plan with a specific `generatedAt` and `retest` cadence without composing. Add a small `setPlanStaleSnooze(page, snoozedUntil)` helper if not already shared.
- `tests/e2e/plan-recompose-nudge.spec.ts` (new) — every acceptance bullet maps to a `test()`. The branch tests seed plans whose `generatedAt + (retest[0].whenWeeks * 7d)` land at known offsets from `now`; the snooze test asserts the localStorage write and the absence of the card on re-render.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit on a stale plan, rendering and dismissing the card, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — pure render-time temporal logic + one localStorage pref.
- Voice spec: the card eyebrow reads "Protocol overdue"; the body reads "Your protocol is older than the retest it set." (or "Your protocol is N days old and has no retest set."); primary button "Recompose"; secondary "Not yet." Declarative, neutral, no streak-shame, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood accent for the eyebrow only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
