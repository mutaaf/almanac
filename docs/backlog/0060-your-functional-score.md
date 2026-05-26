---
id: 0060
title: Your functional score — one headline number for the share of your tracked markers inside the functional range
status: proposed
priority: P1
area: progress
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user with two or more draws on file who wants one honest answer to "am I getting better?", I want a single headline number at the top of Progress — the percentage of my tracked markers currently inside the functional range, with an arrow showing how it moved since my last draw — so that I can read my whole panel as one figure I actually understand, instead of squinting at a dozen sparklines to guess whether the trend is up.

## Why now (four lenses)

### Product Owner

Progress today is a wall of per-marker trends, projection cards, and a compare picker. Every piece is honest, but there is no single number that answers the question the user actually opens the page with: am I closer to optimal than I was? The smallest meaningful unit of value is one headline metric at the top of Progress — "N% of your markers are in the functional range" — computed over the most recent panel, with a delta arrow against the same figure computed over the prior panel. The computation already exists: `computeReportCard(panel, markers)` returns `optimal` and `total` against the functional optimum, and the percentage is `optimal / total`. This ticket adds no new inference, no new egress, no new schema — it surfaces a number the app can already derive, and it removes friction by giving the user one figure to read before they decide whether to study the trends below it. It makes Progress simpler, not richer.

### Stakeholder

This is the cleanest moat-deepener on the board because the number is only computable by a product that holds two things at once: the curated functional-range DB (so "in range" means the functional optimum, not the lab floor) and the user's persistent multi-draw timeline (so the delta has a prior to compare against). A chat box can tell you a single ferritin value looks low; it cannot say "73% of your markers are in the functional range, up four points since February," because it has neither your prior panel nor a functional-range catalog to score against. The score is the structured-artifact and persistent-timeline moats expressed as one figure — the difference between an app that stores numbers and an app that tells you whether the numbers are getting better. And it is privacy-clean: a pure render over the local panels and the in-code marker DB, zero egress.

### User (at 7am on the phone)

I open Progress before work. The first thing I see, in large type, is "73% of your markers are in the functional range," and a small up-arrow with "+4 since Feb 18." That is the whole answer in one glance — I do not have to read every sparkline to know the direction is right. If I want the detail it is all still below. One tap to open the page, no taps to get the headline; it is the first thing rendered, it works offline because it is my own data and a catalog that ships in the app, and it does not move or reflow while I read it with one hand and a coffee in the other.

### Growth

This is the screenshot. "73% of your markers are in the functional range — up 4 since my last draw" is a single, legible, brag-able figure that the persona forwards to the friend who was also told "everything looks normal." It is concrete, it is theirs, and it implies the whole product underneath it without explaining it. (Hypothesis: a single headline score raises both return-to-Progress frequency and share rate versus a page that opens on per-marker trends, because a number that summarizes the whole panel is both easier to check repeatedly and easier to show off than a grid of charts; back-of-envelope from how summary "scores" drive habitual return in health and fitness products; treat as untested without remote analytics, which we will never add.) It is the retention-and-virality sibling of the report card (0036): that scores one panel at rest, this scores the latest panel against the one before it and gives the user a number to watch climb.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] `src/progress/functional-score.ts` (new) exports `computeFunctionalScore(panels: Panel[], markers: MarkerDef[]): { current: { pct: number; optimal: number; total: number; drawnAt: string }; prior?: { pct: number; drawnAt: string }; delta?: number } | null`. It scores the MOST RECENT panel via the existing `computeReportCard(panel, markers)` (`pct = round(optimal / total * 100)`), and when a prior panel exists, scores it the same way and sets `delta = currentPct - priorPct`. Returns `null` when there are zero panels or the most recent panel has `total === 0` (no markers with a range to judge against). Pure: no DOM, no Dexie, no network. Asserted by passing known panels + markers and confirming `pct`, `optimal`, `total`, the prior figure, and `delta`.
- [ ] The percentage is computed against the FUNCTIONAL optimum, not the lab range — it counts only the `optimal` bucket from `computeReportCard` over `total` (markers with a range to judge against). Asserted with a panel whose markers sit inside the lab range but below the functional optimum, confirming those count against the score (denominator) and not toward it (numerator).
- [ ] The Progress page (`src/pages/progress.ts`) renders the headline score at the TOP of the page (above the improvement card, picker, projection, and trends) when `computeFunctionalScore(...)` is non-null. The headline reads "N% of your markers are in the functional range" with N as the integer percent. Asserted by seeding 2+ panels and confirming the headline text and number render at the top of the page.
- [ ] When a prior panel exists, the headline shows a direction arrow (up / down / flat) and the delta against the prior draw, phrased with the prior draw's date — e.g. "+4 since 2026-02-18" (up), "−3 since …" (down), "no change since …" (flat at delta 0). Asserted with a panel pair that improved, one that regressed, and one with an identical score, confirming the arrow class and the delta copy for each.
- [ ] With exactly ONE panel on file, the headline renders the current percentage with NO delta and NO arrow (there is no prior to compare). Asserted on a single-panel profile, confirming the score shows and no delta/arrow element is present.
- [ ] With ZERO panels, or a most-recent panel whose `total` is 0, the headline is ABSENT entirely (no empty "0%" card) and the existing "No labs yet" / "One panel on file" guidance is unchanged. Asserted on a no-panel profile and on a profile whose only panel carries no range-resolvable markers.
- [ ] The score's denominator and numerator agree with `computeReportCard` for the same panel — i.e. the headline is not a second, divergent computation of "in range." Asserted by computing the report card and the functional score over the same seeded panel and confirming `optimal`/`total` match.
- [ ] The headline makes ZERO Anthropic calls and ZERO network calls — it is a pure render over local panels and the in-code marker DB. Asserted by seeding panels, rendering Progress, and confirming the Anthropic mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the headline or any intermediate string. Asserted by seeding a sentinel key, rendering the score, and confirming the key appears nowhere in the rendered output.
- [ ] Renders on both **chromium and mobile-webkit**: the headline number fits the 390 px viewport without truncation or horizontal scroll, the delta line wraps cleanly below the number on narrow widths, and any grid children respect `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) renders the headline against the tour fixture's panels (read-only fixture data); shared-view mode (0017) — which has no panels — does NOT render the headline (Progress already paints the "This was not shared with you" empty state under shared-view and returns early). Asserted in both modes.
- [ ] The existing Progress surfaces — the improvement card (0047), the compare picker (0009), the projection section (0012), the trend list, the continuous-signals section (0004), the singletons-awaiting-second-draw list — are unchanged in behavior and order below the new headline; the headline is purely additive at the top. Asserted by exercising the existing Progress flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — rendering the score introduces no new hostnames in the egress allow-list.
- [ ] New `tests/e2e/functional-score.spec.ts` covers: `computeFunctionalScore` math (current pct, prior pct, delta, null cases), the headline renders at the top with the right number, the up/down/flat arrow and delta copy, the single-panel no-delta case, the zero-panel/zero-total absence, agreement with `computeReportCard`, zero Anthropic + zero network, the key never appears (sentinel), tour vs shared-view behavior, the existing Progress flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- An LLM call to "explain the score," summarize what changed, or generate prose around the number. The headline is a deterministic percentage with a deterministic delta. No inference, no new Anthropic call.
- A composite, weighted, or proprietary "health score" that combines markers with bespoke weights, signals, adherence, or category bonuses. The number is a flat percentage: optimal markers over total range-resolvable markers, full stop. No marketing index.
- A persisted score history table or any schema change. The current and prior figures are computed at render time from the existing panels; persisting a score series is out of scope here (the historical trajectory is ticket 0063, which also computes at render time over the existing panels).
- A share-card / PNG export of the score. The headline is an on-page figure; turning it into a phone-shaped image is a plausible later ticket, not this one.
- Per-category sub-scores ("metabolic 80%, lipids 60%"). One headline number for the whole panel. Category breakdowns belong to the trend groups already on the page.
- Re-deriving "in range" with new thresholds or a new classifier. The score reuses `computeReportCard` / `resolveResultFlag` / `flagFor` exactly so it can never disagree with the rest of the app about what "optimal" means.
- Surfacing the score anywhere except the top of Progress — no Today card, no Plan section, no masthead badge in this ticket.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/functional-score.ts` (new) — `computeFunctionalScore(panels, markers)`. Sort panels oldest→newest (or read the newest two), score the newest via `computeReportCard(panel, markers)` from `src/labs/report-card.ts`, and `Math.round(optimal / total * 100)`. When a second-newest panel exists, score it too and compute the integer `delta`. Return null when no panels or the newest panel's `total` is 0. Pure; no Dexie import — the page passes panels + the merged marker set in.
- `src/pages/progress.ts` — the page already reads `allPanels()` and the merged markers via `getAllMarkers()`; pass both to `computeFunctionalScore` and render the headline section at the very top of the `.page` (before `improvementHtml`/`pickerHtml`). Reuse the existing `eyebrow`/`headline` editorial idiom and the trend `--good`/`--bad`/`--flat` arrow classes for the delta direction. Do not alter the existing compare-param branch or the shared-view early return.
- `src/labs/report-card.ts` — read-only reuse of `computeReportCard` (and, through it, `resolveResultFlag` / `flagFor`). Do NOT fork the classification logic; the score must agree with the report card by construction.
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only; the page already resolves the merged marker set via `getAllMarkers()`.
- `src/styles.css` — `.functional-score` (the headline block), reusing the page's existing display-type and the `trend__delta--good`/`--bad`/`--flat` color tokens for the arrow. No new colors; ink, ink-soft, oxblood. Grid children `min-width: 0`; the number must not force horizontal scroll at 390 px.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour renders the score from the fixture panels (no change needed beyond the page reading `allPanels()` which already honors `isTour()`); shared-view returns early in `renderProgress` already, so the headline never reaches that path.
- `tests/helpers/flows.ts` — reuse the existing panel-seeding helper used by the 0009/0036 specs so the spec can seed two panels with known marker values without a full compose round-trip.
- `tests/e2e/functional-score.spec.ts` (new) — every acceptance bullet maps to a `test()`. The math test calls `computeFunctionalScore` with known panels + markers; the render tests seed panels and assert the headline DOM; the agreement test asserts the score's optimal/total equal `computeReportCard`'s for the same panel.
- `tests/e2e/privacy.spec.ts` — extend with a Progress visit that renders the score, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — the score is computed at render time over existing panels; nothing is persisted.
- Voice spec: the headline reads "N% of your markers are in the functional range"; the delta reads "+4 since 2026-02-18" / "−3 since …" / "no change since …". Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; the arrow uses the existing good/bad/flat tokens.

## Implementation log

(Appended by the implementation-dev agent during execution.)
