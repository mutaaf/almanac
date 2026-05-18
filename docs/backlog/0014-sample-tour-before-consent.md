---
id: 0014
title: Sample tour before consent — let prospects see the artifact before trusting it
status: in-progress
priority: P1
area: growth
created: 2026-05-18
owner: gtm-innovation
---

## User story

As a health-curious adult who clicked an Almanac link from a friend's text or a forum post, I want a "Take a tour with a sample profile" path on the welcome screen that lets me navigate a fully-populated read-only Almanac — plan, meals, progress, compare, share card — without acknowledging consent, typing my name, pasting an API key, or uploading anything I own, so that I can decide whether this product is worth the friction of onboarding *after* I've already seen the artifact, not before.

## Why now (four lenses)

### Product Owner

Today the welcome screen is a single funnel: read three privacy points, tick a checkbox, click Continue, fill an eight-field onboarding form, paste an API key, then — and only then — choose between "upload labs" or "compose from intake." The product is honest with the user about what it requires, but it is asking the user to trust the protocol *before* the user has seen a single output. That order is upside-down for an editorial product whose whole differentiator is the artifact. Every shipped feature since v1 — the eat list, the meal plan, the comparison page, the share card, the recap, the provenance slideover — exists to be *shown*, not described. The smallest meaningful unit of value here is a second button on the welcome screen, next to the Continue button, labeled "Take a tour with sample data" — a button that drops the user inside a sandboxed Almanac populated with one fictional user (a 38-year-old halal-pescatarian with a familiar two-lab history) and every shipped surface fully rendered. Nothing is composed, nothing is written, no Anthropic call fires. The user navigates Today, Plan, Meals, Progress, Compare, Recap, the share card. Then they hit a single "Start your own — clear this and onboard" CTA in the masthead and the sample state is wiped (a localStorage flag, not the IndexedDB they don't yet have). This is a one-day ticket whose entire job is to invert the trust order.

### Stakeholder

The moat surfaces shipped so far — the persistent timeline, functional ranges, the deterministic insight engine, the structured artifact, the share card — are surfaces a prospect *cannot see* until they have onboarded. That means our acquisition story is currently selling everything we are *not* (no backend, no analytics, BYOK) without showing anything we *are*. The sample tour widens the structured-artifact moat into a third audience — the pre-consent visitor — and it does so with no new product mechanics, no schema migration, no new prompt, no new dependency. A fixture-only feature whose entire surface is "render the existing pages against a sample IndexedDB state instead of the user's real one" is the cheapest possible way to make the moat *demonstrable* at the moment of highest funnel friction. It also shores up the privacy contract in the most adversarial setting (the suspicious prospect): the tour proves there is no backend by being browsable with the network tab closed, no Anthropic key in localStorage, no key prompt anywhere. The privacy promise is now a property the prospect can observe, not a property they have to take on faith.

### User (at 7am on the phone)

I tap a link in a friend's iMessage. The welcome page loads. Below the three privacy points there are two buttons: "Continue to onboarding" (greyed until I tick the box) and "Take a tour with sample data" (always live). I tap the tour button. The masthead appears. I'm on Today, looking at a real protocol for someone named "Sample Reader" — three meals on cards, a habit stack of three habits, a 14-day streak strip half-filled. I tap Plan. I see the eat list. I tap Meals. I see seven days. I tap Progress. I see a sparkline. I tap Compare. I see two draws. I tap "Share this marker" on the ApoB row. The OS share sheet opens with a real PNG. There is a small persistent banner across the top of every page: "You're touring a sample. Nothing here is yours. Tap to start your own." I tap it. The sample state clears. I land on the welcome screen, this time ready to tick the box.

### Growth

This is the single biggest conversion lever we have available without weakening the privacy contract. Today the funnel is: visit → consent → onboard → API key → upload → see the artifact. Five steps before the show-me moment. With this ticket, the funnel becomes: visit → see the artifact → consent → onboard → API key → upload. The four onboarding-shaped steps still exist, but they exist on the *far* side of the trust event instead of the near side. (Hypothesis: a static-fixture tour of a credible editorial artifact converts visit-to-onboarded at 3–5× the rate of a consent-first gate; this is back-of-envelope from comparable patterns in indie SaaS like Linear's demo workspace and Cal.com's `/demo` route — treat as untested until we see whether the small "Start your own" CTA in the masthead is clicked at all.) The tour is also the artifact a friend can text without the friend needing to install anything: the sender pastes a link with `#/sample` and the receiver lands in a fully-populated Almanac on their own phone. That is the closest we can come to a viral artifact while still being a single-tenant local-first app.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The welcome screen at `#/welcome` gains a second button below the consent checkbox: **"Take a tour with sample data"**. The button is always enabled (the consent checkbox does not gate it). The existing "Continue to onboarding" button remains greyed until the consent box is ticked — unchanged from today.
- [ ] Tapping the tour button sets a sentinel flag `localStorage["almanac.tour"] = "true"` and routes to `#/today`. The consent flag (`almanac.consent.v1`) is NOT set by the tour button — touring is not consenting.
- [ ] When `almanac.tour === "true"`, the router (`src/main.ts`) bypasses the consent gate AND the profile gate; every route renders against a sample profile + sample panels + sample plan + sample meal plan + sample check-ins served from a new `src/sample/fixture.ts` module instead of IndexedDB. The sample state is in-memory only — the tour writes nothing to IndexedDB and reads nothing from it.
- [ ] Every page in the tour renders without firing a single Anthropic call. Asserted across `#/today`, `#/plan`, `#/meals`, `#/progress`, `#/progress?compare=1,2`, `#/recap`, `#/labs`, `#/labs?id=1` by snapshotting the mock's request count over a full navigation sweep.
- [ ] The sample profile is named "Sample Reader" with sex `male`, halal-pescatarian dietary pattern, "Lower cholesterol, more afternoon energy" goals, and a non-functional API-key placeholder `sk-ant-SAMPLE` that the tour code never sends anywhere. The placeholder is asserted by reading the in-page profile object and confirming it equals `sk-ant-SAMPLE` verbatim — proving the tour does NOT use the real user's key even if one happens to exist in a separate browser profile.
- [ ] The sample data set includes: two panels with overlapping markers (ApoB, ferritin, hsCRP, vit-D, fasting insulin) chosen so the insight engine fires `iron_restricted_erythropoiesis` and the projection cards from 0012 render against the prior panel; a composed plan with at least one insight carrying `provenance` so the chip from 0013 is exercised; a meal plan with seven days; ten days of check-ins so the 14-day streak strip and the recap (on a Sunday tour) both have data.
- [ ] A persistent **tour banner** renders above the masthead on every page when `almanac.tour === "true"`: "You are touring a sample. Nothing here is yours. Start your own →". The arrow link routes to `#/welcome` AND clears `almanac.tour` AND clears any in-memory sample state. The banner is suppressed when the flag is absent (so real users never see it).
- [ ] Tapping any write action during the tour — compose plan, save check-in, save manual panel, swap meal, generate meals, save profile, delete a panel, import Apple Health, define a user marker — surfaces an inline notice ("This is the sample tour. Start your own to write data.") and is a no-op against IndexedDB. The notice is rendered via the existing `errorCard()` pattern but with the ink token, not the oxblood error token — it is informational, not a failure.
- [ ] After the user clicks "Start your own" in the banner, `localStorage["almanac.tour"]` is gone, the consent gate is back in force, and the user lands on `#/welcome` with the consent checkbox unticked. A real onboarding after the tour produces a real IndexedDB profile with the real ownerName the user types — the sample profile does NOT leak into the real state.
- [ ] The share card (ticket 0011) works in the tour: tapping "Share marker" on a comparison row produces a PNG whose dataURL contains the marker name and value pair from the sample fixture and contains NONE of the literal string "Sample Reader" (the share card already excludes the profile name; the assertion catches a regression where a future code path leaks it).
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes. The egress allow-list is unchanged. The tour never widens the surface.
- [ ] All scenarios pass on both **chromium and mobile-webkit**. Mobile is in-scope — the share-this-link-with-a-friend channel is mobile-dominant.
- [ ] New `tests/e2e/sample-tour.spec.ts` covers: button appears on welcome, tour button bypasses consent, every page renders against the sample fixture, zero Anthropic calls during a full sweep, write actions are no-ops, banner present and dismissable, "Start your own" clears the tour state without contaminating onboarding.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A second deployable subdomain hosting the tour. The tour is a runtime flag on the same SPA — no separate deploy, no separate Vercel project, no separate `vercel.json`. Adding a second host would widen the operational surface for zero gain.
- Personalizing the tour for the visitor (geo-locating, time-of-day greeting, etc.). The sample is a single deterministic fixture for everyone. Variability defeats the point: the tour is a *demo*, not a quiz.
- A "build the tour from a referrer's anonymized data" mechanism. Even with the friend's consent this would require shipping data over the network, which we don't do. Friends share the tour link; the link renders the same canned sample.
- A "Try it with my own labs" path that skips consent. Consent stays. The tour is for *sample* data; user-owned data still goes through the front door.
- A "save the tour as my real state" button. The two states are deliberately quarantined. Mixing them muddies the privacy contract.
- An LLM-generated sample. The sample fixture is hand-curated JSON committed to the repo so the tour is byte-for-byte deterministic and CI-asserted. No Anthropic call fires during a tour, ever.
- Adding the tour link anywhere outside `#/welcome`. The point is to subvert the consent gate at the gate itself, not to bury the entry deeper in the funnel.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/sample/fixture.ts` (new) — exports a typed `SampleState` containing one `Profile`, two `Panel[]`, one `Plan` (with at least one insight carrying `provenance`), one `MealPlan`, ten `CheckIn[]`. All fields are real values that already type-check against `src/types.ts`. The plan is hand-edited from `tests/fixtures/plan-with-provenance.json` so any future schema change to `Plan` breaks both fixtures at typecheck time, not at runtime. The fixture is imported lazily (`await import("../sample/fixture")`) so the production bundle's TTI is unaffected for non-tour visitors.
- `src/sample/state.ts` (new) — a tiny module that exposes `isTour(): boolean` (reads the localStorage flag), `enterTour(): void` (sets the flag), `exitTour(): void` (clears the flag + any in-memory cache), and a *getter shim* (`tourProfile()`, `tourPanels()`, etc.) that returns the fixture data. Mirrors the shape of the `src/db.ts` helpers (`getProfile`, `allPanels`, `latestPlan`, …) so the page code can branch on `isTour()` and call the tour getter instead of the Dexie getter at every read site. The shim returns deep clones so a page that mutates an array (e.g. the meals page sorting `days`) doesn't poison subsequent reads.
- `src/db.ts` — add a *thin* wrapper around each read used by the pages (`getProfile`, `allPanels`, `latestPlan`, `latestMealPlan`, `recentCheckIns`, `allPlans`, `getPanel`) that consults `isTour()` first and returns the sample getter's value when true. This avoids editing every page individually. Writes (`savePlan`, `saveMealPlan`, `upsertCheckIn`, `addPanel`, `deletePanel`, `updatePanel`, `saveProjections`, `addUserMarker`, `deleteUserMarker`, `saveProfile`) get a guard at the top: `if (isTour()) { surfaceInlineTourNotice(); return; }`. The notice helper lives in `src/ui.ts` next to `errorCard`.
- `src/main.ts` — the router currently checks `consentAcknowledged()` then `getProfile()`. Add a third branch at the top: when `isTour()` is true AND the route isn't `#/welcome`, skip both gates and proceed straight to the page renderer. Routing to `#/welcome` explicitly (via the banner CTA) also calls `exitTour()` so the consent gate is back the next render.
- `src/pages/welcome.ts` — add the second button. Wire it to `enterTour()` + `location.hash = "#/today"`. Do NOT call `ackConsent()` — that's the point of the ticket.
- `src/chrome.ts` — `masthead()` gets a one-line prepend: when `isTour()` is true, emit a `.tour-banner` block before the existing `<header class="masthead">`. The banner is plain HTML — text + an `<a href="#/welcome" data-action="exit-tour">Start your own →</a>`. Wire the click handler in a shared place (probably `src/main.ts` post-render, since the masthead is re-emitted on every route).
- `src/styles.css` — `.tour-banner` (full-bleed, cream-on-ink, Inter Tight small caps, ~1.4rem tall, a single hairline rule at the bottom in the existing rule token). No new colors. The banner is informational, not promotional — restraint.
- `tests/helpers/flows.ts` — add `enterTour(page)` and `exitTour(page)` helpers that mirror `acknowledgeConsent` / `onboard`. Used by the new spec; not used by existing specs (they continue through the real consent path, since the existing specs are testing the real product, not the tour).
- `tests/e2e/sample-tour.spec.ts` (new) — every acceptance bullet maps to a `test()`. Re-use the existing `tests/helpers/mocks.ts` to assert zero Anthropic calls; the mock's request count helper is already exercised by the share-card spec, so the pattern is established.
- `tests/e2e/privacy.spec.ts` — extend the existing allow-list assertion to also run after a full tour sweep (visit every page in the tour and confirm no new hostnames appeared). Same allow-list, new traversal.
- Schema migration: **no**. The tour writes nothing.
- Egress allow-list change: **no**. The tour fires nothing.
- New deps: **no**.
- Voice spec for the tour banner copy: "You are touring a sample. Nothing here is yours." — one declarative sentence, no exclamation, no "amazing/journey/exciting".

## Implementation log

(Appended by the implementation-dev agent during execution.)

### 2026-05-18 — start

Branch `feat/0014-sample-tour` created. Status moved to `in-progress`. Plan:
write `tests/e2e/sample-tour.spec.ts` first, extend `tests/e2e/privacy.spec.ts`
with a full tour-traversal allow-list assertion, then build the sample fixture
+ tour state module + db read/write shims + router branch + welcome button +
banner + inline tour-notice helper. No schema migration, no egress widening,
no new deps.
