---
id: 0052
title: Coverage gaps — a Labs-page view of the high-impact markers you haven't tested, with a "worth asking about" note for each
status: groomed
priority: P2
area: labs
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a user who has uploaded a panel or two but suspects my doctor never ordered the markers that actually matter — the ApoB, the fasting insulin, the omega-3 index — I want the Labs page to show me, plainly, the high-impact markers I have NOT tested yet, each with a one-line note on why it matters, so that I walk into my next appointment knowing exactly what to ask for, instead of finding out a year later that the one number that would have explained how I feel was never on any panel I have.

## Why now (four lenses)

### Product Owner

Almanac's report card (0036, shipped) tells the user how many of the markers they DID test sit "normal but not optimal" — it reasons about coverage they have. It says nothing about coverage they lack. For the founding persona — the person whose standard panel came back "normal" but who reads Attia and knows an LDL-C is not an ApoB — the most useful thing the app can do is name the high-impact markers that were never ordered. A standard physical orders a basic metabolic panel and a lipid-C panel; it does not order ApoB, fasting insulin, omega-3 index, hs-CRP, or homocysteine, which are exactly the markers this persona cares about. The smallest meaningful unit of value is a "What you haven't tested" section below the panel list on the Labs page: a static, curated, ranked list of high-impact markers, set-differenced against everything the user has ever uploaded, each remaining gap shown with the marker name, a one-line clinically-grounded "why it matters" note (from a static lookup, not a Claude call), and the phrase "worth asking your doctor about." When the user has uploaded all the high-impact markers, the section disappears. It is a pure set difference between a curated constant and the user's panels — deterministic, local, no inference. It turns the report card's "here's what your numbers say" into "and here's what you should make sure to get measured."

### Stakeholder

This deepens the **functional-range DB** moat by making it do *gap analysis*, not just per-marker scoring — and gap analysis is a thing only a product with a curated, ranked marker library and a persistent record of the user's panels can do. A chat box pasted a single lab report cannot tell you what is *missing* against a considered, ranked list of what matters, because it has no such list and no record of your prior draws to difference against; "here are the high-impact markers you have never tested, and why each matters" is structurally a product feature, not a prompt. It compounds the persistent timeline (the set difference reads every panel the user has stored) and the report card (0036) directly: 0036 grades coverage you have, this names coverage you lack, and together they make the Labs page a complete account of the user's measurement picture. It is also a quiet acquisition wedge for the literate persona: a curated "the markers worth asking your doctor for, and why" is exactly the kind of substance-over-pitch artifact that segment forwards — and because it is deterministic, curated, and grounded, it carries the editorial-honesty posture that distinguishes the product from generic AI advice. The curation is the moat; the gap list advertises it.

### User (at 7am on the phone)

I have uploaded my last two panels — the standard stuff my GP ordered. On the Labs page, below them, a section: "What you haven't tested." There they are, the ones I half-knew were missing: "ApoB — the count of atherogenic particles; a better heart-risk read than LDL cholesterol. Worth asking your doctor about. Fasting insulin — rises years before glucose does; an early read on metabolic trouble. Worth asking your doctor about. Omega-3 index — the membrane fatty-acid balance behind inflammation. Worth asking your doctor about." It is a checklist for my next appointment — the questions I would not have known to ask. I screenshot it and bring it in. When I finally get an ApoB on a future panel, it drops off the list on its own. It rendered instantly, offline, because the curated list ships in the app and the math is a set difference over data already on my phone — nothing fetched, nothing sent.

### Growth

This is a retention-and-referral ticket aimed at the persona's defining grievance: that the markers that would explain how they feel were never ordered. Retention: a user who has a concrete, app-given list of what to ask for has a reason to go get more labs — which means more panels, a richer timeline, and a deeper hook; the gap list literally generates the next upload. (Hypothesis: surfacing uncovered high-impact markers raises the rate at which users add a second-or-later panel covering a previously-missing marker, because it converts vague "I should test more" into a specific, named ask their doctor can act on — back-of-envelope from how "recommended next test" prompts drive repeat lab orders in patient-facing tools; treat as untested without remote analytics, which we will never add.) The "show me" frame is the checklist itself: "this told me the exact markers to ask my doctor for, and why each one matters" is precisely the line the persona uses on the friend with the same "everything's normal" complaint — it is actionable, specific, and exactly the advice that friend wishes they had. It is the gap-analysis sibling of the marker reference (0038): the reference shows the whole curated library, this points at the user's own holes in it.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/labs/coverage.ts` (new) exports `HIGH_IMPACT_MARKERS: { key: string; why: string }[]` — a defined, ordered constant of ~12–15 high-impact markers (e.g. ApoB, fasting insulin, ferritin, omega-3 index, hs-CRP, homocysteine, vitamin D, HbA1c, LDL-P, TSH, free T3, cortisol AM, DHEA-S, magnesium RBC), each with a static one-line clinically-grounded "why it matters" note. Every `key` resolves via `findMarker()` against `src/data/markers.ts` (a guard fails if a key is stale). The `why` strings are curated constants — NOT Claude output. Asserted by importing the constant and confirming each key resolves to a known marker and each `why` is a non-empty static string.
- [ ] `src/labs/coverage.ts` also exports `computeCoverageGaps(panels: Panel[]): { key: string; name: string; why: string }[]`. It returns the entries of `HIGH_IMPACT_MARKERS`, in their defined order, whose `key` does NOT appear in any result of any supplied panel (a set difference: high-impact set minus the user's tested set), resolving each remaining marker's human name via `findMarker()`. It NEVER returns a marker the user has tested in any panel. Pure: no DOM, no Dexie, no network. Asserted by passing panels that cover some high-impact markers and confirming the returned set is exactly the uncovered ones in defined order.
- [ ] The Labs page (`src/pages/labs.ts`) renders a "What you haven't tested" section below the panel list when `computeCoverageGaps(...)` is non-empty. Each entry shows the marker name, its `why` note, and the phrase "worth asking your doctor about." Asserted by seeding a panel covering 3 of the high-impact markers and confirming the section lists the remaining uncovered ones with their notes and the phrase.
- [ ] The section is ABSENT when there are no high-impact uncovered markers — i.e. when the user has uploaded panels covering every marker in `HIGH_IMPACT_MARKERS`, the section disappears entirely and the Labs page is byte-for-byte unchanged below the panel list. Asserted by seeding panels covering all high-impact markers and confirming the section is absent.
- [ ] Adding a panel that covers a previously-uncovered high-impact marker removes it from the gap list. Asserted by rendering the section (marker present), then adding a panel containing that marker, then re-rendering and confirming the marker is gone from the list.
- [ ] The "why it matters" notes are the static strings from `HIGH_IMPACT_MARKERS` — the rendered note for a marker equals its `why` exactly (no LLM, no variation). Asserted by comparing a rendered note to the constant.
- [ ] The high-impact set is a defined, assertable constant — the section never invents a marker outside `HIGH_IMPACT_MARKERS`, and the order of the rendered gaps matches the constant's order. Asserted by confirming the rendered gap list is a subset of `HIGH_IMPACT_MARKERS` keys in the same relative order.
- [ ] Sex-specific marker keys resolve their human name and their coverage correctly — a ferritin gap for a male profile checks against `ferritin_m` (or the merged resolution `findMarker()` provides) and renders "Ferritin", not the suffixed key. Asserted with a male profile and a ferritin gap.
- [ ] The section is computed with **zero Anthropic calls** and **zero network calls** — `HIGH_IMPACT_MARKERS` ships in the bundle and the gap is a set difference over the locally-stored panels. Asserted by rendering the Labs page and confirming the mock recorded zero requests during the coverage computation/render.
- [ ] The Anthropic key NEVER appears in the section or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the coverage section.
- [ ] The section is ABSENT in tour mode (0014) and shared-view mode (0017) — it is an owner-side, panel-coverage analysis. (Pick the consistent treatment: if the tour fixture is shaped to demonstrate gaps it MAY render the sample gaps; otherwise absent. Shared-view never renders it — the recipient is not uploading their own labs.) Document the chosen tour treatment. Asserted in both modes.
- [ ] Renders on both **chromium and mobile-webkit**. The section and its rows wrap cleanly at the 390 px viewport; long `why` notes respect `min-width: 0` (the documented overflow fix); the section does not push the existing panel-list interactions off-screen.
- [ ] The existing Labs page (panel list, upload, manual entry, panel detail, the report card 0036) is byte-for-byte unchanged in behavior — the coverage section is purely additive below the panel list. Asserted by exercising the existing Labs flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the coverage section is local-only and deterministic; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the section reads the existing `panels` table and the static `HIGH_IMPACT_MARKERS` constant. Nothing new is persisted.
- [ ] New `tests/e2e/coverage-gaps.spec.ts` covers: the section lists exactly the uncovered high-impact markers in defined order with their static notes + the "worth asking your doctor about" phrase, absent when all high-impact markers are covered, never shows a tested marker, adding a covering panel removes a gap, notes equal the constant, sex-specific resolution, zero Anthropic + zero network calls, the key never appears (sentinel), tour vs shared-view behavior, the existing Labs page unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated "why it matters" note or a personalized gap analysis. The notes are curated, static, source-grounded constants; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose value is being instant, local, and provably consistent. The clinical rationale is fixed editorial copy.
- Prescribing or ordering labs. The section names markers "worth asking your doctor about" and carries the standing "informational, not medical advice" disclaimer; it does not place orders, recommend a specific lab vendor, or tell the user they "need" a test. The doctor decides; the user asks.
- A personalized ranking of which gaps matter most for *this* user's biology (e.g. "given your lipids, prioritize ApoB"). That is inference over the user's data; the high-impact set is a fixed, curated ranking the same for everyone. A biology-conditioned ranking is a separate, larger design and would need a Claude call this ticket forbids.
- Showing gaps for the whole marker DB. The section is the curated high-impact subset (~12–15), not all ~70 markers — a full "everything you haven't tested" list would bury the signal in low-value markers. The marker reference (0038) is the place to browse the whole library.
- A "request this test" integration with a lab vendor (Function, Marek, etc.). Those are third-party accounts and egress; the value is the named, grounded ask the user brings to their own doctor. A vendor integration is a separate ticket only if real users ask for a specific one.
- Carrying the coverage gaps into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). It is an owner-side, in-app planning surface. (A "tests to consider" section on the coach packet 0048 is a plausible future follow-up but is out of scope here.)
- Persisting which gaps the user has "seen" or dismissed. The section is a live set difference; once a marker is tested it drops off on its own, which is the only state it needs.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/labs/coverage.ts` (new) — `HIGH_IMPACT_MARKERS` (the ordered curated constant with `key` + `why`, each `why` carrying a source comment) and `computeCoverageGaps(panels)`. The gap is `HIGH_IMPACT_MARKERS.filter(m => !panels.some(p => p.results.some(r => r.markerKey === m.key)))` (resolving sex-specific keys consistently with how the rest of the app matches them — confirm against `findMarker()` and the panel-result `markerKey` shape). Add a guard (test or `satisfies`-style) that every `HIGH_IMPACT_MARKERS` key resolves via `findMarker()`. Resolve human names via `findMarker()`. Pure; the page passes `allPanels()`.
- `src/pages/labs.ts` — the Labs index already renders the panel list (and, with 0036, the report-card framing). After the panel list, render the "What you haven't tested" section when `computeCoverageGaps(allPanels())` is non-empty. Reuse the existing editorial-section/eyebrow idioms; the rows are small editorial lines (marker name + why + the standing phrase), not table rows.
- `src/data/markers.ts` — read-only. `findMarker()` resolves the human names and validates the high-impact keys (and the sex-specific resolution). No change to the marker DB.
- `src/types.ts` — no new persistent types; any internal render type lives in `coverage.ts`.
- `src/styles.css` — `.coverage-gaps` (the section), `.coverage-gaps__row` (one marker: name + why + "worth asking your doctor about"), reusing the labs/editorial section idioms. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `isSharedView()` (absent) and the documented `isTour()` treatment (sample gaps against the fixture, or absent).
- `tests/helpers/flows.ts` — reuse `addManualPanel` / `seedPanel` (from the 0026/0032 specs) to seed panels covering a known subset of `HIGH_IMPACT_MARKERS` so the spec can assert the exact uncovered set, and to add a covering panel mid-test for the "removes a gap" assertion.
- `tests/e2e/coverage-gaps.spec.ts` (new) — every acceptance bullet maps to a `test()`. The all-covered test seeds panels covering every high-impact key and asserts the section is absent; the removal test renders a gap, adds a covering panel, and asserts the gap is gone.
- `tests/e2e/privacy.spec.ts` — extend with a Labs visit confirming zero off-allow-list egress during the coverage render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the section eyebrow reads "What you haven't tested"; each row reads "<marker> — <why> Worth asking your doctor about." Declarative, no exclamation, no alarm. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
