#!/bin/bash
# Local autonomous review agent. Polls every 5 minutes for open agent PRs
# that haven't been reviewed yet by the repo owner, then grades each one
# using local `claude` (which runs against your Claude Max subscription,
# so this is free).
#
# Because the agent runs under your gh CLI identity AND your identity is
# the PR author (the ship agent pushes via your gh token), GitHub forbids
# self-approval. So this agent never posts --approve. It posts:
#   --comment           for clean PRs (informational sign-off; doesn't block)
#   --request-changes   for blocking issues (blocks auto-merge until dismissed)
#
# Auto-merge on PRs only fires when CI is green AND no request-changes
# review is outstanding. So the request-changes path is your real safety
# net; the comment path is just a sign-off paper trail.
#
# Logs land in ~/.cache/almanac-agent/logs/review-<UTC>.log — but ONLY when
# the poller actually has work to do, to avoid 288 empty logs/day.

set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/$(whoami)}"

REPO="mutaaf/almanac"
WORKDIR="$HOME/.cache/almanac-agent/review-checkout"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
mkdir -p "$LOG_DIR"

# Self-cancel after 2026-05-28 UTC — bound the autonomous spend.
TODAY=$(date -u +%Y%m%d)
if [ "$TODAY" -ge "20260528" ]; then
  exit 0
fi

# Who am I to gh? Used to filter PRs that I've already reviewed.
ME=$(gh api user --jq .login 2>/dev/null || echo "")
if [ -z "$ME" ]; then
  echo "$(date -u): review agent — no gh auth, exiting" >> "$LOG_DIR/review.err"
  exit 1
fi

# Find open PRs from agent branches that don't yet have a review from us.
# Output is one PR number per line.
UNREVIEWED=$(gh pr list --repo "$REPO" --state open --base main \
  --json number,headRefName,reviews \
  --jq "[.[] | select(.headRefName | test(\"^(feat/|chore/gtm-)\"))
            | select(.reviews | any(.author.login == \"$ME\") | not)
            | .number] | .[]" 2>/dev/null)

if [ -z "$UNREVIEWED" ]; then
  # Quiet exit — most ticks have no work.
  exit 0
fi

# We have work. Now spin up the log file.
TS=$(date -u +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/review-$TS.log"
exec >"$LOG" 2>&1

echo "=== almanac-review firing $(date -u) (local $(date)) ==="
echo "reviewer: $ME"
echo "PRs to review:"
echo "$UNREVIEWED" | sed 's/^/  #/'
echo

# Fresh-pull main for the marker DB / AGENTS.md / backlog reads.
if [ ! -d "$WORKDIR/.git" ]; then
  git clone --depth=20 "https://github.com/$REPO" "$WORKDIR"
fi
cd "$WORKDIR"
git fetch origin --prune --quiet
git checkout main --quiet
git reset --hard origin/main --quiet
git clean -fdq

for PR in $UNREVIEWED; do
  echo
  echo "--- reviewing PR #$PR ---"

  # Check out the PR head via FETCH_HEAD. We deliberately avoid
  # `gh pr checkout` which tries to create a local tracking branch and
  # fails in our shallow checkout ("starting point ... is not a branch").
  # The detached HEAD is fine — the agent only reads files; nothing
  # commits back from this working tree.
  PR_SHA=$(gh pr view "$PR" --repo "$REPO" --json headRefOid --jq .headRefOid 2>/dev/null)
  if [ -z "$PR_SHA" ]; then
    echo "couldn't resolve head SHA for PR #$PR; skipping"
    continue
  fi
  if ! git fetch origin "pull/$PR/head" --depth=20 --quiet 2>&1; then
    echo "couldn't fetch PR #$PR head; skipping"
    continue
  fi
  git checkout --detach FETCH_HEAD --quiet
  if [ "$(git rev-parse HEAD)" != "$PR_SHA" ]; then
    echo "checked-out SHA $(git rev-parse HEAD) != expected $PR_SHA; skipping"
    continue
  fi

  # Pre-gather PR metadata + diff into known paths for the agent.
  rm -rf /tmp/review && mkdir -p /tmp/review
  gh pr view "$PR" --repo "$REPO" \
    --json title,body,headRefName,baseRefName,additions,deletions,changedFiles,files,author \
    > /tmp/review/meta.json
  gh pr diff "$PR" --repo "$REPO" > /tmp/review/diff.patch

  echo "diff: $(wc -l </tmp/review/diff.patch | tr -d ' ') lines"
  echo

  # Hand off to claude. --print is non-interactive, --dangerously-skip-permissions
  # auto-approves every tool call (no human here).
  claude --print --dangerously-skip-permissions <<PROMPT
You are the autonomous Review agent for the Almanac repo, reviewing PR #$PR
on branch \$(cat /tmp/review/meta.json | jq -r .headRefName).

You have:
  - The repo checked out at the PR head (cwd is the working tree)
  - /tmp/review/meta.json    — PR metadata
  - /tmp/review/diff.patch   — the actual diff
  - gh CLI authenticated as $ME (the PR author, so you CANNOT --approve)

Read in order:
  1. AGENTS.md (the contract)
  2. /tmp/review/meta.json
  3. /tmp/review/diff.patch
  4. docs/backlog/README.md
  5. The ticket referenced in the PR body (typically "Implements: docs/
     backlog/NNNN-..." or matched from the branch name like "feat/0005-...").
     If no ticket reference is found, post --request-changes and stop.
  6. .claude/agents/review.md — the full grading rubric.

Grade the PR against:
  • AGENTS.md hard NOs (no backend, no analytics, no consent-skip, no
    test deletion, no egress widening, no banned copy)
  • Ticket-fit (every acceptance-criteria checkbox covered by a test in
    the diff)
  • Test-first discipline (every src/ change has a matching tests/ change)
  • Code quality (TS strict, surrounding style, no dead code, etc.)

Deliver your verdict by calling gh:

  If the PR is clean:
    gh pr review $PR --repo $REPO --comment --body "<your detailed sign-off>"

  If the PR has BLOCKING issues:
    gh pr review $PR --repo $REPO --request-changes --body "<summary>"
    Plus inline comments via the GitHub Reviews API if useful.

  Do NOT use --approve. GitHub forbids self-approval and you're running
  as the PR author. Auto-merge fires on CI-green when no request-changes
  is outstanding — so request-changes is your real blocker, comment is
  your sign-off.

End the session immediately after the gh pr review call. Do not add
labels, do not post extra comments.
PROMPT

  # Back to main for the next PR (we were on detached HEAD).
  cd "$WORKDIR"
  git checkout main --quiet
  git reset --hard origin/main --quiet
done

# Wipe the working tree state on exit so the next tick starts clean.
git checkout main --quiet 2>/dev/null || true

echo
echo "=== almanac-review complete $(date -u) ==="
