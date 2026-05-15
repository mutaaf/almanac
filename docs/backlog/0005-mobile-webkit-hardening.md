---
id: 0005
title: Mobile-WebKit timing hardening — promote to gating CI check
status: in-progress
priority: P0
area: infra
created: 2026-05-14
owner: gtm-innovation
---

## User story

As a user opening Almanac on Mobile Safari (the dominant mobile browser, especially in our likely audience), I want the same reliability and test guarantees the chromium build gets, so my plan composition, meal generation, and daily check-in work every time — and so the "no regressions allowed" contract is actually enforced on the surface most users will touch.

## Why now

### Product Owner
We documented the mobile-webkit timing issues as a known issue and pulled it from the gating CI checks. That was a pragmatic ship decision, but it's a debt against the contract. Closing it means our E2E suite genuinely covers what users see. Without this, every future feature on mobile is in a "we don't really test it" zone.

### Stakeholder
WebKit's IndexedDB has documented eventual-consistency quirks under load, and Vite's HMR + parallel workers stresses them in ways production users never will. The two right fixes: (a) make the app's IndexedDB reads use a `waitFor`-style polling helper that's robust to the quirks; (b) restructure the few places where we `location.hash = currentHash` (which doesn't fire `hashchange` in WebKit) to call `route()` directly. Both improve real-user reliability, not just test pass rate.

### User
Visible improvement: fewer one-off "I tapped Compose and nothing happened" moments where the user has to refresh.

### Growth
Mobile is where users actually live. If we ship a feature that works on chromium but flakes on Mobile Safari, the people who try us on their phones (= everyone we want as users) get the broken experience. This unblocks every future mobile-affecting ticket.

## Acceptance criteria

- [ ] All 41 tests in the full Playwright suite pass on **mobile-webkit** with `retries: 0`, in **at least 3 consecutive runs**.
- [ ] CI workflow is updated to remove `continue-on-error: true` from the mobile-webkit job — it becomes a gating check identical to chromium.
- [ ] AGENTS.md "Known issues" entry for mobile-webkit is removed.
- [ ] No tests are deleted, weakened, or marked `.skip` to achieve green.
- [ ] All app-code changes preserve functionality on chromium (no regressions).
- [ ] Total CI runtime increases by no more than 4 minutes vs the current run.

## Out of scope

- Adding a separate "desktop-webkit" project. Mobile is what matters.
- Rewriting the SPA to use a real router framework. Hash routing + targeted `route()` calls is enough.
- Adding `webkit` (non-mobile) coverage.

## Engineering notes

- Three suspect families of failure documented in trace artifacts:
  1. `composePlan` reload-trick races. Fix in app code: in `pages/plan.ts` `compose()`, replace `location.hash = "#/plan"; void renderPlan();` with a direct `await route()` import — set the hash but also `await renderPlan()`. Drop the test-side reload.
  2. Habit-tap full repaint race. Already fixed in plan.ts (kept only optimistic update); confirm no regressions.
  3. IndexedDB read-after-write under WebKit's slightly delayed transaction commit. Add a `waitForDb` helper in `tests/helpers/flows.ts` that polls `latestPlan()` / `latestMealPlan()` until the expected count appears, with a short backoff. Use it in flows where the next step reads a row that the previous step wrote.
- Avoid the reload-trick in `composePlan` — it's a workaround masking a real bug. The real fix is in `plan.ts compose()`.
- Update `playwright.config.ts` after greens to drop `workers: 2` cap if 4 also passes.

## Implementation log

- 2026-05-15 — Picked up via `/ship 0005`. Branch `feat/0005-mobile-webkit-hardening`. Plan: (1) replace the `location.hash + void renderPlan()` race in `pages/plan.ts compose()` with a direct `await` of the imported `route()`; (2) add a `waitForDb` helper in `tests/helpers/flows.ts` that polls IndexedDB via `page.evaluate` until the expected plan/meal row is readable; (3) drop the reload-trick from `composePlan`; (4) lock the fix in with a new `tests/e2e/webkit-hardening.spec.ts`; (5) drop `continue-on-error: true` from the mobile-webkit job in `.github/workflows/ci.yml`; (6) remove the AGENTS.md Known-issues entry. Will gate landing on 3 consecutive clean mobile-webkit runs locally.
