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
