---
id: 0011
title: Demo mode — see the populated app in 10 seconds, no key required
status: proposed
priority: P0
area: growth
created: 2026-05-16
owner: gtm-innovation
---

## User story

As someone who landed on Almanac from a friend's screenshot, a tweet, or a link in a forum thread, I want a single button on the welcome screen that drops me into a fully-populated demo — three lab panels across nine months, an active plan with an eat list and habit stack, a week of meals, ten days of check-ins, and a Sunday recap waiting on Today — so I can actually feel what the app does before I commit to typing in my goals, my key, and uploading a PDF.

## Why now (four lenses)

### Product Owner
The current welcome screen is a wall of three privacy disclaimers and a checkbox, then onboarding asks for name / DOB / sex / height / weight / goals / conditions / diet pattern / Anthropic key before the user sees a single feature. That's a minutes-long form before the user has any reason to trust it's worth the work. The smallest meaningful unit of value is a one-tap path into a read-only, seeded version of the app where every screen is populated. We're not removing the consent gate — we're adding a second door labeled "show me first."

### Stakeholder
This is the cheapest acquisition lever we have access to. We can't run a backend, can't push to social, can't email a follow-up. The only growth surface is the moment a curious visitor hits the URL — and right now we lose them at the consent splash. A demo mode that seeds a realistic profile + 3 panels + plan + meals + check-ins into a separate IndexedDB namespace (so it can never contaminate a real user's data) widens no surface, costs zero infra, and turns the welcome page from a contract into a showroom. It also exercises every paint path with realistic data on every build — so visual regressions in the editorial voice get caught the moment a developer opens the demo.

### User (at 7am on the phone)
A friend texts a link. I tap it on my phone. I see the welcome page. Below the consent checkbox, a quieter link: "Just want to look around? Open the demo." I tap it. The masthead loads with a name that's clearly not mine ("Sample Reader"), a populated Today screen with three meal tiles, a habit stack, a Sunday recap card, and a small persistent banner across the top: "Demo data — nothing you do here is saved. Start your own →." I tap through Plan, Meals, Labs, Progress. Every screen has real content. Two minutes later I tap "Start your own" and land in the real onboarding, this time knowing what I'm signing up for.

### Growth
This is the missing wedge between a screenshot and a signup. Today the show-me artifact is something the user has to build from their own data; for new visitors with no labs handy, there is literally nothing to show. With demo mode, the URL itself is the artifact — a friend can text "almanac-nu.vercel.app, tap the demo link" and the conversion path is one tap from cold to populated. Hypothesis: this moves the first-session-to-feature-touch rate from the current floor (effectively gated by uploading a PDF or composing from intake) to >70%, measured locally via the per-visit telemetry already in place.

## Acceptance criteria

- [ ] Welcome screen renders a secondary link below the consent checkbox, copy: `Just want to look around? Open the demo.` The link is keyboard-accessible and styled with the existing ghost-button / quiet-link tokens — no new colors, no purple.
- [ ] Tapping the demo link routes to `#/today?demo=1`. The consent gate in `src/main.ts` treats the `demo=1` param as an explicit consent acknowledgment (one-time, scoped to demo) and routes through without redirecting to `#/welcome`.
- [ ] On first entry into demo mode, a synchronous seeding pass populates a separate Dexie database named `almanac-demo` with: 1 `Profile` (Sample Reader, sex `unspecified`, distinctive goals string `wants to translate lab numbers into a daily plan`), 3 `Panel` rows with `drawnAt` 9 months / 4 months / 1 month ago (each containing at least 6 markers across lipids/metabolic/iron/vitamins so the insight engine fires), 1 `Plan` row (the existing `tests/fixtures/plan.json` shape, lightly customized to reference the seeded markers), 1 `MealPlan` row covering this calendar week, 10 `CheckIn` rows across the prior 14 days (varied adherence so the recap has real numbers), 0 `userMarkers`. No `anthropicKey` is set.
- [ ] All persistence helpers in `src/db.ts` (`getProfile`, `allPanels`, `latestPlan`, etc.) read from the demo database while demo mode is active and from the real database otherwise. The switch is by Dexie instance, not by query filter — there is zero chance of cross-contamination.
- [ ] A persistent banner renders above the masthead on every page in demo mode: `Demo data — nothing here is saved. <a>Start your own →</a>`. Tapping the link routes to `#/welcome` and exits demo mode (closes the demo Dexie connection, clears the demo session flag in `sessionStorage`).
- [ ] Demo mode is `sessionStorage`-scoped, not `localStorage`-scoped. A new tab does NOT inherit demo mode; closing the tab ends the demo. (Justification: this is a showroom, not a save state — and it keeps the real-user contract pristine across browser sessions.)
- [ ] Any action that writes data while in demo mode (compose plan, save check-in, swap a meal, add a panel) is intercepted at the page level: the action shows an inline `errorCard()` with `Demo mode — start your own to save this.` and offers the `Start your own →` link. Asserted on at least Today (save check-in), Plan (compose), and Meals (swap a meal).
- [ ] The Anthropic key field on Settings is hidden in demo mode (the seeded profile has none, and we never want a visitor to type their key into a session that gets thrown away).
- [ ] Privacy E2E still passes — no new hostnames, no telemetry calls, no demo-mode beacons. The seeding pass touches IndexedDB only.
- [ ] All scenarios pass on both chromium and mobile-webkit.
- [ ] New `tests/e2e/demo.spec.ts` covers: link visibility on welcome, route bypass of the consent gate when `demo=1` is present, seeded counts on every screen (3 panels, 1 plan, 7 days of meals, 10 check-ins), banner presence, write-attempt interception on Today/Plan/Meals, key field hidden on Settings, session-scoped exit on tab close (simulated by `sessionStorage.clear()` then reload).

## Out of scope

- A "try with my own key" inside demo mode. The demo is read-mostly; live composition is a real-mode feature.
- Persisting any user action made inside demo mode. The user does not get to "save their demo" — they leave demo mode and start fresh.
- Multiple demo profiles ("show me an athlete vs a perimenopausal woman"). One representative profile is the right v1; multi-profile is a future ticket if real demand surfaces.
- A guided product tour with tooltips. The seeded data IS the tour. We trust the editorial voice and the populated screens to explain themselves.
- A URL-shareable demo state ("here's the exact view I saw"). All demo sessions start from the same seed; deep-linking inside demo mode is good enough.

## Engineering notes

- `src/db.ts` — refactor the singleton `db` export into a small accessor: `db()` returns either the real `AlmanacDB("almanac")` or the demo `AlmanacDB("almanac-demo")` based on a module-level `demoActive: boolean` flag set during routing. Every existing call site already uses the helpers exported from this file — only the helpers need to thread through `db()` instead of `db`. The Dexie class is unchanged; we instantiate two named DBs.
- `src/main.ts` — before the existing consent + profile checks, inspect the URL params for `demo=1`. If present and not already in demo mode, flip the module flag in `db.ts`, set `sessionStorage.setItem("almanac.demo", "true")`, and call a new `seedDemoIfEmpty()` from `src/demo/seed.ts` that idempotently inserts the fixture data into the demo DB. The seeded data is checked by counting panels — if `>= 3`, the seed is skipped.
- `src/demo/seed.ts` — new module. Exports `seedDemoIfEmpty()` and `exitDemo()`. The fixture data lives in `src/demo/fixture.ts` as a single `DemoSnapshot` literal, easy to evolve without touching the seeding logic. Keep the fixture parallel to the test fixtures (`tests/fixtures/plan.json`, `extraction.json`) so visual review is easy.
- `src/pages/welcome.ts` — add the secondary link below the consent checkbox. Handler navigates to `#/today?demo=1` (no consent acknowledgment in localStorage; the `demo=1` param is the signal).
- `src/chrome.ts` — emit the demo banner above the masthead when `sessionStorage.getItem("almanac.demo") === "true"`. Reuses existing layout tokens; one new CSS class `.demo-banner` in `src/styles.css`.
- `src/pages/today.ts`, `src/pages/plan.ts`, `src/pages/meals.ts` — wrap the write paths (`upsertCheckIn`, `composeFromIntake`, `compose`, `swapMeal`, `addPanel`, etc.) in a `isDemo()` check that surfaces the editorial `errorCard()` instead of writing. Centralize `isDemo()` in `src/demo/seed.ts`.
- `src/pages/settings.ts` — when `isDemo()`, omit the Anthropic key field entirely; render a quiet line: `Key entry is disabled in demo mode.`
- `tests/helpers/flows.ts` — add a small `enterDemo(page)` helper that visits `#/today?demo=1` and waits for the masthead. Keep it parallel to `onboard()` so future demo specs stay readable.
- Schema migration: **no** — the demo DB uses the same Dexie schema (v5). New named DB instance, not a new version.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

(empty — pick up via `/ship 0011`)
