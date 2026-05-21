---
id: 0046
title: The pattern named — surface the top metabolic syndrome cluster the insight engine found
status: proposed
priority: P2
area: plan
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user whose plan fired several related insights, I want a single named label at the top of my Plan — "Your markers show an insulin resistance pattern across 4 of your tracked markers." — instead of a bare count of findings, so that the most important thing my biology is saying is stated in one sentence I can hold in my head and repeat to my doctor, rather than left for me to infer from a list of six separate insight cards.

## Why now (four lenses)

### Product Owner

The deterministic insight engine (`src/insights.ts`) is the deepest computation the app runs — it scans every panel for multi-marker patterns before Claude ever sees the data — but its output reaches the user as a list of individually-titled insight cards and, where 0036 ships, an "Against the optimum" eyebrow. What the user never gets is the *headline*: the single dominant pattern those insights collectively describe. "Six insights" is a count; "an insulin resistance pattern across four markers" is a finding. The smallest meaningful unit of value is one editorial eyebrow sentence at the top of the Plan, derived deterministically from the insights the plan already carries: a small static mapping from rule-id clusters to plain-English syndrome labels, the highest-coverage cluster named in one sentence. Zero new inference, zero new DB writes, zero new egress — it is a presentation layer over the most powerful computation the app already runs, turning the engine's reasoning from a list into a sentence the user can actually carry.

### Stakeholder

This makes the **insight-engine moat** legible to a layperson without a single line of clinical overreach — and legibility is exactly where this asset is weakest. The engine is the clearest thing a chat box cannot replicate (it is deterministic, curated, and runs across the persistent timeline before the model is called), yet its value is hidden behind a list of cards. A named pattern is the artifact that travels: it is the sentence the user repeats to a clinician, the sentence a friend remembers, the sentence that distinguishes "this tool found a pattern in my labs" from "a chatbot wrote me a paragraph." Crucially, ours is a lookup from a fixed mapping over the engine's own `provenance.ruleId` values — so it is honest by construction. A chat box asked for a syndrome label will hallucinate one; Almanac's is a deterministic resolution of which curated rules actually fired, and it returns nothing rather than guess when no cluster reaches the threshold. It compounds the engine (0013 provenance, 0039 ruled-out, 0019 what-if) by giving its output a headline, without new data, new inference, or new schema.

### User (at 7am on the phone)

I open my Plan. Before the eat list, one quiet line in the almanac type: "Your markers show an insulin resistance pattern across 4 of your tracked markers." That is the thing. Not six cards I have to synthesize — the synthesis, stated. I read it once and I have it; it is the sentence I will say at my next appointment. It is not a diagnosis and it does not shout — same ink as the rest of the page, no badge, no color flare — it just names what the engine found. If my markers were clean and nothing clustered, the line is simply absent; the app does not invent a pattern to have something to say. It rendered instantly, offline, because the insights were already computed and stored with my plan — nothing was fetched, nothing was sent.

### Growth

This is a moat-legibility surface whose payoff is a repeatable sentence — the unit that travels by word of mouth and into the exam room. The named pattern is what the user tells one specific person: a doctor ("this app flagged an insulin resistance pattern across four of my markers"), or a friend ("it doesn't just list numbers, it names the pattern"). (Hypothesis: naming the dominant pattern raises both the rate at which users act on a plan and the rate at which they describe the app to others, because a single named finding is far more memorable and repeatable than a list of six — back-of-envelope from how a named diagnosis-shaped finding outperforms an itemized list for recall and retelling; treat as untested without remote analytics, which we will never add.) The "show me" frame is the line itself in the editorial type: "an insulin resistance pattern across 4 markers," deterministic and dated to the user's own labs, is precisely the credibility-shaped artifact a precision-health-literate audience trusts — because they know a chat box would have to make the label up, and this one is a lookup.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/plan/pattern.ts` (new) exports `detectTopPattern(insights: Insight[]): PatternLabel | null`. It defines `RULE_CLUSTERS: { label: string; ruleIds: string[] }[]`, ordered by clinical salience, mapping the real rule ids in `src/insights.ts` to editorial labels — e.g. `{ label: "insulin resistance pattern", ruleIds: ["insulin_resistance", "trending_up_a1c"] }`, `{ label: "thyroid-axis pattern", ruleIds: ["subclinical_hypothyroid"] }`, `{ label: "iron recycling impairment", ruleIds: ["iron_restricted_erythropoiesis", "trending_down_ferritin"] }`, `{ label: "atherogenic lipid pattern", ruleIds: ["atherogenic_dyslipidemia", "persistent_high_ldl", "persistent_high_total_chol"] }`, `{ label: "methylation cofactor insufficiency", ruleIds: ["b12_folate_insufficiency"] }`, `{ label: "smoldering inflammation pattern", ruleIds: ["inflammation_triad"] }`. For each cluster it counts how many of its `ruleIds` appear among the insights' `provenance.ruleId` values; returns the cluster with the highest matching count, ties broken by first-defined order, or `null` when no cluster has **two or more** matching rule ids. Pure: no DOM, no Dexie, no network.
- [ ] `detectTopPattern` matches against `insight.provenance?.ruleId` ONLY (the engine-emitted insights), never against LLM-only insight titles — an insight without `provenance` cannot contribute to a cluster. Asserted by passing a mix of provenance-bearing and provenance-less insights and confirming only the provenance-bearing ones count toward the cluster.
- [ ] The Plan page (`src/pages/plan.ts`), AFTER the existing insights-count eyebrow (and below the 0036 "Against the optimum" eyebrow once it ships), renders — when `detectTopPattern(plan.insights)` is non-null — a single banner sentence reading exactly: "Your markers show <label> across <N> of your tracked markers." where `<N>` is the count of distinct supporting markers across the cluster's firing insights (deduped by marker key). Asserted by composing/seeding a plan whose insights fire a cluster of two rule ids and confirming the exact sentence with the correct marker count.
- [ ] When fewer than two rule ids from any single cluster fire, NO pattern banner renders — the surface returns null and the Plan looks exactly as it does today. Asserted by seeding a plan with exactly one provenance-bearing insight and confirming no `.plan-pattern` banner is present.
- [ ] On a tie (two clusters each matching the same number of rule ids), the FIRST cluster in `RULE_CLUSTERS` wins. Asserted by seeding a plan whose insights match exactly one rule id from cluster A and one from cluster B with both clusters at count 1 — confirming no banner (below the two-match threshold) — then a plan matching two from A and two from B and confirming A's label renders.
- [ ] The banner carries NO color change, NO badge, NO icon — ink and ink-soft only, in the editorial register, consistent with the existing eyebrow styling. Asserted by confirming the rendered `.plan-pattern` element uses no oxblood/accent class and contains only the sentence.
- [ ] The banner renders ONLY on the main Dashboard view of the Plan, NOT on the Read/print view. Asserted by rendering both the Dashboard and the Read view of a plan that fires a cluster and confirming the banner is present on Dashboard and absent on Read.
- [ ] The pattern is computed with **zero network calls** — it reads `plan.insights` already in memory and resolves the label from the static mapping. Asserted by rendering the Plan and confirming the mock recorded zero requests during the pattern computation/render.
- [ ] Tour mode (0014) renders the pattern banner using the tour fixture's insight set IF that set fires a cluster (two-plus rule ids from one cluster); if the tour fixture's insights do not cluster, no banner renders. Asserted in tour mode against the tour's plan fixture (note in the spec whether the fixture clusters; if it does not, the dev may adjust the tour fixture's insights so the tour demonstrates the feature, OR assert absence — pick one and state it).
- [ ] Shared-view mode (0017) renders the pattern banner from the SHARED plan's insights when they cluster. NOTE: the shared payload (`SharedProtocolPayload`) currently carries `eatList` / `avoidList` / `habitStack` / `mealPlan` but NOT `insights`; if the synthetic shared `Plan` shell has an empty `insights` array, the banner correctly does not render. The dev must NOT widen the shared payload to carry insights for this ticket — assert that shared-view shows the banner only if the shell's insights are populated, and otherwise shows nothing. (Confirm the current shell's `insights` state and assert accordingly.)
- [ ] Renders on both **chromium and mobile-webkit**. The banner sentence wraps cleanly at the 390 px viewport and does not push the eat list below the fold by more than one line; long labels respect `min-width: 0`.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the pattern is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — `detectTopPattern` reads the `insights` array already on every stored plan; `PatternLabel` is an internal render type. Nothing new is persisted; the shared payload is NOT widened.
- [ ] `src/types.ts` adds `PatternLabel` (an internal render type, e.g. `{ label: string; markerCount: number; ruleIds: string[] }`). Additive only. Asserted indirectly by the typecheck passing and the banner rendering the resolved label + count.
- [ ] New `tests/e2e/plan-pattern.spec.ts` covers: cluster of two rule ids renders the named banner with the correct marker count, fewer than two matches renders nothing, provenance-less insights do not count, the tie resolves to the first-defined cluster, ink-only styling (no accent), Dashboard-only (absent on Read view), zero-network, tour fixture behavior, shared-view behavior (no payload widening), mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated or free-text pattern label. The label is a lookup from a fixed `RULE_CLUSTERS` mapping over the engine's `provenance.ruleId` values — deterministic and honest by construction. A generated label would hallucinate a syndrome name; that is exactly the failure mode this ticket exists to avoid.
- A clinical diagnosis, ICD code, severity score, or anything that reads as a medical verdict. The banner names a *pattern the engine detected*, in plain English, beneath the standing "informational, not medical advice" disclaimer. No diagnostic framing, no risk percentage.
- Showing more than one pattern. Only the single highest-coverage cluster is named — one sentence, one finding. A ranked list of patterns would re-create the "list of cards" problem this ticket solves. (The full per-insight detail already lives in the existing insight cards and the 0013 provenance slideover.)
- Widening the shared payload (`SharedProtocolPayload`) to carry insights so the shared view can show a pattern. That is a privacy-surface change out of scope here; the banner renders from whatever the shared shell already exposes, which today is no insights.
- New rule ids, new clusters beyond the ones the engine can actually emit, or editing `src/insights.ts`'s rules. This ticket maps EXISTING rule ids to labels; it does not add or change rules. If a cluster references a rule id that does not exist in `RULES[]`/`TREND_RULES[]`, that is a bug — the mapping must use only real ids.
- A color, badge, icon, or any visual flare on the banner. Ink and ink-soft only; oxblood reserved. The restraint is the point — a named pattern in the house type, not an alert.
- Persisting the detected pattern, recording which pattern fired, or surfacing it in telemetry. No analytics. It is computed fresh on every render from the plan's insights.
- Surfacing the pattern outside the Plan Dashboard (Today, Progress, the doctor PDF, the share link, the Markdown export). The Plan Dashboard is where the user reads what their biology is saying; an echo elsewhere is a possible follow-up but is not the value here. (It is explicitly excluded from the Read/print view per the acceptance criteria.)

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/plan/pattern.ts` (new) — `detectTopPattern(insights: Insight[]): PatternLabel | null`. Define `RULE_CLUSTERS` ordered by clinical salience, using ONLY the real rule ids from `src/insights.ts`: pattern rules `insulin_resistance`, `subclinical_hypothyroid`, `iron_restricted_erythropoiesis`, `atherogenic_dyslipidemia`, `b12_folate_insufficiency`, `inflammation_triad`; trend rules `persistent_high_total_chol`, `persistent_high_ldl`, `trending_down_ferritin`, `trending_up_a1c`. For each cluster, count distinct matching `insight.provenance?.ruleId` values; pick the max-count cluster, ties to first-defined; return `null` below the two-match floor. Compute `markerCount` as the count of distinct `markerKey` across the firing cluster's insights' `provenance.supportingMarkers` (deduped). Pure function; no Dexie, no Anthropic.
- `src/insights.ts` — read-only reference for the rule ids. The `Insight.provenance.ruleId` carried on engine-emitted insights is the join key; LLM-only insights carry no `provenance` (the absence is the signal — see the type comment on `Insight`). Do NOT edit the rules.
- `src/pages/plan.ts` — in the Dashboard render path, after the existing insights-count eyebrow (and below 0036's "Against the optimum" eyebrow if present), call `detectTopPattern(plan.insights)`; when non-null, render the `.plan-pattern` banner sentence. Do NOT render it in the Read/print render path. Short-circuit nothing for tour (tour reads its plan fixture); shared-view renders from the synthetic shell's insights (empty today → no banner).
- `src/types.ts` — add `PatternLabel` (internal render type, e.g. `{ label: string; markerCount: number; ruleIds: string[] }`). Additive; no persistent schema change; do NOT touch `SharedProtocolPayload`.
- `src/styles.css` — `.plan-pattern` (the banner sentence), matching the existing Plan eyebrow idiom — ink / ink-soft, no accent, no badge. Grid children get `min-width: 0`. No new colors; oxblood reserved.
- `src/share/shared-state.ts` — read-only confirmation that the synthetic shared `Plan` shell's `insights` is empty (so shared-view shows no banner). Do NOT widen `SharedProtocolPayload` to carry insights.
- `src/sample/state.ts` — the tour's plan fixture. If the tour's insight set already clusters (two-plus rule ids from one cluster), the banner demonstrates itself in tour; if not, the dev may add provenance-bearing insights to the tour fixture so the tour shows the feature (stating the choice in the implementation log), OR assert absence in tour. Pick one.
- `tests/helpers/flows.ts` — reuse the existing plan-seeding helper to seed a `Plan` whose `insights[]` carry controlled `provenance.ruleId` + `provenance.supportingMarkers` so the spec can construct exact clusters, ties, and below-threshold cases. (Insights with no `provenance` exercise the "does not count" path.)
- `tests/e2e/plan-pattern.spec.ts` (new) — every acceptance bullet maps to a `test()`. The cluster test seeds a plan with two `insulin_resistance`-cluster insights across four distinct marker keys and asserts "Your markers show insulin resistance pattern across 4 of your tracked markers." The tie test seeds two-from-A + two-from-B and asserts A's label.
- `tests/e2e/privacy.spec.ts` — extend with a Plan render carrying a clustering insight set, confirming zero off-allow-list egress during the pattern render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (reads existing `plan.insights`; shared payload NOT widened).
- Voice spec: the banner reads "Your markers show <label> across <N> of your tracked markers." Declarative, no exclamation, no diagnostic framing. Labels are plain-English patterns ("insulin resistance pattern", "thyroid-axis pattern", "iron recycling impairment", "atherogenic lipid pattern", "methylation cofactor insufficiency", "smoldering inflammation pattern"). Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)
