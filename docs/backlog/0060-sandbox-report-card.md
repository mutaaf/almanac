---
id: 0060
title: The sandbox report card — a shareable image of how your un-keyed marker entries land against the functional optimum
status: proposed
priority: P1
area: growth
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a prospect who just scored my markers in the sandbox (0040 or 0055) and can see my numbers plotted against the functional optimum, I want a one-tap "Share this report" action that generates a phone-shaped image showing every entered marker as a labeled functional-range bar, so that I can send my functional standing to a friend who's been curious about their own labs — without a key, without a backend, without sharing a URL that encodes my actual data, just a clean image that says "here's what my panel looks like through the Almanac lens."

## Why now (four lenses)

### Product Owner

The sandbox (0040/0055) produces a scored result set; `src/viz.ts` already has the thermometer helper; 0011 (marker hero share card) and 0033 (protocol on the fridge) proved the off-screen phone-shaped image idiom with `html2canvas`. The missing piece is a multi-marker aggregate version of that card for sandbox results — one row per entered marker, sized for a phone viewport, exportable to the OS share sheet. It makes the sandbox's scoring portable to the prospect's network without any data leaving the device except the image the user explicitly chose to export. The smallest meaningful unit of value is one "Share this report" button that appears on the sandbox result view when ≥1 marker has been scored.

### Stakeholder

This extends the **functional-range DB** moat into acquisition. Every image that leaves the app carries the functional-vs-lab-range thesis — the product's intellectual argument, visible before the recipient has heard of Almanac. The recipient landing on the sandbox (0040/0055) and scoring their own numbers is the acquisition loop; this card is the catalyst that starts it from someone else's device. No backend, no tracking, no stored images — the card is generated on-device from the already-computed sandbox state and discarded after share. It is the acquisition-side sibling of the improvement card (0047) and the protocol-on-the-fridge (0033): those carry the product to a friend from inside the app; this carries it from the pre-key surface.

### User (at 7am on the phone)

I've typed in my numbers, I can see the bars, and I want to send this to my sister who has the same TSH concern I do. I tap "Share this report." An image pops up on my share sheet — my markers, my bars, the Almanac name at the bottom. I send it from the same sheet I'd use for anything else. She opens it, sees a real scored panel against the functional optimum, asks me how I got it. That's the acquisition. It took one tap and I sent nothing I didn't choose to send. If she doesn't have the Web Share API available, a "Copy image" fallback drops the PNG to her clipboard.

### Growth

This is the sandbox's missing distribution surface. The sandbox produces compelling results (most people are below functional optimum on 3–5 markers their labs called "normal") — but today the only way to share that finding is a manual screenshot, which doesn't brand the product or link the friend to try it. A generated card with the Almanac aesthetic and a "Score yours at..." byline closes that gap. (Hypothesis: a one-tap shareable sandbox result card lifts the rate at which sandbox users bring in a second-order user, because the barrier to "show a friend" collapses from multi-step manual screenshot to one tap, and the card's byline routes the friend to the same sandbox they can immediately try; back-of-envelope from how shareable-artifact mechanics drive top-of-funnel at zero marginal cost; treat as untested without remote analytics, which we will never add.) The "show me" moment is the card itself: a clean, multi-marker functional-range report with real numbers is exactly the screenshot that makes the receiving friend say "wait, what shows you that?"

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The sandbox result view (the route/view rendered by 0040 or 0055 when markers have been scored) renders a "Share this report" action when ≥1 marker has been entered and scored. The action is ABSENT when no markers have been entered. Asserted by visiting the sandbox with no entries (action absent) and with ≥1 scored marker (action present).
- [ ] Tapping "Share this report" renders an off-screen phone-shaped card element (the same 390×844 px fixed container the 0011/0033 cards use, positioned at `left: -9999px`) containing: each scored marker as a labeled thermometer bar (name, user-entered value, functional range band) built by the existing `src/viz.ts` thermometer helper; a byline reading "Scored with Almanac." Max 8 markers per card for legibility; if >8 were entered, the card shows the 8 with the greatest deviation from the midpoint of each marker's functional range (the same deviation used to rank the scored list). Asserted by entering 3 known markers, tapping the action, and confirming the card element's DOM contains the correct marker names and values.
- [ ] The card is captured as a PNG via `html2canvas` (the existing 0011/0033 capture idiom — no new canvas library) and handed to the existing 0050 native-share path (with its copy-to-clipboard fallback where the Web Share API is unavailable). Asserted in chromium (where the share-file API may not be available) by confirming the clipboard-copy fallback executes without error.
- [ ] The exported card DOM contains NO Anthropic key, NO profile fields (name, age, conditions), NO personal identifiers — only the marker names, the entered numerical values, the functional range bars, and the byline. Asserted by seeding a sentinel key and a sentinel profile field and confirming neither appear in `document.querySelector('.sandbox-card').textContent` or innerHTML before capture.
- [ ] The card generation makes ZERO Anthropic calls and ZERO network calls — it is a pure render of sandbox state already on the page. Asserted by tapping "Share this report" and confirming the mock recorded zero requests.
- [ ] The "Scored with Almanac" byline in the card DOM does NOT contain an external URL or a tracking parameter — the app's own origin only. No new egress hostname. Asserted by confirming the byline text is the documented string and Privacy E2E still passes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — no new outbound hostname introduced by the card render or share invocation.
- [ ] Renders on both **chromium and mobile-webkit**. The "Share this report" action is a ≥44×44 css px tap target (min-height ≥45 px per the 0017 sub-pixel lesson). The generated card is fixed at 390×844 px regardless of host viewport. Asserted on both projects.
- [ ] The existing sandbox flows (entering markers, viewing scores, the sandbox-to-first-panel adoption path from 0049) are unchanged in behavior; the share action is purely additive. Asserted by running the existing sandbox spec and confirming it is unchanged.
- [ ] New `tests/e2e/sandbox-report-card.spec.ts` covers: action absent with no markers, present with ≥1 marker, the card DOM contains entered marker name and value and NOT a sentinel key or profile field, zero Anthropic + zero network, the byline present, the >8 cap (entering 10 markers produces a card with exactly 8 rows), the existing sandbox flows unchanged, mobile tap-target and card size.

## Out of scope

- A logged-in user's full panel as a sandbox report card. This is a pre-key, sandbox-only feature. For a logged-in user's shareable panel artifact, see 0011 (marker hero card) and 0033 (protocol on the fridge).
- A marker-selection UI for the card. If >8 markers were entered, the 8 with greatest deviation are chosen deterministically — no picker, no toggle.
- A backend image store, a hosted URL for the image, or a server roundtrip of any kind. The image is generated on-device and handed to the OS share sheet or clipboard.
- Custom branding, the user's name, or any personalisation beyond the scored numbers. The card carries marker data and the "Scored with Almanac" byline only.
- Carrying the card design into the full-app (logged-in) experience. A logged-in multi-marker share card is a plausible future growth ticket; descoped here.

## Engineering notes

- `src/pages/sandbox.ts` (or whichever file 0040/0055 renders the scored result view) — add a "Share this report" `<button>` below the scored marker rows; gate its presence on `sandboxRows.length >= 1`.
- `src/share/sandbox-card.ts` (new) — `renderSandboxCard(entries: ScoredEntry[]): HTMLElement`. Builds an off-screen `<div class="sandbox-card">` at fixed 390×844 px (`position: absolute; left: -9999px`). For each entry (up to 8 by deviation), renders a labeled thermometer bar via the existing `thermometer(value, funcLow, funcHigh, labLow, labHigh)` helper from `src/viz.ts`. Appends the `"Scored with Almanac"` byline at the bottom. Returns the element; the caller appends it to `document.body`, captures via `html2canvas`, then removes it.
- `src/viz.ts` — read-only reuse of the thermometer helper. No new primitives.
- `src/share/` — read-only reuse: import the `html2canvas` capture and the 0050 native-share invocation idiom already in the codebase (0011/0033 patterns). Do NOT introduce a second share or a second canvas library.
- `src/styles.css` — `.sandbox-card` container reusing the `.protocol-card` / `.share-card` fixed-phone-canvas idioms from 0033: `width: 390px; height: 844px; position: absolute; left: -9999px; background: var(--cream); font-family: ...`. Thermometer bars use the existing oxblood-on-cream idiom from 0011. No new color variables.
- `tests/e2e/sandbox-report-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. The sentinel test seeds a recognizable string in localStorage/profile and a fake API key, enters markers into the sandbox, taps "Share this report", and asserts `document.querySelector('.sandbox-card').innerHTML` contains none of the sentinel strings. The cap test enters 10 distinct markers and asserts the card has exactly 8 thermometer rows. The existing sandbox spec (`tests/e2e/sandbox.spec.ts` or equivalent) is NOT modified.
- `tests/e2e/privacy.spec.ts` — extend with a sandbox-report-card share flow, confirming zero off-allow-list egress.
- New deps: **no** — `html2canvas` already in `package.json` from 0011/0033.
- Egress allow-list change: **no**.
- Schema migration: **no** — sandbox state is ephemeral (session/local), not persisted in Dexie.
- Voice spec: the action reads "Share this report"; the byline reads "Scored with Almanac." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft on cream; oxblood reserved for the functional-range band fill.

## Implementation log

(Appended by the implementation-dev agent during execution.)
