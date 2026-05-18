---
id: 0016
title: Provenance appendix on the doctor PDF — auditable rule trail in the clinical hand-off
status: proposed
priority: P2
area: plan
created: 2026-05-18
owner: gtm-innovation
---

## User story

As a user about to walk into a 20-minute appointment with a physician I want to actually persuade, I want the doctor-variant PDF (from ticket 0010) to include a short appendix per insight that fired from the deterministic rule engine — naming the rule, the markers that triggered it, their values + draw dates, and the rule's evidence string verbatim — so the clinician can audit the reasoning behind every insight on the protocol the same way they'd audit a colleague's note, instead of having to take "Almanac says so" on faith.

## Why now (four lenses)

### Product Owner

Ticket 0013 shipped the in-app provenance slideover: tap "Why this fired" on any rule-emitted insight and read the rule id, the supporting markers with their values + units + draw dates, the evidence string, and the editorial gloss. That solved the in-app trust problem. The doctor PDF (ticket 0010) shipped before 0013 did and still reads as "Almanac found these patterns" with no machinery shown. The smallest meaningful unit of value is one new section in the doctor PDF — *"Rule provenance"* — that renders the same `provenance` data the in-app slideover renders, formatted for paper: one row per rule-emitted insight, with the rule id in monospace, the supporting markers as a short table, the evidence string, and the editorial gloss. The friend-variant PDF stays unchanged (the friend doesn't need the rule trail). Everything we need is already on the persisted `Plan.insights[].provenance` field; we are surfacing existing data in a new template branch. Zero new prompt, zero new schema, zero new dependency.

### Stakeholder

The doctor PDF is, structurally, the highest-LTV acquisition vector we have access to — a physician who reads a clean editorial protocol with functional ranges noted will ask the patient where it came from, and that patient becomes one of our best signal events. Today the doctor PDF is editorial and structured, but it is not *auditable* in the way a clinician reads things. Provenance on paper is the move from "structured artifact" to "structured + auditable artifact" — the same shape the in-app provenance slideover gave us, in the channel where audit-ability has the highest payoff. It widens the **programmatic insight engine** moat into a third surface (the appendix on the printed page) on top of the two surfaces it already covers (the prompt and the slideover). And it does so with a single template branch — the discipline that 0013 invested in (every rule has a `RULE_GLOSSES` entry, the typecheck enforces it) pays out a second time here for free.

### User (at 7am on the phone)

I'm about to send my doctor the PDF before our appointment. I tap "Print or share," choose "For my doctor," tap Generate. The PDF that comes out is the same as today, *plus* a final appendix page titled "Rule provenance." For each insight that fired from a rule, there's a small block: the rule id ("iron_restricted_erythropoiesis · pattern"), a tiny table of supporting markers ("ferritin · 32 ng/mL · drawn 2026-03-04 · functional floor 50"), the evidence string ("ferritin 32 ng/mL · MCV 86 fL"), a one-paragraph gloss in the editorial voice, and the closing line "This finding was produced by a deterministic rule, not by the language model." If the plan has no rule-emitted insights (all LLM-only), the appendix section is omitted — no empty heading. I email the PDF to my doctor. She reads it. She doesn't have to ask what produced any individual finding.

### Growth

The growth lens here is narrower than tickets 0014 or 0015 — this is a clinical-channel ticket. The right physician audience (functional medicine, preventive cardiology, primary care + nutrition) is small but high-converting. A PDF that reads as audit-able rather than as AI-generated is the single most differentiating asset Almanac can put in front of that audience. It compounds with every future rule we add — every new entry in `RULES[]` automatically gets a provenance row in the appendix, same way every new rule gets a slideover for free in 0013. No marketing surface, no new copy, no extra UI; the appendix is the marketing surface.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/print/template.ts` — `renderForDoctor()` gains a new "Rule provenance" section appended after the existing retest schedule and panels summary. The section renders only when at least one insight in `plan.insights` has a `provenance` field; if no insight does, the section is fully omitted (not rendered empty).
- [ ] For each rule-emitted insight, the appendix renders:
  - the insight title (matching the title used in the body of the PDF),
  - a small monospace tag with `provenance.ruleId · provenance.category` (e.g. `iron_restricted_erythropoiesis · pattern`),
  - a table of supporting markers with columns "Marker", "Value", "Unit", "Drawn", "Threshold" (the threshold column is the optional `threshold` field on each row, rendered as a dash when undefined),
  - the `provenance.evidence` string verbatim,
  - the editorial gloss paragraph from `glossForRule(provenance.ruleId)` (the helper already exists, ticket 0013),
  - the closing line "This finding was produced by a deterministic rule, not by the language model." (verbatim).
- [ ] LLM-only insights (those without `provenance`) do NOT appear in the appendix. The appendix is for deterministic findings only — the same discipline 0013 enforced in-app applies on paper.
- [ ] The friend-variant PDF (`renderForFriend()`) is **unchanged** by this ticket. Asserted by snapshot-comparing the friend HTML against a known fixture pre-and-post the change; the byte-equal assertion catches accidental leakage of the provenance machinery into the friend channel.
- [ ] The doctor-variant PDF still passes every assertion from ticket 0010's `tests/e2e/print.spec.ts`: the API key never appears in the printed DOM, the file naming pattern is unchanged, the `PrintProfile` type still only carries `ownerName`, and goals / conditions / household / meal plan are still excluded from the doctor variant.
- [ ] When the active plan has no rule-emitted insights (every insight is LLM-only), the doctor PDF renders without the appendix section AND without a "Rule provenance" heading. A plan fixture with `provenance` stripped is used for this test.
- [ ] When the active plan has multiple rule-emitted insights of mixed `category` ("pattern" and "trend"), the appendix renders both in the order they appear in `plan.insights[]` — the appendix preserves insight ordering rather than imposing its own.
- [ ] Generation runs entirely on-device — zero new network requests. Asserted via the mock's request count over the full generate flow.
- [ ] Privacy E2E still passes — no new hostnames; the appendix data never leaves the device (the PDF is built in the same `mountAndPrint` flow ticket 0010 established).
- [ ] Renders on both **chromium and mobile-webkit**. The PDF generation path is asserted on chromium only (same scope as ticket 0010); mobile asserts the doctor toggle and the share button are wired.
- [ ] `tests/e2e/print.spec.ts` is extended (not replaced) with new scenarios covering: appendix renders for rule-emitted insights, appendix omitted for LLM-only plans, friend PDF byte-unchanged, rule id + category monospace tag present, supporting-marker table columns present, gloss + closing-line present.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A provenance appendix on the friend-variant PDF. The friend doesn't need the rule trail; provenance on the social channel is editorial dead weight and would dilute the friend variant's one-page discipline.
- Linking the rule's evidence to literature citations on the PDF. Citations live in `src/insights.ts` as comments next to the rule definitions; the gloss paragraph is the user-facing prose. This is the same discipline 0013 established for the in-app slideover.
- Adding the trend-rule projection bands (from ticket 0012) to the appendix. The appendix is about *why a rule fired*, not about *what is projected*. The projection module has its own surface (`#/progress`) and its own share artifact.
- Re-ordering the existing doctor-PDF sections to put the appendix earlier. The appendix follows the protocol because clinicians read the protocol first and consult the appendix second — the same way they read a medical chart's body before its lab tables.
- A per-rule "include / exclude" toggle in the doctor-PDF panel. The audience toggle (doctor vs friend) is the only customization; per-rule muting would defeat audit-ability.
- Adding a provenance section to a future "Full export PDF" (multi-page). That belongs to whichever ticket eventually proposes the full export, not to this one.
- Generating an editorial summary of the appendix ("here are the patterns we found"). The body of the PDF already names the patterns; the appendix is the audit trail, not a second narrative.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/print/template.ts` — `renderForDoctor()` is the only function that changes. Add a new private helper `renderProvenanceAppendix(plan: Plan): string` that filters `plan.insights` to entries with a `provenance` field and renders the section described in the acceptance bullets. Return empty string when the filtered list is empty so the caller can append unconditionally. Re-use `esc()` for every string. Pull the gloss from `glossForRule()` (already exported from `src/insights.ts`, ticket 0013). The closing line is a string constant inside the helper.
- `src/print/protocol.ts` — no change needed. The orchestrator already passes the live `Plan` into the doctor-variant renderer; provenance arrives along with it.
- `src/styles.css` — add `.print-sheet .provenance-appendix`, `.provenance-appendix__rule-id` (monospace), `.provenance-appendix__markers` (a small `<table>`), `.provenance-appendix__gloss`, `.provenance-appendix__footer`. All inside the existing `@media print` block — these styles only apply to the printed page, never to the live app. No new color tokens; re-use the existing oxblood / ink / cream tokens that the rest of the print sheet uses.
- `src/print/template.ts` — the supporting-marker table renders one `<tr>` per `provenance.supportingMarkers[]` entry. Don't over-engineer — the table can be a plain HTML `<table>` with hairline borders matching the rest of the print sheet's structure. Five columns ("Marker", "Value", "Unit", "Drawn", "Threshold"), the last one rendering "—" when undefined.
- `tests/fixtures/` — re-use `tests/fixtures/plan-with-provenance.json` from ticket 0013. The doctor-PDF test loads this fixture via the existing `composePlan` flow with the mock pointed at this fixture, then drives the print flow.
- `tests/e2e/print.spec.ts` — extend the existing spec. The pattern is established: render the print sheet to the DOM, query for `.provenance-appendix`, assert the per-rule blocks, assert the friend variant is byte-unchanged (snapshot via `innerHTML` of the friend `.print-sheet`).
- Schema migration: **no** — additive use of an existing optional field on a stored object.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for any new copy: the section heading is "Rule provenance" (small caps, matching the rest of the doctor PDF's section eyebrows). The closing line per rule is the verbatim sentence from 0013: "This finding was produced by a deterministic rule, not by the language model." No new prose; the appendix is data and gloss, not narrative.

## Implementation log

(Appended by the implementation-dev agent during execution.)
