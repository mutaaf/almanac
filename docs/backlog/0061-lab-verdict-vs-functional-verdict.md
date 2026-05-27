---
id: 0061
title: The lab said "normal," we see something else — capture the lab's verbatim verdict per result and render the disagreement, row by row
status: groomed
priority: P1
area: labs
created: 2026-05-27
owner: gtm-innovation
---

## User story

As the person Almanac was built for — handed a lab report whose every row says "Normal" while four of those markers sit below the functional optimum — I want each result row to carry the lab's own verbatim verdict ("Normal", "H", "Optimal", "Out of range") alongside Almanac's functional verdict, so that when the two disagree, the row says so out loud ("Your lab marked this Normal. Below the functional optimum") — instead of the lab's reassuring word being silently dropped at extraction and my only signal of the gap being a colored chip with no provenance.

## Why now (four lenses)

### Product Owner

The wedge is "the lab said normal and I'm not" — and yet the product currently discards the very word the lab printed. Extraction reads a PDF that contains, per row, both a value and a lab-assigned verdict (the word "Normal" / a single-letter "H" / "WNL" / "Optimal" / "Out of range" / a reference-range chip), but only the numeric value and the lab range survive into `Result`. Almanac then computes its own `flag` against the functional optimum, and the row shows our flag — but the user can't see *what the lab said* and so can't see *that we disagree*. The smallest meaningful unit of value is one new optional field on `Result` — `labVerdict?: string` — populated by extraction from whatever the report printed verbatim, and rendered next to Almanac's flag on every result row with a single line of editorial copy when the two disagree ("Your lab marked this Normal. Below the functional optimum.") and a single calm line when they agree ("Your lab and Almanac agree this is normal."). It is the README thesis operationalized at the row level: the gap between "normal" and "optimal" stops being inferable and becomes printed. One field, one render branch, three sentences of curated copy mapping each (`labVerdict` × `almanacFlag`) pair to its declarative line.

### Stakeholder

This is one of the highest-leverage **moat** moves available to a product whose whole pitch is "your labs say normal but they're not." A chat box pasted with a lab PDF can hallucinate the verdict, but it cannot truthfully say "your lab printed the word 'Normal' next to this; I disagree on the following basis" — it has no extracted verbatim verdict to quote, no canonical functional optimum to compare against, and no per-row diff to render. Almanac's extraction pipeline + functional-range DB already hold both halves; this ticket completes the diff. It deepens the **structured artifact** moat (every result becomes a two-sided receipt — lab verdict + Almanac verdict, side by side, queryable through the timeline forever), and it strengthens the honesty posture the product trades on (we don't paraphrase the lab away, we quote it). It also compounds 0036's report-card moment (shipped — "7 of your markers are normal but below optimal"): the count is at the top, the disagreement is now legible on every row that contributes to it.

### User (at 7am on the phone)

I've just uploaded my panel. I scroll the results. Ferritin reads 28. To the right, two small marks: "Lab: Normal" (the word the report printed, faithfully), and "Almanac: below optimum" (our flag). Underneath, one calm line: "Your lab marked this Normal. Below the functional optimum (50–150 ng/mL)." It is the same disagreement my body has been telling me about for two years, now printed on the row of my own blood, with provenance. Next row, ApoB 92: "Lab: Normal. Almanac: above optimum." Next row, fasting insulin 4: "Your lab and Almanac agree this is normal." No glow, no alarm. Just the two verdicts side by side, in the same calm type the rest of the page uses. I tap nothing; it's already there. It worked offline because the lab's word came out of the same extraction pass that read the values, and the comparison is local arithmetic over the curated optimum.

### Growth

This is moat-deepening retention, with a real "show me." (Hypothesis: per-row "lab said X, we see Y" provenance materially raises the rate at which a user forwards their panel to a friend with similar "everything's normal" complaints, because the friend reads the row as a direct response to the same authority that dismissed them; back-of-envelope from how attributed disagreement outperforms unsourced reframing for the persona; treat as untested without remote analytics, which we will never add.) The "show me" frame is a screenshot of three consecutive result rows whose "Lab: Normal / Almanac: below optimum" lines stack on top of each other — exactly the visual proof of "everything's normal but it's not" that the persona has been trying to articulate. It is the row-level sibling of 0036 (the report-card count is the headline; this is the per-marker provenance behind the headline), and it composes with 0011/0047 (share cards can quote the lab's word verbatim, not paraphrase it). It widens the moat the product already advertises — the lab's own language, captured and reconciled, is something only a structured extraction + functional-range product can produce.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/types.ts` gains an optional `labVerdict?: string` on `Result` — the verbatim string the lab printed in its "Status" / "Flag" / "Reference" column for that row, capped at 24 chars (truncate at extraction time if longer), stored as-given (case-preserved). Additive; existing rows load with `labVerdict === undefined`. Asserted by a type-level test (Playwright `evaluate` reading a seeded row's field).
- [ ] `src/extractor.ts` extraction prompt (the one in `EXTRACTION_PROMPT` for both PDF/image and the text path used by 0046) is extended to ask the model to capture the lab's verbatim verdict per row when present (the word in the "Status" / "Flag" column or the inline "H" / "L" / "WNL" / "Normal" / "Optimal" / "Abnormal" marker), and to return it as `labVerdict` on each result. When the lab printed nothing, the field is omitted (NOT a manufactured "—" or "Normal"). Asserted by extending the existing extraction fixture (`tests/fixtures/extraction.json`) with rows carrying explicit `labVerdict` strings AND rows omitting it, then running an extraction flow and confirming the persisted `Result` rows match.
- [ ] `src/labs/verdict-diff.ts` (new) exports `compareVerdicts(result: Result, marker: MarkerDef | undefined): VerdictDiff` returning one of: `{ kind: "agree-normal" }`, `{ kind: "agree-out" }`, `{ kind: "disagree-lab-normal-functional-low" }`, `{ kind: "disagree-lab-normal-functional-high" }`, `{ kind: "disagree-lab-out-functional-normal" }`, `{ kind: "no-lab-verdict" }`, or `{ kind: "no-functional-range" }`. The diff is computed by normalising the lab's verbatim string to one of three buckets — `lab-normal` (matches /normal|wnl|optimal|in range/i and no abnormal markers), `lab-out` (matches /\b[hl]\b|abn|abnormal|out of range|high|low/i), or `lab-unknown` (anything else, or absent) — and comparing against Almanac's `flag` (resolved through `flagFor()` against the marker's `optimalRange` and `labRange`). Pure: no DOM, no Dexie, no network. Asserted by exhaustively constructing a Result+Marker for each `VerdictDiff` kind and confirming the bucket.
- [ ] Each result row on the panel detail (`#/labs?id=N` in `src/pages/labs.ts`) renders, when `labVerdict` is present, a small two-chip pair near the row's existing flag: "Lab: <verbatim>" and "Almanac: <our verdict>" (the existing flag label). Asserted by seeding a panel with a row carrying `labVerdict: "Normal"` and confirming both chips render.
- [ ] When the diff is a disagreement of kind `disagree-lab-normal-functional-low` / `disagree-lab-normal-functional-high` / `disagree-lab-out-functional-normal`, the row carries a one-line editorial caption directly below the chips, using the curated map:
  - `disagree-lab-normal-functional-low` → "Your lab marked this <verbatim>. Below the functional optimum (<low>–<high> <unit>)."
  - `disagree-lab-normal-functional-high` → "Your lab marked this <verbatim>. Above the functional optimum (<low>–<high> <unit>)."
  - `disagree-lab-out-functional-normal` → "Your lab marked this <verbatim>. Inside the functional optimum (<low>–<high> <unit>)."
  Asserted on each kind with the precise wording.
- [ ] When the diff is `agree-normal` or `agree-out`, the caption is the calm corresponding line ("Your lab and Almanac agree this is normal." / "Your lab and Almanac agree this is outside the optimum.") OR is omitted per the documented choice — pick ONE (renders OR omits) and assert consistently. The agreement caption uses the SAME ink colour, not green or red.
- [ ] When `labVerdict` is absent (`no-lab-verdict`) — the lab printed nothing parseable, or the panel was manual / pasted text without a verdict column — the row renders ONLY Almanac's flag (today's behaviour), with NO "Lab: —" chip and NO caption. Asserted by a manual panel and by a pasted-text panel with no verdict tokens.
- [ ] When the marker has no functional range (`no-functional-range` — typically a user-defined marker without an `optimalRange`), the row renders ONLY the lab chip and NO caption claiming an Almanac verdict. Asserted with a user-defined range-less marker carrying a `labVerdict`.
- [ ] The disagreement caption uses ink and ink-soft only — NO red flood for `disagree-lab-normal-functional-low`, NO oxblood pulse, NO emoji. The provenance is the rhetoric; styling stays editorial. Asserted by a CSS spot-check or computed-style assertion (no `color: red`-equivalent on the caption).
- [ ] The report-card (0036) editorial sentence is unchanged in behavior — its count of "suboptimal" markers continues to read from Almanac's `flag`. The two surfaces compose: the report-card is the count at the top, the verdict-diff caption is the provenance on each contributing row. Asserted by exercising a panel where the report-card reads "7 sit inside the lab's normal range but below the functional optimum" and confirming 7 of the result rows carry a `disagree-lab-normal-functional-low` or `-high` caption.
- [ ] The verbatim `labVerdict` is included verbatim in the readable Markdown export (0027 — shipped) on each result line ("Ferritin 28 ng/mL [Lab: Normal; Almanac: below optimum]"). Asserted by exporting and confirming the line shape.
- [ ] The doctor PDF (0010, shipped) renders the `labVerdict` next to the value when present, in the same row-shape style the existing PDF uses; the friend variant of the PDF does not render the lab verdict (no panel data in the friend PDF). Asserted by generating both PDFs from a panel with verdicts and confirming the doctor PDF body contains the verbatim string and the friend PDF does not.
- [ ] The Anthropic key NEVER appears in `labVerdict`, in `compareVerdicts`, or in any caption — and the verbatim string cannot be used to exfiltrate the key (the field is plain text bounded by the 24-char cap; assert with a sentinel key that the key appears nowhere in the row render). Asserted by seeding a sentinel key and confirming.
- [ ] The verdict capture is local-only: it travels in the existing extraction call to `api.anthropic.com` (no new endpoint, no second call), is persisted in `panels[].results[].labVerdict` in IndexedDB, and introduces no new egress. Asserted by Privacy E2E confirming the allow-list is unchanged.
- [ ] Renders on both **chromium and mobile-webkit**. The two-chip pair wraps cleanly at the 390 px viewport (drops to a single column below the value when needed); chips are ≥44×44 css px tap targets where layout allows, or the documented compact-chip exception with an accessible hit area; long verbatim strings respect the 24-char truncation and `min-width: 0`.
- [ ] Schema migration: **yes** — Dexie bumps to v10 with a new additive `.version(10).stores({...})` block (the field is optional on `Result`, so existing v9 panels load with `labVerdict === undefined` and rows render today's behaviour). Migration test asserts a v9 export imports with no result-field loss and the verdict field empty.
- [ ] Tour mode (0014) carries a tour fixture with at least two `disagree-lab-normal-functional-low` rows on its first panel — the wedge made tangible for a prospect. Shared-view (0017) carries the verdict on shared rows IF the share payload already includes per-row data; if not, the shared-view explicitly omits the chip and caption. Asserted in both modes.
- [ ] New `tests/e2e/verdict-diff.spec.ts` covers: extraction populates `labVerdict` (positive and omitted cases), `compareVerdicts` returns each `VerdictDiff` kind, the row chips render, each disagreement caption renders verbatim, agree branch renders OR omits per the chosen behaviour, missing-verdict and range-less behaviour, ink-only styling, report-card composition, Markdown export inclusion, doctor PDF inclusion + friend PDF omission, the key never appears (sentinel), zero new egress, the migration, mobile rendering, tour wedge.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A second Anthropic call to "interpret" the lab's verdict. The verbatim string is extracted in the existing extraction pass (one extra field on the existing schema); the bucket comparison is pure TypeScript over the verbatim string and Almanac's flag. No new inference, no LLM paraphrase.
- A clinical-grade verdict ontology, a per-lab verdict dictionary, or an interaction with each lab's exact code system (H / HH / L / LL / A / C). The three buckets (`lab-normal` / `lab-out` / `lab-unknown`) cover the disagreement the user reads; finer-grained typing is a separate ticket if real demand emerges.
- A "this lab is unreliable" or "your lab is wrong" framing in the copy. The caption is descriptive ("Your lab marked this <verbatim>. Below the functional optimum.") — never accusatory, never "your lab missed this." We quote the lab; we add the functional optimum; we do not editorialise the lab's process.
- A push notification on first-detected disagreement. No notifications. The row is the surface; the user sees it when they open the panel.
- A bulk "your doctor missed N markers" sentence. The report-card count (0036) already produces that headline; this ticket is row-level provenance behind the headline, not a second headline.
- Editing or overriding the captured `labVerdict`. The field is read-only at v1; if the model captured "Normal" and the user disagrees, that is a future ticket.
- Carrying the verdict diff into the doctor PDF as a "Lab disagreed" callout. The doctor PDF carries the verbatim string next to the value (provenance for the clinician) without an editorial caption — the caption is for the user reading their own panel, not for the clinician reading the report.
- Per-result colour beyond ink / ink-soft. NO red flood for disagreements, NO green for agreements. Provenance is the rhetoric.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/types.ts` — add `labVerdict?: string` to `Result` (≤ 24 chars, verbatim, case-preserved). Additive optional; no migration needed for read-side.
- `src/db.ts` — bump Dexie to `version(10)` with a NEW additive `.version(10).stores({...})` block per the AGENTS.md schema rule (never edit the existing v9 block). Field is optional on `Result` inside `panels[].results`; no data migration. Add a migration test confirming a v9 panel loads.
- `src/extractor.ts` — extend `EXTRACTION_PROMPT` (and the text-path prompt that 0046 added, if it lives separately) with one sentence asking the model to capture the verbatim verdict per row when present, with the 24-char cap and the omit-when-absent rule. Update `tests/fixtures/extraction.json` (chromium + mobile-webkit projects share fixtures) with `labVerdict` strings on the rows that demonstrate disagreement.
- `src/labs/verdict-diff.ts` (new) — `compareVerdicts(result, marker)` per the acceptance bullets. Bucket the verbatim string with the documented regex sets; combine with Almanac's flag (use `result.flag` when present, else `flagFor(result.value, marker.optimalRange, marker.labRange)`). Pure; no Dexie, no network.
- `src/labs/verdict-copy.ts` (or inline a small map in `src/pages/labs.ts`) — the three disagreement captions are a hard-coded map keyed by `VerdictDiff.kind`, with `<verbatim>` and the range bounds interpolated. Curated copy lives in code, not in any AI-rendered string.
- `src/pages/labs.ts` — in the result-row render, when `result.labVerdict` is present (and the marker resolves), render the two-chip pair + the caption. Reuse the existing chip idiom (the flag chip is already there — the new "Lab:" chip mirrors it). Pass `findMarker(result.markerKey)` to `compareVerdicts` (use the merged seed + user markers like 0026/0032/0036 already do). No new detail surface.
- `src/share/markdown-export.ts` (where 0027's export lives) — include `labVerdict` in the per-result line when present. Editor a small format helper rather than ad-hoc string concat.
- `src/share/pdf.ts` (or wherever 0010's PDF generator lives) — in the doctor variant, render the `labVerdict` next to the value when present. The friend variant is unchanged.
- `src/sample/state.ts` — confirm or adjust the tour fixture's first panel so that at least two rows carry a `labVerdict: "Normal"` and an Almanac `suboptimal` flag — the wedge made tangible for a prospect.
- `src/share/shared-state.ts` — if the shared payload (0017) already passes results through, the `labVerdict` rides for free; if it strips them, leave that behaviour and confirm the shared-view does not render the chips (document the choice).
- `src/styles.css` — `.result__verdict-chip` (the new "Lab:" chip — same shape as the existing flag chip), `.result__verdict-caption` (the one-line editorial copy, ink). NO red / green styles. Grid children `min-width: 0`. Chip target ≥ 44×44 css px where layout allows, with the 0017 sub-pixel cushion.
- `tests/fixtures/extraction.json` — extend rows with `labVerdict` strings (and one row omitting the field). The plan fixture is unchanged.
- `tests/helpers/flows.ts` — extend `seedPanel(page, panel)` (or whatever the panel-seeding helper is named) to accept rows carrying `labVerdict`. Existing seeds without the field continue to work.
- `tests/e2e/verdict-diff.spec.ts` (new) — every acceptance bullet maps to a `test()`. The `compareVerdicts` exhaustive test constructs each `VerdictDiff` kind from minimal inputs; the row-render test seeds a panel and asserts the chip text and caption text verbatim.
- `tests/e2e/privacy.spec.ts` — extend with a panel-detail visit confirming zero off-allow-list egress during the verdict-diff render.
- `tests/e2e/report-card.spec.ts` — extend (lightly) to assert composition: a panel whose `report-card` count of suboptimal markers is N has exactly N rows carrying a `disagree-lab-normal-functional-low` or `-high` caption.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **yes** — Dexie v10, additive `Result.labVerdict?`.
- Voice spec: chip labels are "Lab:" and "Almanac:"; the verbatim string follows. The captions are declarative (the three lines above). The agreement caption (if rendered) reads "Your lab and Almanac agree this is <normal|outside the optimum>." Banned: "amazing," "exciting," "journey," "great," "missed," "wrong." Ink and ink-soft only; no oxblood on the row chip.

## Implementation log

(Appended by the implementation-dev agent during execution.)
