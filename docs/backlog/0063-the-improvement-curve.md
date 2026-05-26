---
id: 0063
title: The improvement curve — a sparkline of your functional-range percentage across every draw
status: proposed
priority: P2
area: progress
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user with three or four draws on file who has been holding a protocol for months, I want a small chart on Progress that plots the share of my markers in the functional range across every draw I've taken, with dates underneath, so that I can see the whole arc — not just where I am now, but the line I've been walking — and show that line to my doctor as evidence the protocol is working.

## Why now (four lenses)

### Product Owner

The functional score (0060) gives the user one number for the latest draw and a single since-last-draw delta. That answers "am I better than last time?" It does not answer "what has the whole trajectory been?" The smallest meaningful unit of value is one sparkline on Progress, sitting directly below the headline score, that plots the same "percentage of markers in the functional range" figure computed over *every* panel, oldest to newest, with the draw dates on the x-axis. Each new draw adds a point. The data is already there — it is the report-card reduction (0036) run once per panel — and the viz primitive is already there (`sparkline()` in `src/viz.ts`). With one draw there is no line to draw, so the section shows only the number (deferring to 0060's headline); with two or more, the curve appears. It turns a snapshot into a story without any new inference, egress, or schema.

### Stakeholder

This is a moat-deepener that compounds with time — the rarest and best kind. The curve is only possible because Almanac holds the user's *entire* draw history scored against the curated functional ranges; the longer the user stays, the more points the line has and the more valuable the picture becomes. A chat box can score a single panel in a paragraph; it cannot draw "your functional-range percentage across eight months of draws" because it has neither the persistent timeline nor the per-draw functional scoring to plot. The curve is the visual expression of the persistent-timeline and functional-range moats together, and it gives the user a reason to keep adding draws — each one extends a line they're invested in. It is privacy-clean: a pure render over the local panels and the in-code marker DB, reusing the existing sparkline, with no egress.

### User (at 7am on the phone)

On Progress, under the big "73% in the functional range" number, there's a quiet little line chart — dots climbing gently from left to right, dates under each: Nov, Feb, May. I can see the arc of the work, not just today's figure. It is the chart I'd actually screenshot and send to my doctor: "this is what changed since I started eating differently." It loads instantly because it's my own draws and a catalog that ships in the app; it works on the train. With only one draw there's no line yet, just the number — honest, not a misleading single dot pretending to be a trend. One glance, no taps, my biology over time in one small picture.

### Growth

This is the "show me" moment in chart form. A gentle upward curve of "markers in the functional range" with real dates underneath is the screenshot the persona shows the friend who's skeptical that diet moves bloodwork — and the chart they bring to their own doctor as a record. (Hypothesis: a longitudinal curve of the functional score raises both the rate of adding further draws — the user wants to extend a line they can see climbing — and the rate of sharing a biological-progress chart with a clinician or a friend, versus a single current number alone; back-of-envelope from how trajectory visualizations out-share and out-retain point-in-time figures in health and finance products; treat as untested without remote analytics, which we will never add.) It is the over-time sibling of the headline score (0060): that gives the user a number to check; this gives them a line to grow.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] `src/progress/improvement-curve.ts` (new) exports `computeImprovementCurve(panels: Panel[], markers: MarkerDef[]): ImprovementCurvePoint[]` returning one point per panel that has a judgeable `total > 0`, oldest first, each `{ drawnAt: Day; pct: number; optimal: number; total: number }` where `pct = Math.round((optimal / total) * 100)` from `computeReportCard(panel, markers)`. Panels with `total === 0` are skipped (no point). Pure: no DOM, no Dexie, no network. Asserted by passing a known panel set and confirming the ordered points, the pct math, and the skip of a zero-total panel.
- [ ] The percentage at each point uses the SAME `Flag === "optimal"` over `total` classification as `computeReportCard` / the functional score (0060) — the curve and the headline never disagree about "in range" for the same panel. Asserted by computing `computeFunctionalScore` (if 0060 has shipped) or `computeReportCard` for the newest panel and confirming the curve's last point matches; if 0060 has not shipped, assert against `computeReportCard` and note it.
- [ ] On the Progress page (`src/pages/progress.ts`), with 2+ judgeable panels, an "improvement curve" section renders below the headline score (if 0060 has shipped) or as a standalone section near the top of Progress (if not), showing a sparkline of the per-draw percentages. Asserted by seeding 3 panels with known percentages and confirming the section and sparkline render.
- [ ] With exactly ONE judgeable panel, NO line renders — the section shows only the single number (or defers entirely to the 0060 headline) with a quiet note "The curve appears after your next draw." A single dot pretending to be a trend is never drawn. Asserted on a single-panel profile.
- [ ] With ZERO judgeable panels (no labs, or no range-resolvable markers), the section is ABSENT entirely and the existing Progress empty/single-panel guidance is unchanged. Asserted on a no-panel profile.
- [ ] The sparkline reuses the existing `src/viz.ts` `sparkline()` helper (or the page's existing inline sparkline pattern) — it does NOT introduce a new viz primitive. The points are the per-draw percentages on a 0–100 scale. Asserted by confirming the rendered SVG comes from the shared helper (e.g. the expected element shape / class) rather than a bespoke chart.
- [ ] The x-axis shows the draw dates (at least the first and last, or one per point where space allows) so the curve reads as time-forward, left (oldest) to right (newest). Asserted by confirming the first and last draw dates render under the chart in chronological order.
- [ ] The curve makes ZERO Anthropic calls and ZERO network calls — it is a pure reduction over local panels and the in-code marker DB. Asserted by rendering Progress and confirming the Anthropic mock recorded zero requests during the curve computation/render.
- [ ] The Anthropic key NEVER appears in the curve section or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the rendered section.
- [ ] Renders on both **chromium and mobile-webkit**: the sparkline and its date labels fit the 390 px viewport without horizontal scroll, the SVG scales with `preserveAspectRatio` like the existing sparklines, and adjacent children respect `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) renders the curve against the tour fixture's panels (multiple draws → a line). Shared-view mode (0017) — which has no panels — does NOT render the curve (Progress already shows the shared-view empty state and returns early). Asserted in both modes.
- [ ] The existing Progress surfaces — the headline score (0060, if shipped), the compare picker, the projection section, the improvement card (0047), the trend list, the continuous-signals section — are unchanged in behavior; the curve section is purely additive at the documented slot. Asserted by exercising the existing Progress flows and confirming they are unchanged.
- [ ] New `tests/e2e/improvement-curve.spec.ts` covers: `computeImprovementCurve` ordering + pct math + zero-total skip, agreement with `computeReportCard` / the functional score, the line present at 2+ draws and absent at 1 draw (number-only note), absent at 0 draws, the sparkline comes from the shared `viz.ts` helper, the x-axis dates render chronologically, zero Anthropic + zero network, the key never appears (sentinel), tour vs shared-view behavior, the existing Progress flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- An LLM call to narrate the trajectory, predict the next point, or "interpret the curve." The curve is a deterministic plot of a deterministic reduction; the projection of a *future* point is the separate projection feature (0012), not this.
- A new viz primitive or charting dependency. Reuse the existing `sparkline()` in `src/viz.ts` (or the page's inline sparkline). No D3, no chart library — AGENTS.md's no-new-deps rule holds.
- A persisted score-history table or schema change. Each point is recomputed at render time from the existing panels; nothing is persisted (no Dexie migration).
- Per-category curves (a separate line for metabolic, lipids, etc.). One curve for the whole-panel functional-range percentage. Per-marker trajectories are already the trend list.
- A share-card / PNG export of the curve. The section is an on-page chart; a phone-shaped image of it is a plausible later ticket (sibling of 0047), not this one.
- Interpolating or zero-filling between draws. Each point is one real draw; the line connects actual draws, with no synthetic points for the months between them.
- Re-deriving "in range" with a new classifier. The curve reuses `computeReportCard` / `resolveResultFlag` so it can never disagree with the headline score (0060) or the report card (0036).
- A what-if overlay or a dragging interaction on the curve. The curve shows the real history only; the hypothetical is the simulator (0019).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/improvement-curve.ts` (new) — `computeImprovementCurve(panels, markers)`. Sort panels by `drawnAt` ascending; for each, run `computeReportCard(panel, markers)` from `src/labs/report-card.ts`, skip when `total === 0`, else push `{ drawnAt, pct: Math.round(optimal/total*100), optimal, total }`. Pure; no Dexie import. If 0060 shipped, reuse its per-panel scoring rather than duplicating it (extract a small shared `scorePanel(panel, markers)` if cleaner — but do not change 0060's public contract).
- `src/types.ts` — add an `ImprovementCurvePoint` interface (`drawnAt: Day`, `pct: number`, `optimal: number`, `total: number`). Render-time only; additive; NO Dexie change.
- `src/pages/progress.ts` — the page already loads `allPanels()` and `getAllMarkers()`. Compute the curve and render the section directly below the 0060 headline block (or, if 0060 has not shipped, as a standalone section near the top, above the compare picker). Reuse the page's existing date-formatting for the axis labels. Gate the same way the page already gates (shared-view early return; tour via the read shims).
- `src/viz.ts` — read-only reuse of `sparkline({ marker, points, width, height })`. Note: the existing `sparkline()` takes a `MarkerDef` to draw the functional-range band; for a 0–100 percentage curve there is no marker band, so either (a) pass a synthetic 0–100 "marker" with `optimalRange` omitted so no band draws, or (b) add a thin band-less variant / overload. Pick the smallest change that reuses the primitive; document the choice. Do NOT add a new standalone chart function if the existing one can be reused.
- `src/labs/report-card.ts` — read-only reuse of `computeReportCard`. Do NOT fork the classification.
- `src/styles.css` — `.improvement-curve` (the section), `.improvement-curve__axis` (the date labels). Reuse the existing trend/sparkline chart container idioms. No new colors; ink, ink-soft, oxblood. The SVG scales with `preserveAspectRatio="none"` like the existing sparklines; grid children `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour renders the curve from the fixture panels (the page already reads `allPanels()` honoring `isTour()`); shared-view returns early in `renderProgress`, so the curve never reaches that path.
- `tests/helpers/flows.ts` — reuse the existing panel-seeding helper (the 0009/0036 pattern) to seed 1, 2, and 3 panels with known optimal counts so the spec can assert the curve points and the one-draw vs multi-draw rendering without a compose round-trip.
- `tests/e2e/improvement-curve.spec.ts` (new) — every acceptance bullet maps to a `test()`. The math test calls `computeImprovementCurve` with constructed panels; the render tests seed panels and assert the sparkline SVG (from the shared helper) and the axis dates; the one-draw test asserts the number-only note and no line.
- `tests/e2e/privacy.spec.ts` — extend with a Progress visit carrying 2+ panels that renders the curve, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — the curve is recomputed at render time over existing panels; nothing is persisted.
- Voice spec: the section eyebrow reads "Markers in the functional range · over time" (or similar plain label); the one-draw note reads "The curve appears after your next draw." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the accent.

## Implementation log

(Appended by the implementation-dev agent during execution.)
