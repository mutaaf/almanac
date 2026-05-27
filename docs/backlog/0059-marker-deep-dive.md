---
id: 0059
title: The marker deep-dive — tap any marker for its one-screen reference, your trend, and the plan actions targeting it
status: groomed
priority: P2
area: progress
created: 2026-05-23
owner: gtm-innovation
---

## User story

As a user who sees my ferritin trending at 28 and wants to understand it, I want to tap that marker row on Progress (or Labs) and get a one-screen reference — its functional range versus the lab range, a plain-English note on what it affects and why the optimum is tighter than the lab floor, my own trend for it, and which of my plan's actions are aimed at it — so that I can answer "what is this and what do I do about it?" inside the app I already trust with the data, instead of leaving to search and landing on a forum.

## Why now (four lenses)

### Product Owner

The functional-range DB (`src/data/markers.ts`) already carries curated, scientifically-grounded content for every tracked marker — name, unit, functional range, lab range, and a `description` written for exactly this moment ("Fasting blood sugar. Stable below 90 reflects good insulin sensitivity…"). The pre-key reference (0038, shipped) exposes that curation to prospects before they trust the app. But once a user is *inside*, there is nowhere to read it: a user looking at their ferritin trend has the number and the sparkline, but not the "what does this affect, and what moves it" that would keep them in the app. Today they leave to search. The smallest meaningful unit of value is a marker detail panel — a slide-up or sub-route — opened by tapping any marker row on Progress (and Labs): it shows the marker's display name and unit, its functional range versus lab range (and the gap between them, the product's whole thesis), the static `description` explaining what it affects, the user's own trend sparkline for that marker, and the specific plan action(s) targeting it (read from the most recent plan's `eatList` / `habitStack` / supplements / lifestyle filtered by `markerKeys`). All of it is data the app already has — no LLM call, no new content authored at render time. It collapses "what is this number?" from a tab-away search into a tap.

### Stakeholder

This is one of the cleanest moat-deepeners available because it composes three things only Almanac holds together: the **curated functional-range DB**, the user's **persistent trend** for that marker, and the user's **own plan's actions** aimed at it — in one screen, with no inference. A chat box can describe ferritin in a paragraph, but it cannot show you *your* ferritin history, it cannot tell you that *your* plan's "leafy greens daily" and "cook in cast iron" are the actions targeting it, and it defaults to the lab floor rather than the functional optimum the curation encodes. "Here is the marker, here is the gap between normal and optimal, here is your trend, here are the actions in your plan that move it" is structurally a product feature of a persistent-timeline, functional-range, structured-plan app — the exact stack the README's anti-wrapper argument names. It deepens the lock-in: the more the user reads their own markers against the curation and their own plan, the more the product is the place that holds the whole picture. And it is privacy-clean — a pure render over `MARKERS[]`, the local panels, and the local plan; no egress, no inference.

### User (at 7am on the phone)

On Progress, my ferritin is sitting at 28 and I want to know what that means. I tap the row. A panel slides up: "Ferritin — ng/mL. Functional optimum 50–150. Lab range 15–200." Then a plain line I can actually use about what ferritin does and why 28, though "normal," is below where I'd want it. Below that, my own little trend — 24, 26, 28, inching up. And then the part that closes the loop: "In your plan: eat leafy greens daily; cook in cast iron — both for ferritin." So I know what it is, where it should be, where mine's been, and what I'm already doing about it — without leaving the app or wading through a forum. I tap back and I'm where I was. One tap to open, one to close, all of it instant and offline because it's my data and a reference that ships in the app.

### Growth

This is a retention-and-moat ticket whose audience is the engaged resident — the user curious enough to dig into a number. Retention: keeping "what does this mean?" inside the app, answered against the user's own trend and plan, is the difference between the app being a logbook and being the place you *think about your biology*. (Hypothesis: an in-app marker reference that ties curation to the user's own trend and plan actions raises session depth and return visits among users with labs, because the natural follow-on question to "is my number good?" — "what is it and what do I do?" — is answered in place rather than off-platform; back-of-envelope from how in-context explanation retains users versus forcing a search tab-away; treat as untested without remote analytics, which we will never add.) The "show me" frame is the panel itself: a clean one-screen card showing the normal-versus-optimal gap, your real trend, and your plan's actions for one marker is exactly the screenshot that makes the friend with the same "everything's normal" lab ask "wait, what shows you that?" It is the inside-the-app sibling of the pre-key reference (0038): that earns the prospect's trust before the key, this rewards it after.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/progress/marker-detail.ts` (new) exports `buildMarkerDetail(markerKey: string, panels: Panel[], plan: Plan | undefined): MarkerDetail` assembling, with NO network and NO LLM: the marker's display name + unit + functional range + lab range (from `findMarker()`), the static `description` text, the user's value series for that marker across panels (date + value, oldest first), and the plan actions targeting the marker — eat-list items, habit-stack habits, supplements, and lifestyle whose `markerKeys` include `markerKey`. Pure: no DOM, no Dexie, no network. Asserted by passing a known marker, panels, and a plan and confirming each field.
- [ ] Tapping a marker row on Progress (`src/pages/progress.ts`) opens the marker detail panel for that marker. Asserted by seeding 2+ panels, tapping a trend row, and confirming the panel opens for the right marker.
- [ ] Tapping a marker row on Labs (`src/pages/labs.ts`) — the panel/result detail rows — opens the same marker detail panel. Asserted by opening a panel's detail, tapping a result row, and confirming the marker detail panel opens. (If the Labs result row already navigates somewhere, document the chosen affordance so the existing navigation is not broken.)
- [ ] The panel shows the functional range AND the lab range, visibly distinguished, with the gap between them legible (the normal-versus-optimal thesis). Asserted by opening a marker whose ranges differ and confirming both ranges render distinctly.
- [ ] The panel shows the user's own trend sparkline for the marker, built via the existing `src/viz.ts` sparkline helper over the marker's series. A marker with one draw shows the single value (no spurious line); a marker with 2+ draws shows the sparkline. Asserted with a one-draw and a multi-draw marker.
- [ ] The panel lists the plan action(s) targeting the marker — pulled from the most recent plan's `eatList` / `habitStack` / `supplements` / `lifestyle` filtered by `markerKeys.includes(markerKey)` — with NO new inference. When the plan has no action for the marker, the panel shows a calm "No plan action targets this marker yet" note rather than an empty void. Asserted with a marker that has plan actions and one that has none.
- [ ] The static `description` from the marker DB renders verbatim (the curated plain-English explanation). Asserted by confirming the panel contains the marker's `description` string. If the dev adds optional `whatRaisesIt` / `whatLowersIt` fields to `MarkerDef` for richer content, they render only when present and the panel works for markers without them; if adding fields is descoped, the panel renders the existing `description` and the functional-vs-lab gap and the spec notes the descope.
- [ ] The panel closes on a back-tap / dismiss and returns the user to where they were on Progress (or Labs) without losing scroll/state. Asserted by opening and closing the panel and confirming the underlying page state.
- [ ] The panel makes **zero Anthropic calls** and **zero network calls** — it is a pure render over `MARKERS[]`, the local panels, and the local plan. Asserted by opening the panel for several markers and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the panel or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the rendered detail.
- [ ] Renders on both **chromium and mobile-webkit**: the panel/sub-route fits the 390 px viewport, the close affordance is a ≥44×44 css px tap target (min-height ≥45 px per the 0017 sub-pixel lesson), and long marker names / action text respect `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) opens the panel against the tour fixture's markers/plan (read-only fixture data, no real writes). Shared-view mode (0017) — which has no panels/trend — either omits the trend gracefully or does not offer the affordance; document and assert the chosen behavior. Asserted in both modes.
- [ ] The existing Progress and Labs flows — the trend cards, the latest-values rows, the compare-two-draws flow, the improvement card (0047), the panel detail, the match-unrecognized flow — are unchanged in behavior; the detail panel is purely additive. Asserted by exercising the existing Progress and Labs flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the panel is a local render with no inference; no new hostnames.
- [ ] Schema migration: **no** if scoped to the existing `description`; if optional `whatRaisesIt` / `whatLowersIt` are added to `MarkerDef`, that is a static-data change in `src/data/markers.ts` + an optional type field, NOT a Dexie migration (the marker DB is code, not stored). Note which path was taken.
- [ ] New `tests/e2e/marker-detail.spec.ts` covers: `buildMarkerDetail` assembles the fields, tapping a Progress row opens the panel, tapping a Labs row opens it, both ranges render distinctly, the trend sparkline (one-draw and multi-draw), plan actions filtered by markerKey (present and the empty-state note), the static description renders, the panel closes and restores state, zero Anthropic + zero network, the key never appears (sentinel), tour vs shared-view behavior, the existing Progress/Labs flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to explain the marker, summarize the trend, or generate "what to do." The explanation is the curated static `description` (plus optional curated `whatRaisesIt`/`whatLowersIt`); the actions come from the user's existing plan filtered by `markerKey`. No inference at render time, no new Anthropic call.
- A new persisted store, a per-marker notes field, or a "save this marker" feature. The panel is a render-time read over `MARKERS[]`, the local panels, and the local plan. No Dexie schema change for marker content (the marker DB is code).
- Editing the functional range, the lab range, or the description from the panel. Curation lives in `src/data/markers.ts` (and the user-extensible marker flow, 0002); the panel is read-only over it.
- A what-if drag on the marker value from this panel — that is the simulator (0019). The detail panel shows the real trend, not a hypothetical.
- Cross-marker pattern explanation (the insight engine's territory, 0013/0039). The panel is single-marker: this marker's ranges, this marker's trend, the plan actions for this marker. Patterns across markers stay on the Plan page.
- Authoring rich new prose for every marker as part of this ticket. Reuse the existing `description`. If `whatRaisesIt`/`whatLowersIt` are added, they are optional and curated incrementally — the panel must work for markers that carry only `description`.
- Carrying the detail panel into the doctor PDF (0010/0016), the share link (0017), the Markdown export (0027), or the coach packet (0048). It is an in-app reference surface, not an export artifact.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/marker-detail.ts` (new) — `buildMarkerDetail(markerKey, panels, plan)`. Resolve the marker via `findMarker(markerKey)` (handles sex-specific and user keys). Build the value series by scanning each panel's `results` for `markerKey` (oldest first by `drawnAt`). Filter `plan.eatList`, `plan.habitStack.habits` (via their `markerKeys` where present), `plan.supplements`, and `plan.lifestyle` by `markerKeys?.includes(markerKey)`. Return a `MarkerDetail` (an internal/exported type in this file or `src/types.ts`). Pure; no Dexie import.
- `src/types.ts` — add a `MarkerDetail` interface (display fields + series + the filtered action lists). If adding curated direction content, add optional `whatRaisesIt?: string` / `whatLowersIt?: string` to `MarkerDef` (additive, code-only — NOT a Dexie change). `MarkerDef.description` already exists and is the primary content.
- `src/data/markers.ts` — read-only for the existing `description`; optionally append `whatRaisesIt`/`whatLowersIt` to a handful of high-traffic markers (ferritin, ApoB, vit D, fasting insulin) if in scope. The marker DB is code, not stored — no migration.
- `src/pages/progress.ts` — make the trend rows (and latest-value rows) open the marker detail panel on tap. The page already builds a per-marker series (`seriesMap`) and resolves markers via `findMarker` — reuse that. Wire a click handler that opens the panel/sub-route for the row's `markerKey`.
- `src/pages/labs.ts` — make the result detail rows open the same panel. If a result row already has a tap behavior, add the affordance without breaking it (document the chosen interaction).
- `src/viz.ts` — read-only reuse of the existing sparkline helper for the trend; do not add a new viz primitive.
- `src/main.ts` — if implemented as a sub-route (e.g. `#/progress/marker/:key`), register it; if a slide-up panel, no router change. Pick one and document it. Either way, the consent gate and existing routes are unchanged.
- `src/styles.css` — `.marker-detail` (the panel/route), reusing the existing slideover or detail-card idioms (the 0013 "why this fired" slideover and the panel-detail card are templates). Close affordance ≥44×44 css px (`box-sizing: border-box; min-height: 45px`). Grid children `min-width: 0`. No new colors; ink, ink-soft, oxblood for the functional-range band.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour opens the panel against fixture data; shared-view has no panels — omit the trend or the affordance per the documented choice.
- `tests/helpers/flows.ts` — reuse the panel-seeding + plan-seeding helpers (`seedPanel`/`seedPlan` patterns from the 0019/0050 specs) so the spec can open the panel without a full compose round-trip.
- `tests/e2e/marker-detail.spec.ts` (new) — every acceptance bullet maps to a `test()`. The assembly test passes known panels + a plan to `buildMarkerDetail` and asserts the fields; the open tests tap a Progress row and a Labs row and assert the panel; the actions test seeds a plan with an eat item carrying the marker key and asserts it renders, plus a marker with no action asserting the empty-state note.
- `tests/e2e/privacy.spec.ts` — extend with opening the marker detail panel, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (marker content is code; the panel reads existing stores).
- Voice spec: the panel headers read plainly — the marker name, "Functional optimum", "Lab range", "Your trend", "In your plan". The empty-action note reads "No plan action targets this marker yet." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood for the functional-range band only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
