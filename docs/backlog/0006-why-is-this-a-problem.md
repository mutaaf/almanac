---
id: 0006
title: Per-marker "Why is this a problem?" expansion
status: groomed
priority: P1
area: plan
created: 2026-05-14
owner: gtm-innovation
---

## User story

As a user looking at "Total cholesterol persistently elevated" in my plan, I want to tap that finding (or the marker behind it) and read 2–3 paragraphs that explain what this means biologically, why we're treating it as a pattern, what specifically of *mine* drove the call, and what changes will move it — all without leaving the page or making another LLM call.

## Why now

### Product Owner
Today an insight tells you *what* but not *why*. Users either trust the call blindly or have to leave Almanac and Google. The "why" already exists in our marker DB (`description` field), in the insight engine's `detail` field, and in the user's own trend data. We're not generating it on the fly — we're presenting what we already know. This is a polish ticket that has outsized perceived-intelligence payoff.

### Stakeholder
This is one of the moments where the moat is most visible. Claude.app users can't get this kind of synthesis because they don't have the trend data, the curated marker DB, or the cross-marker rule engine. Showing the user the marker description + their own series + the rule that fired = a 3-second demonstration of why the app is more than a chatbot.

### User
Tap the chevron on any insight or marker. Slide-over from the side. Three short paragraphs: "what this marker is," "what yours has been doing," "what moves it." Tap close.

### Growth
Curious users stay longer when "tap to learn more" actually rewards them. The 2-3 paragraph expansion is also the most screenshot-friendly artifact in the app — clean, specific, undeniably about *them*.

## Acceptance criteria

- [ ] In dashboard mode, every `Insight` card with a `markerKey` renders a **"Why"** affordance (chevron + accessible label `Read why ${marker.shortName ?? marker.name} is on the list`).
- [ ] Tapping the affordance opens an in-page slideover element (`<aside class="slideover">`), NOT a route change. `location.hash` is unchanged before vs after open. No `history.pushState` calls fire.
- [ ] The slideover contains exactly three `<section>`s, in order, with the headings **"The marker"**, **"Your trajectory"**, **"How to move it"**.
- [ ] **The marker** body equals `findMarker(insight.markerKey).description` (or the matching user marker's description) verbatim. Asserted by test against a known marker.
- [ ] **Your trajectory** lists at most the last 6 chronological values for that markerKey across all panels: each row shows `drawnAt`, value with unit, and flag. Ordering is newest-to-oldest. If only 1 value exists, the section renders "Only one reading on file — upload earlier draws to see a trend" with an inline link to `#/labs`.
- [ ] **How to move it** renders (a) the insight's `detail` paragraph and (b) the titles of every `EatItem` and `Recommendation` (supplements) in the current Plan whose `markerKeys` includes this insight's markerKey, each rendered as a tap-target that scrolls to the matching card in the plan when the slideover closes.
- [ ] Slideover closes on backdrop tap, on `Escape` key, and on the explicit close button. Triple regression: focus returns to the originating chevron after close.
- [ ] On mobile-webkit, the slideover enters from the bottom (`.slideover--from-bottom`) and is at least 60vh tall; on chromium it enters from the right at ~480px wide.
- [ ] Zero new Anthropic calls fire during open/close (assert against `page.route` request count).
- [ ] Privacy E2E still passes.
- [ ] All scenarios pass on both chromium and mobile-webkit.

## Out of scope

- Editing the marker description inline. (Use the user-extensible markers ticket if disagreement.)
- LLM-on-tap "expand this in 3 more paragraphs." The expansion should feel snappy and local.
- Linking out to PubMed / external references. (Future ticket if there's demand.)

## Engineering notes

- `src/styles.css` — add `.slideover` base + `.slideover--from-right` (desktop) and `.slideover--from-bottom` (mobile, via `@media (max-width: 720px)`). Use the existing oxblood/ink/cream tokens. No purple, no gradient.
- `src/ui.ts` — add `openSlideover(html: string, opts?: { onClose?: () => void }): void` and `closeSlideover()`. Internally manages exactly one slideover instance under `<main id="app">` as a sibling (so route re-renders don't blow it away), wires backdrop / Escape / close-button, returns focus to `document.activeElement` at open time.
- `src/pages/plan.ts` — in dashboard mode's insight cards, add a `.insight-card__why` chevron when the insight has a `markerKey`. Click handler builds the three-section HTML from local data only: `findMarker()` for description, `allPanels()` (already in scope) for the trajectory, and the current plan's `eatList`/`supplements` filtered by markerKey for the "How to move it" tap-targets. Tap-target close handler calls `closeSlideover()` then scrolls the matching plan card into view via `scrollIntoView({ behavior: "smooth", block: "center" })`.
- `tests/e2e/plan.spec.ts` — extend with scenarios in the acceptance criteria. Use the existing `plan` fixture; pick an insight whose markerKey appears in eat list (e.g. apoB / triglycerides).
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

(empty)
