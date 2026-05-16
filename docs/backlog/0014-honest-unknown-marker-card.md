---
id: 0014
title: Honest "we don't have a curated opinion" card for unrecognized markers
status: proposed
priority: P2
area: plan
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a user whose lab report includes a marker Almanac doesn't carry a curated functional range for, I want the plan to say so explicitly — show me the value, the lab range, and a single honest sentence stating that we don't yet have a curated opinion on this marker — instead of silently dropping it from the plan or letting the LLM invent a range it doesn't actually know.

## Why now (four lenses)

### Product Owner
Today, unrecognized rows that the user doesn't define (0002) effectively disappear from the plan generation context. Worse, *recognized* markers that lack a `functional` range in the seed (or that fall under no rule and have nothing the LLM is grounded on) get rolled into the snapshot paragraph with whatever opinion the LLM happens to have. Both fail the editorial contract — silently ignoring data the user uploaded is a trust break, and inventing functional opinions we don't actually carry is a different trust break. The smallest meaningful unit of value is one new card type that fires for both cases and says, in our voice, what's actually true.

### Stakeholder
This deepens the moat through honest negative space. Every wellness app pretends to know everything; Almanac's editorial voice can credibly say "we don't know yet." That's a differentiator we can defend, and it pairs directly with the user-extensible markers feature (0002) and the functional-range DB (the core moat) — both of which exist precisely because we curate carefully rather than hallucinating.

### User (at 7am on the phone)
I uploaded a Quest panel that includes `Vitamin K1`. It shows up on the panel detail page, but my plan never mentions it. After this ticket, the plan's snapshot includes one quiet card near the bottom: `Markers we don't yet have a curated opinion on — Vitamin K1 (0.45 ng/mL, lab range 0.10–2.20). Within the lab's reference range. If you want this woven into the plan, define it under Settings → Your markers.` I tap the link, I define it once, the next compose includes it for real.

### Growth
This is the moment a Reddit / Twitter post writes itself: a screenshot of the "we don't yet have a curated opinion" card next to a screenshot of a competitor app confidently making up a functional range for the same marker. It's the kind of integrity moment that gets reposted in the privacy / honest-tech corner of the internet — exactly the audience the rest of our positioning targets. Hypothesis: a 5–10% uplift in user-extensible-marker definitions (measurable locally as `db.userMarkers.count()` over the cohort that has at least one panel) because the card surfaces the opportunity explicitly.

## Acceptance criteria

- [ ] `src/claude.ts` plan-generation prompt is updated so the system message (`PLAN_VOICE`) instructs the model: when a marker in the panel data has no `optimalRange` in the Marker Reference block (i.e. seed entry without functional range, OR no seed entry at all), the model MUST surface it under a new `unknownMarkers` array on the returned `Plan` JSON — one entry per marker, each with `{ markerKey, displayName, value, unit, labRange?, note }`. The `note` field is one sentence in the editorial voice acknowledging that Almanac does not yet carry a curated functional opinion on this marker.
- [ ] `src/types.ts` adds the optional field: `Plan.unknownMarkers?: UnknownMarker[]` with the shape above. Existing plans without the field keep working (optional everywhere).
- [ ] `src/pages/plan.ts` dashboard mode renders a new section (heading: `Markers we don't yet have a curated opinion on`) below the existing insights cluster, ONLY when `plan.unknownMarkers?.length > 0`. Each row shows: marker name, value with unit, "Within the lab's reference range" / "Below lab range" / "Above lab range" derived from `labRange`, and a quiet tap-target link: `Define this marker →` that routes to `#/labs?id=<latestPanelId>#define-<markerKey>` (we land on the panel detail's "Unrecognized rows" section if the marker is unrecognized, else on the marker row).
- [ ] Read mode of the plan renders the same content as a single editorial paragraph at the foot of the snapshot section, in the same prose voice: `Almanac doesn't yet carry a curated opinion on N marker${s}: <comma list>. <one-sentence honest note>.`
- [ ] When `plan.unknownMarkers` is empty or undefined, neither section renders — the existing plan layout is byte-identical.
- [ ] The card's copy is suppressed and replaced by a single line `(none — every marker in this panel has a curated opinion behind it.)` ONLY if the user explicitly opens a `details`-style "Show the curated coverage" disclosure on the page. Default state: hidden when the array is empty. (Avoid bragging at the user every render.)
- [ ] The Marker Reference block in the prompt explicitly labels markers without functional ranges as `(no functional opinion in catalog — surface as unknown)` so the model knows which side of the line they fall on.
- [ ] Plan-generation fixture (`tests/fixtures/plan.json`) is extended to include 1 entry in `unknownMarkers` for a known-but-uncovered marker (e.g. `vitamin_k1` if added to the seed without a functional range, OR a deliberately uncurated string used in the fixture only). New scenario in `tests/e2e/plan.spec.ts` asserts the card renders + the tap-target navigates correctly.
- [ ] Regression: composing a plan from a panel where every marker IS covered by the seed produces `unknownMarkers: []` (or undefined), and the new section does NOT render.
- [ ] Privacy E2E still passes.
- [ ] All scenarios pass on both chromium and mobile-webkit.

## Out of scope

- Auto-generating functional ranges from population data. We're explicitly choosing the editorial path: a marker either has a curated opinion or it doesn't, no inferred middle ground.
- Encouraging the user to submit their definition to a shared marker catalog. There is no catalog; we're local-first by contract. The "Define this marker" link routes to the existing per-device user-markers flow.
- Adding `unknownMarkers` to the meal-plan generator. Meals stay grounded in the eat list / avoid list / dietary pattern; the unknown markers are a plan-level artifact only.
- Rewriting the entire plan section ordering. The new section slots in near the existing insights cluster; the rest of the dashboard is untouched.

## Engineering notes

- `src/claude.ts` — extend the `PLAN_VOICE` system prompt and the JSON schema description inside it to include the `unknownMarkers` array. Add the labeling logic in `formatMarkerReference()` (or wherever the prompt builds the Marker Reference block) so the model can see which markers lack a curated functional opinion. Be careful with the cache-control boundaries — the labels live in the same cacheable prefix as the Marker Reference itself.
- `src/types.ts` — add the `UnknownMarker` interface and the optional `unknownMarkers` field on `Plan`. Mirror the same shape in the JSON schema described in the prompt voice.
- `src/pages/plan.ts` — in dashboard mode, add the new section renderer after the existing insights mapping. In read mode, append the editorial paragraph to the snapshot block. Reuse `findMarker()` for display names; fall back to `unknownMarker.displayName` for markers not in the seed.
- `tests/fixtures/plan.json` — add an `unknownMarkers` array with one or two entries; pick marker keys that exist in the seed but have no curated `optimalRange`, OR include a clearly-uncurated key the test asserts against.
- `tests/e2e/plan.spec.ts` — one describe block for the new section: presence when `unknownMarkers.length > 0`, absence when empty, tap-target navigation to the labs panel, read-mode prose variant.
- Schema migration: **no** — `unknownMarkers` is an optional field on existing `Plan` rows; old persisted plans render without the section.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

(empty — pick up via `/ship 0014`)
