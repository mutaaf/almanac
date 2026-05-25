---
id: 0060
title: Request this panel — the exact test names to bring to your next draw, formatted for a clinical conversation
status: proposed
priority: P1
area: labs
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a user with a composed plan whose protocol targets ferritin, ApoB, and fasting insulin, I want a one-tap "lab request card" that lists the exact test names my doctor or lab tech would recognize — organized by panel type (lipid, metabolic, thyroid, etc.) — so I can hand them that list at my next appointment instead of describing it from memory and getting a partial order.

## Why now (four lenses)

### Product Owner

The plan already knows which markers it's targeting: each eat-list item, habit, supplement, and lifestyle action carries `markerKeys[]` linking it to the markers it moves. The marker DB (`src/data/markers.ts`) carries the canonical clinical name and panel group for every tracked marker. The smallest unit of value is a "Request this panel" surface on the Plan page (or Labs) that collects the union of all `markerKeys` referenced in the current plan's actions, looks up their canonical names, groups them by the panel a clinical lab would recognize (Lipid Panel, Comprehensive Metabolic Panel, Complete Blood Count, Thyroid Panel, etc.), and renders a clean, copyable list. No LLM. No new inference. Zero new egress. It turns the plan's machine-readable marker graph into a human-readable clinical request in one tap.

### Stakeholder

This closes the most important open loop in the product: the user's protocol lives in Almanac, but the ORDER that turns protocol → progress still happens in a separate clinical conversation the app can't see. By making the lab request something the app generates, Almanac inserts itself into the draw workflow — not as a backend participant, but as the trusted source of "what to ask for." That makes the draw-recompose-improve loop Almanac's loop, not just Almanac's read. It deepens the moat at the clinical handoff seam: a chat box can tell you what ferritin is; only a structured-plan app with a per-marker action graph can tell you which tests to order next time, named correctly for a clinical workflow, because it is reading from YOUR plan's marker actions rather than generic health advice.

### User (at 7am on the phone)

I have a GP appointment in three days and I want to finally get the right labs ordered. I go to the Plan page, tap "Request this panel," and a clean card appears: "Lipid Panel: Total cholesterol, LDL-P, HDL, Triglycerides, ApoB. Iron studies: Ferritin, serum iron, TIBC. Thyroid: TSH, Free T3, Free T4." I copy it, paste it into a note, show it to my doctor. Done. The list came from my plan — it knows exactly what it's trying to move. No Googling, no guessing from memory, no "your TSH looks fine, we didn't check T3."

### Growth

The lab request card is one of the clearest "show me" moments the product has because it is concrete clinical action, not health content. Showing a friend "here's the exact lab panel my app says I need" is more convincing than showing them a protocol — it connects the app to the real-world event (the draw) in a way that's easy to photograph and explain. (Hypothesis: surfacing a clinical-vocabulary lab request list, generated from the user's specific plan actions, raises the share rate among users who have active protocols with lab targets, because it collapses "what do I ask for?" from a multi-step search into one screenshot; treat as untested without remote analytics, which we will never add.) It also deepens doctor-channel acquisition: a patient who hands a GP a well-organized panel request drawn from a privacy-first app is a warm referral to every other privacy-curious patient in that waiting room.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A `buildLabRequest(plan: Plan, markers: MarkerDef[]): LabRequestGroup[]` pure function (new file `src/plan/lab-request.ts`) returns the union of all `markerKeys` referenced in `plan.eatList`, `plan.habitStack.habits`, `plan.supplements`, and `plan.lifestyle`, resolved to their `MarkerDef` canonical names and grouped by a `panelGroup` property on `MarkerDef` (see engineering notes). Asserted by passing a known plan with actions targeting 3 markers across 2 panel groups and confirming the output groups and names. Pure: no DOM, no Dexie, no network.
- [ ] A "Request this panel" affordance (button or link) appears on the Plan page when a composed plan exists. Asserted by composing a plan and confirming the affordance renders.
- [ ] Tapping the affordance renders the lab request card as a formatted text block showing each group name as a heading and each marker's canonical clinical name as a list item. Asserted by opening the card and confirming the group headings and the canonical names for the markers targeted by the seeded plan.
- [ ] The "copy to clipboard" action on the card writes the formatted request text (group headers + marker names) to the clipboard. Asserted by triggering copy and reading `navigator.clipboard.readText()` and confirming it matches the rendered text.
- [ ] The card makes **zero Anthropic calls** and **zero network calls** — it is a pure render over `MARKERS[]` and the local plan. Asserted by opening the card and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere.
- [ ] When the plan has no actions with `markerKeys`, the affordance either does not render or renders an empty-state note ("No marker targets in this plan yet"). Asserted by seeding a plan with no `markerKeys` on any action.
- [ ] Renders correctly on both **chromium and mobile-webkit** (390 px viewport): the card scrolls if the list is long; all text respects `min-width: 0` in grid children; copy affordance is a ≥44×44 css px tap target (min-height ≥45 px per the sub-pixel rounding lesson). Asserted on both projects.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — no new hostnames.
- [ ] Schema migration: **no** — reads the existing plan from Dexie, no new persistent state.
- [ ] New `tests/e2e/lab-request.spec.ts` covers: the pure-function assembly, the affordance renders, the card renders with correct groups and canonical names, the copy-to-clipboard result, zero Anthropic/network, key-sentinel check, empty-plan state, and mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- Sending the request anywhere (email, fax, EHR API). The card is copy/share-to-clipboard only.
- Suggesting ADDITIONAL tests the plan doesn't already target. The request card is purely the markers the current plan already knows it needs to move — no new inference, no "you should also check."
- Grouping by lab vendor (Quest vs LabCorp vs hospital). The grouping is by panel type (Lipid, Metabolic, etc.), the vocabulary a GP uses when ordering, not vendor-specific codes.
- LOINC codes, CPT codes, or insurance billing information. Plain English test names only.
- A structured form the user fills in. The card is generated from the plan, not user-authored.
- Persisting the request or emailing it. Copy/Web Share only.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- Add an optional `panelGroup?: string` field to `MarkerDef` in `src/types.ts` (the type the marker DB uses). Populate it for the high-traffic markers in `src/data/markers.ts` (e.g. `"Lipid Panel"` for ApoB/LDL-P/HDL/triglycerides, `"Iron Studies"` for ferritin/serum iron/TIBC, `"Complete Metabolic Panel"` for glucose/BMP markers, `"Thyroid Panel"` for TSH/T3/T4, etc.). Markers without `panelGroup` go into a catch-all `"Other"` group. Additive to the type; existing markers without the field render fine with `?? "Other"`.
- `src/plan/lab-request.ts` (new): `buildLabRequest(plan, markers)` — collect all `markerKeys` from `plan.eatList`, `plan.habitStack.habits` (if they carry `markerKeys`), `plan.supplements`, and `plan.lifestyle` (grep `src/types.ts` for the exact field shapes; the existing `what-if-simulator.spec.ts` seeds a plan with `markerKeys` arrays and is a good model). Resolve each key to a `MarkerDef` via `findMarker()`. Group by `def.panelGroup ?? "Other"`. Sort groups alphabetically, markers within group alphabetically. Return `LabRequestGroup[]` = `{ groupName: string; markers: { key: string; displayName: string; unit: string }[] }[]`.
- `src/pages/plan.ts` — add the affordance in the dashboard view. The button fires a slide-up or inline card rendering `buildLabRequest(plan, getAllMarkers())`. Copy affordance calls `navigator.clipboard.writeText(formattedText)` where `formattedText` is the groups rendered as `\n## GroupName\n- MarkerName (Unit)\n...`. Fallback for clipboard API unavailability: show a selectable `<pre>` block.
- `src/styles.css` — `.lab-request` (the card), `.lab-request__group` (each panel group section). Reuse the existing card idioms (the egress receipt card 0025 is a template). Ink and ink-soft only; no new colors. Copy button: min-height 45px, box-sizing: border-box.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice: the affordance label reads "Request this panel"; the card eyebrow reads "Lab request"; the copy button reads "Copy"; groups use clinical vocabulary ("Lipid Panel", not "Fat markers"). Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great."

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
