---
id: 0047
title: The improvement card — a phone-shaped image of your most-improved marker, three months in, that carries the brand to a friend
status: groomed
priority: P1
area: growth
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a user three or more draws into a protocol whose ferritin came up from 32 to 48 — or whose ApoB dropped, or whose omega-3 index climbed — I want a one-tap "Save the improvement" on Progress that renders a single, phone-shaped image of my single most-improved marker over time (the sparkline with the functional-range band, the start value and date, the now value and date, and the plain-language move), in the almanac's own type and color, so that the proof that this actually worked over months becomes a thing I can post or text — and the friend who sees "ferritin 32 → 48 in three months" is one tap from the sample tour and one key-paste from their own protocol, instead of my progress staying locked inside an app no one else has opened.

## Why now (four lenses)

### Product Owner

The product can already render a single marker's *current* value to a saveable card (0011, shipped) and the *protocol* to a glanceable card (0033, groomed). What it cannot render is the one artifact that proves the whole thesis — that following the protocol *moved a number over time*. The marker-hero card (0011) shows where a marker sits today; it does not tell the improvement story, which is the trend, the delta, and the time elapsed. The smallest meaningful unit of value is a "Save the improvement" affordance on Progress that, for the user's single most-improved marker (the marker with the largest favorable move toward its functional optimum across the timeline), renders one editorial image entirely on-device: a dateline, the marker name, the start value + month, the now value + month, the plain move ("Ferritin — 32 (Mar) → 48 (May), now in range"), and the same sparkline-with-functional-band the Progress page already draws. It reuses 0011's canvas-render-and-download mechanism and the existing trend/movement computation; the only new code is selecting the most-improved marker and laying out the before/after. It turns "is this doing anything over months?" into a single screenshot.

### Stakeholder

This is the **persistent timeline** and **structured artifact** moats fused into the most forwardable proof the product can produce — the over-time result, which is the one thing a chat box structurally cannot show because it has no prior draw to compare against and no trend to plot. It compounds the shipped acquisition loop directly: 0017 (share link, shipped) sends the live protocol; 0014 (sample tour, shipped) lets a clicker feel the artifact pre-consent; 0040 (try-it-with-your-numbers, groomed) lets them score their own numbers; this card is the *hook at the top of that funnel* — the image that gets posted carries the almanac wordmark and the improvement story, and the friend who sees it lands in exactly the pre-key surfaces already built. It is the marker-side sibling of the protocol card (0033): 0033 puts the to-do on the fridge for the owner; this puts the result in the feed for acquisition. The selection — "most-improved marker" — is computed from the same canonicalized, dual-range timeline that makes the trend trustworthy, so the card is honest by construction (it shows a real move toward a real optimum, on the user's own dated draws).

### User (at 7am on the phone)

Three months in, I just uploaded my second ferritin draw and it came up — 32 to 48, finally inside the functional band. On Progress, above the trends, a quiet affordance: "Save the improvement." I tap it. A phone-shaped image lands in my downloads, in the type I trust: "Almanac." Then "Ferritin — 32 ng/mL (March) → 48 ng/mL (May)" and beneath it the little sparkline rising into the shaded functional band, with "now in range." It is the proof I have been wanting to show someone — not a promise, a result, on my own number. I post it, or I text it to the friend who is always tired and always "normal." They tap through to the sample tour and see what the full thing looks like, and they are one key-paste from their own. It worked offline, instantly, because the trend is already on my phone — no call, no wait, no key.

### Growth

This is the highest-leverage acquisition artifact the product can build, because it is the only one that carries a *result over time* — the single most credible thing one health-curious person can show another. (Hypothesis: an over-time improvement card is forwarded friend-to-friend at a meaningfully higher rate than the current-value marker card 0011, because "this moved 32 → 48 in three months" is a story with a before and an after, which is what makes a health claim believable to a skeptic; and the friend who receives it lands directly in the shipped pre-key funnel — tour 0014, sandbox 0040 — so the artifact is the top of an existing, instrumented-by-design conversion path; back-of-envelope from how before/after results outperform single-data-point posts in health communities; treat as untested without remote analytics, which we will never add.) The "show me" frame is the card itself: "my ferritin went from 32 to 48 following this — here's the chart" is exactly the line the persona uses on the one friend with the same complaint, and the card makes it a screenshot instead of a sentence.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/progress/most-improved.ts` (new) exports `selectMostImproved(panels: Panel[], profile: Profile): { markerKey: string; name: string; unit: string; startValue: number; startDay: Day; nowValue: number; nowDay: Day; movedIntoRange: boolean } | null`. Across markers with ≥ 2 draws, it scores each marker's favorable movement toward its functional optimum (the magnitude of the move in the optimum-improving direction, normalized so markers with different scales compare fairly — document the normalization in the file), and returns the single best, or `null` when no marker has ≥ 2 draws or none moved favorably. `movedIntoRange` is true when the start value was outside the functional optimum and the now value is inside it. Pure: no DOM, no Dexie, no network.
- [ ] `src/progress/improvement-card.ts` (new) exports `renderImprovementCard(improved, opts: { width: number; height: number }): Promise<Blob>` (or returns a canvas the page converts to a Blob — match 0011's exact render-and-download mechanism). It draws a portrait (e.g. 1080×1920) editorial image: an "Almanac" wordmark, the marker name, the start value + start month, the now value + now month, a one-line plain move ("32 → 48 ng/mL · now in range" when `movedIntoRange`, else "32 → 48 ng/mL"), and a sparkline with the functional-range band behind it reusing the existing `src/viz.ts` sparkline helper. Pure render: no Dexie, no network. Asserted by invoking with a known improved-marker object and confirming a non-empty image Blob of the requested dimensions.
- [ ] The Progress page (`src/pages/progress.ts`) renders a "Save the improvement" affordance ONLY when `selectMostImproved(...)` is non-null. Tapping it builds the card and triggers a download (`<slug(ownerName)>-improvement.png`, falling back to `almanac-improvement.png`), reusing 0011's download mechanism. Asserted by tapping the action and confirming a `.png` download with the expected filename.
- [ ] With fewer than two draws of any marker (a single panel, or an intake-only profile with no labs), the affordance is ABSENT and the Progress page is byte-for-byte unchanged from today. Asserted on a single-panel profile.
- [ ] The card renders the start/now values, units, and months verbatim from the selected marker's oldest and newest draws, and the move direction is correct (a marker that dropped favorably, e.g. ApoB, reads "110 → 84 mg/dL", not reversed). Asserted with one rising marker (ferritin) and one favorably-falling marker (ApoB), confirming each card's composed text.
- [ ] Marker names resolve to human names via `findMarker()`, including sex-specific keys (Ferritin, not `ferritin_m`) and user-defined markers (0002). Asserted by a most-improved sex-specific marker rendering "Ferritin".
- [ ] The card carries the editorial type (Cormorant Garamond display + Inter Tight body) and the cream/ink palette with the single oxblood accent used sparingly; no purple, no emoji; a single small "Almanac" wordmark with NO URL and NO tracking parameter. Asserted by confirming the composed card text includes the wordmark and contains no `http`/`https`/`?`-bearing string.
- [ ] The card is generated with **zero network calls** and **zero Anthropic calls** — it is a pure render of local data with the already-loaded fonts (no new font fetch). Asserted by triggering the save and confirming the mock recorded zero requests.
- [ ] The Anthropic key is NEVER drawn on the card and NEVER appears in any intermediate string. Asserted by seeding a sentinel key on the profile and confirming it appears nowhere in the card's composed text.
- [ ] Renders the affordance on both **chromium and mobile-webkit**. The download triggers on mobile-webkit, or — where WebKit blocks programmatic download — the card Blob/content is verified via the same mechanism 0011's spec uses. Touch target ≥44×44 css px (min-height ≥45 px per the 0017 sub-pixel lesson in `docs/LESSONS.md`). Note in the spec which path is asserted per project.
- [ ] Tour mode (0014) offers "Save the improvement" against the tour's fixture if the fixture carries a marker with ≥ 2 draws and a favorable move (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the affordance — the recipient is viewing a shared protocol, not their own timeline. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is local-only; no new hostnames (fonts already on the allow-list); the key never appears; the wordmark carries no URL.
- [ ] Schema migration: **no** — the card is a render-time transform of the existing `panels` rows. Nothing new is persisted.
- [ ] New `tests/e2e/improvement-card.spec.ts` covers: most-improved selection across multiple markers, the action triggers a `.png` download with the right filename, start/now/units/months content, correct direction for a rising and a favorably-falling marker, "now in range" only when the move crossed into the optimum, marker-name resolution, the editorial wordmark with no URL, the key never appears (sentinel), zero-network during render, affordance absent on a single-panel profile, tour vs shared-view behavior, mobile rendering/path note.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A new image/canvas dependency. The marker-hero card (0011) already established the on-device render-and-download mechanism; this ticket reuses it verbatim. Do not introduce html-to-image, dom-to-png, or any new library.
- A multi-marker collage / "all my improvements" card. The artifact is the single most-improved marker — one clear story, not a dashboard. Multiple markers dilute the before/after the card is built to land. A picker is a possible follow-up, not v1.
- An LLM-generated caption or congratulation. The card's copy is a deterministic render of the start/now values; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose value is being instant, local, and provably honest about the actual move.
- A QR code or any link on the card. We have no backend; the share link (0017) is the path for sending the live protocol, and the wordmark is the only attribution. The card's job is to make the friend curious enough to find the (already-shipped) pre-key surfaces.
- Letting the user pick which marker the card shows. v1 selects the single most-improved deterministically so the artifact is honest and one-tap. A "choose a marker" variant is a clean follow-up if it earns it.
- Claiming causation ("the protocol caused this"). The card states the move and the dates, on the user's own draws; it does not assert the protocol is why. The standing "informational, not medical advice" disclaimer holds on the Progress page.
- Carrying the card into the doctor PDF (0010/0016) or the Markdown export (0027). It is the user's own keepsake/share artifact, not a clinical hand-off. The coach export (0048) is the clinical surface.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/most-improved.ts` (new) — `selectMostImproved(panels, profile)`. Build per-marker series (oldest → newest) the same way Progress does; score favorable movement toward the functional optimum (use the marker's optimum direction from `MarkerDef`; normalize by the optimum-range width or a z-like scale so cross-marker comparison is fair — document the choice). Resolve human names via `findMarker()`. Pure; the page passes `allPanels()` + profile.
- `src/progress/improvement-card.ts` (new) — `renderImprovementCard(improved, opts)`. FIRST read 0011's marker-hero card module (the growth-area share card) and reuse its canvas setup, font handling, color tokens, and convert-to-Blob + download path verbatim — this is a second layout on the same proven mechanism. Reuse the `src/viz.ts` sparkline helper for the trend-with-band. Pure render.
- `src/pages/progress.ts` — add the "Save the improvement" affordance near the existing Progress actions, gated on `selectMostImproved(...)` being non-null. Wire it to `renderImprovementCard(...)` → Blob → 0011's download helper. Do not invent a second download mechanism.
- `src/viz.ts` — read-only consumer for the sparkline + functional-range band. If the existing helper renders to SVG/DOM rather than canvas, factor a small canvas-drawing variant or draw the sparkline directly on the card canvas using the same series + band math; do not add a rasterization dependency.
- `src/data/markers.ts` — read-only. `findMarker()` for names + optimum direction.
- `src/types.ts` — no new persistent types; the internal selection/layout types live in the two new modules.
- `src/styles.css` — minimal; one new action button styled like 0011's "Save card" action and the existing Progress actions (≥45 px min-height). The card itself is canvas-drawn; color/type tokens come from 0011's shared constants. No new colors.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with `isSharedView()` (absent) / `isTour()` (present only when the fixture supplies a ≥2-draw favorable marker).
- `tests/helpers/flows.ts` — reuse `seedPanel` (from the 0026/0032 specs) to seed two dated panels sharing a marker with a favorable move; mirror however 0011's spec asserts card content (composed-text or known-path assertion).
- `tests/e2e/improvement-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. The selection test seeds ferritin (small move) and ApoB (large favorable drop) and asserts ApoB is chosen; the direction test asserts the ApoB card reads "110 → 84 mg/dL".
- `tests/e2e/privacy.spec.ts` — extend with a card-save invocation confirming zero off-allow-list egress (fonts already allow-listed; no new font fetch).
- New deps: **no** — reuse 0011's render mechanism and `src/viz.ts`.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the card dateline/wordmark is "Almanac"; the move line reads "<start> → <now> <unit>" with "· now in range" appended only when `movedIntoRange`. No exclamation, no causation claim. Banned: "amazing," "exciting," "journey," "great." Cream + ink, single oxblood accent used sparingly; editorial type only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
