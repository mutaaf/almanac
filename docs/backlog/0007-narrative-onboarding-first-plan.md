---
id: 0007
title: First plan from intake alone (no labs required)
status: in-progress
priority: P0
area: onboarding
created: 2026-05-15
owner: gtm-innovation
---

## User story

As a brand-new user who just finished the welcome and onboarding forms but doesn't have a PDF of my labs in front of me, I want Almanac to compose a real first protocol from my intake answers — goals, conditions, dietary pattern, age, sex — so I see a tappable plan in my first session and have a reason to come back tomorrow with my labs.

## Why now (four lenses)

### Product Owner
Today the flow after onboarding is a dead-end gate: "Add labs to compose your plan." That's a perfect product-side reason, but it's a terrible user-side reason. The user spent four minutes typing out goals and a dietary pattern and is given an empty room and a homework assignment. Half of them never come back. The smallest meaningful unit of value is a *first plan* — even one written without lab data — because it converts the intake answers from a form-fill into an artifact. The labs become an upgrade, not a prerequisite.

### Stakeholder
The persistent timeline is the moat, but the timeline is empty on day one no matter what we do. The moat we *can* widen on day one is the **structured artifact** — `Plan` is a typed object that hangs around forever and gets re-composed on top of, not replaced. A first-session plan written from intake means every subsequent re-compose has prior context. It also exercises the plan-generation pipeline end-to-end on day one, surfacing prompt / cache / model issues we'd otherwise only catch after lab upload.

### User (at 7am on the phone)
I downloaded the app last night, typed five sentences about my goals, and went to bed. This morning my plan is waiting: a snapshot paragraph that reads back what I said in my own words, an eat list with five things I can actually find at the bodega, a 3-item habit stack, and a single retest suggestion that says "the most useful thing you can do this week is upload your last lipid panel — here's what we'll look at." I tap the eat list. I screenshot the snapshot. I show my partner over coffee.

### Growth
This is the missing wedge between "I saw a tweet about Almanac" and "I have my own plan to share." Right now the screenshot a friend wants to see only exists for users who got to the labs step. With this ticket, every onboarded user is a screenshot away from the show-me moment in their first session — typically inside 6 minutes from app open. That's the difference between a 5% and a 30% first-session-to-first-artifact rate (hypothesis; we'd see it in `latestPlan() != null` after onboarding completion, all measured locally).

## Acceptance criteria

- [ ] After saving the onboarding form for the first time, the user is routed to a new `#/plan` "first compose" state that offers two paths: **"Compose from intake"** (primary) and **"I have labs — upload first"** (secondary link to `#/labs`).
- [ ] Tapping **Compose from intake** fires exactly one Anthropic call. The mock detects it via a sentinel in the system prompt (`INTAKE_PLAN_VOICE` or a `kind=intake-plan` marker passed through the user message) and serves a new fixture `tests/fixtures/plan-from-intake.json`.
- [ ] The returned `Plan` validates against the existing `Plan` type and is persisted via `savePlan()`. `basedOnPanelIds` is `[]` (no panels).
- [ ] The composed plan's `snapshot` paragraph references at least one phrase from the user's `profile.goals` or `profile.dietPattern` verbatim or near-verbatim (assert by seeding intake with a distinctive token like "afternoon energy crash" and checking the rendered snapshot contains it via the fixture).
- [ ] The composed plan's `retest` array is non-empty and the first item's `reason` mentions uploading labs.
- [ ] After compose, the user lands on the standard `#/plan` dashboard view. The empty-state ("Your protocol hasn't been written yet") does NOT appear.
- [ ] When a labs panel is later added and the user re-composes, the resulting plan's `basedOnPanelIds` includes the new panel id — i.e. re-compose works exactly as today; intake-only plans are not a special re-compose state.
- [ ] Re-composing after labs are added does NOT delete the intake-only plan; `allPlans()` returns both, ordered newest first.
- [ ] A new `CallRecord` row with `kind: "plan"` (re-use the existing kind; do not invent a new one) shows up in Settings → Telemetry.
- [ ] All scenarios pass on both chromium and mobile-webkit.
- [ ] Privacy E2E still passes (no new hostnames).

## Out of scope

- A separate `IntakePlan` type / table. The output is just a `Plan` with empty `basedOnPanelIds`. Same shape, same table, no migration.
- Asking additional intake questions beyond what onboarding already collects. (If we need more, that's a separate ticket on onboarding depth.)
- An "intake-only" badge on the plan card. The presence of `basedOnPanelIds: []` is enough; the eyebrow already shows "Composed YYYY-MM-DD".
- Composing without consent or without a profile. Routes are still gated.

## Engineering notes

- `src/claude.ts` — add `ClaudeClient.generatePlanFromIntake(profile, userMarkers)` alongside the existing plan generator. New `INTAKE_PLAN_VOICE` system prompt that explicitly tells the model: no lab data available, write the plan against the user's stated goals, conditions, and dietary pattern; the eat / avoid lists must be defensible for a generic adult of this sex / age / dietary pattern; the first `retest` item must invite the user to upload labs and name the markers the plan would most benefit from. Re-use the existing `Plan` JSON schema. Use the same `cache_control` discipline as `generatePlan` — voice + marker reference are cacheable, the volatile bit is the intake summary.
- `src/pages/plan.ts` — `paintEmpty()` currently branches on `haveLabs`. Add a third branch: when `!haveLabs`, render the two-path compose state described above. The "Compose from intake" button calls a new `composeFromIntake()` function that mirrors the existing `compose()` flow (loading state, telemetry, `savePlan`, `await route()` to re-render). Reuse the existing error card on failure.
- `tests/fixtures/plan-from-intake.json` — copy `plan.json`, strip the panel-specific insights, keep eat/avoid/habits, ensure `basedOnPanelIds: []` and the retest item mentions uploading labs.
- `tests/helpers/mocks.ts` — sniff `INTAKE_PLAN_VOICE` and serve the new fixture; otherwise the existing plan sniffer wins.
- `tests/e2e/plan.spec.ts` — new scenarios per acceptance criteria. Use the existing `onboard` helper, then assert the new branch renders.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: **no**.

## Implementation log

- 2026-05-15 — picked up by implementation-dev. Branch `feat/0007-intake-only-plan`.
