---
id: 0061
title: The setup invite card — a persistent "check your own numbers" prompt for prospects in the tour or a shared view who haven't keyed in
status: proposed
priority: P1
area: growth
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a prospect who came in through the sample tour or a friend's shared protocol and likes what I see but hasn't set up my own account, I want a clear, persistent prompt inside the app that tells me exactly the three steps to start — get an API key, upload my labs, compose my protocol — and takes me straight to the key field, so that I don't have to guess what "start your own" actually involves and bounce before I ever try it.

## Why now (four lenses)

### Product Owner

There are now two strong pre-key entry points — the sample tour (0014) and the shared-protocol view (0017/0020) — and both are working: prospects land, look around, and see the artifact. But the path from "looking" to "doing" is under-signposted. A prospect in the tour sees a banner notice when they try to write, and a shared-view recipient gets an adopt CTA on the Plan page, but there is no single, always-present prompt that names what setup costs and where to begin. The smallest meaningful unit of value is one persistent invite card — "Ready to check your own numbers?" — that renders in tour and shared-view modes for visitors who have NOT yet saved a real profile, lists the three concrete steps, and deep-links to the key field on onboarding. It is a conversion surface, not a new feature: it removes the guesswork between interest and action.

### Stakeholder

This widens the top of the funnel without touching the privacy contract: the not-yet-keyed state is detected locally (`!hasRealProfile()`), the card writes nothing, and the link is an in-app hash navigation — no backend, no analytics, no egress. It protects the moat by converting the two artifacts that already showcase it (the tour and the share link) into actual residents. Every moat surface — the persistent timeline, the functional-range scoring, the adherence loop — only compounds for users who have keyed in and uploaded labs; this card is the bridge that turns a one-time visitor into someone who has data on the device. It is cheap moat leverage: it deepens nothing new, but it raises the rate at which the existing depth gets used.

### User (at 7am on the phone)

I'm reading my friend's shared protocol on my phone, or poking through the sample tour, and I think "I want this for my own labs." Right there, without hunting, is a calm card: "Ready to check your own numbers?" Under it, three plain lines — get an API key (here's where), upload your labs, compose your protocol — and one button that drops me straight onto the setup screen with the key field ready. I don't have to figure out what "onboarding" means or where to paste a key. One tap from curiosity to starting, and because it's just an in-app navigation it works even when my signal is one bar in the kitchen.

### Growth

This is a pure acquisition ticket aimed at the conversion gap between the showcase surfaces and a real first session. (Hypothesis: a persistent, step-naming invite with a direct deep-link to the key field raises the rate at which tour and shared-view visitors start onboarding, versus the current implicit path where the next step is only discoverable by tapping around; back-of-envelope from how explicit, low-step "here's exactly what to do next" prompts lift activation in trial-to-paid funnels; treat as untested without remote analytics, which we will never add.) The card itself is part of the viral mechanic: a shared protocol that arrives with a clear "here's how to do this with your own numbers" closes the loop the share button (0050) opens — the friend who received the link now has an obvious door. It is the activation sibling of the tour (0014) and the share link (0017): those earn the look, this turns the look into a setup.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] `src/growth/setup-invite.ts` (new) exports `shouldShowSetupInvite(): Promise<boolean>` returning true only when (a) the app is in tour mode (`isTour()`) OR shared-view mode (`isSharedView()`), AND (b) no real profile exists on the device (`!(await hasRealProfile())`). Returns false in every normal (keyed, onboarded) session. Asserted by stubbing/seeding each combination and confirming the boolean.
- [ ] In TOUR mode with no real profile, the setup invite card renders. Asserted by entering the tour and confirming the card is present with its eyebrow "Ready to check your own numbers?".
- [ ] In SHARED-VIEW mode with no real profile, the setup invite card renders. Asserted by opening a valid shared link and confirming the card is present.
- [ ] For a fully onboarded user with a real profile (the normal app), the card does NOT render anywhere. Asserted by onboarding a real profile and confirming the card is absent on Today, Plan, Meals, and Progress.
- [ ] A returning user who has a real profile but happens to open a shared link does NOT see the card (they already have their own account; the existing adopt-CTA gating already distinguishes this via `hasRealProfile()`). Asserted by onboarding a real profile, then opening a shared link, and confirming the card is absent.
- [ ] The card names exactly three steps in order: (1) get an Anthropic API key, (2) upload your labs, (3) compose your protocol. Asserted by confirming the three step labels render in that order.
- [ ] The card's primary action navigates to the onboarding/consent setup screen with focus (or a deep-link target) on the API key field (`#key`). Tapping it leaves tour/shared-view mode appropriately and lands the user on the setup screen with the key field reachable. Asserted by tapping the action and confirming the route is the onboarding screen and the `#key` field is present and focused (or scrolled into view per the documented affordance).
- [ ] Because the setup screen sits behind the consent gate, tapping the action routes through the existing consent flow without bypassing it — the consent gate is NOT skipped or weakened. Asserted by confirming a not-yet-consented visitor lands on consent first (or the documented consent-then-key path) and is never dropped past the gate.
- [ ] The card makes ZERO Anthropic calls and ZERO network calls — it is a local render plus an in-app hash navigation. Asserted by rendering the card and confirming the Anthropic mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string (the card is shown precisely when no key exists, but assert it cannot surface a seeded sentinel key either). Asserted by seeding a sentinel key, forcing a tour render, and confirming the key appears nowhere.
- [ ] Renders on both **chromium and mobile-webkit**: the card and its three steps fit the 390 px viewport without horizontal scroll, the action button is a ≥44×44 css px tap target (min-height ≥45 px per the 0017 sub-pixel lesson), and long copy respects `min-width: 0`. Asserted on both projects.
- [ ] The existing tour and shared-view surfaces — the tour write-notice banner, the shared-view "adopt as a starting point" CTA (0020), the shared-view "not shared with you" empty states — are unchanged in behavior; the invite card is purely additive at a single documented slot. Asserted by exercising the existing tour/shared flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card renders and its action navigates with no new hostnames in the egress allow-list.
- [ ] New `tests/e2e/setup-invite.spec.ts` covers: `shouldShowSetupInvite` truth table, the card present in tour and in shared-view (no profile), absent for an onboarded user, absent for a returning user opening a shared link, the three ordered steps, the action navigates to setup with the `#key` field reachable, the consent gate is not bypassed, zero Anthropic + zero network, the key never appears (sentinel), the existing tour/shared surfaces unchanged, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- A backend-issued referral code, invite tracking, or any server round-trip to "claim" the setup. The card is a local render and an in-app navigation; nothing leaves the device.
- Analytics on whether the card was shown, tapped, or converted. No counters, no localStorage tally exfiltrated anywhere, no event tracking. The privacy contract forbids it and this ticket adds none.
- Pre-filling, generating, or buying an Anthropic key for the user. Step one POINTS to where the key goes (the `#key` field) and may link out to Anthropic's own key page; it never handles or fabricates a key.
- Skipping or weakening the consent gate to make the deep-link shorter. The action routes through consent exactly as a normal first-run does; the deep-link is to the key field, not past the gate.
- Showing the card to existing, keyed users as an upsell or re-onboarding nudge. It renders ONLY in tour/shared-view modes for visitors with no real profile.
- A multi-screen onboarding wizard or a redesign of the onboarding form. This ticket is one card plus a deep-link; the onboarding screen itself is unchanged except for being a navigable target with the key field reachable.
- Carrying the tour/shared-view data into the new profile. That carry-over is the adopt-and-adapt flow (0020) and the bring-your-sandbox-numbers flow (0049); this card just gets the prospect to the setup screen.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/growth/setup-invite.ts` (new) — `shouldShowSetupInvite()` reads `isTour()` (`src/sample/state.ts`), `isSharedView()` (`src/share/shared-state.ts`), and `hasRealProfile()` (`src/db.ts`). Also export a `renderSetupInvite(): string` that returns the card markup (eyebrow + three steps + the deep-link button) so the page layer mounts a string, matching the existing card idioms.
- The card's host page — render it at one documented slot visible in both tour and shared-view (e.g. on the shared/tour Plan page, or as a shared chrome element). Pick ONE slot, document it, and gate it behind `shouldShowSetupInvite()`. Do not scatter it across every page.
- `src/pages/onboarding.ts` — the deep-link target. The key field is already `#key`; ensure the route can focus/scroll to it (add an `autofocus` affordance or a hash-fragment scroll target if not already present). Do not restructure the form.
- `src/pages/welcome.ts` — the consent gate. The action must route through consent for a not-yet-consented visitor (the existing flow already does this); confirm the deep-link does not bypass `consentAcknowledged()`.
- `src/sample/state.ts` — `exitTour()` exists; tapping the setup action should leave tour mode cleanly so the real onboarding screen renders (not the tour shim). Reuse the existing exit; do not invent a new one.
- `src/styles.css` — `.setup-invite` (the card), `.setup-invite__steps` (the three-step list), reusing the existing card / CTA idioms (the recap-card and adopt-notice blocks are templates). Action button `box-sizing: border-box; min-height: 45px`. No new colors; ink, ink-soft, oxblood for the action. Grid children `min-width: 0`.
- `tests/helpers/flows.ts` — reuse `acknowledgeConsent`, `onboard`, and the existing tour-entry / shared-link-open helpers so the spec can drive each mode without re-creating the click sequences.
- `tests/e2e/setup-invite.spec.ts` (new) — every acceptance bullet maps to a `test()`. The truth-table test drives each (mode × hasRealProfile) combination; the navigation test taps the action and asserts `location.hash` is the onboarding route and `#key` is reachable/focused.
- `tests/e2e/privacy.spec.ts` — extend with a tour/shared-view render of the card and its navigation, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no** — if step one links out to Anthropic's key page, it is an external anchor the user taps (a new browser navigation), NOT an in-app fetch; it does not widen the page's egress allow-list and the privacy test (which checks the app's own requests) stays green. Document the anchor target.
- Schema migration: **no** — the card writes nothing; detection is a read of existing local state.
- Voice spec: the eyebrow reads "Ready to check your own numbers?"; the three steps read plainly (e.g. "Get an Anthropic API key", "Upload your labs", "Compose your protocol"). Declarative, no exclamation beyond the single question. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the action.

## Implementation log

(Appended by the implementation-dev agent during execution.)
