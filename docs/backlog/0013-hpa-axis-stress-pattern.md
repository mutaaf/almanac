---
id: 0013
title: Cross-marker rule — HPA-axis stress pattern (cortisol AM + DHEA-S + sex hormones)
status: proposed
priority: P1
area: plan
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a user whose morning cortisol is high-normal and whose DHEA-S and free testosterone are at the low end, I want Almanac's insight engine to recognize that pattern as `HPA-axis stress drift` — name it as an authoritative finding in the plan, point to the markers behind it, and write the recommendation against it — instead of having the LLM either invent something less specific or treat the markers as independent.

## Why now (four lenses)

### Product Owner
The insight engine already carries six pattern rules (iron-restricted erythropoiesis, subclinical hypothyroid, insulin resistance, atherogenic dyslipidemia, methylation cofactor insufficiency, smoldering inflammation) and four trend rules. Each one is a discrete, defensible piece of curated clinical opinion the LLM cannot credibly invent. Adding the HPA-axis pattern is the smallest meaningful unit of value — one rule, one fixture, one Playwright assertion — and it covers a cohort (chronically stressed knowledge workers, perimenopausal women, endurance athletes) that overlaps heavily with our likely audience.

### Stakeholder
The insight engine is one of the clearest pieces of the moat. Every additional curated rule widens it. A rule that fires on (high-normal cortisol AM) + (low DHEA-S) + (low free testosterone) + (sometimes low ferritin) names a pattern that Peter Attia / Stacy Sims / Chris Kresser audiences immediately recognize — and that a generic chatbot reading the same numbers would not, because it doesn't carry the rule. This is exactly the kind of pre-computed finding that we then *inject as authoritative* into the LLM prompt (see `formatInsightsForPrompt`), so the recommendation downstream stays on-pattern.

### User (at 7am on the phone)
I open the plan after my second draw. The third insight reads: `HPA-axis stress drift pattern — high-medium`. I tap the chevron (the 0006 slideover). Three sections: `The marker` (now showing the rule's `detail` since it crosses markers), `Your trajectory` (showing my cortisol AM + DHEA-S series across the two draws), and `How to move it` (the eat list and supplement tap-targets that already address those markers). I screenshot it to text my partner.

### Growth
The specialty-medicine cohort (Wild Health, Function Health, Quest Defender, Boston Heart) frequently sees this exact pattern flagged manually by their clinicians. Surfacing it programmatically — with the same vocabulary their clinician uses — is the kind of "wait, this app *knows*" moment that gets a Reddit / forum post. Hypothesis: the average specialty user has 1–2 of our six pattern rules fire on their first plan; adding HPA brings the average closer to 2–3, which is the difference between "Almanac saw one thing" and "Almanac is reading the same panel my clinician reads."

## Acceptance criteria

- [ ] `src/insights.ts` gains a seventh entry in `RULES[]` with `id: "hpa_axis_stress_drift"`, `category: "pattern"`. The rule fires when at least 3 of the following 5 signals are present (using `ctx.latest`):
  - `cortisol_am` value > 18 µg/dL (functional ceiling — top of the lab range);
  - `dhea_s` value below the sex-specific functional floor (male < 280 µg/dL, female < 170 µg/dL);
  - `free_testosterone` value below the sex-specific functional floor (male < 9 pg/mL, female < 1.5 pg/mL);
  - `shbg` value > 60 nmol/L (binding too much free hormone);
  - `ferritin` (sex-keyed) below the same floor used by the existing iron rule.
- [ ] When the rule fires, the emitted `PreComputedInsight` has: title `HPA-axis stress drift pattern`, priority `high` when 4+ signals are present else `medium`, supportingMarkers populated with the marker keys that signaled, `evidence` populated with the firing values in the same `key value · key value` shape the other rules use, and a `detail` paragraph in the editorial voice (2–3 sentences) explaining the pattern, the common contributors (chronic stress, energy deficit, undersleeping, undereating relative to training load), and the food-first levers (carbohydrate availability around training, protein at breakfast, magnesium-rich foods, salt sufficiency).
- [ ] If any of the five markers required are missing from `findMarker()` (the canonical seed DB), the rule still compiles but skips that signal — it never errors. (Defensive check: `dhea_s`, `cortisol_am`, `free_testosterone`, `shbg` may not all be in the current seed; the ticket should add the missing ones to `src/data/markers.ts` so the rule has real curated functional ranges to reference downstream.)
- [ ] New entries added to `src/data/markers.ts` for any of (`cortisol_am`, `dhea_s`, `free_testosterone`, `shbg`) not already present — each with `aliases` covering the common lab name variants (`Cortisol, AM`, `Cortisol, Serum (AM)`, `DHEA-Sulfate`, `Testosterone, Free, Direct`, `Sex Hormone Binding Globulin`, etc.), units, `labRange`, `optimalRange`, and a 1-sentence `description`.
- [ ] The rule appears in the prompt block emitted by `formatInsightsForPrompt()` when it fires, ordered with the other `high` / `medium` patterns.
- [ ] New scenario in `tests/e2e/plan.spec.ts` (or `tests/e2e/insights.spec.ts` if cleaner) seeds a panel via `page.evaluate` with `cortisol_am: 22`, `dhea_s: 140` (female), `free_testosterone: 1.1`, fires `computeInsights`, and asserts the returned array contains an entry with `id === "hpa_axis_stress_drift"`, `priority === "high"`, and the three supporting markers.
- [ ] Regression scenario: a panel with only `cortisol_am: 22` (one signal) does NOT fire the rule.
- [ ] Regression scenario: the existing six pattern rules and four trend rules still fire on their existing test fixtures (no accidental shadowing or signal-counting bug introduced).
- [ ] Plan-generation E2E (the existing `composePlan` flow) still works end-to-end with the expanded `Marker Reference` block — the prompt-cache assertion must still see `cacheReadTokens > 0` on a re-roll, proving the added markers didn't blow the cacheable prefix shape.
- [ ] Privacy E2E still passes.
- [ ] All scenarios pass on both chromium and mobile-webkit.

## Out of scope

- A separate "stress" tab or visualization. The pattern is surfaced as an `Insight` like any other; the 0006 slideover handles the deep-read.
- Salivary or 4-point cortisol curve interpretation. Almanac is serum-only for now (that's the data users actually arrive with from Quest / LabCorp / Boston Heart).
- A user-facing "HPA score." We render the pattern, not a composite score; scores tend to be wrong in cohorts they weren't designed for.
- Replacing the existing `inflammation_triad` overlap with cortisol — that rule stays as-is; the HPA rule is a separate finding.

## Engineering notes

- `src/insights.ts` — append the new rule to `RULES[]` after the existing six. Follow the exact shape of `inflammation_triad` for the signal-counting pattern and the sex-keyed marker lookup.
- `src/data/markers.ts` — append the four (or however many are missing) markers to `MARKERS[]`. Categories: `cortisol_am` → `hormones`, `dhea_s` → `hormones`, `free_testosterone` → `hormones`, `shbg` → `hormones`. Functional ranges should reflect the values used in the rule above; cite a one-line source in the file comment next to each new entry (e.g. `// DHEA-S floor per Attia / Sims; lab range from Quest`).
- `tests/e2e/plan.spec.ts` — new describe block `Plan · HPA-axis pattern`. Seed via `page.evaluate(db.panels.add(...))` to stay consistent with the existing in-spec seeding pattern; assert via the rendered insights list on the plan page that the new pattern is present after `composePlan()`.
- `tests/fixtures/plan.json` — no change required if the test seeds its own panel; if you opt to extend the shared fixture, ensure the existing tests still pass (don't break the iron / lipid panel scenarios).
- Schema migration: **no** — markers and rules are code, not storage.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

(empty — pick up via `/ship 0013`)
