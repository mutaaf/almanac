---
id: 0001
title: Auto-split panels by drawn date
status: shipped
priority: P1
area: labs
created: 2026-05-14
owner: gtm-innovation
---

## User story

As someone uploading multiple historical lab pages in one go, I want each distinct draw date to become its own panel, so that my marker timeline reflects real biology instead of a fictional "all-at-once" reading.

## Why now (four lenses)

### Product Owner
Today, the upload flow assumes "many files = many pages of one panel." Real users have stacks of lab reports from multiple draws across years — they paste them in and end up with one Frankenstein panel with four WBC values from four different mornings. The Plan generator treats those as four readings from "today," which is biologically wrong and erodes trust on the first impression. Splitting by date is the single most leveraged fix to the first-time-user experience.

### Stakeholder
The persistent timeline is the moat. Today the timeline only has as many points as the user manually onboarded — usually one. If we accept legacy reports gracefully, the timeline jumps from 1 point to 6 points after the first upload session. Every other surface (Progress sparklines, trend rules in the insight engine, "since last draw" diffs) gets richer for free. Without this, Almanac feels like a fancy form; with it, it feels like a longitudinal record from day one.

### User (at 7am)
The user pastes 6 screenshots from their Apple Notes archive. They expect 6 entries in their lab history. They tap "Extract" once and walk away. They come back to a clean, dated list. They don't have to know that we split anything.

### Growth
The screenshot a friend wants to see is the Progress page with 12 months of trends already drawn. Today you can only show that screenshot after a year of using Almanac. With auto-split, you can show it the same day you onboard, because you uploaded your last 4 draws at once. That's the "show me" moment.

## Acceptance criteria

- [x] If the extractor returns rows associated with more than one distinct `drawnAt` date, the labs page creates **N panels**, one per date, each containing only that date's rows.
- [x] If the extractor returns rows with a single `drawnAt` date (the existing behavior), it still creates **1 panel**. Regression check.
- [x] Each split panel persists `fileBlobs` only for the pages that contributed to it (best-effort: if Claude can't attribute pages to dates, fall back to attaching all pages to the latest split panel).
- [x] After upload, the user lands on the **labs index** (not a single panel detail), showing the N new panels at the top, each labeled with its date.
- [x] The extraction cache is still keyed by file-set hash, so re-pasting the same set re-uses the prior split.
- [x] Plan generator sees all N panels in its `recentPanels` window, ordered by `drawnAt`.
- [x] Privacy E2E still passes (no new hostnames; no new egress).
- [x] Test runs green on chromium. Mobile-webkit nice-to-have but not blocking.

## Out of scope

- Manually editing a panel's date after the fact (handled separately if needed).
- Splitting based on lab name when dates are the same (treat same-date rows from "Quest" + "LabCorp" as a single panel for v1).
- Auto-merging duplicate panels.

## Engineering notes

- The extractor (`src/extractor.ts`) currently returns `{ drawnAt, labName, rows[] }`. Change to return `{ panels: [{ drawnAt, labName, rows[] }] }`, where one entry per distinct date. Backward-compat is unnecessary — there are no production users yet.
- The prompt in `EXTRACTION_PROMPT` already asks Claude to extract `drawnAt` per row implicitly; tighten it to: "if you see multiple distinct draw dates on the pages, return separate panel entries — one per date — with rows grouped by date."
- `panelFromFiles` becomes `panelsFromFiles`, returning `Omit<Panel, "id" | "createdAt">[]`.
- `pages/labs.ts` upload flow: after extraction, call `addPanel` in a loop; navigate to the labs list, not the single panel detail, when N > 1.
- Test in `tests/e2e/labs.spec.ts`. Use the mock to return a multi-date payload by detecting a marker file name (e.g. `multi-date.png` triggers the multi-panel fixture).

## Implementation log

- 2026-05-15 — Implementation-Dev agent picked this up. Branch `feat/0001-auto-split-panels`. Plan: rework `extractor.ts` to return `{ panels: [...] }`, rename `panelFromFiles` → `panelsFromFiles`, loop `addPanel` in `pages/labs.ts`, and route to labs index when N > 1. Failing E2E first in `tests/e2e/labs.spec.ts` using a `multi-date.png` marker filename in the Anthropic mock.
- 2026-05-15 — Shipped via PR #2 (https://github.com/mutaaf/almanac/pull/2), merged as `0e5eea3`. Files touched: `src/extractor.ts` (new `ExtractedPanel`; `panels`-shaped return; `panelFromFiles` → `panelsFromFiles`; `EXTRACTION_PROMPT` tightened to instruct multi-panel-by-date; user text now lists file names so attribution has a hint), `src/pages/labs.ts` (loops `addPanel` over the returned panels; routes to `#/labs` when N > 1, retains `#/labs?id=N` for N == 1), `tests/helpers/mocks.ts` (sniffs user text for `multi-date` and serves the multi-date fixture), `tests/fixtures/extraction-multi-date.json` (3 panels: 2024-03-12, 2025-01-18, 2026-04-03), `tests/fixtures/extraction.json` (rewrapped under `panels: [...]`), `tests/e2e/labs.spec.ts` (3 new scenarios covering split, regression-single, and cache-replay-of-the-split). CI green on both chromium and mobile-webkit. Vercel preview deployed.
