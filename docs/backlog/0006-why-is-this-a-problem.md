---
id: 0006
title: Per-marker "Why is this a problem?" expansion
status: proposed
priority: P2
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

- [ ] Every insight card in dashboard mode has a chevron / "why" affordance.
- [ ] Tapping opens an in-page slideover (NOT a route change) with three labeled sections: **"The marker"**, **"Your trajectory"**, **"How to move it"**.
- [ ] **The marker** is the description from `MARKERS[].description` (or user marker description) — no LLM call needed.
- [ ] **Your trajectory** lists the user's last 6 values for the supporting marker(s), each with its date, value, unit, and flag.
- [ ] **How to move it** is the existing `insight.detail` plus the eat-list and supplement items whose `markerKeys` include this marker (cross-referenced from the current Plan).
- [ ] Slideover closes on backdrop tap, escape key, or close button. No history.pushState pollution.
- [ ] Works on mobile-webkit (slideover slides from bottom on mobile).
- [ ] No new Anthropic call (the data is all local).
- [ ] Test in `tests/e2e/plan.spec.ts` covering open + content + close.

## Out of scope

- Editing the marker description inline. (Use the user-extensible markers ticket if disagreement.)
- LLM-on-tap "expand this in 3 more paragraphs." The expansion should feel snappy and local.
- Linking out to PubMed / external references. (Future ticket if there's demand.)

## Engineering notes

- New component pattern: a slideover. Add `.slideover` + `.slideover--from-right` / `.slideover--from-bottom` CSS in `src/styles.css`. Mount it under `<main id="app">` as a sibling, not a child of the route content.
- Helper in `src/ui.ts`: `openSlideover(content: string): void` and a paired close handler. Single instance at a time.
- `pages/plan.ts` dashboard: attach a click listener to `.insight-card__head` that prevents `<details>` default and opens the slideover instead. (Or keep `<details>` and add a "Read more" chevron inside that opens the slideover. Whichever feels right.)

## Implementation log

(empty)
