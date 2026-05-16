---
id: 0009
title: Side-by-side draw comparison with shared-marker deltas
status: in-progress
priority: P1
area: progress
created: 2026-05-15
owner: gtm-innovation
---

## User story

As a user with three or more lab draws on file, I want to pick any two of them and see a single page that shows just the markers they have in common, with the value on each draw, the delta, the percent change, the flag transition (e.g. "high → in-range"), and the functional-range band — so I can answer the one question I always have between draws: "did the thing I changed actually work?"

## Why now (four lenses)

### Product Owner
Progress already shows per-marker sparklines, which is great for trend reading. But the question users actually ask is comparative and pointed: "this draw vs that draw." Today they answer it by switching tabs between two panel-detail pages and squinting. The smallest meaningful unit of value is one screen that does the comparison for them. Nothing new gets persisted; one new view collects what's already there.

### Stakeholder
This is the clearest "Claude.app + a PDF can't do this" moment we can ship cheaply. The moat-deepening pieces are all here: marker canonicalization (the two reports use different names — we already normalize them), the curated functional-range DB (we render the band, not just the lab's reference range), and the persistent timeline (only meaningful when there's more than one panel). Together they produce something a generic chatbot literally cannot — its context window doesn't carry the user's two PDFs at sufficient fidelity to do the math, and even when it does, it doesn't know the functional ranges. This is the screenshot that wins a comparison post.

### User (at 7am on the phone)
"My March draw vs my October draw." Two taps to pick. One page: a clean two-column list, marker name on the left, two values + delta + arrow on the right. Bold red where a marker crossed out of optimal. Bold green where it crossed in. I screenshot the page and send it to my partner: "Look — apoB went from 95 to 78 after the dietary changes."

### Growth
This is the artifact our highest-LTV cohort (specialty-medicine users, the cohort 0002 was written for) will actually use. They draw labs every 3 months and the comparison is the whole point. It's also genuinely viral inside the precision-health community — Twitter / Reddit / forum posts of "look at my apoB drop" are the format. We just need to make the screenshot good.

## Acceptance criteria

- [ ] A new route `#/progress?compare=A,B` renders a side-by-side comparison of two panels by id (A = older, B = newer; if reversed, the page swaps them and warns in a small note).
- [ ] The default `#/progress` page gains a **"Compare two draws"** affordance at the top. Tapping it opens an inline picker (no slideover yet — keep this self-contained) with two `<select>`s: "Earlier draw" and "Later draw," each populated from `allPanels()` ordered newest-first.
- [ ] The picker has a **"Compare"** button that constructs the URL `#/progress?compare=<earlierId>,<laterId>` and navigates via the imported `route()`.
- [ ] The comparison page lists ONLY markers that appear in BOTH panels (intersection by `markerKey`). If the intersection is empty, the page renders an editorial empty state explaining the two draws share no markers and links back to the picker.
- [ ] Each row shows: marker name (canonical), unit, earlier value, later value, absolute delta, percent change (rounded to one decimal), an arrow glyph (`↑` / `↓` / `→`), and a small functional-range band visualization (re-use `thermometer` from `src/viz.ts`) showing where each value falls.
- [ ] Rows are ordered by category, then by the absolute percent change descending within each category (biggest movers first).
- [ ] Markers that crossed an `optimal` boundary between the two draws get a one-word badge: "improved" (entered optimal) or "regressed" (exited optimal). The badge uses the existing oxblood / ink tokens — no new colors.
- [ ] The page header reads: "<earlier date> · <later date> · N markers in common · <X> improved, <Y> regressed."
- [ ] Comparison works for user-defined markers (from ticket 0002) when both panels contain them. Asserted with a fixture that includes one user marker on both draws.
- [ ] Zero Anthropic calls fire during compare. All data is local.
- [ ] Renders on both chromium and mobile-webkit. On mobile, each row collapses to a stacked card; on desktop, a two-column row.
- [ ] Privacy E2E still passes.
- [ ] New scenarios in `tests/e2e/progress.spec.ts` (or a new `tests/e2e/compare.spec.ts`) cover: picker → compare flow, the intersection logic, the cross-boundary badges, the empty-intersection state, and the user-marker case.

## Out of scope

- Comparing more than two panels at a time. (The mental model breaks down past two; trend sparklines on the main Progress page already handle "many".)
- LLM-generated "what changed and why" summary on the comparison page. The numbers and badges are the artifact.
- Letting the user annotate a marker on the comparison page. (Notes are at the panel level today; keep it that way.)
- Exporting the comparison as a PDF or image. That's ticket 0010 (printable artifacts) and should follow this one.

## Engineering notes

- `src/pages/progress.ts` — the picker UI goes at the top of the existing page when `compare` is not in the URL params. The compare view is a new render path branching on `params.get("compare")`.
- New helper module `src/progress/compare.ts` — pure function `computeComparison(earlier: Panel, later: Panel, markers: MarkerDef[]): ComparisonRow[]` returning the row data. Easy to unit-test if we ever add Vitest; for now exercised through Playwright.
- `src/viz.ts` — `thermometer()` already exists; if it doesn't take a "two markers on one band" shape, extend it minimally OR render two thermometers per row stacked. Pick whichever keeps the SVG complexity low. Don't invent a new viz primitive.
- `src/types.ts` — internal types only; no exported shape needed yet.
- Mobile layout: the row should reflow via CSS — no JS detection. Use the existing breakpoint pattern.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

- 2026-05-16 — implementation-dev agent picked up via `/ship 0009`. Branch
  `feat/0009-compare-draws`. Writing the Playwright spec first against the
  picker → compare flow, intersection logic, cross-boundary badges, the
  empty-intersection state, the user-defined-marker case, and the
  no-Anthropic-egress invariant.
