---
id: 0002
title: User-extensible marker database
status: shipped
priority: P1
area: labs
created: 2026-05-14
owner: gtm-innovation
---

## User story

As a user whose lab report includes a marker we don't recognize, I want to define that marker myself (name, unit, lab range, functional range) so my full panel is captured and the Plan can reason against my whole biology — not just the markers we shipped with.

## Why now (four lenses)

### Product Owner
Today every unrecognized row is dead data. The match-unrecognized UI lets users map a row to a built-in marker, but if the marker doesn't exist (Lp-PLA2, ceruloplasmin, hs-troponin, fasting C-peptide…), the row gets skipped. For users on specialty panels (Boston Heart, Genova, ZRT, mainland-Asian-lab translations) that's most of the report. We need a "define this marker" affordance that turns an unrecognized row into a first-class one.

### Stakeholder
Marker canonicalization is part of the moat. We ship ~70 markers; specialty practice ships ~300. We can't curate the long tail ourselves — and shouldn't try to. The right design is: ship a strong seed DB, let the user extend it locally, and the Plan generator gets the extension in its prompt automatically. The Plan still doesn't have functional-range opinions about the user's custom markers (no curated description), but the lab range is enough to flag in-range / out-of-range correctly.

### User
A row that read "Lp-PLA2" → "unrecognized" → friction. After this ticket, the same row offers "Define Lp-PLA2 once" → fills three fields → done forever on this device, including for future panels that mention it.

### Growth
This is the feature that lets specialty-medicine users (Wild Health, Function Health, Quest Defender, etc.) take Almanac seriously. They're the highest-LTV cohort and the loudest evangelists when something works for them. Even one of them telling their forum / Discord / Twitter community is a multiplier.

## Acceptance criteria

- [ ] On the panel detail's "Unrecognized rows" section, each row exposes a **"Define this marker"** action alongside the existing "match to existing" affordances.
- [ ] The define-marker form captures: canonical name, short name (optional), category (dropdown from the existing enum), unit, lab range low/high (optional), functional range low/high (optional, but at least one of lab or functional must be present), description (textarea), sex restriction (optional).
- [ ] On save, the new marker is persisted to a `userMarkers` table in IndexedDB, then the matching unrecognized rows on the current panel are immediately bound to it (flag computed).
- [ ] User markers appear in the full marker dropdown for future match-unrecognized actions, distinguishable from built-ins with a small "yours" pill.
- [ ] `findBestMatches`, `matchMarker`, and `findMarker` all transparently consider user markers (seed + user, with user winning on conflicts).
- [ ] Plan + Meal generators include user markers in the Marker Reference block; LLM treats them as authoritative ranges.
- [ ] Export/import round-trip preserves user markers.
- [ ] Privacy E2E still passes.
- [ ] Tests in `tests/e2e/labs.spec.ts` for define + persistence + dropdown surfacing.

## Out of scope

- Editing the built-in seed markers (you can only add yours, not mutate ours). If you disagree with our default optimum, override by defining a same-key user marker — the user table wins.
- Sharing markers between users / publishing to a community catalog. (Future ticket if real demand emerges.)
- Auto-suggesting LOINC codes.

## Engineering notes

- New IndexedDB table `userMarkers`: schema v5, additive over v4. Same shape as `MarkerDef`.
- New module `src/data/userMarkers.ts` with `listUserMarkers()`, `addUserMarker()`, `deleteUserMarker()`.
- Modify `src/data/markers.ts` matchers to take an optional `extras: MarkerDef[]` argument and prepend it to MARKERS in scoring. Callers fetch user markers from IndexedDB and pass them.
- Or simpler: a `getAllMarkers()` async helper that returns seed + user; refactor callers to use it. Async chain matters — Plan generation must await this before composing the prompt.
- New UI: `src/pages/labs.ts` panel detail — add a "Define new marker" button per unrecognized group; form rendered inline or as a slideover.
- Settings: add a "Your markers" subsection listing user markers with a delete affordance.
- Export schema bump to v4 in `db.ts` — include `userMarkers` in `AlmanacExport`.

## Implementation log

- 2026-05-15 — Picked up via `/ship 0002`. Branched `feat/0002-user-extensible-markers`. Plan:
  schema v5 adds `userMarkers` table (additive); `src/data/userMarkers.ts` exposes
  `listUserMarkers`/`addUserMarker`/`deleteUserMarker`/`getAllMarkers`; matchers in
  `src/data/markers.ts` accept an optional `extras` and prepend (user wins). Labs panel
  detail grows a "Define this marker" affordance per unrecognized group that immediately
  binds matching rows on save. Settings gains a "Your markers" subsection. Export bumps
  to v4 and includes `userMarkers`. Plan + Meal generators await `getAllMarkers()` before
  composing the Marker Reference block.
- 2026-05-15 — Shipped via PR #4. CI all-green: Typecheck + build (14s), E2E chromium
  (1m43s), E2E mobile-webkit (3m42s), Vercel preview. 7 new specs in
  `tests/e2e/labs.spec.ts` cover define + persist + immediate bind + dropdown surfacing
  (with "yours" pill + option label) + form validation + Settings list + delete + plan
  prompt injection + export round-trip.

  Notable implementation details:
  - The form pre-fills unit and lab range from the extracted row, so the common case is
    two clicks: open form, save.
  - User keys are deterministic and prefixed `user_` (slug of the canonical name) so
    they can't collide with seed keys by accident; to override a seed default the user
    saves a same-keyed entry (the matcher pool suppresses seed entries whose key
    matches an extras entry).
  - The `matchRowsByName` callsite in `labs.ts` was updated to consider user markers
    too — needed for the "Match selected" path when the user picks their own marker
    from the dropdown.
  - The Marker Reference block in `claude.ts` flags user-defined entries as
    "(user-defined; treat these ranges as authoritative)" so the model uses their
    ranges rather than inventing functional opinions on specialty markers.

  Files: `src/db.ts`, `src/data/markers.ts`, `src/data/userMarkers.ts` (new),
  `src/extractor.ts`, `src/pages/labs.ts`, `src/pages/settings.ts`, `src/claude.ts`,
  `src/styles.css`, `tests/e2e/labs.spec.ts`,
  `tests/fixtures/extraction-with-unrecognized.json` (new), `tests/helpers/mocks.ts`.
