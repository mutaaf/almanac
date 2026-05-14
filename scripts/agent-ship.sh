#!/bin/bash
# Local autonomous "ship" agent. Fired by launchd (every hour at :41 local).
#
# - Pulls the latest main into a persistent working checkout (cheap re-clones).
# - Asks the local `claude` CLI to run the full implementation-dev loop against
#   the top groomed/proposed backlog ticket, single-PR-at-a-time gated.
# - All work happens via claude's tool use; this script is just the launcher.
#
# Logs land in ~/.cache/almanac-agent/logs/ship-<UTC timestamp>.log.

set -euo pipefail

# launchd starts processes with a minimal environment — set PATH ourselves.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/$(whoami)}"

REPO_URL="https://github.com/mutaaf/almanac"
WORKDIR="$HOME/.cache/almanac-agent/checkout"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
mkdir -p "$WORKDIR" "$LOG_DIR"

TS=$(date -u +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/ship-$TS.log"
exec >"$LOG" 2>&1

echo "=== almanac-ship firing $(date -u) (local $(date)) ==="
echo "PATH=$PATH"
echo "HOME=$HOME"
echo "claude=$(command -v claude || echo MISSING)"
echo

# Self-cancel after 2026-05-28 UTC. Bound the autonomous spend.
TODAY=$(date -u +%Y%m%d)
if [ "$TODAY" -ge "20260528" ]; then
  cat <<EOF
expired — local launchd agent has reached its 14-day self-cancel date.

To re-arm, edit scripts/agent-ship.sh and bump the cutoff date, then:
  launchctl kickstart -k gui/\$UID/com.almanac.agent-ship
EOF
  exit 0
fi

# Fresh-pull each run; depth-20 history is enough for our ops.
if [ ! -d "$WORKDIR/.git" ]; then
  git clone --depth=20 "$REPO_URL" "$WORKDIR"
fi
cd "$WORKDIR"
git fetch origin --prune --quiet
git checkout main --quiet
git reset --hard origin/main --quiet
git clean -fdq

# All branches the agent creates are committed under this identity.
git config user.email "noreply@anthropic.com"
git config user.name "Almanac Dev Agent"

# Hand off to the local claude. --print is non-interactive,
# --dangerously-skip-permissions auto-approves every tool call (no human here).
claude --print --dangerously-skip-permissions <<'PROMPT'
You are the autonomous Implementation-Dev runner for this Almanac repo (you are
already at its working dir on main).

Read AGENTS.md and docs/backlog/README.md first — they bind everything you do.

Step 1 — single-PR-at-a-time gate.
  Run:
    gh pr list --state open --base main --json number,headRefName \
      --jq '[.[] | select(.headRefName | startswith("feat/"))] | .[0].number // empty'
  If the result is non-empty, print "agent PR #N already open — exiting" and
  exit cleanly with no changes.

Step 2 — pick the ticket.
  Read every file under docs/backlog/ (skip _template.md and README.md).
  Parse frontmatter. Pick the highest-priority ticket where `status: groomed`.
  Tie-break: lower id wins. If none groomed, fall back to highest-priority
  `status: proposed`. If still nothing, print "no actionable tickets" and exit.

Step 3 — execute the implementation-dev loop.
  Use the Task tool with subagent_type="implementation-dev" (.claude/agents/
  implementation-dev.md). Hand it the ticket id and instruct it to execute the
  loop in its system prompt verbatim:

    1.  git checkout -b feat/<ticket-id>-<short-slug>
    2.  Update the ticket frontmatter to status: in-progress; commit as first.
    3.  Write the failing E2E test FIRST in tests/e2e/. Every acceptance-
        criteria checkbox maps to a test or expectation. Run it; confirm it
        fails for the right reason.
    4.  Implement the minimum code to make the test pass.
    5.  Run the full local gate — all three MUST pass:
          npm run typecheck
          npm run build
          npx playwright test --project=chromium
    6.  Commit with an editorial message; include the trailer:
          Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    7.  git push -u origin HEAD
    8.  gh pr create --fill --base main
    9.  gh pr checks --watch  (wait up to 18 min)
   10.  On green CI: update the ticket frontmatter to status: shipped + append
        to Implementation log; commit and push.
   11.  On red CI: leave the ticket as in-progress and the PR open. Add a PR
        comment with the exact failure.

HARD NOS — these fail the run:
  • Never push to main directly.
  • Never disable, weaken, or skip a passing test.
  • Never bypass branch protection or attempt to merge with red CI.
  • Never widen the privacy egress allow-list without an explicit ticket
    approval line.
  • Never add consent-skip shortcuts in src code.
  • Never introduce a backend, an analytics SDK, or a proxy for the
    Anthropic call.

End with: PR url, CI state, ticket id, ticket final status, any spawned
sibling tickets.
PROMPT

EXIT=$?
echo
echo "=== almanac-ship complete $(date -u) — exit=$EXIT ==="
exit $EXIT
