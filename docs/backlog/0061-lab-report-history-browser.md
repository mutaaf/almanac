---
id: 0061
title: The source files — a chronological browser of every report you uploaded, with its extraction receipt, so you can audit what fed your panels
status: proposed
priority: P2
area: labs
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a privacy-literate user who has uploaded a half-dozen lab reports over a year — some clean PDFs, some phone photos of a printout, one set of patient-portal screenshots — I want a place on the Labs page that lists every original file I ever uploaded, newest first, each with its filename, the date I added it, how it was read (PDF / image / pasted text), and how many markers came out of it, with a tap to re-open the original on-device — so that I can audit exactly what fed my panels, catch the photo that only extracted three markers because the corner was cut off, and trust that the trend my whole protocol rests on was built from the reports I think it was.

## Why now (four lenses)

### Product Owner

Every uploaded report is already kept: the `Panel` row stores `fileNames`, the original `fileBlobs` (the files themselves, on-device), the `source` type (`pdf` / `image` / `manual` / `mixed` / `paste`), `createdAt`, and the `results` the extractor produced. All of it is persisted and none of it is browsable. The Labs page shows panels grouped by draw date and the markers in them, but there is no way to see the raw inputs — the user cannot answer "which file did this draw come from?", "did that blurry photo extract everything?", or "what have I actually uploaded?" The smallest meaningful unit of value is a "Source files" section (or sub-view) on Labs: a chronological list, newest first, of every uploaded report across all panels, each row showing the filename(s), the upload date, the source type, and an extraction receipt — "12 markers read" — with a tap to re-open the stored original (`fileBlob`) in a viewer/new object URL. Pasted-text and manual panels show their source honestly ("pasted from portal", "entered by hand") with no file to open. It is a pure render over data the app already holds — no new storage, no inference, no network. It turns a write-only pile of blobs into an auditable record of inputs.

### Stakeholder

This deepens the **privacy** moat and the **persistent timeline** at the exact point the product's whole promise is staked: the claim that your reports live on your device and nowhere else. Today that claim is true but invisible — the files are in IndexedDB, kept on-device, and the user has no way to see them, which means they have to take the promise on faith. A source-file browser makes the privacy contract *legible*: here are your original reports, every one, on your phone, openable, never uploaded anywhere but the direct Claude extraction call you authorized. It is the natural companion to the egress receipt (0025), which shows what *leaves* before a call; this shows what *stayed*. It also hardens the timeline's integrity: a trend is only as trustworthy as its inputs, and a user who can see that one photo extracted three markers instead of twelve can fix the gap (re-upload, or match-unrecognized) instead of unknowingly trusting a thin draw. A chat box retains nothing — it cannot show you the file you pasted last March, because it does not have it. A persistent, on-device record of every input is structurally a feature only this architecture can offer.

### User (at 7am on the phone)

On Labs, below my panels, a quiet line: "Source files." I tap it. There they are, newest first — "lab-results-march.pdf, added Mar 14, PDF, 14 markers read"; "IMG_4821.jpg, added Mar 14, photo, 3 markers read"; "pasted from portal, added Jan 2, 9 markers read." The photo that only read three jumps out — that was the one with the cut-off corner, and now I know to re-shoot it. I tap the PDF row and the original opens, the actual report I uploaded, right here on my phone. Nothing was fetched; these are my files, on my device, and the list proves it. It is the receipt I did not know I wanted: not just the numbers the app pulled out, but the papers they came from, all in one place, openable, mine.

### Growth

This is a trust-and-retention ticket aimed squarely at the privacy-literate persona who is the product's seed user and best evangelist. Retention: a user who can audit their own inputs trusts the trend built on them, and a trusted trend is the thing that keeps them uploading the next panel; the browser also quietly catches thin extractions, which prompts the corrective re-upload that keeps the timeline dense. (Hypothesis: an auditable source-file record raises retention among the privacy-and-rigor segment by making the on-device promise tangible and by surfacing fixable extraction gaps before they silently corrupt a trend; back-of-envelope from how data-provenance and "see your raw inputs" affordances build trust in rigor-minded tools; treat as untested without remote analytics, which we will never add.) The "show me" frame is unusual and exactly on-brand for this audience: "it keeps every report I ever uploaded, on my phone, and lets me open any of them — and it never sent them anywhere but the call I authorized." That is the radical-data-ownership detail the persona cites to the friend who asks "but where does my lab data actually go?" It is the kept-on-device sibling of the egress receipt (0025): 0025 proves what leaves, this proves what stays.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/labs/source-files.ts` (new) exports `buildSourceFileList(panels: Panel[]): SourceFileEntry[]` assembling, with NO network and NO LLM, one entry per uploaded source across all panels, sorted newest-first by the panel's `createdAt`. Each entry carries: a label (the `fileNames` joined, or an honest synthetic label for `paste`/`manual` — e.g. "Pasted from portal", "Entered by hand"), the upload date (from `createdAt`), the `source` type, the marker count (`panel.results.length`), the owning panel id, and an index into `fileBlobs` when an openable original exists (absent for `paste`/`manual`). Pure: no DOM, no Dexie, no network. Asserted by passing panels of each source type and confirming the assembled entries, order, and marker counts.
- [ ] The Labs page (`src/pages/labs.ts`) renders a "Source files" affordance (a section or sub-view) listing the entries from `buildSourceFileList(allPanels())`, newest first. Each row shows the label, the upload date, the source type, and the extraction receipt "N markers read". Asserted by seeding panels of mixed source types and confirming the rows render with the right labels, dates, types, and counts in newest-first order.
- [ ] A row whose entry has an openable original (`pdf` / `image` / `mixed`, with a `fileBlob`) exposes a tap affordance that opens the stored original from IndexedDB (e.g. a `URL.createObjectURL(blob)` in a viewer / new context), with NO network fetch. Asserted by seeding a panel with a `fileBlob`, tapping the open affordance, and confirming an object URL for the local blob is produced (and no off-allow-list request fires).
- [ ] A `paste` or `manual` entry shows its honest synthetic label and NO open-original affordance (there is no file to open). Asserted by seeding a pasted-text panel and a manual panel and confirming both render with their labels and neither offers an open-original control.
- [ ] The extraction receipt is the literal marker count for that panel (`panel.results.length`) — a panel that read 3 markers shows "3 markers read", a panel that read 14 shows "14 markers read", and a singular case ("1 marker read") reads grammatically. Asserted with a thin (3-marker) panel and a full panel.
- [ ] A panel uploaded as several files at once (`source: "mixed"` or multiple `fileNames`) is represented coherently per the documented rule — either one row per panel listing all its filenames, or one row per file; pick one and document it so the spec asserts the chosen shape. Asserted on a multi-file panel.
- [ ] The "Source files" affordance is ABSENT (or shows a calm "No reports uploaded yet" empty state — pick one and document it) when there are no panels. Asserted on a profile with no panels.
- [ ] The browser makes **zero Anthropic calls** and **zero network calls** — it is a pure render over the local `panels` table, and opening an original uses an on-device object URL, not a fetch. Asserted by rendering the list and opening an original and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the list or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the source-file list or an opened-original affordance.
- [ ] Renders on both **chromium and mobile-webkit**: the list fits the 390 px viewport, the open-original affordance is a ≥44×44 css px tap target (min-height ≥45 px per the 0017 sub-pixel lesson), and long filenames respect `min-width: 0` (the documented overflow fix) and truncate cleanly. Asserted on both projects.
- [ ] Tour mode (0014) renders the source-file list against the tour fixture's panels if the fixture carries file metadata (otherwise the section is absent — never fabricated). Shared-view mode (0017) does NOT render it — the shared payload carries no source files. Asserted in both modes.
- [ ] The existing Labs page (panel list, upload, manual entry, panel detail, match-unrecognized, the report card 0036) is byte-for-byte unchanged in behavior — the source-file browser is purely additive. Asserted by exercising the existing Labs flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the browser is a local render; opening an original is an on-device object URL; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the browser reads the existing `panels` table (`fileNames`, `fileBlobs`, `source`, `createdAt`, `results` already exist). Nothing new is persisted.
- [ ] New `tests/e2e/source-files.spec.ts` covers: `buildSourceFileList` assembles entries of each source type in newest-first order with correct counts; the section renders the rows; opening a stored original produces a local object URL with zero network; paste/manual rows show their label and offer no open control; the singular/plural marker-count copy; the multi-file panel shape; the empty state; zero Anthropic + zero network; the key never appears (sentinel); tour vs shared-view behavior; the existing Labs flows unchanged; mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Re-running extraction from the browser ("re-read this file with Claude"). The browser is a read-only audit of what was uploaded and what came out of it. Re-extraction is the existing upload flow's job; a "re-read" button is a plausible future ticket, not this one.
- Deleting individual source files or panels from the browser. Panel deletion (if any) lives with the panel surfaces; this is a read-only record. Adding a delete here risks a destructive affordance on a privacy-sensitive list and is out of scope.
- An LLM-generated summary of a report, a thumbnail render, or OCR preview text. The receipt is the literal marker count; the original opens as the stored blob. No inference at render time, no new Anthropic call, no thumbnailing pipeline.
- A new `uploadedAt` / `originalName` field or any schema change. The browser reads the existing `Panel.fileNames`, `fileBlobs`, `source`, `createdAt`, and `results`. If a field is genuinely missing for the receipt, prefer deriving it from what exists; do not bump the Dexie schema for this ticket.
- Carrying the source-file list into the doctor PDF (0010/0016), the share link (0017), the Markdown export (0027), or the coach packet (0048). It is an owner-side, in-app audit surface, not an export artifact. (A "files included" line on the coach packet is a plausible future follow-up, out of scope here.)
- A draws-and-plans timeline. That is the record (0045) — the dated spine of draws and plans. This is the narrower thing the record does not cover: the *raw uploaded files* and their extraction receipts. Do not duplicate 0045's spine.
- Surfacing the egress / what-leaves view here. That is the egress receipt (0025), shown before a call. This is the complementary "what stayed on device" view; link to 0025 if trivial, but do not rebuild it.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/labs/source-files.ts` (new) — `buildSourceFileList(panels)`. Map each panel to one (or more, per the documented multi-file rule) `SourceFileEntry`, sorting newest-first by `panel.createdAt`. Derive the label from `panel.fileNames` (or a synthetic label keyed on `panel.source` for `paste`/`manual`), the receipt from `panel.results.length`, and the openable-original index from `panel.fileBlobs` when present. Pure; no Dexie import. The page passes `allPanels()`.
- `src/types.ts` — add a `SourceFileEntry` interface (label, date, source, markerCount, panelId, optional blob index). Additive, internal render type — NOT a persisted schema change. `Panel` already carries `fileNames`, `fileBlobs`, `source`, `createdAt`, `results` (see `src/types.ts` ~line 132).
- `src/pages/labs.ts` — the Labs index already renders the panel list and (with 0036) the report-card framing. Add the "Source files" affordance (a section below the panel list, or a small sub-view toggled from Labs — pick one and document it). The open-original handler reads the panel's `fileBlob` from the already-loaded panel (or re-reads via the existing panel getter) and opens it via `URL.createObjectURL` in a viewer / new context; revoke the URL appropriately. Reuse the existing editorial section/eyebrow idioms.
- `src/db.ts` — read-only reuse: `allPanels()` (or the existing panel reader) returns panels with their `fileBlobs`. Confirm the blobs are loaded by the reader the page uses; if the list reader strips blobs for performance, fetch the blob lazily on the open tap via the by-id getter. Do NOT alter the `panels` store.
- `src/styles.css` — `.source-files` (the section/sub-view), `.source-files__row` (one entry: label + date + type + receipt + open affordance), reusing the labs/editorial section idioms. No new colors; ink and ink-soft, oxblood reserved. Long filenames: grid children `min-width: 0` + `text-overflow: ellipsis`. Open affordance ≥44×44 (`box-sizing: border-box; min-height: 45px`).
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `isSharedView()` (absent) and the documented `isTour()` treatment (render against fixture file metadata if present, else absent).
- `tests/helpers/flows.ts` — reuse `seedPanel` / `addManualPanel` (and the paste-panel seed from the 0046/0055 specs) to seed panels of each source type, including one with a real `fileBlob` (a tiny canned Blob) so the open-original test has something to open. Mind the `&day` index where panels share dates.
- `tests/e2e/source-files.spec.ts` (new) — every acceptance bullet maps to a `test()`. The open-original test seeds a panel with a small Blob, taps the open affordance, and asserts an object URL for that local blob was created with no off-allow-list request; the paste/manual test asserts the label and the absence of an open control.
- `tests/e2e/privacy.spec.ts` — extend with a Labs visit rendering the source-file list and opening an original, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — reads the existing `panels` table.
- Voice spec: the section eyebrow reads "Source files"; each row reads "<label> · <date> · <type> · N markers read"; the synthetic labels read "Pasted from portal" / "Entered by hand". Declarative, no exclamation, no praise-words. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)
