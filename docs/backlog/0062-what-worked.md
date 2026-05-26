---
id: 0062
title: What worked — a per-action audit on recompose tying the previous plan's protocol items to the new draw's measured outcomes
status: proposed
priority: P2
area: plan
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user who just uploaded a new draw after three months on a protocol, I want to see — at the moment the new plan composes — a quiet per-item audit of the previous plan's protocol actions against my new markers: which interventions moved their target markers in the right direction, which did not move them, and which have no measurable marker target at all, so that I have an honest accounting of what the protocol accomplished and can read the new plan knowing which bets paid off instead of treating each recompose as a fresh start with no memory.

## Why now (four lenses)

### Product Owner

The plan delta surface (0029, shipped) already shows what changed between the old protocol and the new one. What it does not show is *why* — whether the add/drop/change was driven by a measured outcome. The audit fills that gap with the smallest possible surface: at the top of the plan page, on a recompose where a prior plan exists and the prior plan had any items with `markerKeys`, show a collapsed "What worked" section listing each prior plan item (eat-list, habit-stack, supplements, lifestyle) alongside its marker outcome in the draw that triggered the recompose — `moved toward optimum`, `moved into range`, `stable`, `moved away`, or `no marker measured`. When the section is empty (first plan, or prior plan had no markerKeys-bearing items), it is absent. The section is read-only, collapsed by default, and adds zero LLM inference — it is a pure deterministic join of `plan.eatList/habitStack/supplements/lifestyle[*].markerKeys` against the two draws' `Result[]` using the same `MarkerMove` shape 0032 already defined. It makes the adherence loop legible — the user sees the protocol's track record in one glance before reading what changed.

### Stakeholder

This closes the **adherence loop → plan recompose** cycle at its most overlooked seam: every other precision-health tool (app or chat) composes a new protocol in isolation, as if the prior one never existed. Almanac already has the prior plan's `markerKeys`, the two draws' `Result[]`, and the delta between them — it is structurally the only product that can produce this retrospective without a server, without analytics, without a second inference call. "Leafy greens daily → ferritin up from 32 to 48 — moved into range" is a typed, provenance-bearing, locally-computed outcome line that no chat box session produces, because a chat box has no persistent plan or persistent draws. The section deepens the **structured-plan + persistent-timeline** moat by composing them at the cadence the moat is designed for: the draw-recompose cycle. It also makes the new plan's changes MORE legible — "we dropped fish oil because DHA is now in range" is implied by the "fish oil → DHA moved into range → stable" audit line, which gives the user the cause-and-effect the plan delta alone does not carry.

### User (at 7am on the phone)

I just uploaded my second draw and composed the new plan. At the top of the plan page, a small collapsed section: "What worked — March through May." I tap it open. Six rows: "Leafy greens daily → ferritin up 16 points, now in range ✓. Cast iron cooking → same. Morning walk → HbA1c stable ✓. Cold shower → no marker measured (no outcome data). Fish oil → DHA not retested. Dairy limit → CRP unchanged." Three green, one stable, two unmeasured. Then the new plan below. I now know which bets paid off and which I cannot assess yet. The cold shower and the fish-oil rows do not vanish from the new plan — I'm not confused when they reappear — because I can see they were in a "no data" category, not a "failed" one. It took one tap to open, zero network calls, and it felt like reading a receipt from someone who kept good accounts.

### Growth

This is a retention-and-moat ticket with a specific "show me" frame. (Hypothesis: showing the per-action outcome audit at recompose time lifts the recompose rate among users with 2+ draws, because it turns the "did any of this work?" question from a vague anxious feeling into a typed, color-coded receipt — which is the emotional close the protocol loop has been missing; back-of-envelope from how accountability and visible outcome feedback raise adherence and repeat engagement in behavior-change contexts; treat as untested without remote analytics, which we will never add.) The "show me" frame is the audit section itself: "leafy greens → ferritin moved into range" is the kind of concrete, specific outcome line the persona screenshots and forwards to the friend who's skeptical whether any of this actually changes anything. It is the provenance-bearing sibling of 0032 (marker moved receipt, event-triggered on a single marker) and the retrospective complement of 0029 (plan delta, which shows what changed but not what drove the change).

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/plan/action-audit.ts` (new) exports `buildActionAudit(priorPlan: Plan, priorDraw: Panel, newDraw: Panel): ActionAudit` where `ActionAudit = { items: AuditItem[]; hasMeasuredOutcome: boolean }` and `AuditItem = { label: string; outcome: 'into-range' | 'toward' | 'stable' | 'away' | 'no-data' | 'not-measured'; markerKey?: string; delta?: number }`. For each item in `priorPlan.eatList + habitStack.habits + supplements + lifestyle` that carries a non-empty `markerKeys`, resolve the first `markerKey` against both draws' `Result[]` and compute the outcome using the same favorable-direction semantics as 0032's `computeMovementReceipt`. Items without `markerKeys`, or with a `markerKey` present in `priorDraw.results` but absent from `newDraw.results` (not retested), produce `outcome: 'not-measured'`. Items with a `markerKey` absent from BOTH draws produce `outcome: 'no-data'`. `hasMeasuredOutcome` is true iff at least one item has an outcome other than `'no-data'` and `'not-measured'`. Pure: no DOM, no Dexie, no network, no LLM. Asserted by passing known plans and panels and confirming each item's outcome and the `hasMeasuredOutcome` flag.
- [ ] The Plan page (`src/pages/plan.ts`) renders the "What worked" section ONLY when `hasMeasuredOutcome` is true and the section is collapsed by default. Asserted by seeding a prior plan with markerKeys-bearing items and two panels with measurable movement, and confirming the section renders collapsed and expands on tap.
- [ ] The section is ABSENT for a first-time plan (no prior plan), for a prior plan whose items carry no `markerKeys`, and for a prior plan where every item's markerKey was present in neither draw. Asserted in each of the three absence cases.
- [ ] Each audit row renders: the action's label (e.g. "Leafy greens daily"), the outcome in a short editorial string (e.g. "ferritin moved into range", "ferritin stable", "ferritin not retested", or "no marker data"), and a calm directional indicator (text-only; no color beyond ink / ink-soft / oxblood; `into-range` and `toward` use oxblood, `stable` uses ink, `away` uses ink-soft, `not-measured` and `no-data` use ink-soft). Asserted by seeding items with each outcome class and confirming the rendered strings.
- [ ] The collapse/expand is driven by a summary tally in the collapsed state: "N of M actions with measurable outcomes." Asserted by seeding 3 items with measured outcomes and 2 without and confirming the tally reads "3 of 5 actions with measurable outcomes."
- [ ] The audit covers ONLY the prior plan's protocol items, NOT the new plan's items. The new plan renders unchanged beneath the audit section. Asserted by seeding a prior plan and a new plan with different items and confirming the audit rows match the prior plan and the new plan's items are unchanged below.
- [ ] The audit makes **zero Anthropic calls** and **zero network calls** — it is a pure join of `priorPlan`, `priorDraw`, and `newDraw`. Asserted by rendering the section and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the audit section or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the rendered section.
- [ ] Renders on both **chromium and mobile-webkit**. The collapsed section fits the 390 px viewport; the expand affordance is ≥44×44 css px (min-height ≥45 px per the 0017 sub-pixel lesson); long action labels respect `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) renders the section against the tour fixture's prior plan and prior draw if the fixture carries them; shared-view mode (0017) does NOT render the section (a shared protocol has no prior draw from the recipient's device). Asserted in both modes.
- [ ] The existing Plan page surfaces — the protocol body, plan-delta section (0029), tell-a-friend (0050), adopt-diff (0056) — are byte-for-byte unchanged in behavior; the audit section is purely additive. Asserted by exercising the existing Plan flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the audit is a local computation with no inference; no new hostnames.
- [ ] Schema migration: **no** — the audit is a render-time join over existing `Plan` and `Panel` fields (`markerKeys` already on plan items per the type definitions). No new Dexie version, no new persisted field.
- [ ] New `tests/e2e/action-audit.spec.ts` covers: `buildActionAudit` assembles each outcome class, the section renders collapsed with the tally and expands, the three absence cases, each outcome class renders its editorial string, the tally string is correct, the new plan is unchanged below, zero Anthropic + zero network, the key never appears (sentinel), tour vs shared-view behavior, the existing Plan surfaces unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-authored outcome narrative ("your leafy greens habit seems to have paid off…"). Every outcome line is a deterministic string assembled from the marker name + the computed outcome class. No inference, no generative prose.
- Multi-markerKey aggregation per action (e.g. "fish oil → DHA + EPA + TG, all moved"). The audit resolves the first `markerKey` only, to keep each row single-marker, legible, and unambiguous. Multi-key aggregation is a possible future refinement.
- Attributing causation ("the protocol CAUSED this change"). The outcome line uses neutral verbs ("moved into range", "stable", "not retested") — never "because of" or "thanks to." The product makes no causal claims; it presents correlation as correlation.
- Surfacing the audit outside the Plan page — on Progress, on Today, on the improvement card (0047). The audit is context for the new plan; it lives on Plan only.
- An "average protocol adherence" line or a check-in-rate column in the audit. Connecting adherence to outcomes is a plausible future ticket; this ticket presents marker outcomes only, not behavioral compliance.
- Carrying the audit into exports (doctor PDF, coach packet, Markdown export). It is a real-time in-app surface, not an archival artifact.
- A "retry this action" or "keep this item" UI control. The new plan below already reflects the planner's decisions; the audit is read-only. No UI that overrides or edits the new plan from the audit surface.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/plan/action-audit.ts` (new) — `buildActionAudit(priorPlan, priorDraw, newDraw)`. Iterate `priorPlan.eatList`, `priorPlan.habitStack.habits`, `priorPlan.supplements`, `priorPlan.lifestyle`. For each item, resolve `item.markerKeys?.[0]`. Look up `priorDraw.results.find(r => r.markerKey === key)` and `newDraw.results.find(...)`. Compute outcome via the existing `MarkerMove` semantics from 0032 (reuse `computeMovementReceipt` if exported, otherwise inline the same comparison logic). No Dexie, no LLM.
- `src/types.ts` — add `AuditItem` and `ActionAudit` interfaces. Confirm `Plan.eatList[*].markerKeys`, `Plan.habitStack.habits[*].markerKeys`, `Plan.supplements[*].markerKeys`, `Plan.lifestyle[*].markerKeys` exist and are typed (they should from the plan-generation schema; if any are missing, add the optional field additively).
- `src/pages/plan.ts` — after fetching `latestPlan()` and `panels` (already fetched for the existing plan body), identify the prior plan (the plan before `latestPlan()`, ordered by `createdAt` desc) and the draw that preceded the latest plan's `createdAt` vs. the draw that preceded THAT (i.e., the two most recent panels in ascending order). If both exist and `buildActionAudit(...).hasMeasuredOutcome` is true, render the "What worked" section at the top of the plan body, collapsed. Wire the expand/collapse tap handler. The existing plan body renders unchanged below.
- `src/data/markers.ts` — read-only reuse of `findMarker()` + the functional-range comparison to determine outcome direction.
- `src/styles.css` — `.action-audit` (the section), `.action-audit__row` (each item row), `.action-audit__toggle` (the expand affordance, ≥44×44 css px). Reuse the plan-delta (0029) and insight-evidence (0013) section idioms. `into-range` and `toward` use oxblood; `stable` uses ink; `away` and `not-measured` and `no-data` use ink-soft. No new colors.
- `src/sample/state.ts` — if the tour fixture carries a prior plan + a prior draw, enable the section in tour mode. If not, gate with `!isTour()` or add a minimal fixture extension.
- `src/share/shared-state.ts` — gate the section with `!isSharedView()`.
- `tests/helpers/flows.ts` — reuse the existing `seedPlan(page, planData)` and `seedPanel(page, panelData)` helpers (from the 0019/0050 specs) to seed a prior plan + two panels without a compose round-trip.
- `tests/e2e/action-audit.spec.ts` (new) — every acceptance bullet maps to a `test()`. The outcome-class test seeds a prior plan with 5 items carrying different markerKey outcomes and asserts each row's rendered string; the absence tests seed the three absence conditions and assert the section is not rendered.
- `tests/e2e/privacy.spec.ts` — extend with composing a plan with a prior plan + two draws, rendering the audit section, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — join over existing persistent fields; no new Dexie version.
- Voice spec: section eyebrow reads "What worked"; collapsed tally reads "N of M actions with measurable outcomes"; individual outcome strings: "moved into range", "moved toward optimum", "stable", "moved away from optimum", "not retested since", "no marker data". Declarative, past-tense, no attribution of causation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the positive outcomes.

## Implementation log

(Appended by the implementation-dev agent during execution.)
