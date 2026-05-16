---
id: 0004
title: Apple Health import (CSV/XML, on-device)
status: shipped
priority: P2
area: infra
created: 2026-05-14
owner: gtm-innovation
---

## User story

As an Apple Health user, I want to drop my Health Export ZIP into Almanac and have the relevant daily signals (HRV, sleep duration, resting heart rate, body weight, blood glucose if I wear a CGM) parsed on-device into Almanac's check-in record, so my Plan can adapt to what I'm actually doing day to day, not just to my labs.

## Why now

### Product Owner
The check-in screen captures sleep / mood / energy manually today. That's friction. Half the people who'd benefit from this app already have months of HRV, sleep, and RHR sitting in their Health app. Importing it bridges Almanac's "labs are episodic" with "daily reality is continuous" — without us building wearable integrations one vendor at a time.

### Stakeholder
This is the local-first answer to the "you should integrate with Whoop / Oura / Garmin" pressure that every wellness app eventually faces. Instead of a fragile per-vendor OAuth stack we'd have to maintain (and that'd compromise the no-backend story), we let Apple Health's user-controlled export be the ingest format. Apple Watch + Whoop + Oura + Garmin all already push to Health on iOS. One on-device parser unlocks all of them.

### User
Settings → "Import Apple Health." Drop the .zip. 30 seconds of on-device XML parsing (we show progress). Land on a summary: "Imported 387 days of sleep, 412 days of HRV, 89 weights." From now on, the Plan generator sees these in its context.

### Growth
This is the moment we stop being "the lab app" and become "the health app you don't have to feed." Users who paid for Whoop get instant value without churning Whoop. The post-import screenshot ("9 months of HRV in 12 seconds") is shareable.

## Acceptance criteria

- [ ] Settings exposes an **"Import Apple Health"** file input that accepts `.zip` and `.xml`. The privacy E2E asserts no new hostnames during the entire import.
- [ ] Parsing runs in a `Worker` (`src/health/apple.worker.ts`); UI thread stays responsive (test: a click on the masthead nav during import is handled within 200ms).
- [ ] Parser extracts these `HK*` record types: `HeartRateVariabilitySDNN`, `RestingHeartRate`, `SleepAnalysis` (aggregated per night into hours), `BodyMass`, `BloodGlucose`. Other record types are ignored without error.
- [ ] After import, a results banner names exact counts: "Imported N days of HRV, M nights of sleep, K weights, L RHR readings, G glucose readings." Asserted against the synthetic fixture's known counts.
- [ ] Each imported day updates / inserts a `CheckIn` row. If the user previously logged `signals.mood` or `signals.energy` for a given day, the import does NOT overwrite those fields — only sets the new continuous signals. Regression scenario in the spec.
- [ ] Progress page gains a "Continuous signals" section with HRV / RHR / sleep sparklines over the last 90 days when any imported data exists; section is omitted entirely when no data.
- [ ] Re-running the import with the same file is idempotent: counts banner shows the same numbers, no duplicate `CheckIn` rows (asserted via `recentCheckIns(90).length` before and after second import).
- [ ] A malformed XML produces an `errorCard()` with a recoverable message; the app does not throw to console.
- [ ] Privacy E2E still passes (allow-list unchanged).
- [ ] New `tests/e2e/health-import.spec.ts` covers happy path + idempotency + manual-entry-preservation + malformed-file using a synthetic 10-day `tests/fixtures/health-export.xml` checked into the repo.
- [ ] All scenarios pass on chromium; mobile-webkit is in-scope (Apple users will run this on their phones).

## Out of scope

- Direct API integration with Apple Health (requires native iOS app; we're a web app for now).
- Direct per-vendor integrations (Whoop, Oura). The right answer is "export from your wearable's app to Apple Health, then export Health."
- Workout / activity / step parsing for v1 (deferred until a Plan reads them; they bloat the import).
- Real-time push updates. Import is user-initiated, batch.

## Engineering notes

- `src/health/apple.ts` — the parser. SAX-style streaming XML (full DOM parse will OOM on multi-GB exports). Use a Web Worker so the UI doesn't freeze.
- Zip handling: use the browser's built-in `DecompressionStream` where available; fall back to `fflate` (~30kb) if needed. Justify any new dep in the commit message.
- New types in `src/types.ts`: `ContinuousSignal { day: Day; hrvMs?: number; rhrBpm?: number; sleepHours?: number; weightKg?: number; glucoseMgDl?: number[] }`. Persisted in a new table or merged into `CheckIn.signals` — preference: extend CheckIn so the existing daily timeline stays the single source of truth.
- Progress page: extend `pages/progress.ts` to render continuous-signal sparklines when any imported data exists.
- Plan generator: extend `formatAdherence` to include 7-day rolling averages of HRV / sleep / RHR — gives the LLM ground to say "your HRV trends down on weeks you don't hold the habit stack."

## Implementation log

- 2026-05-16 — picked up by implementation-dev. Branch `feat/0004-apple-health-import`. Plan: SAX-style parser in a Web Worker, zip via `DecompressionStream` (no `fflate` — built-in is universally available in the browsers we target). New `CheckIn.signals` continuous fields rather than a new table (per engineering notes). Progress page sparklines + `formatAdherence` 7-day rolling averages of HRV / RHR / sleep.
- 2026-05-16 — shipped in PR #18. Files touched: `src/health/apple.ts` (regex-streamed parser), `src/health/apple.worker.ts` (Web Worker + `DecompressionStream` zip reader), `src/health/importApple.ts` (orchestration + merge logic), `src/types.ts` (extended `CheckIn.signals` + new `ContinuousSignal`), `src/pages/settings.ts` (file input + banner + errorCard wiring), `src/pages/progress.ts` (Continuous-signals section with sparklines), `src/claude.ts` (`formatAdherence` extended with 7-day rolling averages + week-over-week deltas), `src/styles.css` (continuous-signal cards + health-banner), `tests/e2e/health-import.spec.ts` (8 scenarios), `tests/fixtures/health-export.xml` (synthetic 10-day fixture with known counts). No new npm dep — `DecompressionStream` was sufficient and `fflate` proved unnecessary.
