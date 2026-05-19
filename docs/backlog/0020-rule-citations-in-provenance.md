---
id: 0020
title: Rule citations on the provenance slideover and the doctor PDF appendix
status: proposed
priority: P2
area: plan
created: 2026-05-19
owner: gtm-innovation
---

## User story

As a clinician or technically literate user reading an insight on `#/plan` (or its doctor-PDF appendix) — looking at "iron-restricted erythropoiesis pattern · ferritin 32 ng/mL · MCV 86 fL" and the editorial gloss paragraph — I want a small Citations block at the bottom of the provenance slideover (and the matching appendix row in the doctor PDF) that lists 1–3 named literature anchors for the rule, in a clean editorial format ("Beard JL, 2001 · iron-deficient erythropoiesis"), so I can audit the rule's *origin* the same way I already audit its *firing* — and so the clinical-channel hand-off carries the literature trail along with the rule-engine trail.

## Why now (four lenses)

### Product Owner

Ticket 0013 shipped the in-app provenance slideover and ticket 0016 is in-progress on the doctor-PDF provenance appendix. Both surfaces show *what* fired and *why* — the rule id, the supporting markers, the evidence string, the editorial gloss. Neither surface shows *where the rule came from*. The literature anchors already exist as comments adjacent to the rule definitions in `src/insights.ts` and `src/data/markers.ts` (e.g. "Beard 2001", "Mensink 2003", "Esposito 2004") — they're in the codebase as documentation but they don't reach the user. The smallest meaningful unit of value here is a `RULE_CITATIONS` map adjacent to `RULE_GLOSSES`, keyed by the same `RuleId` type with the same `satisfies` enforcement so every rule must declare 1–3 citations, and a small Citations block rendered at the bottom of both the in-app slideover and the doctor-PDF appendix row. Format: short author + year + a five-word description, NOT a full citation (we are not a journal). One block, two surfaces, one map.

### Stakeholder

This is the clinical-credibility moat-deepener. The insight engine is already the differentiator (six pattern rules + four trend rules, every one curated). The provenance slideover (0013) and the PDF appendix (0016) make the engine *auditable*. What's missing is the literature *anchor* — the surface that makes a clinician reading the doctor PDF think "OK, this isn't just a chatbot taking a guess; the rule has a name and the rule has a source." Citations are the property that turns audit-ability into *citability* — the difference between "Almanac says so" and "Almanac says so, and here is where Almanac learned that." In the clinical channel, which is the highest-LTV channel we have access to, the citation block is the cheapest single signal of editorial seriousness. It compounds with every rule we add (ticket 0017 ships two new cross-domain rules; both inherit the citation block on Day 1). It also compounds with the doctor PDF appendix (0016) — the appendix becomes the single editorial artifact that carries (a) the rule id, (b) the supporting markers with values + dates, (c) the evidence string, (d) the editorial gloss, AND (e) the literature anchors — which is the four-layer hand-off a clinician would expect from a colleague's note.

### User (at 7am on the phone)

I'm on `#/plan`. I tap "Why this fired" on the iron-restricted erythropoiesis insight. The slideover slides up the same way it does today. At the top, the rule id and the supporting-marker table. The editorial gloss. The closing footer ("This finding was produced by a deterministic rule, not by the language model."). Now, below the footer, a new section: **Citations.** A small list of 2–3 anchored references in a hairline-bordered block. For iron-restricted erythropoiesis: "Beard JL, 2001 · iron-deficient erythropoiesis"; "Cook JD, 1990 · iron absorption windows." Each line is plain text in the ink token — not a hyperlink (we don't link out from inside the editorial surface to external journal sites; the citation is the anchor, not the click-target). I close the slideover. Later that week I generate the doctor PDF. The same rule's appendix row now ends with the same Citations block, hairline-bordered, monospace name + year + descriptor.

### Growth

This is a moat-deepener, not an acquisition lever — but it is the moat-deepener that unlocks the clinical-channel acquisition lever that 0016 already set up. The doctor PDF with the provenance appendix is the artifact a patient hands a physician; the same PDF with citations on every rule row is the artifact a physician *circulates*. We are talking about an audience of perhaps 5,000–15,000 functional-medicine, preventive-cardiology, and integrative-primary-care clinicians in North America — a small absolute number, but the cohort with the highest per-user LTV in the entire category (each clinician who reads a single Almanac PDF is likely to mention the tool to several of their own patients). Citations are the editorial property that turns "this looks serious" into "this is something I would share with a colleague." Hypothesis: citations on rule provenance is the single feature most likely to be screenshotted by a precision-health-adjacent professional account on Twitter / Substack — back-of-envelope from comparable patterns in the open-source clinical-decision-support category (UpToDate, MDCalc). Treat as untested until we see whether anyone outside the immediate friend network screenshots a doctor PDF.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/insights.ts` — add a `RULE_CITATIONS` map adjacent to `RULE_GLOSSES`, keyed by the same `RuleId` type with the same `satisfies Record<RuleId, ReadonlyArray<Citation>>` clause so the typecheck breaks if any rule (existing or future) lacks 1–3 citations. `Citation` type is `{ author: string; year: number; descriptor: string }` where `author` is "Last AB" (one or two authors max, no "et al." — too imprecise), `year` is a four-digit number, and `descriptor` is a five-to-eight-word phrase that anchors *what about the source* the rule depends on (e.g. "iron-deficient erythropoiesis", "soluble fiber & ApoB lowering").
- [ ] Every existing rule from `RULES[]` and `TREND_RULES[]` (six + four = ten today) has a `RULE_CITATIONS` entry with at least one citation. Specifically:
  - `iron_restricted_erythropoiesis`: Beard JL 2001 (iron-deficient erythropoiesis), Cook JD 1990 (iron absorption windows).
  - `subclinical_hypothyroid`: Surks MI 2004 (subclinical thyroid disease).
  - `insulin_resistance`: DeFronzo RA 2009 (insulin resistance pathogenesis).
  - `atherogenic_dyslipidemia`: Mensink RP 2003 (saturated fat lipid meta-analysis), Sniderman AD 2019 (ApoB vs LDL particle count).
  - `b12_folate_insufficiency`: Carmel R 2008 (B12 deficiency clinical patterns), Allen LH 2009 (folate status assessment).
  - `inflammation_triad`: Esposito K 2004 (Mediterranean diet & CRP), Calder PC 2013 (omega-3 inflammation).
  - `persistent_high_total_chol`: Mensink RP 2003 (saturated fat lipid meta-analysis).
  - `persistent_high_ldl`: Sniderman AD 2019 (ApoB vs LDL particle count).
  - `trending_down_ferritin`: Beard JL 2001 (iron-deficient erythropoiesis).
  - `trending_up_a1c`: Selvin E 2010 (HbA1c trajectory & metabolic risk).
- [ ] `src/insights.ts` exports `citationsForRule(ruleId: string): ReadonlyArray<Citation>` — returns `[]` for unknown rule ids (the runtime fallback, mirroring `glossForRule`'s pattern); the typecheck prevents this case for any rule in the curated library.
- [ ] On the in-app provenance slideover (`src/pages/plan.ts`), beneath the existing "This finding was produced by a deterministic rule, not by the language model." footer, a new `<section class="provenance-citations">` renders when `citationsForRule(provenance.ruleId).length > 0`. The section is omitted entirely when the rule has no citations (which shouldn't happen for any curated rule, but is the right fallback for an old persisted plan with a since-removed rule id). Layout: a small caps heading "Citations", then a hairline-bordered block with one `<li>` per citation in the format `<strong>{author}, {year}</strong> · {descriptor}`. No external links — the descriptor is the anchor, not a click-target.
- [ ] On the doctor-PDF provenance appendix (`src/print/template.ts`, once ticket 0016 has shipped), each appendix row gains the same Citations block at the bottom — same format, same hairline border, same one-line-per-citation layout. The friend-variant PDF is unchanged by this ticket (citations are clinical metadata, not friend-share content).
- [ ] The in-app slideover's accessibility is preserved: the citation block is reachable via keyboard tab order, the heading is a real `<h3>` inside the slideover's existing landmark structure, and screen readers announce "Citations" before the list. No `aria-hidden` on the block.
- [ ] When the active plan's insights include an LLM-only entry (no `provenance`), the chip from 0013 is still absent and no citations render — citations are inherited from the rule id, and LLM-only insights have no rule id. The empty-state discipline mirrors what 0013 + 0016 already enforce.
- [ ] Zero new Anthropic calls — the citations are local data. Asserted against the mock's request count over a full slideover-open flow.
- [ ] Privacy E2E still passes — no new hostnames; the citation block does not link out; no external font or resource is loaded for it.
- [ ] Renders on both **chromium and mobile-webkit**. On mobile the citation block reflows into a single column inside the existing slideover layout. Mobile assertion is "the Citations heading is visible, at least one citation row is visible, the block is below the closing footer."
- [ ] New `tests/e2e/citations.spec.ts` covers: citation block renders for a rule-fired insight; the block is omitted for an LLM-only insight; the block lists every citation declared for the rule; the doctor-PDF appendix row carries the same citations (asserted once ticket 0016 has shipped; if 0016 has not yet shipped, this acceptance line is deferred and the test is added once 0016 lands — note in the implementation log); the friend-variant PDF is byte-unchanged (snapshot comparison); typecheck breaks if a rule lacks a citation (asserted via a deliberate failing-build test gated by an env flag, OR via a unit-style test that imports `RULE_CITATIONS` and confirms every `RuleId` has an entry — the latter is simpler).

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Hyperlinks to journal pages (PubMed, DOI, the journal site). External links break the no-egress posture; even a `target="_blank"` link sitting in the DOM is a request the user can fire. The descriptor IS the anchor.
- A separate "Citations" page that lists every rule + every citation in one place. The block is per-rule, in context. A standalone reference page would dilute the editorial moment.
- Citation count balancing across rules ("every rule must have exactly two citations"). One is enough when one is enough; three is the soft ceiling so the block stays a paragraph, not a bibliography.
- Per-rule descriptions of the citation's *findings* ("this paper found that ferritin sub-50 is the threshold below which red-cell indices begin to suffer"). The five-to-eight-word descriptor is the anchor; the full reading is the user's responsibility. Editorial restraint.
- BibTeX / RIS / EndNote export of the citations. The artifact is the in-app block and the PDF appendix; structured export is a future ticket if asked for.
- Citations on `EatItem` / `AvoidItem` / `Recommendation` entries (the editorial protocol body). Citations on the rule provenance is a contained surface; pushing citations into every food item would push the editorial voice toward a journal article, which is the opposite of what the product is.
- A "request a citation" button or a Github-issue link. The curated citation list is version-controlled in the codebase; if a user disagrees with a citation or wants one added, the right answer is a PR, not in-app UI.
- Citations on the recap card, the quiet card, the milestone card, or any of the editorial surfaces. Those are non-clinical and don't share the citation discipline.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/insights.ts` — add the `Citation` type, the `RULE_CITATIONS` map, and the `citationsForRule()` export. Put `RULE_CITATIONS` immediately below `RULE_GLOSSES` so a curator can read the gloss and the citations side by side. The `satisfies Record<RuleId, ReadonlyArray<Citation>>` clause is what enforces coverage at compile time. A minimum-length check at the type level (every entry must have at least 1 citation) is hard to express in pure TS; instead, add a `const __ASSERT_NONEMPTY = (Object.values(RULE_CITATIONS) as Array<ReadonlyArray<Citation>>).every(c => c.length >= 1);` style runtime guard that throws at module load if violated. This catches missing citations at import time rather than at first slideover render.
- `src/pages/plan.ts` — `renderProvenanceSlideover()` (added by 0013) gains a trailing `${citationsBlock(provenance.ruleId)}` call. The block is a small string template that renders the heading + the list; returns empty string when `citationsForRule(ruleId).length === 0`.
- `src/print/template.ts` — once 0016 has shipped, the `renderProvenanceAppendix()` helper grows a `${citationsBlock(...)}` per row. Re-use the same `citationsBlock()` helper or extract it into `src/insights.ts` as a tiny presentational helper (`renderCitationsList(ruleId: string): string` returning the inner HTML). Putting it in `src/insights.ts` keeps the two surfaces (in-app slideover, PDF appendix) using the same renderer.
- `src/styles.css` — add `.provenance-citations` (the in-app block) inside the existing `.provenance-slideover` cascade. Add `.print-sheet .provenance-citations` inside the `@media print` block for the PDF variant. No new color tokens; re-use ink + rule + paper.
- `tests/fixtures/plan-with-provenance.json` — already exists from 0013. No change needed; the citations are derived from the rule id, which the fixture already carries.
- `tests/e2e/citations.spec.ts` (new) — every acceptance bullet maps to a `test()`. Re-use `composePlan` + the 0013 fixture; assert the block renders, assert it's absent on LLM-only insights, assert every citation line is present.
- `tests/e2e/provenance.spec.ts` — extend with one regression scenario that asserts the existing slideover tests still pass with the new citations block appended below the footer.
- `tests/e2e/print.spec.ts` — once 0016 has shipped, extend with one scenario that asserts the appendix rows carry the citation block. If 0016 has not yet shipped, the dev notes this in the implementation log and the test lands in a follow-up.
- Schema migration: **no** — additive use of curated maps; no persisted shape changes.
- Egress allow-list change: **no**.
- New deps: **no**.
- Voice spec for the descriptors: factual, five-to-eight words, no marketing tone, no value judgments. The samples in the acceptance bullets are the calibration bar. Author format is "Last AB" (initials, no periods between letters, no "et al.").

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0020-rule-citations` opened
- YYYY-MM-DD — failing tests added in `tests/e2e/citations.spec.ts`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
