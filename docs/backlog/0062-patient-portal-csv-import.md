---
id: 0062
title: Patient portal CSV — map the standard CSV export from MyChart or Quest into a dated panel
status: proposed
priority: P2
area: labs
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a user whose hospital uses Epic MyChart and whose lab results page has a "Download as CSV" button, I want to drag that file into the Labs page the same way I drag a PDF, and have it produce a dated panel of recognized markers — without needing to read the file format myself or transcribe each value by hand.

## Why now (four lenses)

### Product Owner

Labs has three ingestion paths: PDF/image upload (0001), paste-as-text (0046), and manual entry. All three work. But the most common digital lab record is a CSV exported from the patient portal — MyChart, Quest Direct, LabCorp Patient, and most hospital portals offer it. These CSVs share a rough common shape: one row per test, columns for test name, result value, unit, reference range, and drawn date. The app already has everything it needs to parse them: `matchMarker()` on the test name (the alias system from 0002), the same `panelsFromDate()` grouping by draw date that the other paths use. The smallest unit of value is a new ingestion branch on Labs that detects a `.csv` file in the same paste/drop zone, parses it deterministically (no LLM), maps the test-name column through `matchMarker()`, and stores the resulting Panel in Dexie via the same `addPanel` path. If a row doesn't match, it goes into the existing "match unrecognized" queue. No new route, no new modal — one new parser, wired into the existing zone.

### Stakeholder

CSV ingestion is the lowest-effort high-impact expansion of the "get your first panel in" funnel. PDF parsing is LLM-powered (a round-trip to api.anthropic.com), requires a key, and takes several seconds. Manual entry is tedious for more than a handful of markers. CSV parse is deterministic, instant, requires no key, and costs the user nothing per use. It broadens the acquisition funnel — a new user who has a CSV but no key yet can get their labs into the app before entering a key, deepening the stake before the commitment. And it deepens the moat: the more labs the app ingests deterministically, the richer the trend timeline, the higher the cost of switching.

### User (at 7am on the phone)

I exported my CBC + CMP from MyChart as a CSV last night. I open Labs, drop the file in. Two seconds later: a dated panel appears with 14 recognized markers. Three showed up as "unrecognized" — I tap to match them manually, same as with a PDF. Total time: under a minute. No key needed, no wait for the model. It just worked, like dropping in a PDF but faster.

### Growth

A "drop a CSV, get a panel in 2 seconds" demo is a frictionless way to show the app's value before an API key is required. (Hypothesis: supporting CSV import raises the rate at which a new user ingests their first panel without an API key, which lowers the barrier to experiencing the app's core value before committing a key; treat as untested without remote analytics.) The zero-API-key ingestion path makes Almanac demonstrable — a friend can try it with their own CSV export before trusting it with a key, which is the most honest acquisition flow available.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/parsers/csv-panel.ts` (new) exports `parseCsvPanel(csvText: string): { recognized: { markerKey: string; value: number; unit: string }[]; unrecognized: { rawName: string; rawValue: string; unit: string }[]; drawnAt: string | null }`. It detects the drawn date from a date column or file metadata, maps each row's test-name cell through `matchMarker()`, and populates `recognized`/`unrecognized`. Pure: no DOM, no Dexie, no network. Asserted by passing a fixture CSV string with a known set of test names (some matching, some not) and confirming the output arrays and date.
- [ ] The Labs page drop/paste zone accepts `.csv` files in addition to images/PDFs. Asserted by dropping a `.csv` file on the zone and confirming it is processed (not silently ignored).
- [ ] A recognized CSV produces a dated Panel in Dexie with `source: "csv"` (or equivalent source tag) and all recognized markers, stored via the same `addPanel` path as PDF panels. Asserted by dropping a fixture CSV, reloading Labs, and confirming the panel appears with the correct markers and drawn date.
- [ ] Unrecognized rows from the CSV appear in the same "match unrecognized" queue that PDF ingestion uses. Asserted by dropping a CSV with 2 unrecognized rows and confirming both appear in the queue.
- [ ] When no drawn-date column is found, the parser defaults to today's date (same behavior as the manual-entry path). Asserted by dropping a date-less CSV and confirming the panel's drawn date is today.
- [ ] The CSV parse makes **zero Anthropic calls** and **zero network calls**. Asserted by dropping a CSV and confirming the mock recorded zero requests.
- [ ] The user's API key is NOT required to import a CSV. Asserted by dropping a CSV without an API key set and confirming the panel ingests successfully.
- [ ] The Anthropic key NEVER appears in the CSV parser or any intermediate string. Asserted by seeding a sentinel key.
- [ ] The existing PDF/image drop, paste-text, and manual-entry ingestion paths are unchanged. Asserted by running the existing labs ingestion flows after the CSV parser is wired in.
- [ ] A malformed CSV (empty file, a file with no recognizable test-name column, a file with all unrecognized rows) produces an inline error note rather than a crash. Asserted by dropping each kind of bad input and confirming a graceful message.
- [ ] Renders on both **chromium and mobile-webkit**: file drop works on desktop; on mobile, the zone also accepts file input via `<input type="file" accept=".csv">`. Asserted on both projects.
- [ ] Privacy E2E still passes — no new hostnames.
- [ ] Schema migration: **no** — stores via the existing `addPanel` path; the `source` field may need a new enum value in `Panel` if it's typed, documented and asserted.
- [ ] New `tests/e2e/csv-import.spec.ts` covers: the pure parser (recognized / unrecognized / date extraction / date fallback), file drop triggers parse + panel, unrecognized rows in queue, zero Anthropic/network, no key required, sentinel key, existing labs flows unchanged, malformed input error, mobile rendering.

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- Parsing vendor-specific binary formats (XLS, XLSX, PDF-as-Excel). CSV only.
- Handling FHIR JSON or HL7 exports. Plain CSV only, in the common patient-portal row-per-test format.
- An LLM fallback for rows the alias matcher doesn't recognize. Unrecognized rows go to the manual match queue, same as unrecognized PDF rows.
- Distinguishing between Quest, LabCorp, MyChart, and hospital portal CSV dialects with named format templates. The parser uses column-name heuristics (looks for header cells containing "test", "result", "value", "unit", "date", "reference") rather than per-vendor schemas.
- Importing CSVs from wearables, Apple Health, or nutrition trackers. This is lab-result CSVs only (patient portal format).
- Automatic date detection from the file's `lastModified` timestamp. Date must come from a column in the CSV data.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/parsers/csv-panel.ts` (new) — a pure CSV parser with NO external dependencies (the browser's built-in string parsing is sufficient for RFC 4180 CSVs; do not import a CSV library). Column detection: scan the header row for cells matching case-insensitive substrings "test" or "component" (name column), "result" or "value" (value column), "unit" (unit column), "date" or "collected" (date column). For each data row, pass the name cell through `matchMarker(rawName)` (from `src/data/markers.ts`). Numeric result: `parseFloat(valueCell)` — if NaN, treat as unrecognized. Date parse: try `new Date(dateCell)` — if invalid, return `null` (caller defaults to today).
- `src/pages/labs.ts` — in the existing file-drop / paste handler, detect `.csv` MIME type (`text/csv` or `application/vnd.ms-excel` or `.csv` extension check). Pass the text content to `parseCsvPanel()`. Feed recognized rows into the existing Panel-construction path (the same `createPanel(drawnAt, markers)` or equivalent). Feed unrecognized rows into the existing "match unrecognized" flow (`stagingStore` or equivalent; grep `src/pages/labs.ts` for how PDF unrecognized rows are staged). Add `<input type="file" accept=".csv,.txt">` to the drop zone for mobile (the existing input already accepts image types; extend `accept`).
- `src/types.ts` — if `Panel.source` is a string union type, add `"csv"` to the union (additive). If it's a free string, no change needed.
- `tests/fixtures/` — add `csv-panel-fixture.csv` (a 20-row synthetic CSV with ~15 recognized markers and 5 unrecognized ones, plus a date column). The fixture's test-name values should match aliases in `src/data/markers.ts`.
- `tests/helpers/flows.ts` — add a `dropCsvPanel(page, csvText)` helper that reads the fixture, dispatches a DataTransfer drop event on the Labs drop zone (mirror the existing `addPanelFromText` helper pattern).
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** if `Panel.source` is a free string; **additive type change** if typed union.
- Voice: the drop-zone hint extends to "Drop lab PDF, image, or CSV — or paste text." Error state reads "Could not read this CSV — try the paste text option." Declarative, no exclamation.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
