---
id: 0012
title: "Next-draw projection — what we'd expect to see if you tested today"
status: proposed
priority: P1
area: progress
created: 2026-05-16
owner: gtm-innovation
---

## User story

As a user three weeks into a freshly-composed protocol — well past the daily-ritual novelty, still six weeks away from my retest — I want to open Almanac on a random Wednesday morning and see a "Projected next draw" card per marker on the Progress page that says, in plain English, the band the marker is *likely* to land in if I keep doing what I'm doing, based on adherence so far and the typical time-to-effect for that marker — so I have a reason to keep going on a day when nothing is otherwise moving and no new lab data has arrived.

## Why now (four lenses)

### Product Owner
The biggest hole in the daily / weekly / per-lab cadences is the **between-draw quiet zone**. Labs come 8–16 weeks apart. The Plan composes when labs come. The recap fires on Sunday. Today fires every morning. But weeks 3 through 10 of a protocol — the weeks where adherence either compounds or collapses — have nothing new to look at. A user with no new data on screen leaves. The smallest meaningful unit of value is one editorial card per marker on the Progress page: "Ferritin (last 18 ng/mL, March 4). Holding the iron-rich tier ~6 of 7 days. Typical time-to-effect is 8–12 weeks. Likely range at your next draw: 35–55 ng/mL." Computed deterministically from the latest value, adherence over the protocol window, and a tiny per-marker time-to-effect / responsiveness table in `src/data/markers.ts`. No LLM call. No new schema. The user has new information about themselves every week.

### Stakeholder
This widens both the **adherence loop** and the **functional-range DB** moats, and it does so in a way no Claude wrapper can copy. The adherence loop becomes load-bearing in a second surface (Progress, not just Plan-generation), which means every `CheckIn` row materially changes what the user sees the next time they open Progress — that's the compounding shape we want. The marker DB grows a new field per marker (`responsiveness: { weeksToEffect, expectedDirection, magnitude }`) which is curated, opinionated, and irreplaceable in a chat product — a user who pastes their lab into Claude.app cannot get back "8–12 weeks, expected magnitude +15 to +40 ng/mL on a high-iron dietary tier" because there is no source of truth Claude can reach for that number short of consensus-reading literature on the fly. We are building the canonical artifact for that consensus. (It also exposes our limits honestly: the band is a range, not a number, and markers without a curated responsiveness entry get an honest "we don't have enough data to project this marker" card rather than a fake prediction.)

### User (at 7am on the phone)
Wednesday, week 4 of the new protocol. I open Progress. Above the sparklines, a new section: "Between draws — what we'd expect." Four cards: ApoB, ferritin, hsCRP, fasting insulin. Each says where the last value sat, what tier I've been holding (with the small "6 of 7 days" tally re-used from the recap), the typical time window for the marker to move, and a small visualization of the projected band overlaid on the functional-range thermometer. It's not a promise; it's a statement of what the literature suggests is plausible given my inputs. I tap a card; the slideover shows the rule's evidence (which check-ins, what tier, the time-to-effect citation in plain English). I close it. I feel like the work is going somewhere even though my retest is six weeks out.

### Growth
This is the retention feature, plain and stated. Daily check-ins answer "did you do the thing today?" Recap answers "what happened this week?" Lab uploads answer "where do you stand?" None of those answers the most-asked between-draw question: *"is this actually working?"* The projection is the asnwer-shaped card for that question, and it's the first thing in the app that gives the user a reason to come back specifically because the *adherence data they generated* has produced *new on-screen information about their biology*. It's also a quiet referral lever — users who screenshot a "projected: 35–55 ng/mL ferritin in 8 weeks" tile next to "current: 18 ng/mL" are showing friends the part of the app that no other tool in the category has. (Hypothesis: feature is a week-3+ retention lever, not a day-1 acquisition lever — treat as untested until we have the local-only telemetry to see whether `#/progress` opens cluster mid-protocol after this ships.)

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/data/markers.ts` (and `src/data/userMarkers.ts` resolver path) gains a new optional `responsiveness?: { weeksToEffect: [number, number]; direction: "increase" | "decrease" | "either"; magnitude: { low: number; high: number; unit?: string } }` field on `MarkerDef`. Curated entries land for the markers where it's medically defensible: ferritin, ApoB, hsCRP, fasting insulin, hba1c, vit-D, omega-3 index, free-T3, magnesium-RBC. Other markers leave the field undefined.
- [ ] On `#/progress`, when at least one panel exists AND at least one of its markers has a curated `responsiveness` entry, a new section header "Between draws — what we'd expect" renders above the existing sparkline section. When no marker qualifies, the section is fully omitted (not shown empty).
- [ ] Each projection card shows: marker canonical name, the latest value + unit + draw date, the adherence-tier label currently being held ("easy" / "moderate" / "advanced" — derived from the same 14-day window `formatAdherence` in `src/claude.ts` uses), a "N of 14 days" tally, the typical time-to-effect ("typically moves over 8–12 weeks"), and a projected band visualization that overlays a translucent rectangle on the existing functional-range `thermometer()` — the rectangle spans the projected `[low, high]` and is rendered in an oxblood-stroked, no-fill style so it never visually competes with the current-value tick.
- [ ] Projection math is pure and deterministic: `computeProjection(marker, latestResult, checkins14d): { low: number; high: number; weeksOut: [number, number] } | null`. Returns `null` (skip the card) when adherence is below a threshold (say <30% of habit-stack days held over the last 14 — the "you haven't been doing the thing" case). The "we don't have a confident projection" empty-card branch reads: "Hold the easy tier for 7 of 14 days to start projecting where this marker lands."
- [ ] Zero new Anthropic calls. Asserted against the mock request count over a full page load.
- [ ] Tapping a projection card opens a slideover with the rule's plain-English evidence — which check-ins counted, which days were held, the time-to-effect citation phrased editorially ("Common functional-medicine practice expects ferritin to move 15–40 ng/mL over 8–12 weeks on a sustained iron-rich tier."), and a single closing sentence: "This is a plausible range, not a prediction. Your next draw is the only ground truth."
- [ ] When the user uploads a NEW panel after the card has been showing, the projection card for that marker on the previous panel is replaced by an evaluation row: "Projected 35–55 ng/mL. Landed at 42 ng/mL — within range." OR "Projected 35–55 ng/mL. Landed at 28 ng/mL — under range; consider what slipped." Computed against the *previous* projection that was live at the time the new panel was uploaded; this requires persisting the projection as a tiny `ProjectionSnapshot` row at panel-upload time (one row per qualifying marker per upload).
- [ ] Schema bump: Dexie v6 adds a `projections` table keyed by `markerKey + panelId`. Existing v5 data is preserved. The migration test asserts a v5 export can be imported into a v6 build without loss.
- [ ] Renders on both chromium and mobile-webkit. The slideover is the same primitive used elsewhere in the app, so the mobile-webkit case re-uses the existing slideover spec scaffolding; assertion on mobile is limited to "the section header appears, the cards appear, tapping opens the slideover" — projection-math edge cases are chromium-only.
- [ ] Privacy E2E still passes — no new hostnames in the allow-list; the new Dexie table doesn't leak across origins.
- [ ] New `tests/e2e/projection.spec.ts` covers: section omitted when no panel, section omitted when no qualifying marker, section appears with a single qualifying marker, adherence-below-threshold "hold the tier" empty branch, slideover evidence content, post-new-panel evaluation row (projected vs landed), v5→v6 schema migration.

## Out of scope

- LLM-generated projections. The whole point is that this is deterministic, transparent, and works offline. An LLM-projected "your ApoB will be 78" is exactly the kind of false-precision the editorial voice rejects.
- A confidence interval beyond `[low, high]`. We are not pretending to do statistical modeling. The band is the curated literature consensus, not a posterior.
- Projections for arbitrary user-defined markers (from ticket 0002). The `responsiveness` field is curated; user-defined markers without it cleanly skip the section. A future ticket could let users author their own responsiveness entries, but not this one.
- A push notification "your projected window opens this week." No notifications API; no backend; would break the cadence-by-opening discipline.
- A "share this projection" image. The compare card (ticket 0011) already covers the social channel; projections are an in-app, between-draw artifact for the user themselves, not a public claim.

## Engineering notes

- `src/types.ts` — extend `MarkerDef` with the optional `responsiveness` shape; add a `ProjectionSnapshot { id?: number; markerKey: string; panelId: number; low: number; high: number; weeksOut: [number, number]; createdAt: number }` interface.
- `src/data/markers.ts` — curated responsiveness entries on the ~9 markers listed above. Citations / sourcing live in a comment block at the top of the marker entry so future curators can sanity-check.
- `src/progress/projection.ts` (new) — pure `computeProjection()` + `evaluateLanded()` (compares a new panel's value against the prior snapshot's band). No DOM, no Dexie. Easy to test through the Playwright spec; if we ever add Vitest, this is the module that justifies it.
- `src/pages/progress.ts` — render the new "Between draws — what we'd expect" section above the existing sparkline section. Re-use `thermometer()` from `src/viz.ts` and overlay the projected band by passing an optional `projectionBand?: { low: number; high: number }` to it; the viz primitive gains one optional param, which is the minimum-invasive change.
- `src/db.ts` — add the `projections` table at Dexie v6 (additive over v5, mirroring how 0002 added `userMarkers` at v5). Helpers: `getProjectionsFor(panelId)`, `saveProjections(snapshots)`. The save call fires inside `addPanel()`'s post-insert continuation so every new upload that triggers a projection lands a snapshot atomically.
- `src/pages/labs.ts` — at successful new-panel insert, call into `src/progress/projection.ts` to materialize snapshots for any qualifying marker on the *prior* latest panel; persist them so the next visit to Progress shows the evaluation row.
- `src/claude.ts` — `formatAdherence` already computes the 14-day tier; reuse the same derivation in the projection module (don't duplicate). If the derivation isn't already extracted as a pure helper, do that as part of this ticket — it'll be a one-line refactor.
- `src/viz.ts` — extend `thermometer()` with the optional `projectionBand` overlay only. Don't invent a new viz primitive. If the overlay reads visually muddy against the existing functional-range band, render it as a stroked-only rectangle with no fill so the existing band stays the dominant visual.
- `src/styles.css` — `.projection-section`, `.projection-card`, `.projection-card__band-note`, `.projection-eval--in-range`, `.projection-eval--under` / `--over`. No new colors; the under/over states use the existing oxblood / ink tokens.
- `tests/fixtures/` — extend the existing fixtures or add a `projection-panel.json` with a known ferritin value such that `computeProjection` produces a deterministic `[35, 55]` band against a fixed adherence pattern. The test then either (a) seeds adherence directly in IndexedDB via the existing test helpers or (b) drives the today screen to check off N habits across N days using `page.clock.setFixedTime` (the same trick the recap spec uses; see 0008's implementation log for the gotcha — `install` deadlocks Dexie, `setFixedTime` does not).
- `tests/e2e/projection.spec.ts` — new file. Re-use `acknowledgeConsent` / `onboard` / `addManualPanel` from `tests/helpers/flows.ts`.
- Schema migration: **yes — Dexie v6**, additive only.
- Egress allow-list change: **no**. Projection is fully on-device.
- New deps: **no**.

## Implementation log

(Appended by the implementation-dev agent during execution.)
