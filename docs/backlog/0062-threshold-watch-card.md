---
id: 0062
title: The threshold watch — a quiet Today card naming the exact next number that would change your protocol
status: groomed
priority: P1
area: today
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a user halfway between draws, working a protocol I composed three weeks ago, I want a quiet card on Today that names the *exact next number* that would change something — "Your ferritin is 28. At 50, the iron-restricted erythropoiesis pattern would no longer fire, and the iron-rich tier could relax from advanced to easy." — so that the abstract retention loop ("keep doing the protocol") becomes one concrete, owned-by-the-app number to aim for, instead of a featureless wait for the next draw to tell me where I stand.

## Why now (four lenses)

### Product Owner

The hardest part of the between-draws month is that the protocol's goalposts are invisible. The user has a plan, has check-ins, may have a projection card (0012, shipped) showing a plausible band — but no single screen names the *threshold* that, if crossed, would flip a finding or relax a tier. The deterministic insight engine already knows: every rule in `RULES[]` has a numeric threshold (ferritin `< 50`, ApoB `> 100`, hsCRP `> 1.5`, fasting insulin `> 5`), every habit tier has a marker-keyed boundary (the iron tier escalates when ferritin drops below 30 and relaxes when it crosses 50). The smallest meaningful unit of value is a quiet card on Today — surfacing when the user is between draws and has at least one out-of-optimum marker — that names, for at most three markers, the specific value that would change something: "Ferritin 28 → 50 would relax the iron tier and drop the iron-restricted pattern." The card reads thresholds from the existing rule definitions, the current values from the latest panel, and the current adherence-tier mapping from `formatAdherence` — no LLM call, no new content authoring at render time. It collapses "is this working?" from "wait six weeks and find out" to "here is the number; you'll see it on the next draw." It is the retention surface 0012 (projection) is one step shy of: 0012 says "likely range," this names "the value that flips."

### Stakeholder

This is a clean **insight engine** moat extension into the daily surface. The rules carry the thresholds; the simulator (0019, shipped) lets a curious user *drag* a value to discover the threshold; this ticket pre-computes the same answer for the markers actually relevant to the user *right now* and prints it on Today without requiring the drag. A chat box can guess at "you should aim for around 50 for ferritin," but it cannot name the threshold that flips *your* iron-restricted erythropoiesis pattern *given your other markers*, because the pattern depends on the multi-marker rule body — only the engine knows which rule fires now and which rule would fire at the boundary. It widens the **adherence loop** moat too: the card reads adherence-tier state alongside the rule body, so a user holding the advanced tier sees "at 50, the tier could relax to easy" — closing the loop between the work they're doing daily and the marker they're moving. It compounds 0012 (projection band) and 0028 (retest countdown) and 0051 (pre-draw primer) into a between-draws triplet — projection ⇢ threshold ⇢ retest — that no chat product can structurally produce.

### User (at 7am on the phone)

Today, three weeks into the protocol. Above my meals, a calm card: "Watch list." Three lines:
- "Ferritin 28 → 50: would relax the iron tier and drop the iron-restricted pattern."
- "ApoB 92 → 80: would drop the elevated-ApoB finding."
- "Fasting insulin 6 → 5: would drop the insulin-resistance pattern."
That's it. Three numbers I can hold in my head — the next number on each marker that means something to *me*, given the rules currently firing on *my* panel. I tap a line; a small slideover shows the rule name, the threshold, and a one-sentence reminder of why that threshold is where it is (from the rule's existing gloss). I close it. The card is the same calm type and ink as the rest of Today; no glow, no alarm. It worked offline because the rules are code, the values are local, and the comparison is arithmetic. Tomorrow it reads the same — until I retest, when it disappears for the values that cleared and updates for the ones that moved.

### Growth

This is pure between-draws retention, aimed at the exact stretch where users in this category disengage. (Hypothesis: a Today card naming the specific next number that would change the protocol meaningfully outperforms a generic "keep going" reminder for the persona, because the persona is motivated by concrete targets and tests of falsifiable claims; back-of-envelope from how target-anchored adherence beats encouragement-anchored adherence in self-improvement product literature; treat as untested without remote analytics, which we will never add.) The "show me" frame is the card itself — a clean three-line "Ferritin 28 → 50 would relax the iron tier and drop the iron-restricted pattern" is the kind of detail the persona screenshots into a precision-health forum DM with "how does an app know to tell me this?" — because no other product in the category names the threshold tied to *their own multi-marker rule firing right now*. It also produces a slow drumbeat of forwardable cards: every recompose updates the thresholds, every new draw clears one and surfaces another, and each is a small concrete shareable.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/threshold-watch.ts` (new) exports `computeThresholdWatch(latestPanel: Panel | undefined, plan: Plan | undefined, markers: MarkerDef[], rules: Rule[], checkIns: CheckIn[]): WatchLine[]` returning, for at most THREE markers, an object `{ markerKey, displayName, currentValue, unit, targetValue, consequences: string[] }`. Selection rule: from the markers on the latest panel whose current value is OUTSIDE the marker's `optimalRange` AND whose value is referenced by at least one of the *currently firing* rules in the engine's output OR by a habit-tier boundary, rank by absolute distance from the nearest threshold (closest first, so the most-achievable watch surfaces first), take the top 3. For each selected marker, the `targetValue` is the closest threshold across all rules and tier boundaries that would change the engine's output if crossed (with the direction implied by the marker's `optimalRange` — if currentValue is below the floor, the target is the floor or the lower of the two; mirror for above the ceiling). `consequences` is a list of plain-English clauses pulled from the rule's existing `RULE_GLOSSES` entry (or the tier-boundary's curated label) — NO new authored copy at render time. Pure: no DOM, no Dexie, no network. Asserted by constructing a panel + plan + rules and confirming the picked markers, target values, and consequence strings.
- [ ] The Today page (`src/pages/today.ts`) renders the "Watch list" card when `computeThresholdWatch(...)` returns ≥ 1 line AND today is between draws (i.e. the user is past the first compose, not on draw day per 0031, and not within the pre-draw primer window per 0051 unless that window also wants the card — pick ONE and document). Asserted by seeding a between-draws profile + a panel with out-of-optimum values + a composed plan, and confirming the card renders with the right line count.
- [ ] Each line renders as "Marker <currentValue> <unit> → <targetValue> <unit>: <consequence sentence>." The arrow is a literal "→" (NOT an emoji, NOT an SVG icon). Asserted on a known seed.
- [ ] Tapping a line opens a small slideover (reuse the 0013 "Why this fired" slideover primitive, or a sibling) showing the rule name, the threshold value, the rule's `RULE_GLOSSES` body, and a single closing line: "This is the threshold in the rule; your next draw is the only ground truth." Asserted by tapping and confirming the slideover content.
- [ ] The card is ABSENT when the latest panel has NO out-of-optimum markers among rule-referenced markers (every relevant marker is already optimal). Asserted on an all-optimal panel.
- [ ] The card is ABSENT when there is no composed plan / no panels (nothing to watch). Asserted on a fresh profile.
- [ ] The card is ABSENT on draw day (when 0031's draw-day card surfaces) and on the day of a fresh upload (the user just got new numbers; the receipt 0032 owns that moment). Asserted by setting the profile state to each of those moments.
- [ ] The card never shows more than 3 lines, even if many markers qualify. Asserted by seeding 8 out-of-optimum markers and confirming exactly 3 lines render, ranked by distance-to-threshold ascending.
- [ ] Markers with NO matching rule and NO tier-boundary involvement are EXCLUDED from selection, even if out-of-optimum — there is no threshold to name. Asserted by seeding an out-of-optimum marker that no rule references and confirming it never appears.
- [ ] User-defined markers (0002) are eligible if they have an `optimalRange` AND are referenced by a user-authored rule (0022 territory, if shipped); otherwise excluded. Asserted with a user-defined marker carrying a range and no rule, confirming exclusion.
- [ ] The card makes **zero Anthropic calls** and **zero network calls** — it is pure local compute over `MARKERS[]`, `RULES[]`, the latest panel, and the latest plan. Asserted by rendering Today and confirming the mock recorded zero requests for the card.
- [ ] The Anthropic key NEVER appears in any line, slideover, or intermediate string. Asserted by seeding a sentinel key.
- [ ] Renders on both **chromium and mobile-webkit**. The three lines wrap cleanly at the 390 px viewport; each line is a ≥ 44×44 css px tap target (min-height ≥ 45 px per the 0017 sub-pixel lesson); long consequence sentences respect `min-width: 0`.
- [ ] Tour mode (0014) surfaces a single representative watch line against the fixture's panel — the demo of what the card does for a prospect. Shared-view (0017) does NOT render the card (no real plan / panel context). Asserted in both modes.
- [ ] The existing Today flow — habit check-ins, meal cards, streak strip, recap / quiet-day / retest / draw-day cards, the catch-up grid (0058 once shipped) — is unchanged in behavior; the watch card is purely additive at the documented slot (below the daily ritual, above the meal plan, or wherever Today's existing between-draws cards sit). Asserted by exercising the existing Today flow.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is a local render; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the card is computed at render from existing panel + plan + rule definitions. Nothing new is persisted.
- [ ] New `tests/e2e/threshold-watch.spec.ts` covers: `computeThresholdWatch` selection + target + consequences, the card present with correct lines + arrow, the slideover content, absent on all-optimum, absent on no-plan, absent on draw day, absent on fresh-upload day, max-3 ranking by distance, no-rule exclusion, user-marker eligibility, zero Anthropic + zero network, the key never appears (sentinel), tour vs shared-view, the existing Today flow unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to author or paraphrase the consequence sentence. Every consequence comes from the rule's existing `RULE_GLOSSES` entry or the tier-boundary's curated label, used verbatim. No inference at render time.
- A push notification when a threshold "is within reach." No notifications. The card appears only when the app is opened.
- An editable target — letting the user set a custom number to aim for. The card names the engine's threshold; user-authored thresholds are a separate ticket if real demand emerges.
- More than 3 lines, or a configurable count. Three is the cognitive ceiling at 7am; the next thresholds are accessible via the simulator (0019) and the marker deep-dive (0059).
- A celebratory styling when a value gets close to the threshold (a glow, a pulse, an "almost there"). Calm ink. Provenance is the rhetoric.
- A trend-based "you'll cross this in 4 weeks" projection on the card. That is the projection card's job (0012). This card names the threshold; the projection names the band; they compose, they do not merge.
- Per-line action ("start the iron tier now") — the actions belong to the existing Plan; the watch card is a between-draws reference surface, not a re-plan button.
- Carrying the watch card into the doctor PDF, the share link, or the Markdown export. It is an in-app between-draws surface, not an export artifact.
- A what-if drag from the watch card. That is the simulator (0019). Tapping a line opens the rule slideover (read-only), not a drag.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/threshold-watch.ts` (new) — `computeThresholdWatch(latestPanel, plan, markers, rules, checkIns)`. Resolve markers via `findMarker()`. For each result in `latestPanel.results` whose value is outside the resolved marker's `optimalRange`, walk `rules` (the same `RULES[]` the insight engine uses) and the `plan.habitStack` tier boundaries (the tier-marker mapping the existing adherence-tier logic uses in `src/claude.ts` `formatAdherence`) to find every threshold value referenced for that marker. Pick the closest threshold to the current value in the direction toward optimum. Rank markers by absolute distance to the chosen threshold ascending; take top 3. For consequences, pull the rule's `RULE_GLOSSES` entry verbatim and the tier-boundary's curated label; do NOT compose new prose. Return `WatchLine[]`. Pure; no Dexie import.
- `src/insights.ts` — read-only. Re-use the existing `RULES[]` shape (and `runRules()` to know which are currently firing so the watch card prefers thresholds in active rules). If `runRules` is not pure enough to call from a Today render (it currently runs as part of plan compose), factor a small helper that returns the rule list with a `firing: boolean` per rule on the current panel — but keep it pure.
- `src/data/markers.ts` — read-only.
- `src/pages/today.ts` — read the latest panel + the latest plan + the current rule set, call `computeThresholdWatch`, render the "Watch list" card at the documented slot. The slot is whichever location the existing between-draws cards (recap, retest countdown, pre-draw primer, draw-day, catch-up grid) collectively occupy — document the chosen ordering. Wire the per-line tap to open the existing slideover primitive (the 0013 "Why this fired" slideover OR a sibling, depending on which is more reusable).
- `src/types.ts` — add `WatchLine` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — `.watch-list` (the card), `.watch-list__line` (each line), `.watch-list__arrow` (the literal "→"). Reuse the existing Today-card idioms (the quiet-day card 0015, the retest countdown 0028 are templates). Ink only on the consequence text; oxblood reserved for the target value, if at all (subtle). Grid children `min-width: 0`. Tap target ≥ 44×44 css px with the 0017 sub-pixel cushion.
- `src/sample/state.ts` — confirm the tour fixture's latest panel carries at least one out-of-optimum marker referenced by a rule, so the tour can demonstrate one watch line. Adjust fixture values if necessary (fixture data only).
- `src/share/shared-state.ts` — gate with the existing `isSharedView()` check; absent in shared-view.
- `tests/helpers/flows.ts` — reuse the existing seed helpers (`seedPanel`, `seedPlan`, `seedCheckIns` per the 0021/0058 patterns) to construct between-draws state without a real compose round-trip.
- `tests/e2e/threshold-watch.spec.ts` (new) — every acceptance bullet maps to a `test()`. The selection test seeds 8 out-of-optimum markers, asserts 3 lines, asserts ranking by distance. The slideover test taps a line and asserts the rule body content.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying a between-draws state, rendering the watch card, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: card eyebrow "Watch list." Lines read "Marker <currentValue> <unit> → <targetValue> <unit>: <consequence>." Slideover close line "This is the threshold in the rule; your next draw is the only ground truth." Declarative, no exclamation, no "great news" framing. Banned: "amazing," "exciting," "journey," "great," "almost there." Ink and ink-soft; oxblood reserved for the target value if used at all.

## Implementation log

(Appended by the implementation-dev agent during execution.)
