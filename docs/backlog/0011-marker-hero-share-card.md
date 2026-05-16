---
id: 0011
title: Marker hero share card — one-marker, phone-shaped image for social
status: in-progress
priority: P1
area: growth
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a user who just opened the side-by-side compare view (ticket 0009) and saw that one marker moved a meaningful amount between two draws, I want to tap a "Share this marker" affordance on that row and get a single vertical, phone-shaped PNG of just that marker — name, two values, the functional-range band, the delta, the draw dates, and a small "Almanac" wordmark — that I can paste into Instagram Stories, a Reddit reply, an iMessage, or a Twitter thread without having to crop a screenshot or expose anything I didn't choose to share.

## Why now (four lenses)

### Product Owner
We shipped the comparison page (0009) and the doctor/friend PDF (0010). Both are great artifacts for their channels: the comparison page is the in-app data view, the PDF is the clinician handoff. Neither is the artifact users actually post on social. People don't post PDFs to Stories and they don't crop comparison tables for Reddit; they post tall, image-shaped, single-claim tiles. The smallest meaningful unit of value is one extra button on a row of a page that already exists, generating one image with one claim ("ApoB 95 → 78") rendered in the almanac voice. No new data shape, no schema, no new prompt. We are converting a view we already have into a format the channel already wants. Nothing is added to the rest of the app — the share affordance lives only inside the compare row, where the user is already looking at the exact piece of data the card is about.

### Stakeholder
This widens the **structured artifact** moat into a third channel — the social channel — that neither the PDF (clinical) nor the in-app comparison (private) can reach. Every other wellness app's share artifact is either a leaderboard tile (Strava, Whoop weekly), a sleep-stage donut (Oura), or a streak (Snapchat-shaped). The category lacks a credible *biomarker delta tile* because no consumer app actually has the functional-range data to render the band correctly behind the two values — Claude.app certainly doesn't. The card itself encodes our moat: marker canonicalization (so the name reads cleanly across labs), the functional-range DB (so the band is right), and the persistent timeline (so the two values exist together at all). And it generates fully on-device — the privacy contract holds in the most adversarial setting, the one where the user is *literally about to post the thing*. The unit-of-share is privacy-preserving by construction: only what the user typed into the picker enters the bytes.

### User (at 7am on the phone)
I'm on `#/progress?compare=3,7`. I see the ApoB row jumped from 95 to 78 between March and October. There's a small chip on the right of the row: "Share this marker." I tap it. The OS share sheet opens with one item: a 1080×1920 PNG named `almanac-apob-2026-10-04.png`. I AirDrop it to my partner. I paste it into a Stories. It looks like a printed almanac page, not a wellness app — cream paper, ink, oxblood accent for the improved direction, Cormorant Garamond display, Inter Tight body. My name is not on it. My API key is not in it. My other markers are not in it. Just the one claim.

### Growth
Twitter posts of "look at my apoB drop after 6 months" are the format that drives the *highest-intent* incoming traffic for precision-health products — they're posted by people whose audience already cares about biomarkers, and they're seen by exactly the readers Almanac wants. The blocker on that format today is that the asset is a crappy iPhone screenshot of a PDF, or a chart from a clinic portal that says "in range" in red. We give users an asset that reads as *editorial* and *credible* in a feed that's otherwise noisy. The wordmark in the corner is the entire growth ask — one glyph, no link, no QR code. People search "almanac biomarker app" if they care. (Hypothesis: a single high-engagement marker tile in the precision-health niche on Twitter drives ~50–200 organic site visits over its lifetime; this is back-of-envelope from comparable Strava / Oura screenshot mechanics, treat as untested.)

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] On `#/progress?compare=A,B`, every comparison row gains a small **"Share marker"** chip on the row's right edge (desktop) or below the value pair (mobile). The chip is a button, not a link, and is keyboard-focusable.
- [ ] Tapping the chip generates a 1080×1920 PNG `Blob` entirely on-device using `<canvas>` (no `html2canvas`, no `dom-to-image`, no new dependency — the canvas API + manually drawn paths is sufficient for a six-element layout).
- [ ] The PNG contains, top-to-bottom: a small "Almanac" wordmark; the marker's canonical name (`MarkerDef.name`); a single line with the earlier and later values + units; the functional-range band rendered behind both values (re-use the same scale logic as `thermometer()` in `src/viz.ts` but draw via canvas); the delta + percent change with a `↑` / `↓` glyph; the two draw dates in long form (e.g. "March 4 → October 4, 2026"); the eyebrow word "improved" or "regressed" if the marker crossed an optimal boundary, otherwise omitted.
- [ ] The PNG contains NONE of: the user's display name, their API key, any other marker, any value not in the functional-range DB for this marker, any URL, any QR code.
- [ ] The card is delivered via `navigator.share({ files: [new File([blob], name, { type: "image/png" })] })` when `navigator.canShare({ files })` is true; otherwise via a hidden `<a download>` click. Filename pattern: `almanac-<markerKey>-<laterDateIso>.png`.
- [ ] Card generation runs with zero new network requests. Asserted by snapshotting `page.route` request counts before and after the chip tap on the chromium project.
- [ ] The card renders correctly for a **user-defined marker** (from ticket 0002) — the canonical name comes from `getAllMarkers()`, not the seed `MARKERS` array. Tested with a fixture that adds a user marker present on both panels.
- [ ] The card renders correctly for a marker with **no functional range defined on one side** (lab-range-only) — the band falls back to the lab range and the eyebrow word is suppressed.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the egress allow-list is unchanged; no new hostnames appear.
- [ ] The chip and the share flow render on both **chromium and mobile-webkit**. On mobile-webkit, assertion is limited to (a) the chip appears, (b) the chip is tap-targetable (≥44×44 css px), (c) the `navigator.canShare({ files })` code path is exercised; the binary blob bytes assertion runs only on chromium (Playwright's mobile-webkit blob download is the same flake surface as 0010 — keep them isolated).
- [ ] A new `tests/e2e/share-card.spec.ts` covers: chip appears, chip generates a PNG with the expected filename, the PNG bytes pass a basic PNG-header sanity check (`89 50 4E 47`), the canvas does NOT contain the user's display name (rendered to a hidden test sentinel for grep), the user-marker case, the lab-range-only fallback case, and the no-egress assertion.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A multi-marker collage tile ("my whole panel improved"). The product point is one claim per card. If users want more, they share more cards.
- A "share entire comparison" image. The PDF in ticket 0010 already covers the multi-element export channel.
- Any tracking pixel, watermark URL, or QR code linking back to a site. The wordmark is the entire growth ask. Linking would require widening the egress allow-list to host a public landing page on a domain we operate — out of scope and contradicts the no-backend rule.
- Customizing the card (font, color, hide-name toggle, add-caption). The card has one layout. The card has no name on it by default. Configurability defeats the artifact discipline.
- Sharing from the standalone `#/progress` sparkline view. The hero card lives on the compare view because the compare view is where the two-value claim makes sense. Single-draw "look at my one number" is a less-credible artifact and we don't want to ship it.
- A Twitter / Instagram / Threads "post directly" integration. The OS share sheet is the integration. We don't add a per-platform SDK.

## Engineering notes

- `src/pages/progress.ts` — in the compare-row renderer (the path that fires when `params.get("compare")` is present), add the "Share marker" chip per row. The chip dispatches a click handler that calls into a new module.
- `src/share/marker-card.ts` — new module. Exports `generateMarkerCardPng(row: ComparisonRow, marker: MarkerDef): Promise<Blob>` and `shareOrDownload(blob: Blob, filename: string): Promise<void>`. The canvas drawing is ~100–150 lines of straight 2D context calls: `fillRect` for the page background, `fillText` for the wordmark / name / values / dates / delta, a hand-drawn rounded-rect for the functional-range band with two small filled circles for the earlier and later values. Fonts are referenced by name (`Cormorant Garamond` / `Inter Tight`); they're already loaded for the rest of the app, so by the time the user reaches the compare page the browser has them cached, but defensively call `document.fonts.ready` before drawing the canvas so type doesn't fall back mid-render.
- `src/progress/compare.ts` — already returns a `ComparisonRow` with everything the card needs (`earlier.value`, `later.value`, deltas, percent change, the crossed-boundary flag). No change needed unless the row doesn't carry the canonical `MarkerDef` reference — if not, look it up in the page handler via `findMarker(row.markerKey)` + the user-marker resolver and pass it in. Don't re-shape `ComparisonRow` to carry the def, just pass alongside.
- `src/styles.css` — add `.compare-row__share` (the chip) and `.share-card-debug` (a visually-hidden div used by the test to assert the user's display name is NOT in the bytes — the test reads the canvas via `toDataURL` and asserts no occurrence of the test display name; the debug div is only how we plant a known sentinel into the *page* to prove the spec catches it if the implementation regresses).
- `tests/e2e/share-card.spec.ts` — new file. Re-uses the existing `addManualPanel` + `composePlan` flows from `tests/helpers/flows.ts` to seed two panels with overlapping markers, then navigates to `#/progress?compare=…`, taps the chip, intercepts the `<a download>` click to capture the blob, and asserts the PNG header + filename. For the no-name assertion, the test names the profile `__ALMANAC_SHARE_SENTINEL__` and asserts the canvas dataURL does not contain that string in its decoded text (use a tiny in-test PNG-to-text helper or, more reliably, render the canvas to a 2D context in the test and `getImageData` to assert no text-shaped pixels in regions we never draw to; the simpler assertion is to verify `generateMarkerCardPng` is pure of the profile by passing in a `Profile`-less argument list — the function signature does not take `Profile` at all, and the typecheck enforces it).
- No new dependencies. Canvas 2D + the existing fonts are sufficient. If a dev finds that rendering Cormorant Garamond on canvas is unacceptably ugly compared to the SVG renderer, the fallback is to render the card into an SVG `<foreignObject>` and rasterize via `OffscreenCanvas.transferToImageBitmap()` — still no new deps, both APIs are universal in the browsers we target.
- Schema migration: **no**.
- Egress allow-list change: **no**. The card is built and shared 100% on-device. The privacy E2E will catch any regression.
- Voice spec: the only words rendered on the card are the marker name, the unit, the dates (long form, e.g. "March 4"), the delta, the eyebrow ("improved" / "regressed"), and the wordmark. No prose, no claim, no narrative — discipline.

## Implementation log

- 2026-05-16 — picked up by implementation-dev. Branch `feat/0011-marker-hero-share-card`. Plan: add a per-row "Share marker" chip on the compare view that calls a new `src/share/marker-card.ts` module to draw a 1080×1920 PNG via canvas 2D, then ship it via `navigator.share({ files })` (with `<a download>` fallback). No new deps, no schema change, no egress allow-list change.
