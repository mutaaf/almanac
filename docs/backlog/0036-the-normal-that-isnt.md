---
id: 0036
title: The "normal" that isn't — a panel report card that counts how many markers sit below the optimum the lab called fine
status: proposed
priority: P1
area: labs
created: 2026-05-21
owner: gtm-innovation
---

## User story

As the person this product was built for — told "everything looks normal" while feeling anything but — I want the moment my first panel resolves to give me one honest, dated readout of how my markers actually stack up against the *functional* range, not the lab floor ("7 of your 22 markers are in the lab's normal range but below the functional optimum; 3 are outside even the lab range; 12 are optimal"), so that the gap between "normal" and "optimal" — the entire reason I am here — is made legible to me at the exact instant I upload, instead of being something I have to reconstruct marker by marker down a long results table.

## Why now (four lenses)

### Product Owner

The founding wedge of Almanac is one sentence: the lab's "normal" is a floor, the functional range is the target, and the gap between them is where "everything looks normal but I don't feel normal" lives. The functional-range DB exists to close that gap — and yet the gap is never *counted* for the user anywhere. The results table flags each marker individually (`flagFor()` already classifies every result as low / high / in-range / suboptimal / optimal against both ranges), but the user has to scan the whole table and tally the suboptimal ones in their head to feel the headline. The smallest meaningful unit of value is a deterministic, zero-network "report card" rendered at the top of the post-extraction review screen (`#/labs?id=N`): a single editorial line plus a small tally — total markers, how many are optimal, how many are in-lab-range-but-suboptimal (the wedge), and how many are outside the lab range entirely — computed by reducing the panel's results over the existing `Flag` classification. It reuses the flag the extractor and `flagFor()` already assign; the only new code is the count and the sentence. It turns the product's central claim into a number on the user's own first panel.

### Stakeholder

This makes the **functional-range DB** — the moat asset with the highest engineering cost and, until 0026/0032, the least user-facing surface — legible at the moment of maximum receptivity: the first upload. It is the single most defensible answer to "why not just paste my labs into Claude?": raw Claude defaults to the lab's reference range and will tell you you are "within normal limits"; Almanac counts, against a curated optimum, exactly how many markers the lab called fine that are not. That count is a sentence the chat box structurally cannot produce. It compounds the other labs-page receipts this sprint introduces — 0026 says "we recognized this marker across labs," 0032 says "and here is how far it moved," and this says "and here is how far you are from optimal right now" — three honest accountings of what the app did with the report, surfaced where the user is already reading it. And it lands on the first panel, before any trend or movement exists, which is the one moment 0026 and 0032 cannot reach (they require a prior draw); this is the wedge for the brand-new user.

### User (at 7am on the phone)

First upload. The PDF resolves; the values fill in. Before I scroll the long table, the top of the screen tells me the thing I came to find out: "Of 22 markers, 12 are optimal. 7 sit inside the lab's normal range but below the functional optimum. 3 are outside the lab range." There it is — the gap I have felt for two years, counted on my own blood. The seven "normal but not optimal" markers are the ones my doctor waved off; now I can see them as a group, not hunt for them. I tap one of the numbers and the table scrolls to that set. It is calm and it is honest — it does not pretend the optimal markers are a problem, and it does not soften the three that are genuinely out of range. It rendered instantly, offline, because the flags were assigned at extraction and the count is just arithmetic over data already on my phone.

### Growth

This is the acquisition artifact most aligned with the persona's founding grievance, and the most screenshot-worthy single line the product can produce. The target user's whole story is "I was told I'm normal and I'm not" — a card that says, on their own labs, "7 of your markers are normal but below optimal" is the precise, evidence-shaped vindication of that grievance, which is exactly what they will show a friend with the same complaint. (Hypothesis: the report-card line at first upload is the highest-converting single screenshot in the product for the "told everything's normal" segment, because it reframes their own bloodwork as the proof they have been looking for; and the sample-tour fixture 0014 carrying a vivid report card raises the rate at which a prospect uploads their own first panel — back-of-envelope from how "you have N issues your doctor missed" framings drive sign-ups in DTC lab products; treat as untested without remote analytics, which we will never add.) It pairs naturally with the marker-hero share card (0011) and the next-draw projection (0012): the report card gives the new user the reason to care, the projection gives them a reason to act, the movement receipt (0032) rewards them for retesting.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/labs/report-card.ts` (new) exports `computeReportCard(panel: Panel, markers: MarkerDef[]): ReportCard` where `ReportCard` is `{ total: number; optimal: number; suboptimal: number; outOfLabRange: number; lowOrHigh: number }`. It classifies each result by its `flag` (computed via the existing `flagFor()` against the resolved marker's `labRange` + `optimalRange` when the stored `flag` is absent), counting: `optimal` (flag `optimal`), `suboptimal` (flag `suboptimal` — in lab range but outside functional optimum: the wedge), `outOfLabRange` (flag `low` or `high` against the lab range), and rolling `low`+`high` into `lowOrHigh`. Results whose marker does not resolve (no `labRange`/`optimalRange` to judge against) are excluded from `total`. Pure: no DOM, no Dexie, no network.
- [ ] The post-extraction panel review screen (`#/labs?id=N` in `src/pages/labs.ts`) renders the report card at the TOP of the results view under a single eyebrow ("Against the optimum"), above the results table, whenever the panel has at least one classifiable marker. Asserted by seeding a panel with a known mix of flags and confirming the card renders the correct counts.
- [ ] The card's editorial line reads, with correct singular/plural and only the non-zero clauses present: "Of <total> markers, <optimal> are optimal. <suboptimal> sit inside the lab's normal range but below the functional optimum. <outOfLabRange> are outside the lab range." A panel where every marker is optimal renders only the first clause plus a closing "Nothing sits below the functional optimum." Asserted across three seeded panels: all-optimal, mixed, and several-out-of-range.
- [ ] Each non-zero count is a tap target that scrolls the results table to (or filters to) the markers in that class, re-using the existing results-row layout — no new detail surface. Tapping "suboptimal" brings the in-range-but-below-optimum markers into view. Asserted by tapping the suboptimal count and confirming the corresponding rows are scrolled into / highlighted in view.
- [ ] A panel with ZERO classifiable markers (e.g. a manual panel of markers with no functional range, or all unrecognized) renders NO report card — the section is absent and the review screen is byte-for-byte unchanged from today. Asserted by a panel of only unrecognized/range-less results.
- [ ] The card is computed with **zero network calls** — it reduces the panel's results (already extracted and flagged) and the resolved marker definitions, both local. Asserted by rendering the review screen and confirming the mock recorded zero requests during the card computation/render.
- [ ] The card respects user-defined markers (0002) and sex-specific keys: a user-defined marker with a functional range is classified and counted; `ferritin_m`/`ferritin_f` resolve via `findMarker()` against the merged set so the count is correct for the profile's sex. Asserted with a male profile panel containing a sex-specific ferritin and a user-defined marker.
- [ ] The "suboptimal" class is defined exactly as "inside the lab reference range but outside the functional optimal range" — never double-counted with `outOfLabRange`. A marker outside the lab range counts only in `outOfLabRange`, even though it is also outside the optimum. Asserted by a marker below the lab floor confirming it lands in `outOfLabRange` and not `suboptimal`.
- [ ] Renders on both **chromium and mobile-webkit**. The card wraps cleanly at the 390 px viewport; the count chips are ≥44×44 css px tap targets; the card does not push the results table below the fold by more than one card height.
- [ ] Tour mode (0014) surfaces the report card against the tour fixture's first panel (the fixture is shaped to show a vivid suboptimal count — the wedge made tangible for a prospect). Shared-view mode (0017) does NOT render the card — panel detail is not part of the shared payload. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the card is computed on render from the existing `panels` rows (which already carry `results[].flag` and the ranges, with `flagFor()` as the fallback classifier). Nothing new is persisted.
- [ ] New `tests/e2e/report-card.spec.ts` covers: correct counts on a mixed panel, all-optimal copy, several-out-of-range copy, tap-to-scroll for each class, no card on a range-less panel, zero-network during render, user-defined + sex-specific classification, suboptimal-vs-out-of-range non-double-counting, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated narrative of the report card. The card is a deterministic reduction over already-assigned flags; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose entire value is being instant, local, and provably honest about the actual count. The plan's snapshot (composed via the LLM, reading the same panel) is where prose interpretation belongs; this is the count.
- A per-marker severity score or a composite "health score" number. A single aggregate score invites the exact false precision the dual-range honesty is designed to avoid, and it would be a clinical claim we cannot make. The card is a count of markers per class, not a grade.
- A celebratory or alarmist styling on the counts (green glow for optimal, red flood for out-of-range). The card is calm editorial copy with the standard tap-target chips; the satisfaction and the seriousness are both in the sentence. Ink and ink-soft; oxblood reserved.
- Surfacing the report card anywhere but the post-extraction review screen. Its value is the at-upload immediacy on a freshly-resolved panel. A Today card or a Progress banner is a possible follow-up, not this ticket.
- Carrying the card into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). It is the upload-moment artifact; the clinical hand-off already shows per-marker ranges, and the Markdown export shows both ranges per result.
- Re-running extraction or any inference to compute the card. It is built entirely from already-extracted, already-flagged data, with `flagFor()` as a pure fallback classifier.
- A trend or movement dimension on the card. That is the movement receipt's job (0032); this is the static at-rest picture of one panel against the optimum, which is the only thing available on a first-ever upload.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/labs/report-card.ts` (new) — `computeReportCard(panel, markers)` per the acceptance bullets. Reuse the existing `flagFor()` (in `src/data/markers.ts`) to classify any result whose stored `flag` is absent; resolve each result's marker via `findMarker(key, extras)` with `extras = getAllMarkers()`'s user markers so user-defined + sex-specific keys judge correctly. Exclude range-less / unresolved markers from `total`. Pure; the page passes the panel + the merged marker set in.
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only. `flagFor()`, `findMarker()`, and the merged-marker accessor already exist (the same trio 0026/0032 lean on). No change to the marker DB or the flag logic.
- `src/pages/labs.ts` — the `renderPanelDetail(id)` / `#/labs?id=N` review screen already loads the panel and renders the results table (with per-row flags). Above the table, call `computeReportCard(panel, mergedMarkers)` and render the "Against the optimum" section when `total > 0`. Render the report card ABOVE the canonicalization (0026) and movement (0032) receipts — the at-rest picture comes first, then the cross-lab and movement context. The count chips scroll to / highlight the matching rows; reuse the existing row identity (markerKey) to find them. No new detail surface.
- `src/types.ts` — add `ReportCard` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.report-card` (the section), `.report-card__line` (the editorial sentence, ink), `.report-card__count` (the tap-target chips, ≥44×44 css px). The eyebrow reuses the existing small-caps token. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0` (the documented overflow fix).
- `src/sample/state.ts` — confirm the tour fixture's first panel carries a mix of flags that produces a non-trivial suboptimal count (the wedge). If the existing fixture is all-optimal, adjust the fixture values (fixture data only — not a code path) so the tour demonstrates the card honestly.
- `src/share/shared-state.ts` — gate with the same `isSharedView()` check the labs page already uses (absent in shared-view).
- `tests/helpers/flows.ts` — reuse the panel-seeding approach 0026/0032 use (`seedPanel(page, panel)` via `page.evaluate`), seeding results with explicit `flag` values OR values + ranges that `flagFor()` classifies, so the spec can construct exact class counts.
- `tests/e2e/report-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. The mixed-panel test seeds 12 optimal + 7 suboptimal + 3 out-of-lab-range results and asserts "Of 22 markers, 12 are optimal. 7 sit inside the lab's normal range but below the functional optimum. 3 are outside the lab range."
- `tests/e2e/privacy.spec.ts` — extend with a panel-review visit confirming zero off-allow-list egress during the report-card render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the eyebrow is "Against the optimum." The line reads "Of <N> markers, <N> are optimal. <N> sit inside the lab's normal range but below the functional optimum. <N> are outside the lab range." (non-zero clauses only). The all-optimal close is "Nothing sits below the functional optimum." Declarative, no exclamation, no alarm, no spin. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
