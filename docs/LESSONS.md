# Agent Lessons — operational memory for the autonomous loop

This is the self-learning layer. Every autonomous agent (ship, groom, review)
**reads this file at the start of every run**, right after `AGENTS.md`, and
**appends a new entry whenever it hits a failure or takes a healing action that
a future run should know about.**

The goal is compounding: a problem solved once should never cost a full
debugging pass again. `AGENTS.md` is the *contract* (what you must/mustn't do);
this file is *experience* (what actually went wrong and how it was fixed).

## How to write an entry

- One entry per lesson. Keep it to 1–3 lines.
- Format: `- YYYY-MM-DD [agent/phase] SYMPTOM → CAUSE → FIX`
- Only append a **novel** lesson. Before adding, scan the entries below; if the
  lesson is already here, do nothing (don't re-log known failures).
- Entries ride on whatever branch you're already working (the feature branch
  during a ship, the PR branch during a heal, the `chore/gtm-` branch during a
  groom). Never push to `main` directly just to record a lesson.
- Prune only during a `groom` run, and only to merge exact duplicates. Never
  delete a lesson that still describes live behavior.

## Gating vs non-gating CI checks (load-bearing — read before judging mergeability)

Branch protection gates merges on exactly these three checks:

- `Typecheck + build`
- `E2E (chromium)`
- `E2E (mobile-webkit)`

**Every other check is informational and must be ignored when deciding whether a
PR can merge** — including `Vercel` and `Vercel Preview Comments`. A red Vercel
check never blocks a merge and is never a reason to "fix" anything.

## Entries

- 2026-05-20 [ship/heal] A PR with all gating checks green still won't auto-merge and shows `mergeStateStatus: BEHIND` → branch protection requires the branch to be up to date with `main`, and nothing rebases it automatically → run `gh pr update-branch <n>`; CI re-runs on the new merge commit and auto-merge fires when green. This single gap froze the whole loop for ~17h (every ship run hit the single-PR gate and exited).
- 2026-05-20 [ship/review] `Vercel` check reports FAILURE but the PR is otherwise mergeable → Vercel is NOT a branch-protection gating check → ignore its state entirely when deciding mergeability or whether to attempt a fix. Only the three checks above gate.
- 2026-05-20 [ship] One stuck `feat/` PR used to freeze ALL shipping because Step 1 exited the moment any `feat/` PR was open → the gate now *heals before it gives up* (rebase if BEHIND, recover if red, only then wait) so a single stall can no longer halt the backlog.
- 2026-05-20 [ship] A `chore/gtm-` groom PR can also stall on `BEHIND` (#44 hit this) → PHASE 1 now tends `chore/gtm-` PRs too (feat/ first, then chore/gtm-), applying the BEHIND-rebase and trivial DIRTY-resolve cases; a red gating check on a groom PR (usually backlog:check) is escalated by comment, not hand-fixed — the next groom run reopens with a corrected index.
- 2026-05-20 [human] A human picked up ticket 0001 from a stale local checkout and rebuilt a feature the ship agent had already merged days earlier → local `main` and the memory snapshot lagged origin → always `git fetch origin main` and check the ticket's status on `origin/main` before starting any ticket.
- 2026-05-20 [ship] The README index table can show a ticket as `groomed` after its implementation has already merged → ship updates the ticket FILE on shipping while groom rewrites the index (every 6h), so the index lags up to 6h → PHASE 2 must read the ticket FILE's `status:` as truth (the index gives ordering only) and never re-ship a file marked `shipped`. Ship also flips the index row on shipping to shrink the drift window. Now enforced deterministically by `scripts/check-backlog.mjs` in the "Typecheck + build" gating job — drift can no longer merge.
- 2026-05-19 [test] `progress.spec.ts › renders the latest-values section when there is one panel` flakes on chromium under parallel load (manual-entry path) → IndexedDB read-after-write timing → it recovers on retry under CI's `retries: 2`; do NOT "fix" it by weakening the assertion. If it ever fails deterministically, add a `waitForDb`-style poll, never a bare timeout.
- 2026-05-19 [dev] Plan/meal composition fails with "Could not parse JSON" → the model response was truncated at `max_tokens` → bump `max_tokens` for the relevant generator in `src/claude.ts` (see commit 21fbf50). Detect truncation via `stop_reason === "max_tokens"` and surface a clear error, never a silent empty plan.
- 2026-05-19 [dev] WebKit `page.goto("/#/route")` returns before the SPA renders (hash navigations don't fire `load`) → after each goto, wait for a sentinel element of the target page; for the post-compose read-after-write pattern use the `composePlan` / `waitForDb` helpers.
- 2026-05-20 [dev] A spec file that runs many `onboard`→`composePlan` flows (e.g. what-if 0019, 18 tests × 2 projects) can fail with "Test timeout of 45000ms exceeded" / "Tearing down context exceeded the test timeout" when run at 2 workers on a busy local machine — the page renders fine in the failure snapshot, so it is parallel-load contention, NOT a regression. Confirm by re-running the failing test in isolation or the file at `--workers=1` before treating it as a bug; CI's per-project jobs + `retries: 2` absorb it. To cut the load, seed a bare plan + panel straight into IndexedDB (helper `seedPlanAndPanel`) instead of paying the compose round-trip when the test only needs a rendered dashboard.
- 2026-05-20 [dev] `getAllMarkers()` strips `createdAt` off user markers, so you cannot detect "is this a user-defined marker?" by sniffing that field on the merged catalog → test seed-membership instead: `findMarker(key)` (no extras) returns undefined for a user marker. Used by the 0019 simulator's approximate-bounds note.
- 2026-05-20 [ship/phase2] Resuming a partial prior ship whose PR already has auto-merge armed (0019/#46): the squash fires the instant the final feature commit's CI goes green, BEFORE PHASE 2 step 11 can push the `status: shipped` flip, so the flip gets orphaned into a follow-up PR → push the ticket→shipped + index-row flip in the SAME commit that completes the feature (revert if CI reddens), OR if a follow-up PR is unavoidable name its branch `chore/gtm-*` or `feat/*` so PHASE 1's healing net (`^(feat/|chore/gtm-)`) can tend it — a `chore/0019-ship-status`-style branch is invisible to that query and stalls silently if it goes BEHIND.
- 2026-05-20 [groom] A groom run that shares the SAME working dir with an in-flight ship run is destructive: while ship implements a `feat/` ticket (0020) it switched the shared checkout to `feat/0020`, and its git ops (stash/checkout/clean) silently REVERTED the groom's `docs/backlog` frontmatter edits AND deleted the groom's untracked new ticket files (0024–0027 vanished mid-run) → never branch/commit the groom from the shared working dir while a `feat/` PR is being built in it. Do all groom git work in an isolated `git worktree add -b chore/gtm-... <path> origin/main`, write/commit the backlog files there (the orchestrator already has their content), push, PR, then `git worktree remove`. The shared checkout's HEAD and the ship's WIP stay untouched.
- 2026-05-20 [dev] An interactive `/ship` session shares ONE working checkout with the launchd `agent-groom.sh` / `agent-ship.sh` jobs. Mid-session a groom run did `git checkout main && git reset --hard origin/main`, which switched the branch out from under the dev session AND discarded every UNCOMMITTED file (new source, new spec, edits) — only the already-committed status-flip survived → COMMIT EARLY AND OFTEN on the feature branch: land a WIP commit the moment the code compiles, before any long test run, so a concurrent agent's branch-switch/reset can't wipe an hour of work. After such a clobber, recover by `git checkout feat/<id>`, then re-create files from context and re-commit; leave the groom agent's stray `docs/backlog/00NN-*.md` + index churn OUT of the feature commit (move them aside / `git checkout HEAD -- docs/backlog/README.md`) so `backlog:check` stays in sync with only your ticket's rows.
- 2026-05-20 [dev] Editing a `.spec.ts` file WHILE `playwright test --workers=1` is running that same file makes the runner throw "Cannot find module <spec>.ts" and fail every remaining test in the file — it's a harness artifact, not a real failure. Never edit a spec mid-run; let the run finish, then edit, then re-run.
- 2026-05-20 [dev] A `page.evaluate` IndexedDB seed helper that reassigns an add-request's `onsuccess` AFTER the request was queued (to read the auto-id for a dependent write in the SAME tx) is racy: if the add already fired success, the handler never runs, the dependent write is silently skipped, and the evaluate promise can be left dangling so the test's next `page.goto` aborts it with "Execution context was destroyed by navigation" (hit seeding projections joined to seeded panels in 0021). FIX: write the parents in one tx and resolve the helper on `tx.oncomplete` capturing each id in its own `req.onsuccess` (which DOES fire before oncomplete), then write the dependents in a SECOND tx keyed off the now-committed ids. Also: the `checkins` store has a `&day` UNIQUE index — a seed that emits duplicate `day`s (e.g. `dayOffset: i % N`) throws "tx failed"; always seed unique days.
- 2026-05-21 [dev] `adopt-and-adapt.spec.ts:345` ("compose with a seed … then clears the seed") and `hundred-day.spec.ts:146` fail LOCALLY on this Mac (deterministically at `--workers=1` for the adopt one; a 45s test-timeout for the hundred-day one) while `origin/main`'s CI for the SAME commit is green → these are local-environment artifacts, not regressions. Proof technique when you suspect a failure is pre-existing: check out the unmodified base commit's source over your changed src files (`git checkout <base> -- src/...`), re-run the suspect test; if it still fails with your code reverted, it is not yours — restore with `git checkout HEAD -- src/...` and trust CI (which has `retries: 2` + per-project jobs + Linux runners that don't hit the local timing). Do NOT weaken these tests; they pass on CI. (The `git worktree add <base>` route to the same end is unreliable because a symlinked `node_modules` loads a duplicate `@playwright/test` and throws "did not expect test.describe() to be called here".)
