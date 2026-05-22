---
id: 0026
title: Same marker, different lab — surface the canonicalization that lets a trend span report formats
status: groomed
priority: P2
area: labs
created: 2026-05-20
owner: gtm-innovation
---

## User story

As a user who has uploaded two panels from two different labs — March from Quest where it printed "25-OH Vitamin D" and May from LabCorp where it printed "Vitamin D, 25-Hydroxy" — I want a small, honest line at the moment a new panel resolves that tells me which printed names just joined an existing marker's timeline ("LabCorp's 'Vitamin D, 25-Hydroxy' joined your Vitamin D line — now 2 draws across 2 labs"), so that the invisible work that lets my trends survive switching labs becomes visible to me, and I trust that the sparkline on Progress is actually the same marker over time and not two unrelated readings drawn on one chart.

## Why now (four lenses)

### Product Owner

Marker canonicalization is one of the load-bearing moat assets — it is what lets "25-OH Vit D" / "Vitamin D, 25-OH" / "VitD" from three different report formats resolve to one trend line. But it is entirely invisible. The user uploads a second panel, and the new value just appears on the Progress sparkline with no acknowledgment that the app had to recognize a differently-printed name and reconcile it. The user has to *take on faith* that the two dots on the line are the same marker. The smallest meaningful unit of value is a deterministic, zero-network "canonicalization receipt" rendered on the post-extraction review screen (`#/labs?id=N`): for each result in the just-resolved panel whose `rawName` differs from a `rawName` previously seen for the same canonical `markerKey`, a small line names the join — "<labName>'s '<rawName>' resolved to <canonical marker name> — now N draws across M labs." It is one read over the existing panels, computed locally, surfaced exactly where the user is already reviewing what was extracted. It makes the most quietly-impressive thing the app does legible at the moment it happens.

### Stakeholder

This is the **marker canonicalization** moat — the asset with the most engineering value and the least user-facing surface — finally getting one. Canonicalization compounds the **persistent timeline** (a trend can only span re-tests if the markers reconcile) and is precisely the thing a Claude.app user cannot replicate by pasting screenshots: Claude treats "VitD" and "25-OH Vitamin D" as different strings and will not connect a March Quest reading to a May LabCorp reading into one trend. Making the reconciliation visible turns a silent technical advantage into a stated one — and a stated advantage is the only kind that converts a skeptic. It also creates a quiet data-quality surface: when an extracted `rawName` does NOT resolve to any known marker, the existing match-unrecognized flow already exists; the receipt is its positive-case sibling, closing the loop so the user sees both "we recognized this across labs" and "we need your help with this one" as two halves of the same honest accounting of what we did with their report.

### User (at 7am on the phone)

I just uploaded my May labs — a new lab this time, my old clinic closed. The review screen shows the extracted values. Under the Vitamin D row, a small line: "LabCorp's 'Vitamin D, 25-Hydroxy' joined your Vitamin D line — now 2 draws across 2 labs." Under ApoB: "LabCorp's 'Apolipoprotein B' joined your ApoB line — now 3 draws across 2 labs." It is a quiet, satisfying thing to read. It tells me the app did the annoying work I would otherwise have to do in a spreadsheet — line up two labs that name everything differently — and it tells me my trends are real, not an accident of identical printing. I tap through to Progress and the sparkline now reads as trustworthy: those two dots ARE the same marker, the app just told me how it knew. On a slow connection it all renders instantly, because it is computed from data already on my device.

### Growth

This is a moat-deepening + retention ticket whose artifact is quietly screenshot-worthy for exactly the spreadsheet-tired persona Almanac targets. The Cronometer/Oura-fatigued user's specific pain is that no tool reconciles labs across providers — they keep a manual spreadsheet for precisely this. A line that says "your two labs, named differently, are one trend now" is the "show me" frame for that user: it answers the objection they did not know they could have answered. (Hypothesis: the canonicalization receipt is the artifact most likely to convert the "I keep a manual lab spreadsheet" power user, because it demonstrates the one thing their spreadsheet does that no app has automated for them; this segment is small but unusually high-LTV and unusually vocal in precision-health communities — back-of-envelope, treat as untested.) The retention value is trust compounding: every time the receipt fires, the user's confidence that the timeline is real deepens, which is the thing that makes them keep uploading — and a user with four panels across two labs is structurally far harder to churn than one with a single panel.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/labs/canonicalization.ts` (new) exports `computeCanonicalizationReceipt(newPanel: Panel, priorPanels: Panel[]): CanonicalJoin[]` where `CanonicalJoin` is `{ markerKey: string; canonicalName: string; newRawName: string; newLabName?: string; totalDraws: number; distinctLabs: number; crossLab: boolean }`. For each result in `newPanel`, the function finds prior panels carrying the same `markerKey`, and emits a join row when (a) the marker now has ≥ 2 total draws, AND (b) the `newPanel`'s `rawName` for this marker differs from at least one prior `rawName` for the same `markerKey` OR the lab name differs. `crossLab` is true when ≥ 2 distinct `labName` values contribute to the marker's history. Pure: no DOM, no Dexie, no network.
- [ ] The post-extraction panel review screen (`#/labs?id=N` in `src/pages/labs.ts`) renders the receipt rows inline. Each row reads: "<newLabName>'s '<newRawName>' resolved to <canonicalName> — now <totalDraws> draws across <distinctLabs> lab(s)." Singular/plural on "draw" and "lab" agree with the counts. Asserted by seeding a March panel (Quest, rawName "25-OH Vitamin D") and a May panel (LabCorp, rawName "Vitamin D, 25-Hydroxy") both resolving to `vitamin_d_25oh`, then confirming the review screen of the May panel surfaces the join line with "2 draws across 2 labs."
- [ ] A marker that appears for the FIRST time (no prior draw) produces NO receipt row — there is nothing to reconcile across. Asserted by uploading a single panel and confirming zero join rows render.
- [ ] A marker whose `rawName` AND `labName` are identical to a prior draw (same lab, same printed name) produces a row with `crossLab` reflecting reality but phrased as a same-source continuation: "Another <canonicalName> draw from <labName> — now <totalDraws> draws." (The reconciliation story is honest: same lab, same name is a continuation, not a cross-format join.) Asserted by two same-lab same-name panels.
- [ ] The receipt rows render in the order the results appear in the panel; markers with no join are silent. The receipt section renders a single eyebrow ("Across your labs") only when at least one join row exists; with zero joins the section is absent entirely (a fresh user's first panel shows no canonicalization UI).
- [ ] The receipt is computed with **zero network calls** — it reads the new panel and prior panels from IndexedDB (local) only. Asserted by rendering the review screen and confirming the mock recorded zero requests during the receipt computation/render.
- [ ] The receipt respects user-defined markers (0002): a marker the user defined and that resolved across two labs surfaces a join row identically to a built-in marker. The canonical name comes from `findMarker()` / the merged marker set (`getAllMarkers`). Asserted by seeding a user-defined marker present in two panels.
- [ ] Sex-specific marker keys (e.g. `ferritin_m` / `ferritin_f`) collapse to a single human-readable canonical name in the receipt — the user sees "Ferritin," not the internal sex-suffixed key. Asserted with two ferritin draws for a male profile.
- [ ] Renders on both **chromium and mobile-webkit**. Long rawNames + long lab names wrap cleanly at the 390 px viewport; the receipt rows do not overflow their container (the existing `min-width: 0` grid-child fix from the labs page applies).
- [ ] Tour mode (0014) surfaces the receipt against the tour's two-panel fixture if the fixture is shaped to demonstrate a cross-lab join (otherwise the section is absent — never fabricated). Shared-view mode (0017) does NOT render the receipt — panel detail was not part of the shared payload. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the receipt is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the receipt is computed on render from existing `panels` rows (which already carry `results[].rawName`, `labName`, and `drawnAt`). Nothing new is persisted.
- [ ] New `tests/e2e/canonicalization-receipt.spec.ts` covers: two-lab cross-format join surfaces the line with correct counts, first-ever marker shows no row, same-lab same-name continuation phrasing, eyebrow absent on a fresh single panel, zero-network during render, user-defined marker join, sex-specific key collapse to one canonical name, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Editing or overriding the canonicalization at the receipt. If the user thinks the app reconciled two markers wrongly, the place to fix it is the existing match-unrecognized / marker-detail flow, not a new override surface on the receipt. The receipt is a read-only statement of what was reconciled.
- A standalone "your labs across providers" report page. The receipt lives where the user already is — the post-extraction review screen — at the moment a join actually happens. A separate page would dilute the just-happened immediacy that makes the receipt land.
- Surfacing the unit-conversion side of canonicalization (e.g. mmol/L → mg/dL) in this ticket. Unit reconciliation is real and worth its own honest surface, but it is a distinct mechanism from name reconciliation; folding both into one line would muddy the message. Scope this to the rawName/lab join.
- A confidence score on the canonicalization ("we are 80% sure these are the same marker"). The matching is deterministic via the alias table; surfacing a fake probability would undercut the determinism that is the whole point. A match either resolved to a canonical key or it did not (and the unmatched case already has the match-unrecognized flow).
- Carrying the receipt into the doctor PDF (0010/0016) or the share link (0017). The receipt is an ingestion-moment artifact; it does not belong in the clinical hand-off or the shared protocol. A future ticket might add a "labs reconciled across N providers" line to the PDF if clinicians ask.
- Re-running extraction or any inference to compute the receipt. It is built entirely from already-extracted, already-stored data.
- An animated "merging" effect on the sparkline. The receipt is one calm line of editorial copy, not a visual flourish.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/labs/canonicalization.ts` (new) — `computeCanonicalizationReceipt(newPanel, priorPanels)` per the acceptance bullets. Resolves the canonical display name via `findMarker()` (and the merged user-marker set from `src/data/userMarkers.ts` `getAllMarkers`) so user-defined and sex-specific markers render their human name. Pure; the page passes in the panels from `allPanels()`.
- `src/pages/labs.ts` — the `renderPanelDetail(id)` path (the `#/labs?id=N` review screen) already loads the panel and renders its results. After the results table, call `computeCanonicalizationReceipt(panel, priorPanels)` (priorPanels = `allPanels()` minus this one, drawn before this one) and render the "Across your labs" section when it returns rows. Re-use the existing result-row layout idioms; the receipt rows are small editorial lines, not table rows.
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only. Use `findMarker(key)` for the canonical `name`; collapse sex-specific keys by reading the resolved marker's `name` (which is already the human label without the internal suffix). No changes to the marker DB itself.
- `src/types.ts` — add `CanonicalJoin`. Additive.
- `src/styles.css` — `.canon-receipt` (the section), `.canon-receipt__row` (one join line, ink-soft). The eyebrow re-uses the existing small-caps token. No new colors. Grid children get `min-width: 0` to respect ellipsis on long names (the documented overflow fix).
- `tests/helpers/flows.ts` — re-use `addManualPanel` to seed two panels with distinct `labName` + distinct `rawName` resolving to the same `markerKey`. If `addManualPanel` does not let the test set `rawName` / `labName`, add a `seedPanel(page, panel)` helper that writes a fully-formed Panel via `page.evaluate` against Dexie.
- `tests/e2e/canonicalization-receipt.spec.ts` (new) — every acceptance bullet maps to a `test()`. The cross-format join test seeds Quest "25-OH Vitamin D" (March) and LabCorp "Vitamin D, 25-Hydroxy" (May), both resolving to `vitamin_d_25oh`, and asserts the May review screen renders "now 2 draws across 2 labs."
- `tests/e2e/privacy.spec.ts` — extend with a panel-review visit confirming zero off-allow-list egress during receipt render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: cross-lab join reads "<lab>'s '<rawName>' resolved to <canonical> — now N draws across M labs." Same-lab continuation reads "Another <canonical> draw from <lab> — now N draws." The eyebrow is "Across your labs." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
