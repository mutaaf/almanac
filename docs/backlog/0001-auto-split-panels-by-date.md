---
id: 0001
title: Auto-split panels by drawn date
status: in-progress
priority: P1
area: labs
created: 2026-05-14
owner: implementation-dev
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

- [ ] If the extractor returns rows associated with more than one distinct `drawnAt` date, the labs page creates **N panels**, one per date, each containing only that date's rows.
- [ ] If the extractor returns rows with a single `drawnAt` date (the existing behavior), it still creates **1 panel**. Regression check.
- [ ] Each split panel persists `fileBlobs` only for the pages that contributed to it (best-effort: if Claude can't attribute pages to dates, fall back to attaching all pages to the latest split panel).
- [ ] After upload, the user lands on the **labs index** (not a single panel detail), showing the N new panels at the top, each labeled with its date.
- [ ] The extraction cache is still keyed by file-set hash, so re-pasting the same set re-uses the prior split.
- [ ] Plan generator sees all N panels in its `recentPanels` window, ordered by `drawnAt`.
- [ ] Privacy E2E still passes (no new hostnames; no new egress).
- [ ] Test runs green on chromium. Mobile-webkit nice-to-have but not blocking.

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

- 2026-05-19: Picked up. Branched `feat/0001-auto-split-panels-by-date`.
