---
id: 0032
title: The marker moved — a dated receipt when a new draw lands a number where the protocol aimed it
status: in-progress
priority: P1
area: progress
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who retested after three months of holding the iron-rich tier, I want the moment my new panel resolves to tell me — in one calm, dated line — that a marker the protocol was working on actually moved into the functional range ("Ferritin came up from 32 to 48 ng/mL since February — it is now inside the functional range"), so that the single thing the whole loop exists to produce — proof that the food and habits changed my biology — meets me at the exact moment I upload the draw, instead of being something I have to go hunting for across two sparklines and do the subtraction myself.

## Why now (four lenses)

### Product Owner

The post-upload moment is the highest-emotion second in the entire product: the user has done the hard part — retested — and wants to know whether it worked. Today the answer is mute. The new panel resolves, the values appear, and the user is left to navigate to Progress, find the right marker, and mentally diff two dots on a sparkline to learn whether anything moved. The smallest meaningful unit of value is a deterministic, zero-network "what moved" receipt rendered on the post-extraction review screen (`#/labs?id=N`): for each marker in the just-resolved panel that also has a prior draw, compute the delta, classify whether it moved *toward* the functional range and whether it crossed *into* it, and render a short editorial list — "<marker> came up/down from <prior> to <now> <unit> since <prior month> — now inside the functional range" / "still below the functional floor, but moving toward it." It reads only data already on the device. It is the canonicalization receipt's (0026) emotional sibling: 0026 says "we recognized this marker across labs," this says "and here is how far it moved."

### Stakeholder

This activates the two moat assets that only pay off over time — the **persistent timeline** and the **functional-range DB** — at the precise instant they deliver their value. The functional ranges are the reason Almanac reasons against the optimum, not the lab floor; a delta that says "now inside the functional range" is the functional-range DB made visceral, and it is a sentence raw Claude structurally cannot produce (it has no prior draw and defaults to lab "normal"). It compounds the retest loop the rest of this sprint is building: 0028 nudges the user to draw again, 0029 shows how the plan responded, and this shows how the *body* responded — the three together close the loop and prove it closed on the user's own numbers. A backend product could compute the same delta, but it would do so on data the user shipped to its server; Almanac computes it from data that never left the device, which is the entire argument.

### User (at 7am on the phone)

Results day. I upload the PDF; the values resolve. Before I have even tapped through to Progress, the review screen tells me what I came to find out: "Ferritin came up from 32 to 48 ng/mL since February — now inside the functional range." Under it: "hs-CRP eased from 2.1 to 1.4 mg/L — moving toward the functional range." It is the most satisfying thing I have read all week, and I did not have to do any arithmetic to feel it. One marker that did not move says so honestly — "ApoB held at 95 mg/dL — unchanged since February" — no spin. I tap through to Progress to see the sparkline behind the line, but I already know the headline. It rendered instantly, offline, because both draws are already on my phone.

### Growth

This is the artifact that makes the retest worth retesting for, and the most honest "the system works over time" proof a skeptic can be shown. Retention: a user who watches a marker cross into the functional range on their own data has the strongest possible reason to keep going — the loop visibly worked. (Hypothesis: surfacing the moved-marker receipt at upload raises the rate of a *third* draw among users who reach a second, because the second draw's payoff is now immediate and unmissable rather than buried in a chart — back-of-envelope from how fitness apps that surface a PR at the moment it is set outperform those that bury it in history; treat as untested without remote analytics, which we will never add.) The "show me" frame is the screenshot a friend cannot argue with: "my ferritin actually came up, look" is evidence, not a feature tour — and it is the natural pairing with the marker-hero share card (0011), which this receipt gives the user a concrete reason to generate.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/labs/movement-receipt.ts` (new) exports `computeMovementReceipt(newPanel: Panel, priorPanels: Panel[]): MarkerMove[]` where `MarkerMove` is `{ markerKey: string; canonicalName: string; priorValue: number; newValue: number; unit: string; priorMonth: string; delta: number; towardOptimal: boolean; crossedIntoRange: boolean; state: "into-range" | "toward" | "away" | "unchanged" }`. For each result in `newPanel` with at least one prior draw of the same `markerKey`, it takes the most recent prior value, computes `delta`, decides `towardOptimal` from the marker's `optimalRange` and `higherIsBetter`, sets `crossedIntoRange` true when the prior value was outside the functional range and the new value is inside it, and classifies `state` (`unchanged` when `delta === 0`). Pure: no DOM, no Dexie, no network.
- [ ] The post-extraction panel review screen (`#/labs?id=N` in `src/pages/labs.ts`) renders the receipt rows inline under a single eyebrow ("Since your last draw") only when at least one marker has a prior draw; a fresh user's first panel renders no movement UI at all. Asserted by seeding a February panel (ferritin 32) and a May panel (ferritin 48) and confirming the May review screen surfaces the row.
- [ ] An `into-range` move renders exactly: "<marker> came <up|down> from <prior> to <new> <unit> since <prior month> — now inside the functional range." Direction word agrees with the sign of the delta. Asserted with ferritin 32 → 48 (functional floor 50? — use the marker's actual `optimalRange`; the test seeds a value pair that genuinely crosses in).
- [ ] A `toward` move (moved toward optimal but not yet inside) renders: "<marker> <eased|came up> from <prior> to <new> <unit> since <prior month> — moving toward the functional range." Asserted with hs-CRP 2.1 → 1.4 where the optimal ceiling is below 1.4.
- [ ] An `away` move (moved away from optimal) renders honestly: "<marker> moved from <prior> to <new> <unit> since <prior month> — further from the functional range." No spin, no euphemism. Asserted with a value pair that worsens.
- [ ] An `unchanged` marker (delta exactly 0) renders: "<marker> held at <value> <unit> — unchanged since <prior month>." Asserted with an identical value across two draws.
- [ ] A marker appearing for the FIRST time (no prior draw) produces NO row — there is nothing to compare. Asserted by a single-marker single-panel upload.
- [ ] The receipt resolves the canonical display name via `findMarker()` / `getAllMarkers` so user-defined (0002) and sex-specific (e.g. `ferritin_m`) keys render their human name. Asserted with a sex-specific ferritin pair on a male profile rendering "Ferritin," not the suffixed key.
- [ ] The receipt is computed with **zero network calls** — it reads the new panel and prior panels from IndexedDB only. Asserted by rendering the review screen and confirming the mock recorded zero requests during the receipt computation/render.
- [ ] Renders on both **chromium and mobile-webkit**. Long marker names wrap cleanly at the 390 px viewport; the rows respect `min-width: 0` so ellipsis works (the documented overflow fix); the receipt does not push the results table below the fold by more than one card height.
- [ ] Tour mode (0014) surfaces the receipt against the tour's two-panel fixture if the fixture is shaped to demonstrate a movement (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the receipt — panel detail is not part of the shared payload. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the receipt is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the receipt is computed on render from existing `panels` rows (which already carry `results[].value`, `optimalRange`, and `drawnAt`). Nothing new is persisted.
- [ ] New `tests/e2e/movement-receipt.spec.ts` covers: into-range/toward/away/unchanged copy each with correct direction word, first-ever marker shows no row, eyebrow absent on a fresh single panel, zero-network during render, user-defined and sex-specific marker name resolution, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated narrative of what moved. The receipt is a deterministic transform of two stored values; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose entire value is being instant, local, and provably honest about the actual delta.
- Attributing the movement to a specific food or habit ("salmon moved your omega-3"). Attribution is a causal claim we cannot make honestly from two data points; the receipt states *what* moved, not *why*. The plan-delta (0029) is where the protocol's response is shown; this is where the body's response is shown. Neither claims causation.
- A full statistical trend (rate of change, projected next value). The next-draw projection (0012) and the evaluation against it already exist on Progress; this receipt is the at-upload headline, not a re-implementation of the projection surface.
- Surfacing the receipt anywhere but the post-extraction review screen. The value is the just-happened immediacy at the moment of upload; a Today card or a Progress banner would dilute it. (A future ticket could echo a one-line "your last draw moved N markers" elsewhere if it earns it.)
- Carrying the receipt into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). The Markdown export's trend appendix already shows oldest → newest; this is the live upload-moment artifact.
- Re-running extraction or any inference to compute the receipt. It is built entirely from already-extracted, already-stored data.
- A celebratory animation or color flourish on an into-range crossing. The receipt is one calm editorial line. No confetti, no green glow — the satisfaction is in the sentence, not the styling.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/labs/movement-receipt.ts` (new) — `computeMovementReceipt(newPanel, priorPanels)` per the acceptance bullets. Resolves canonical name via `findMarker()` and the merged user-marker set (`getAllMarkers`). Decides `towardOptimal` / `crossedIntoRange` from the marker's `optimalRange` (and `higherIsBetter` where present) read off the resolved `MarkerDef`. Pure; the page passes in panels from `allPanels()`.
- `src/pages/labs.ts` — the `renderPanelDetail(id)` / `#/labs?id=N` review screen already loads the panel and renders its results. After the results table (and adjacent to the canonicalization receipt 0026 if it has shipped — they are siblings; render movement below canonicalization), call `computeMovementReceipt(panel, priorPanels)` where `priorPanels = allPanels()` drawn before this one, and render the "Since your last draw" section when it returns rows. Re-use the existing small editorial-line idioms; these are not table rows.
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only. `findMarker(key)` for the canonical `name`, `optimalRange`, and `higherIsBetter`. Collapse sex-specific keys by reading the resolved marker's human `name`. No changes to the marker DB.
- `src/types.ts` — add `MarkerMove` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.movement-receipt` (the section), `.movement-receipt__row` (one move line, ink-soft). The into-range line gets no special color (ink, not oxblood and not a green) — the satisfaction is in the copy. The eyebrow re-uses the existing small-caps token. Grid children get `min-width: 0` for long names.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with the same `isTour()` / `isSharedView()` checks the labs page already uses.
- `tests/helpers/flows.ts` — re-use the panel-seeding approach the canonicalization-receipt (0026) spec uses (a `seedPanel(page, panel)` helper writing a fully-formed Panel via `page.evaluate`); if it does not exist yet, add it so the spec can seed exact value pairs across two panels with controlled `drawnAt`.
- `tests/e2e/movement-receipt.spec.ts` (new) — every acceptance bullet maps to a `test()`. The into-range test seeds a prior ferritin below the functional floor and a new value above it and asserts "now inside the functional range."
- `tests/e2e/privacy.spec.ts` — extend with a panel-review visit confirming zero off-allow-list egress during the receipt render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: into-range "<marker> came up/down from <prior> to <new> <unit> since <month> — now inside the functional range." Toward "<marker> eased/came up … — moving toward the functional range." Away "… — further from the functional range." Unchanged "<marker> held at <value> <unit> — unchanged since <month>." The eyebrow is "Since your last draw." Declarative, no exclamation, no spin. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

- 2026-05-21 [implementation-dev] Picked up. Branch `feat/0032-marker-moved-receipt`. Status → in-progress.
  Interpretation notes for the few ambiguous edges in the criteria:
  - Value pairs: the ticket's "ferritin 32 → 48" floor note is illustrative; `ferritin_m`'s actual functional floor is 70, so the into-range test seeds a `ferritin_m` pair (60 → 80, male profile) that genuinely crosses 70. The toward test uses hs-CRP 2.1 → 1.4 (ceiling 1.0, both still above) and the unchanged test uses ApoB 95 (held). The away test uses hs-CRP worsening 1.4 → 2.1.
  - Direction word: "came up/down" is chosen from the sign of the delta; the toward state uses "eased" when the value fell and "came up" when it rose. "moved from" is the neutral verb for the `away` state (no euphemism).
  - Sex-specific name: `ferritin_m` resolves through `findMarker()` to its human `name` ("Ferritin (Male)") — the row never shows the suffixed key. The criterion is satisfied by asserting the raw key never appears and the human name does.
  - "Most recent prior draw" = the newest panel (by `drawnAt`) strictly older than the new panel that also carries the same `markerKey`.
- 2026-05-21 [implementation-dev] Shipped the slice:
  - New `src/labs/movement-receipt.ts` — `computeMovementReceipt(newPanel, priorPanels, extras)` (pure; no DOM/Dexie/network) + `moveSentence()` voice helper. State classification uses a single direction-agnostic distance-to-range metric so `higherIsBetter` and `lowerIsBetter` markers need no special case (the range bounds already encode direction).
  - `src/types.ts` — additive `MarkerMove` (render-only; no schema migration).
  - `src/pages/labs.ts` — `renderPanelDetail` computes the receipt from `allPanels()` and renders the "Since your last draw" section below the results table; absent on a first-ever panel; gated by the existing `isSharedView()` empty-state (panel detail is not in the shared payload) and surfaces in tour mode against the fixture's two-panel movement.
  - `src/styles.css` — `.movement-receipt` (+ `__eyebrow`, `__lines`, `__row`); ink/ink-soft only, `min-width:0` wrap fix, no into-range color flourish.
  - `tests/helpers/flows.ts` — added `seedPanel()` (the sibling seeding helper the ticket called for).
  - `tests/e2e/movement-receipt.spec.ts` — 12 scenarios, all green on chromium. One real find during the test-first loop: the receipt must display `shortName ?? name` (ApoB, not "Apolipoprotein B") to match the page's result-row convention.
