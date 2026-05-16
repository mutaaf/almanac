---
id: 0013
title: Insight engine provenance — show every rule's evidence on the Plan page
status: proposed
priority: P2
area: plan
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a technically-literate user (the cohort that knows what an ApoB is and reads the underlying functional-medicine literature) looking at an insight on my Plan that says "iron-restricted erythropoiesis pattern," I want to tap the insight and see exactly which rule fired, which markers triggered it, which threshold each marker crossed, and which draw the value came from — so I can verify the reasoning is sound before I act on it, and so the *trustworthiness* of the insight engine becomes a property I can demonstrate to a clinician or a skeptical friend instead of a property I have to take on faith.

## Why now (four lenses)

### Product Owner
The insight engine (`src/insights.ts`) is the part of Almanac that no LLM wrapper can copy. It runs deterministic, curated, multi-marker rules before any Claude call and feeds the results in as authoritative findings. Today the user sees the *output* of that engine ("iron-restricted erythropoiesis pattern: ferritin sits below the functional floor…") but they don't see the *machinery* — they don't see which rule fired, which signals counted, which values triggered the threshold, or which draw the evidence came from. The result: the insight reads as "an LLM said this," which is exactly the perception we are trying to escape. The smallest meaningful unit of value is one slideover, opened by tapping the existing insight card, that renders the rule's id, its category (pattern vs trend), the supporting markers with their values + units + draw dates, the evidence string the rule already produces, and a small "this is a deterministic rule, not an LLM finding" footer. The engine already emits all of this (`PreComputedInsight.supportingMarkers`, `evidence`, `id`); we're just surfacing it. Zero new computation, zero new schema, zero new prompt.

### Stakeholder
This is the most direct widening of the **programmatic insight engine** moat we can ship — it converts an invisible asset into a visible, auditable one. The engine has been a structural advantage since v1 but the user has had to take it on faith. Provenance turns "Almanac is opinionated" into "Almanac is *auditable*", and auditability is the precondition for the highest-LTV channel we have: clinician handoff. A physician reading the doctor-PDF from ticket 0010 today sees "we found an iron-restricted erythropoiesis pattern" and has to either take it or leave it. With provenance shipped, the in-app version of that insight links to the rule's evidence, and a follow-up ticket can extend the doctor-PDF with that same evidence in a separate appendix. This is also the wedge for *editorial credibility* in the precision-health community — a screenshot of "Rule: iron_restricted_erythropoiesis · ferritin 32 ng/mL (Mar 4) · MCV 86 fL (Mar 4) · 2 of 4 signals required, 2 of 4 present" reads as serious technical work in a category dominated by AI-generic prose.

### User (at 7am on the phone)
I'm reading my Plan. The top insight is "iron-restricted erythropoiesis pattern." Below the prose, in small caps, a single line: "Why this fired." I tap. The slideover slides up. Top of the slideover: a small monospace tag, "rule: iron_restricted_erythropoiesis · pattern". Then a list: "ferritin 32 ng/mL · drawn 2026-03-04 · functional floor 50." "MCV 86 fL · drawn 2026-03-04 · functional floor 88." Then the rule's gloss: "Triggered because ferritin is below the female functional floor (50 ng/mL) and one red-cell index supports it. Two of four secondary signals are needed for high priority; you have two." Bottom of the slideover: "This finding was produced by a deterministic rule, not by the language model. The model's role was to phrase the recommendation — not to find this pattern." I close it. I'm convinced.

### Growth
This is the moat-deepening ticket of the three, but it's also a quiet acquisition lever for the clinical channel. The dev-doc voice of the slideover ("rule: iron_restricted_erythropoiesis", a marker list with units, the threshold logic in plain English) is the voice that lands with a physician — the same way a SaaS audit log lands with a security buyer. We are not shipping a "marketing" surface; we are shipping the surface that makes the existing claim ("Almanac's insights are deterministic and curated") demonstrable in an environment where it matters (the doctor's office, the precision-health forum, the family-medicine sub-Reddit). It compounds with every future rule we add — every new entry in `RULES[]` or `TREND_RULES[]` automatically inherits a provenance UI.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] In the plan-generation pipeline, each `PreComputedInsight` is persisted into the resulting `Plan.insights[]` entry as a small `provenance` field: `{ ruleId: string; category: "pattern" | "trend"; supportingMarkers: Array<{ markerKey: string; value: number; unit: string; drawnAt: Day; threshold?: string }>; evidence: string }`. The persisted Plan carries everything needed to render the slideover without going back to the rule engine.
- [ ] LLM-generated insights (the ones Claude adds beyond what the rule engine produced) carry no `provenance` field and render no "Why this fired" affordance — the absence is the signal. The provenance UI is for *deterministic* findings only.
- [ ] On `#/plan` (both Read and Dashboard modes), every insight card with `provenance` gets a small **"Why this fired"** chip beneath the prose. The chip is keyboard-focusable, has a `role="button"`, and is styled as a small-caps eyebrow link in the ink token (not oxblood — provenance is informational, not a call-to-action).
- [ ] Tapping the chip opens a slideover (re-use `openSlideover` from `src/ui.ts`) with the structure described in the user story: a `<code>`-styled rule-id line, a `<dl>` of supporting-marker rows (`<dt>` = marker name + value + unit, `<dd>` = drawn date + threshold note), the evidence string verbatim, a short rule-gloss paragraph (loaded from a per-rule gloss map keyed by `ruleId` — one short paragraph per rule, hand-written, in the editorial voice), and the closing footer ("This finding was produced by a deterministic rule, not by the language model.").
- [ ] The `Plan` shape change is **additive** — old plans without `provenance` on insights still render (the chip is just absent for those entries). Asserted by loading a fixture plan with no provenance and confirming the page renders without errors.
- [ ] The `formatInsightsForPrompt` call (in `src/insights.ts`) is unchanged — provenance is rendered locally, not re-sent to Claude. The prompt-caching behavior should not regress; the cache-hit-rate in `#/settings → AI calls` after re-rolling within 5 minutes should match the pre-ticket baseline within ±5% on the existing fixture flow.
- [ ] The doctor-variant PDF from ticket 0010 is unchanged by this ticket (provenance is in-app only for v1). A follow-up ticket can add a provenance appendix to the doctor PDF.
- [ ] Schema migration: **none**. `Plan.insights[].provenance` is an optional new field on a Dexie-stored object; existing rows have `undefined` and the code paths above tolerate it.
- [ ] Renders on both **chromium and mobile-webkit**. On mobile-webkit the slideover is the existing primitive used for other slideovers on the Plan page; mobile assertion is "the chip appears, the slideover opens, the supporting-marker list is visible, the closing footer is visible." Provenance content cases (multi-rule fixtures, trend rules, missing-data rules) run on chromium.
- [ ] Privacy E2E still passes — no new hostnames; provenance data never leaves the device; the chip does not fire any network request.
- [ ] New `tests/e2e/provenance.spec.ts` covers: chip appears on rule-fired insights, chip is absent on LLM-only insights, slideover contents (rule id, supporting markers with values + dates, evidence string, gloss, closing footer), legacy plan without provenance renders fine, prompt-cache regression check (compare token counts on a re-roll before/after on a deterministic fixture).
- [ ] A new fixture variant `tests/fixtures/plan-with-provenance.json` is added with two insights: one rule-fired (carries `provenance`) and one LLM-only (no `provenance`). Used by the cross-cutting chromium + mobile-webkit tests.

## Out of scope

- Editing the rules from the UI. The rules live in TypeScript by design — they are a curated, version-controlled clinical artifact, not user-mutable content.
- A "disable this rule for me" toggle. If a user disagrees with a rule, the right answer is a GitHub issue against the curated DB, not a per-user mute. (The risk profile of muting a clinical pattern detector for a single user without medical oversight is exactly what we want to avoid.)
- Provenance for the *trend* rules in detail beyond their existing `evidence` string. The trend rules already emit a meaningful evidence sentence ("persistently elevated across 4 of 5 draws"); rendering it verbatim in the slideover is sufficient for v1. A richer trend-provenance UI (sparkline, threshold lines per draw) is a future ticket.
- Adding provenance to the doctor / friend PDF (ticket 0010). The in-app surface is enough for v1; the PDF extension is a follow-up ticket with its own layout decisions.
- Linking the rule's source citations to the literature. The gloss paragraph is plain English in the editorial voice; per-rule literature citations belong in `src/insights.ts` as a comment block, not in the user-facing UI.

## Engineering notes

- `src/types.ts` — extend `Insight` with `provenance?: InsightProvenance`. Add the `InsightProvenance` interface (shape per the first acceptance bullet). All additive, all optional, no break for existing plans.
- `src/insights.ts` — `computeInsights()` (or the function that maps `PreComputedInsight` → the `Insight` array attached to a generated Plan) gains the side-effect of attaching `provenance` per rule-fired insight. The rule engine already has `supportingMarkers` + `evidence`; resolve each `markerKey` to its current value/unit/drawnAt via the `RuleContext.latest()` helper. The gloss paragraph per rule lives in a new const `RULE_GLOSSES: Record<string, string>` adjacent to `RULES[]`. Every rule must have a gloss; the typecheck enforces it via a type-derived key list (or a `satisfies` assertion).
- `src/claude.ts` — `generatePlan` already merges pre-computed insights into the prompt and stitches LLM-emitted insights with rule-emitted ones into the final `Plan.insights[]`. Make the stitch carry `provenance` only on the rule-emitted entries.
- `src/pages/plan.ts` — render the "Why this fired" chip per insight that has `provenance`. Wire the chip to a new render path: `renderProvenanceSlideover(insight: Insight)` calling `openSlideover` with the structured content. Both Read and Dashboard modes get the chip — provenance is mode-agnostic.
- `src/styles.css` — `.insight__provenance-chip`, `.provenance-slideover`, `.provenance-rule-id` (monospace), `.provenance-markers` (dl), `.provenance-gloss`, `.provenance-footer`. No new colors.
- `tests/fixtures/plan-with-provenance.json` — new fixture. Update the mock in `tests/helpers/mocks.ts` if needed to serve this variant when the plan-prompt sniffer sees a specific marker constellation; otherwise just use the existing route override pattern.
- `tests/e2e/provenance.spec.ts` — new file. Use `composePlan` from `tests/helpers/flows.ts` with a fixture that fires at least one rule (the iron-restricted erythropoiesis fixture is the obvious candidate — ferritin + MCV thresholds documented in `src/insights.ts`).
- Schema migration: **no** — additive optional field on a stored object.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for the gloss paragraphs: editorial, plain English, ~2 sentences, no jargon without a one-line gloss. The footer is one sentence, verbatim across all rules: "This finding was produced by a deterministic rule, not by the language model."

## Implementation log

(Appended by the implementation-dev agent during execution.)
