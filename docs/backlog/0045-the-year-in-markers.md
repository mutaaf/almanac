---
id: 0045
title: The year in markers — a full trailing-year biomarker arc for the user with a history
status: proposed
priority: P1
area: progress
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user a year or more into a protocol who has drawn blood three or four times, I want a single `#/year` view that lays out every marker I have measured at least twice in the last twelve months as a dated sparkline against its functional-range band — with its highest, lowest, and current value and whether it is improving, declining, or holding — so that the whole trailing year of my biology is one framed, scrollable audit I can read in a sitting and show to someone, instead of a per-category trend list I have to assemble in my head one marker at a time.

## Why now (four lenses)

### Product Owner

Almanac already stores every panel a user has ever drawn (`db.plans`/`db.panels`, read newest-first via `allPanels()`), and the Progress page already renders per-marker sparklines with the functional band behind the line. But Progress is structured by category and spans *all time* — it is a working surface for "what is moving," not a single framed artifact for "where the last year went." There is no view that takes the trailing twelve months specifically and lays the whole biology out as one audit. The smallest meaningful unit of value is a new read-only route `#/year` that reads `allPanels()`, groups results by `markerKey` across the trailing 365 days, keeps every marker with two or more data points in that window, and renders each as a dated sparkline (reusing `viz.ts`'s exported `sparkline()`) with the functional-range band, a current value, a highest/lowest pair, and a direction label computed in pure TypeScript from first-versus-last in the window. Zero new inference, zero new schema, zero new egress — it is a deterministic re-projection of data the user already owns, sliced to the one window (a year) that humans actually reason in. It does not replace Progress; it is the annual frame Progress was never meant to be.

### Stakeholder

This deepens the single richest moat asset — the **persistent timeline** — along the axis with the most accumulated, least-surfaced value: the multi-marker, multi-draw arc over a meaningful clinical interval. A chat box cannot produce this at any price, because it has no record of last March's draw, let alone twelve markers across four draws each reconciled to the same canonical key and the same functional band. The year view is the visible payoff of three quieter moat investments compounding at once: marker canonicalization (so "25-OH Vit D" and "Vitamin D, 25-OH" land on one sparkline), the functional-range DB (so each line is read against the optimum, not the lab floor), and the timeline itself (so the line exists at all). It sits cleanly beside the existing side-by-side draw comparison (0009, which diffs two chosen panels) and the next-draw projection (0012, which looks forward one draw) by occupying the slot neither does: the full backward arc of every marker at once. And it is the kind of asset that gets harder to walk away from the longer the product is used — a user with a year of dated, banded marker arcs has a record that exists nowhere else and took a year to accrue.

### User (at 7am on the phone)

It is a Sunday a year in. I want to see how the whole thing went, not click through one category at a time. I tap "See year view" from Progress. One page: every marker I have drawn twice this year, each a small dated line over its green functional band, each with "highest 142, lowest 88, now 96 — improving." I can scroll the whole year of my biology in twenty seconds. ApoB came down, ferritin climbed back into the band, hs-CRP held flat — all there, all dated, all read against the optimum. The header tells me the shape of the year in one line: "11 markers tracked this year across 4 draws." It rendered instantly, offline, because every number is already on my phone — nothing was fetched, nothing was sent. It is the page I screenshot and the page I would actually show a friend.

### Growth

This is a retention-and-acquisition surface aimed at the resident user — the one with enough history to have an arc worth seeing — and it produces the single most credible "show me" artifact the product owns. Retention: a user who can see a full year of banded marker arcs in one frame has tangible proof that the time they invested produced movement, which is the most durable reason to keep drawing blood and keep recomposing. (Hypothesis: a single-screen trailing-year marker view raises long-run retention among users past their third draw and lifts the share rate of progress artifacts, because a framed annual arc converts diffuse, hard-to-feel progress into one ownable image — back-of-envelope from how annual-summary surfaces in quantified-self tools drive both return visits and outbound shares; treat as untested without remote analytics, which we will never add.) The acquisition tail is specific: "here is twelve of my biomarkers over twelve months, each against its functional target" is exactly the screenshot that makes a precision-health-literate friend ask "wait, what app is that?" — because no chat box and no generic tracker can produce a canonicalized, functionally-banded annual arc, and the persona who reads Attia and Patrick knows it.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A new route `#/year` is registered in `src/main.ts` under the SAME gate posture as `#/progress` — requires consent and a profile, does NOT bypass either. Asserted by visiting `#/year` with a profile + qualifying panels (renders) and confirming a fresh pre-consent browser does not reach it.
- [ ] `src/pages/year.ts` (new) exports `renderYear()`. It reads `allPanels()` (newest-first), groups every `Result` by `markerKey` across panels whose `drawnAt` falls inside the trailing 365 days ending at `today()`, and keeps only markers with **two or more** data points in that window. Pure render over stored data: no inference, no network. Asserted by seeding three panels inside the year with a marker that appears in two of them and confirming that marker renders, while a marker appearing in only one panel does NOT render an arc.
- [ ] For each qualifying marker the page renders, in the editorial register: the marker's human name (via `findMarker()`, preferring `shortName`), a dated sparkline using the exported `sparkline()` from `src/viz.ts` with the functional-range band behind the line, the current (most-recent-in-window) value with unit, a "highest" and "lowest" value from the window, and a single direction label of "improving", "declining", or "holding". Asserted by seeding a marker with known in-window values and confirming the rendered current/highest/lowest and the direction label.
- [ ] The direction label is computed deterministically in pure TypeScript from the marker's first-versus-last in-window value AND the marker's `optimalRange` (moving toward the optimum reads "improving", away reads "declining", no net move reads "holding") — reusing the same toward-the-optimum logic already in `progress.ts`'s `signOfChange` / `distanceToRange` (extract to a shared helper rather than duplicate). Asserted across three seeded markers: one moving toward optimum (improving), one away (declining), one with equal first/last (holding).
- [ ] A draw older than 365 days is excluded from the window — a marker whose only second data point is 400 days ago drops below the two-point threshold and does NOT render. Asserted by seeding one in-window draw and one 400-days-ago draw for the same marker and confirming no arc renders for it.
- [ ] The summary header reads exactly: "<N> markers tracked this year across <M> draws." where N is the count of qualifying markers and M is the count of distinct panels with a `drawnAt` inside the trailing 365 days. Asserted by seeding a known set of in-window panels/markers and confirming the exact header counts.
- [ ] A "See year view" link is rendered on `src/pages/progress.ts` ONLY when the user has two or more panels with `drawnAt` inside the trailing 365 days; it routes to `#/year`. Asserted by confirming the link appears with two in-window panels and is absent with one (or with two panels both older than 365 days), and that tapping it lands on `#/year`.
- [ ] The page is computed and rendered with **zero network calls** — it reads `allPanels()` from IndexedDB and computes everything in memory. Asserted by rendering `#/year` and confirming the mock recorded zero requests during the render.
- [ ] This view does NOT duplicate the side-by-side draw comparison (0009) or the all-time per-category trend list on Progress — it carries no two-panel picker and no category grouping; it is the flat trailing-12-month arc only. Asserted by confirming `#/year` renders no `.compare-picker` and no per-category `.section-mark` trend grouping.
- [ ] With FEWER than two qualifying markers in the window, the page renders an editorial empty state ("Not enough draws in the last twelve months to chart a year — add a panel or wait for your next draw.") rather than an empty grid. Asserted by visiting `#/year` with a profile but only one in-window panel and confirming the empty state.
- [ ] Renders on both **chromium and mobile-webkit**. Each marker arc card wraps cleanly at the 390 px viewport, the sparkline scales to the column width, and long marker names respect `min-width: 0` (the documented overflow fix) and do not overflow horizontally.
- [ ] Tour mode (0014) renders the year view against the tour's panel fixtures if they carry two-plus draws inside a synthetic trailing year; shared-view mode (0017) does NOT render the route — the shared payload carries no panels, exactly as Progress short-circuits under shared-view. Asserted in both modes.
- [ ] Marker-name resolution covers sex-specific keys (e.g. `ferritin_f`) and user-defined markers (0002) via `findMarker()` / the merged catalog, so the arc shows "Ferritin", not the raw key. Asserted by a window containing a sex-specific marker and a user-defined marker and confirming both render with their human names.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the year view is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the view reads the existing panels store (every drawn panel already stored with `drawnAt`). Nothing new is persisted; no panel is edited or deleted from this surface.
- [ ] New `tests/e2e/year.spec.ts` covers: route gated like `#/progress`, two-point-in-window filter, per-marker current/highest/lowest + direction render, toward/away/holding direction logic, the 365-day window boundary exclusion, the exact summary-header counts, the Progress-page link gating + routing, zero-network throughout, no compare-picker / no category grouping, the empty state, tour vs shared-view behavior, sex-specific + user-marker name resolution, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A two-panel picker or any side-by-side comparison. That is the side-by-side draw comparison (0009), reachable from Progress. The year view is a single flat arc per marker, not a chosen-pair diff.
- A forward projection / "where it lands next" band. That is the next-draw projection (0012). The year view looks strictly backward over the trailing twelve months.
- A user-selectable window (last 6 months, last 2 years, custom range). The window is fixed at the trailing 365 days — the editorial unit is "the year". A configurable range adds settings surface for no clear gain.
- Category grouping or a category filter. The view is deliberately flat — one scrollable list of every qualifying marker — so the whole year reads as one frame. Progress already owns the category-grouped all-time list.
- An LLM-generated narrative of the year. The arcs and the summary line are deterministic structural renders; a Claude call would add cost, latency, non-determinism, and egress to a surface whose entire value is being instant, local, and provably honest. The hundred-day mark (0021) already carries a deterministic editorial paragraph for the quarterly arc.
- A shareable image export of the whole page. The marker hero share card (0011) and the protocol-on-the-fridge card (0033) own image export; a full-page year image is a possible follow-up but is not the minimum value here. The view is screenshot-friendly by being clean, not by adding a render-to-PNG path.
- Continuous-signal (HRV / RHR / sleep) arcs. Those live on Progress's "Continuous signals" section (0004). The year view is lab markers only — the canonicalized, functionally-banded draws.
- Adding `#/year` to the authenticated masthead nav. It is reached from the Progress page and by direct URL, keeping the masthead at its current entry count (the same restraint the hundred-day route 0021 used).
- Editing, annotating, or deleting a draw from this surface. It is strictly read-only.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/year.ts` (new) — `renderYear()`. Read `allPanels()` (already newest-first, with tour/shared-view shims). Compute the window edge as `today()` minus 365 days. Group `Result`s by `markerKey` across panels inside the window; keep markers with `points.length >= 2`. For each, derive current (newest in window), highest, lowest, and a direction via the shared toward-the-optimum helper. Render each with `sparkline({ marker, points })` exported from `src/viz.ts` (the standalone helper, NOT the page-local `sparkline` in `progress.ts`). Pure render; no Dexie write, no Anthropic call. Short-circuit in `isSharedView()` (render the "not shared" empty state, mirroring `progress.ts`'s `paintSharedNotIncluded`); render normally under `isTour()`.
- `src/progress/` (shared helper) — extract `progress.ts`'s `signOfChange` / `distanceToRange` toward-the-optimum logic into a small shared module (e.g. `src/progress/direction.ts`) returning "improving" | "declining" | "holding" given first value, last value, and `optimalRange`, then call it from BOTH `progress.ts` and `year.ts`. Do NOT duplicate the logic. The year-view direction uses first-in-window vs last-in-window (the whole arc), not the last two points.
- `src/viz.ts` — read-only consumer. Use the exported `sparkline(opts)` (the one taking `{ marker, points: ThermPoint[] }`). No change to `viz.ts`.
- `src/main.ts` — register `#/year` in the router with the same gate behavior as `#/progress` (consent + profile required, not bypassed). Routing back to `#/progress` is the path out.
- `src/pages/progress.ts` — add a restrained "See year view" link near the page's existing controls, rendered only when the user has two or more panels with `drawnAt` inside the trailing 365 days. Match the existing link/button styling; reuse the same window computation the year page uses (extract a `panelsInTrailingYear(panels, now)` helper if it keeps the two surfaces honest).
- `src/db.ts` — read-only. `allPanels()` already returns every panel newest-first. No change to the panels store. (`today()` lives in the existing date utilities; reuse it.)
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only. `findMarker()` / the merged catalog resolve sex-specific and user-defined marker names. No change.
- `src/types.ts` — add a small internal render type for the year-view row (e.g. `YearMarkerArc`) if it clarifies the render; additive, no persistent schema change.
- `src/styles.css` — `.year` (the page), `.year__row` / `.year__arc` (one marker: name, sparkline, current/high/low, direction label), reusing the existing Progress `.trend` token family where it fits (restraint over novelty). Direction label uses ink / ink-soft; no new colors; oxblood reserved. Grid children get `min-width: 0`.
- `src/chrome.ts` — do NOT add `#/year` to the authenticated nav; it is reached from Progress and by direct URL, like the hundred-day route.
- `src/share/shared-state.ts` / `src/sample/state.ts` — shared-view short-circuits the route (no panels in the payload); tour reads its panel fixtures so the year lists the tour's draws if they qualify.
- `tests/helpers/flows.ts` — reuse the existing panel-seeding helper (the one the Progress / hundred-day specs use) to seed panels with controlled `drawnAt` dates and marker values; drive `now` via Playwright's clock API for the 365-day boundary test. Mind the read-after-write determinism pattern (`composePlan` / `waitForDb`) when seeding then navigating.
- `tests/e2e/year.spec.ts` (new) — every acceptance bullet maps to a `test()`. The window-boundary test seeds one in-window draw and one 400-days-ago draw for the same marker and asserts no arc renders; the direction test seeds three markers (toward / away / equal) and asserts "improving" / "declining" / "holding".
- `tests/e2e/privacy.spec.ts` — extend with a `#/year` visit confirming zero off-allow-list egress during the render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the summary reads "<N> markers tracked this year across <M> draws." Per-marker stats read "highest <h>, lowest <l>, now <c> — <improving|declining|holding>." The empty state reads "Not enough draws in the last twelve months to chart a year — add a panel or wait for your next draw." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)
