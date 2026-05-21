---
id: 0039
title: What we ruled out — name the patterns the engine checked and did NOT find, so a clean panel reads as reassurance instead of silence
status: groomed
priority: P2
area: plan
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user whose latest panel fired few or no insights — the person who was told "everything looks normal" and half-believes it is being waved off again — I want the Plan page to name, plainly, the multi-marker patterns the engine actually checked for and did NOT find ("Checked and clear: iron-restricted erythropoiesis, atherogenic dyslipidemia, subclinical hypothyroid, smoldering inflammation — none of these patterns are present in your panel"), so that a quiet result reads as a deliberate, reasoned all-clear from a system that looked for specific things, rather than as silence from a system that might simply have missed something — which is the exact distrust that "everything looks normal" earned in the first place.

## Why now (four lenses)

### Product Owner

The insight engine's value is asymmetric in a way the UI does not yet reflect: when a rule fires, the user sees a card (and, via 0013, why it fired); when *no* rule fires, the user sees nothing — which is indistinguishable, from the user's chair, from the engine not having looked. For the founding persona, that silence is poison: "nothing showed up" is the precise non-answer their doctor gave them, and an app that reproduces it has thrown away its credibility on a clean panel. The smallest meaningful unit of value is a deterministic, zero-network "checked and clear" section on the Plan page: the engine already evaluates every rule in `RULES[]` and `TREND_RULES[]` and returns only the ones that fired — this ticket exposes the *evaluated-but-did-not-fire* set (the rules that had enough data to run and returned null) and renders them as a short, plainly-named all-clear list. It reuses the rule ids and their human names; the only new code is the engine returning the negative set and the page rendering it. It turns the engine's silence into a stated, reasoned all-clear.

### Stakeholder

This makes the **programmatic insight engine** legible in its negative space — the half of its work that is invisible today and is, for a healthy or improving user, the more reassuring half. It is a structural argument the chat box cannot make: raw Claude does not run a fixed battery of curated patterns, so it cannot honestly tell you "I checked these eight specific things and none are present" — it can only spot what it happens to spot, and it cannot enumerate what it ruled out because it never had a list. Almanac has the list (`RULES[]` + `TREND_RULES[]`, each with a gloss in `RULE_GLOSSES`), so it can name what it ruled out, by name, deterministically. This compounds the provenance moat (0013): 0013 shows *why a rule fired*; this shows *which rules were checked and cleared* — together they make the engine fully auditable in both directions. It is also the reassurance that retains the user whose biology is *good* — the user a problem-only UI silently under-serves, and the user most likely to refer a friend precisely because the app told them, with specifics, that they are clear.

### User (at 7am on the phone)

New panel, recomposed plan. There are one or two insight cards, or none at all, and for a second the old dread returns — is it not finding anything because there's nothing, or because it didn't really look? Then I see it, below the insights: "Checked and clear — iron-restricted erythropoiesis, atherogenic dyslipidemia, subclinical hypothyroid, B12/folate insufficiency, smoldering inflammation. None of these patterns are present in your panel." I exhale. It looked for specific, named things — the same things I have read about — and it is telling me, by name, that they are not there. That is the all-clear my doctor never actually gave me; he just said "normal." A pattern it could NOT assess for lack of data says so honestly too ("not enough data to check thyroid — add a TSH and free T3"), so the all-clear is not overclaiming. It rendered instantly, offline, because the engine ran on data already on my phone.

### Growth

This is a retention-and-referral ticket aimed at the user a problem-only product silently loses: the one whose labs are clean or improving. Retention: a clean panel that produces a reasoned, named all-clear is a reason to keep retesting (the all-clear is itself a result worth confirming); a clean panel that produces silence is a reason to wonder why you are paying for cents and bothering. (Hypothesis: surfacing the ruled-out set raises retention among users with few firing insights — the cohort a problem-only UI under-serves — because it converts silence into a stated, trustworthy all-clear; and "the app told me, by name, the eight things it checked and ruled out" is a more referral-worthy line than any single problem card, because it is the opposite of the vague reassurance the persona distrusts — back-of-envelope; treat as untested without remote analytics, which we will never add.) The "show me" frame is the all-clear list itself, which is exactly the thing the "everything looks normal" sufferer wishes their doctor had handed them, and the thing they will show the friend with the same complaint.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/insights.ts` gains a pure exported function `computeRuledOut(panels: Panel[], profile: Profile): RuledOut` where `RuledOut` is `{ clear: { ruleId: string; name: string }[]; insufficientData: { ruleId: string; name: string; missing: string[] }[] }`. A rule is `clear` when it ran against the available data and returned null (the pattern was assessed and not present). A rule is `insufficientData` when it could not be meaningfully assessed because a required marker has no value (the engine could not run it) — with `missing` listing the human names of the absent markers it needed. Every rule in `RULES[]` and `TREND_RULES[]` lands in exactly one of: firing (already returned by `computeInsights`), clear, or insufficientData. Pure: no DOM, no Dexie, no network.
- [ ] Each ruled-out rule resolves a short human name (a new `RULE_NAMES` lookup keyed by `RuleId`, type-checked the same way `RULE_GLOSSES` is — adding a rule without a name breaks the typecheck) — e.g. `iron_restricted_erythropoiesis` → "Iron-restricted erythropoiesis". Asserted by confirming a known cleared rule renders its human name, not its id.
- [ ] The Plan page (`src/pages/plan.ts`) renders a "Checked and clear" section beneath the firing insights, listing the `clear` rules' names, only when at least one rule is clear. The section's line reads: "Checked and clear — <names, comma-joined>. None of these patterns are present in your panel." Asserted by seeding a panel that fires zero rules but has enough data to clear several, and confirming the named all-clear renders.
- [ ] A separate "Not enough data to check" line lists the `insufficientData` rules with the markers they would need: "Not enough data to check <name> — add <missing markers>." This line renders only when at least one rule is in `insufficientData`. The all-clear never claims a pattern is absent when the engine could not assess it. Asserted by seeding a panel missing thyroid markers and confirming the thyroid rule is listed under "not enough data," not under "checked and clear."
- [ ] When EVERY rule fired (no clear, no insufficient), neither new section renders and the Plan page is byte-for-byte unchanged from today below the insights. Asserted by seeding a panel that fires many rules and confirming no "checked and clear" section appears.
- [ ] When NO panel exists (intake-only first plan, 0007), the ruled-out sections do not render — there is no panel to assess against. Asserted on an intake-only plan with no labs.
- [ ] Each cleared rule name is a tap target that opens the existing provenance slideover (0013) showing that rule's `RULE_GLOSSES` paragraph — so a curious user can read what the pattern *is* and what would have made it fire, even though it did not. The slideover for a cleared rule shows the gloss and a "not present in this panel" note (no supporting-marker values, since none fired). Asserted by tapping a cleared rule and confirming the gloss renders.
- [ ] The sections are computed with **zero network calls** — `computeRuledOut()` runs the same in-memory rule battery over the panels already loaded for the plan render. Asserted by rendering the Plan page and confirming the mock recorded zero requests during the computation/render.
- [ ] `computeRuledOut()` respects sex-specific rule wiring exactly as `computeInsights()` does — a male profile's iron rule uses `ferritin_m`, and the missing-marker list for a male profile names the male-specific markers. Asserted with a male and a female profile confirming the correct sex-specific markers in the `missing` list.
- [ ] The firing insights (from `computeInsights`) and the ruled-out set (from `computeRuledOut`) are **disjoint and exhaustive** over `RULES[] + TREND_RULES[]` — no rule appears in both, every rule appears in exactly one bucket (firing / clear / insufficient). Asserted by a spec that sums the three buckets and confirms the count equals the total rule count for a given panel.
- [ ] Renders on both **chromium and mobile-webkit**. The name lists wrap cleanly at the 390 px viewport; long rule-name lists do not overflow horizontally (the documented `min-width: 0` fix applies).
- [ ] Tour mode (0014) renders the ruled-out sections against the tour fixture's panel (the fixture is shaped to fire some rules and clear others, demonstrating both halves). Shared-view mode (0017) does NOT render them — the shared payload carries no panels for the engine to assess. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the ruled-out computation is local-only; no new hostnames; no inference call (the engine is deterministic TypeScript).
- [ ] Schema migration: **no** — the ruled-out set is computed on render from the existing `panels` rows via the deterministic rule engine. Nothing new is persisted; the firing insights stored on the plan are unchanged.
- [ ] New `tests/e2e/ruled-out.spec.ts` covers: named all-clear on a clean panel, "not enough data" line with the missing markers, neither section when all rules fired, no section on an intake-only plan, tap-to-gloss for a cleared rule, sex-specific missing markers, disjoint-and-exhaustive bucketing, zero-network, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated reassurance paragraph. The all-clear is a deterministic enumeration of the rules the engine ran and cleared, named from `RULE_NAMES` and explained from `RULE_GLOSSES`; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose entire value is being a *deterministic, auditable* all-clear. The plan snapshot (composed via the LLM) already carries prose; this is the engine's own ledger.
- Claiming clinical completeness ("you are healthy"). The section names which *curated patterns* were checked and not found — it never claims the panel is exhaustive or that the user has no health issues. The standing "informational, not medical advice" disclaimer holds, and the "not enough data to check" line is the explicit honesty guard against overclaiming.
- Persisting the ruled-out set onto the Plan. It is computed on render from the panels; storing it would duplicate state that the engine reproduces deterministically and would drift if the rule set changes. The firing insights stay the only insight data on the plan.
- Reordering or restyling the firing insights. The ruled-out sections sit beneath the existing insight cards; the cards themselves are unchanged.
- Surfacing ruled-out anywhere but the Plan page in this ticket (Today, Progress, the report card 0036, the Markdown export 0027). The Plan page, at the moment the composed plan is read, is where the engine's full reasoning belongs. An echo elsewhere is a clean follow-up if it earns it.
- Carrying the ruled-out set into the doctor PDF (0010/0016) — though that is a genuinely good future ticket (a clinician would value "patterns screened and cleared"), it is a distinct surface with its own clinical-voice constraints. Scope this to the Plan page.
- Exposing the rule *thresholds* in the ruled-out line ("ferritin was 95, above the 70 floor"). That is the firing-rule provenance's job (0013); a cleared rule by definition did not fire, and listing every threshold it cleared would bury the all-clear in numbers. The gloss in the slideover is the depth path for the curious.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/insights.ts` — add `computeRuledOut(panels, profile)`. The cleanest implementation reuses the existing rule battery: build the same `RuleContext` `computeInsights()` builds, then for each rule in `RULES[]` and `TREND_RULES[]` determine its bucket. "Firing" = `evaluate(ctx)` returns non-null (already what `computeInsights` does — do not double-run if you can share the pass). "Insufficient data" = the rule's required marker(s) have no `ctx.latest(...)` value; encode each rule's required markers either via a small per-rule `requires: (profile) => string[]` companion or by having each rule's `evaluate` distinguish "no data" from "assessed and clear" (prefer a minimal `requires` map keyed by rule id so the missing-marker list is honest and sex-aware). "Clear" = had the required data and returned null. Add `RULE_NAMES` as a `Record<RuleId, string>` `satisfies`-checked exactly like `RULE_GLOSSES`, so a new rule without a name fails the typecheck. Keep `computeInsights()`'s output unchanged.
- `src/types.ts` — add `RuledOut` (internal/render type; additive). No persistent schema change.
- `src/pages/plan.ts` — the page already renders firing insight cards and wires the provenance slideover (0013). After the insight cards, render the "Checked and clear" and "Not enough data to check" sections from `computeRuledOut(panels, profile)` (the panels are already loaded for the plan render — reuse them; do not re-read). A cleared rule name reuses the existing slideover-open wiring, passing the rule's gloss and a "not present in this panel" note (the slideover already takes a gloss; extend its cleared-rule branch to show no supporting markers).
- `src/data/markers.ts` — read-only. `findMarker()` resolves the human names for the `missing` list and the rule names where a rule maps to a marker. No change to the marker DB.
- `src/styles.css` — `.ruled-out` (the section), `.ruled-out__line` (the all-clear sentence, ink-soft), reusing the existing small-caps eyebrow and the insight-section idioms. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0`.
- `src/sample/state.ts` — confirm the tour fixture's panel fires at least one rule and clears at least one other so the tour demonstrates both halves; adjust fixture values (fixture data only) if needed.
- `src/share/shared-state.ts` — gate with the same `isSharedView()` check the Plan page already uses (the shared payload carries no panels — the sections are absent).
- `tests/helpers/flows.ts` — reuse the panel-seeding approach the insight specs use (a panel with controlled marker values) so the spec can construct a panel that fires zero rules but clears several, and a panel missing thyroid markers for the insufficient-data test. The disjoint/exhaustive test reads the rule count off the engine (export a small `ruleCount()` test hook or count via the buckets).
- `tests/e2e/ruled-out.spec.ts` (new) — every acceptance bullet maps to a `test()`. The all-clear test seeds an all-optimal panel (no rule fires, several clear) and asserts "Checked and clear — …. None of these patterns are present in your panel." The insufficient-data test seeds a panel without TSH/free T3 and asserts the thyroid rule lands under "Not enough data to check."
- `tests/e2e/privacy.spec.ts` — extend with a Plan-page visit confirming zero off-allow-list egress during the ruled-out render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the all-clear reads "Checked and clear — <names>. None of these patterns are present in your panel." The insufficient line reads "Not enough data to check <name> — add <markers>." Declarative, no exclamation, no overclaim. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
