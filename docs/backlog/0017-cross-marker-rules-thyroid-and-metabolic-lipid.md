---
id: 0017
title: Two new cross-marker rules — thyroid × inflammation, and early-metabolic × atherogenic
status: proposed
priority: P1
area: plan
created: 2026-05-19
owner: gtm-innovation
---

## User story

As a user whose labs sit "in range" on every individual marker but whose protocol still doesn't reflect the cross-marker patterns most worth catching — a TSH at 2.6 with an hs-CRP at 2.1 (each acceptable alone; together a real signal), or an ApoB at 92 with a fasting insulin at 7.5 (each just-above-functional; together the earliest picture of an atherogenic-metabolic spiral) — I want the deterministic insight engine to fire two new rules that name these cross-domain patterns by name, so the protocol I read on `#/plan` actually surfaces the biology two unconnected single-marker thresholds would each individually miss.

## Why now (four lenses)

### Product Owner

The insight engine (`src/insights.ts`) is the single asset no Claude wrapper can replicate. Its leverage is compounding: every new rule we add automatically gets a "Why this fired" slideover (ticket 0013), a doctor-PDF provenance appendix row (ticket 0016, in-progress), an authoritative prompt-injection at plan-generation time, and an inherited place in the editorial gloss table. We have shipped six pattern rules and four trend rules — none of them cross *domains*. Every existing rule lives inside one organ system: thyroid-only, iron-only, lipid-only, glucose-only, methylation-only, inflammation-only. The smallest meaningful unit of value here is two new rules that explicitly straddle domains:

1. **`thyroid_inflammation_drift`** — TSH between 2.0 and 4.0 (above the functional ceiling, below the lab cutoff) AND hs-CRP above 1.0. Functional-medicine practice reads this as stress-driven hypothyroid drift with an inflammatory mediator — the classic picture that gets missed when each marker is read alone.
2. **`early_metabolic_atherogenic`** — ApoB above 80 AND fasting insulin above 5 (or HOMA-IR above 1.0). The early-stage version of the atherogenic-dyslipidemia pattern that already exists, but caught one tier earlier — before TG and HDL have moved enough to trigger the existing rule.

Both rules use the existing `RuleContext` API. Both inherit the existing `provenance` + `RULE_GLOSSES` machinery — the typecheck enforces a gloss for each new rule via `satisfies Record<RuleId, string>`. Zero new schema, zero new prompt mechanics, zero new UI primitive. The work is two rule definitions, two gloss paragraphs, two acceptance tests, and one fixture variant.

### Stakeholder

Every additional curated rule deepens the **programmatic insight engine** moat — the rule count is the asset. Six pattern rules is a serious starting library; eight pattern rules with two of them crossing organ systems is a *category-defining* library, because cross-domain pattern detection is the exact thing that physicians read each others' charts for and the exact thing that an LLM prompted on a single PDF cannot reliably do. Both rules also have a second-order moat compounding effect: they expand the surface area of the **doctor PDF provenance appendix** (ticket 0016) for free — every new rule means another row of audit-trail evidence physicians can verify, which is the moat property that makes the clinical channel high-LTV. Adding rules is the cheapest single-feature lever we have to widen the moat per hour of work spent.

### User (at 7am on the phone)

I re-upload my October panel. TSH 2.6 (lab says 0.45–4.5, plenty of headroom). hs-CRP 2.1 (lab says <3.0, fine). ApoB 92 (lab says <100, fine). Fasting insulin 7.5 (lab says 2–25, fine). Under the old rule set my Plan would say "nothing fired — your numbers look normal." Under the new rule set my Plan now leads with two insights I can read together: "Thyroid + inflammation drift — TSH 2.6 above the functional ceiling alongside hs-CRP 2.1 above the inflammatory ceiling. Stress-driven hypothyroid drift with an inflammatory mediator." And: "Early atherogenic + metabolic — ApoB 92 above the functional ceiling with fasting insulin 7.5. The earliest picture of an atherogenic-metabolic spiral, before lipid ratios shift." Each one has the "Why this fired" chip from 0013 and the editorial gloss paragraph. The protocol my Plan generates re-reads against these two patterns, not against four innocuous single markers.

### Growth

Acquisition leverage here is editorial credibility in the precision-health community. The single shareable artifact this ticket produces is a screenshot of an insight card that reads *"Thyroid + inflammation drift — TSH 2.6, hs-CRP 2.1"* with the "Why this fired" chip and the literature-grounded gloss. That sentence is the one a Peter Attia-podcast listener forwards to a friend on iMessage, because nothing else in the precision-health app category catches cross-domain patterns by name. It also compounds with every channel we already have: the in-app slideover (0013), the doctor PDF appendix (0016) once shipped, and the prompt-injection (which makes the LLM-emitted prose around the insight sharper because Claude reasons from "thyroid + inflammation drift" as an authoritative finding instead of having to derive it). Hypothesis: adding rules grows the *trust* surface, not the *acquisition* surface — but trust is the rate-limiter for word-of-mouth growth in this category, so the leverage is real. Treat as untested until we have qualitative feedback from the next few users who hit one of these patterns.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/insights.ts` — `RULES[]` gains a new entry `thyroid_inflammation_drift` with `id: "thyroid_inflammation_drift"`, `category: "pattern"`, `evaluate(ctx)` returning a `PreComputedInsight` when ALL of: `ctx.latest("tsh") && ctx.latest("tsh").value > 2.0 && ctx.latest("tsh").value <= 4.0` AND `ctx.latest("hs_crp") && ctx.latest("hs_crp").value > 1.0`. Returns `null` when TSH is above 4.0 (the existing `subclinical_hypothyroid` rule handles that range) OR hs-CRP is not present OR TSH is at/below 2.0. `supportingMarkers: ["tsh", "hs_crp"]`. `evidence: "TSH {tsh} (functional ceiling 2.0) · hs-CRP {crp} (functional ceiling 1.0)"`. Title: "Thyroid + inflammation drift". `priority: "high"` when hs-CRP > 2.0; otherwise `"medium"`.
- [ ] `RULES[]` gains a new entry `early_metabolic_atherogenic` with `id: "early_metabolic_atherogenic"`, `category: "pattern"`, `evaluate(ctx)` returning a `PreComputedInsight` when `ctx.latest("apo_b") && ctx.latest("apo_b").value > 80` AND (`(ctx.latest("fasting_insulin") && ctx.latest("fasting_insulin").value > 5)` OR `(ctx.latest("homa_ir") && ctx.latest("homa_ir").value > 1.0)`). Returns `null` when the existing `atherogenic_dyslipidemia` rule would fire at high priority on the same context (i.e. when `signals >= 3` from the existing TG/HDL/LDL counts — read the existing rule's evaluator output via a helper rather than duplicating the math). The new rule is the *earlier* signal; the existing one wins when both fire because it carries more supporting evidence. `supportingMarkers: ["apo_b", "fasting_insulin"]` (or `["apo_b", "homa_ir"]` when insulin is missing and HOMA fires). Title: "Early atherogenic + metabolic". `priority: "medium"` (the rule's whole job is to catch the *pre*-emergency picture; "high" would over-claim).
- [ ] `RULE_GLOSSES` gains a hand-written paragraph for each new rule in the editorial voice — ~2 sentences, plain English, no jargon without a gloss. The `satisfies Record<RuleId, string>` clause enforces coverage; the typecheck fails if either gloss is missing. Sample (the dev may edit for voice, but must hit these beats):
  - `thyroid_inflammation_drift`: "TSH above the functional ceiling with hs-CRP above the inflammatory ceiling is the picture of stress- or inflammation-driven hypothyroid drift — each marker alone reads as 'in range' to the lab but together they describe a real pattern. Antibody testing (TPO + TG) and an honest look at sleep, stress, and ultraprocessed-food intake are the right next moves before any pharmacology enters the conversation."
  - `early_metabolic_atherogenic`: "ApoB above the functional ceiling alongside elevated fasting insulin (or HOMA-IR) is the earliest cross-domain signal of an atherogenic-metabolic spiral — caught here a year before the triglyceride and HDL shifts that would eventually fire the broader atherogenic pattern. The 12-week response to soluble fiber, omega-3, fewer refined carbs, and walking after meals is large; this is the window where food alone moves the needle."
- [ ] On `#/plan`, when a panel fires either new rule, the insight card renders with the title from the rule definition AND the existing "Why this fired" chip from ticket 0013. The chip opens the slideover with the rule id (`thyroid_inflammation_drift` or `early_metabolic_atherogenic`), the supporting markers with values + units + drawn dates, the evidence string verbatim, and the new gloss paragraph. No new UI primitive — the chip + slideover pipeline from 0013 picks up the new rules for free.
- [ ] When ticket 0016 has shipped, the doctor-PDF provenance appendix renders a new row for each new rule that fired on the active plan — the appendix iterates over `plan.insights[].provenance` so the new rules are inherited automatically. The dev should confirm by running the existing `tests/e2e/print.spec.ts` against a fixture that fires one of the new rules and asserting the appendix row appears. If 0016 has not yet shipped, this acceptance line is deferred and the test is added once 0016 lands (note in the implementation log).
- [ ] Existing rules continue to fire unchanged. Regression: the `subclinical_hypothyroid` test fixture (TSH 4.2 + Free T4 low) still fires `subclinical_hypothyroid` and does NOT fire `thyroid_inflammation_drift` (because TSH is above the new rule's 4.0 ceiling). The `atherogenic_dyslipidemia` test fixture (ApoB 110 + TG 180 + HDL 38) still fires the existing high-priority rule and does NOT fire `early_metabolic_atherogenic` (because the existing rule's higher-evidence outcome wins via the rule's own `null` guard).
- [ ] `tests/fixtures/plan-cross-domain.json` (new) — a fixture that produces two insights: one `thyroid_inflammation_drift` (TSH 2.6, hs-CRP 2.1, no Free T4) and one `early_metabolic_atherogenic` (ApoB 92, fasting insulin 7.5, no TG/HDL). The fixture's `provenance` blocks carry both rule ids so the in-app slideover renders for both. The mock in `tests/helpers/mocks.ts` sniffs the plan-prompt's user message for both insight titles and serves this fixture when either appears (the existing mock pattern from 0013).
- [ ] Zero new Anthropic calls — the rules run pre-prompt and feed the prompt as authoritative findings, same as every existing rule. Asserted by the same request-count pattern the provenance spec uses.
- [ ] Privacy E2E still passes — no new hostnames; the rules add no network surface.
- [ ] Renders on both **chromium and mobile-webkit**. The slideover is the same primitive 0013 already exercises on both projects.
- [ ] New `tests/e2e/cross-domain-rules.spec.ts` covers: `thyroid_inflammation_drift` fires when both markers cross thresholds and not when TSH > 4.0; `early_metabolic_atherogenic` fires when ApoB + insulin cross and not when the older `atherogenic_dyslipidemia` rule wins on the same context; both rules produce a provenance slideover with the rule id, supporting-marker table, evidence string, and the new gloss; the LLM-only insight pathway is unaffected (no provenance, no chip); regression: existing fixtures from `provenance.spec.ts` still fire the rules they always did.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A "rule editor" UI that lets the user disable, mute, or threshold-tweak the new rules. The whole rule library is curated and version-controlled by design (see the 0013 "out of scope" list for the same rationale). User-level muting of clinical pattern detectors is exactly what the editorial voice rejects.
- Additional new rules beyond the two named here. A "thyroid × adrenal" or "metabolic × inflammatory" rule may well be worth shipping, but each rule deserves its own ticket so the gloss + evidence + test live in one shippable unit. This ticket is two rules; the next one is one or two more.
- Trend variants of the new rules (e.g. "TSH + hs-CRP both trending up over three draws"). Trend rules are a separate category in the engine; if either pattern is worth a trend rule, it gets its own ticket with the `TREND_RULES[]` shape.
- Rendering the new rules' literature citations in the in-app slideover or the PDF appendix. Citations live as comments in `src/insights.ts` adjacent to the rule definitions; the gloss paragraph is the user-facing prose. A future ticket can add a "Cite" block per rule across both surfaces — separate ticket, separate decision.
- Touching the `subclinical_hypothyroid` or `atherogenic_dyslipidemia` rules. The new rules carve out the *pre*-threshold space; the old rules keep their thresholds and supporting-marker counts unchanged. Re-tuning the existing rules is a separate ticket if ever warranted.
- A new "cross-domain" rule category in the engine. The two-bucket pattern/trend split is fine; the new rules go into `RULES[]` with `category: "pattern"` like every other multi-marker pattern.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/insights.ts` — add the two rule entries to `RULES[]`. Put them adjacent to the existing `atherogenic_dyslipidemia` and `subclinical_hypothyroid` rules so a reader sees the family relationships. Add the two new entries to `RULE_GLOSSES` — the `satisfies Record<RuleId, string>` clause already enforces coverage at compile time, so a missing gloss breaks the build. The "early atherogenic suppressed by the older rule" gate: extract a tiny helper `wouldAtherogenicDyslipidemiaFireHigh(ctx)` that re-runs the existing rule's evaluator and returns `signals >= 3`; the new rule's evaluator returns `null` when the helper returns true. Document the inhibition in a comment next to the new rule so future curators understand why both rules don't ever fire together at high priority.
- `src/insights.ts` — confirm the LLM prompt-injection path (`formatInsightsForPrompt`) is unchanged. The new rules' titles + details flow through it for free; no special-casing needed.
- `tests/fixtures/plan-cross-domain.json` (new) — a Plan fixture with two insights carrying `provenance` for the new rule ids. Use the same shape as `plan-with-provenance.json` (already in `tests/fixtures/` from 0013). The fixture is hand-edited from the existing one so any future schema change to `Plan.insights[].provenance` breaks both fixtures at typecheck time.
- `tests/helpers/mocks.ts` — extend the plan-prompt sniffer to serve `plan-cross-domain.json` when the user message contains either new rule's title. The sniff pattern is documented in 0013's implementation log; mirror it.
- `tests/e2e/cross-domain-rules.spec.ts` (new) — every acceptance bullet maps to a `test()`. Use `composePlan` / `addManualPanel` / the existing `acknowledgeConsent` + `onboard` flows. Construct two distinct test panels (one fires `thyroid_inflammation_drift` only, one fires `early_metabolic_atherogenic` only, one fires both) using `addManualPanel` and confirm the right rules fire on each.
- `tests/e2e/provenance.spec.ts` — extend with one regression scenario that asserts the new rules' chips work via the existing slideover code path. The existing scenarios stay untouched.
- `tests/e2e/print.spec.ts` — once 0016 has shipped, extend with one scenario that drives a new-rule fixture into the doctor PDF and asserts an appendix row renders for the new rule. If 0016 has not yet shipped, the dev agent notes this in the implementation log and the test is added in a follow-up.
- Schema migration: **no** — additive use of the existing `RULES[]` / `RULE_GLOSSES` / `InsightProvenance` machinery.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for the gloss paragraphs: editorial, plain English, ~2 sentences each, no "amazing/journey/exciting", no exclamations, no emoji. The samples in the acceptance bullets are the calibration bar.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0017-cross-domain-rules` opened
- YYYY-MM-DD — failing tests added in `tests/e2e/cross-domain-rules.spec.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
