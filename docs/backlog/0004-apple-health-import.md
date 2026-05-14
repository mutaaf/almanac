---
id: 0004
title: Apple Health import (CSV/XML, on-device)
status: proposed
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

- [ ] New Settings action: "Import Apple Health." Accepts `.zip` (Apple's export format) or `export.xml` directly.
- [ ] Parsing happens entirely **on-device** via a Web Worker — no network egress (privacy E2E enforces).
- [ ] Parser extracts these record types initially: HRV (HKQuantityTypeIdentifierHeartRateVariabilitySDNN), Resting HR (HKQuantityTypeIdentifierRestingHeartRate), Sleep Analysis (HKCategoryTypeIdentifierSleepAnalysis, aggregated into hours per night), Body Mass (HKQuantityTypeIdentifierBodyMass), Glucose (HKQuantityTypeIdentifierBloodGlucose).
- [ ] Each day's import becomes / updates the `CheckIn` row for that day. Manual entries are NEVER overwritten — if the user already logged today's mood, it stays.
- [ ] Progress page gains a new section "Continuous signals" with sparklines for HRV / RHR / sleep over the last 90 days when data exists.
- [ ] Import is idempotent — re-running with the same file doesn't duplicate.
- [ ] Privacy E2E still passes (allow-list unchanged).
- [ ] Test in a new `tests/e2e/health-import.spec.ts` using a synthetic minimal export.xml fixture (10 days of data).

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

(empty)
