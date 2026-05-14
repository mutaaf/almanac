#!/bin/bash
# Local autonomous "groom" agent. Fired by launchd (every 6h at :17 local —
# 00:17 / 06:17 / 12:17 / 18:17).
#
# - Pulls main into a working checkout.
# - Asks the local `claude` CLI to invoke the gtm-innovation subagent: regroom
#   existing tickets, add 2-4 fresh ones focused on acquisition / retention /
#   moat, open a PR.
# - Self-gates: if there are already ≥3 groomed P0/P1 tickets, it no-ops.
#
# Logs land in ~/.cache/almanac-agent/logs/groom-<UTC timestamp>.log.

set -euo pipefail

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/$(whoami)}"

REPO_URL="https://github.com/mutaaf/almanac"
WORKDIR="$HOME/.cache/almanac-agent/checkout"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
mkdir -p "$WORKDIR" "$LOG_DIR"

TS=$(date -u +%Y%m%d-%H%M%S)
LOG="$LOG_DIR/groom-$TS.log"
exec >"$LOG" 2>&1

echo "=== almanac-groom firing $(date -u) (local $(date)) ==="
echo "PATH=$PATH"
echo "claude=$(command -v claude || echo MISSING)"
echo

# Self-cancel after 2026-05-28 UTC.
TODAY=$(date -u +%Y%m%d)
if [ "$TODAY" -ge "20260528" ]; then
  cat <<EOF
expired — local launchd agent has reached its 14-day self-cancel date.

To re-arm, edit scripts/agent-groom.sh and bump the cutoff date, then:
  launchctl kickstart -k gui/\$UID/com.almanac.agent-groom
EOF
  exit 0
fi

if [ ! -d "$WORKDIR/.git" ]; then
  git clone --depth=20 "$REPO_URL" "$WORKDIR"
fi
cd "$WORKDIR"
git fetch origin --prune --quiet
git checkout main --quiet
git reset --hard origin/main --quiet
git clean -fdq

git config user.email "noreply@anthropic.com"
git config user.name "Almanac GTM Agent"

claude --print --dangerously-skip-permissions <<'PROMPT'
You are the autonomous GTM/Innovation runner for this Almanac repo (you are
already at its working dir on main).

Read AGENTS.md, docs/backlog/README.md, and every file under docs/backlog/.

Self-gate: count tickets where frontmatter `status: groomed` AND `priority: P0`
or `P1`. If that count is ≥ 3, print "backlog is full (N groomed P0/P1)" and
exit cleanly with no changes.

Otherwise, do the work:
  1. Use the Task tool with subagent_type="gtm-innovation" (.claude/agents/
     gtm-innovation.md). Prompt it to:
       (a) run a grooming pass across every existing ticket — re-rank
           priorities, rewrite vague tickets to template standard, mark
           dead ones rejected, move ready ones from proposed → groomed.
       (b) add 2–4 fresh tickets focused on USER ACQUISITION, RETENTION,
           or MOAT-DEEPENING. Use the next available NNNN ids. Each
           ticket follows docs/backlog/_template.md exactly: frontmatter
           + user story + four-lens "Why now" + acceptance criteria
           (test-shaped) + out-of-scope + engineering notes.

  2. Update docs/backlog/README.md's index table to reflect the new
     ordering and statuses.

  3. NEVER touch anything under src/ or tests/. NEVER run npm or playwright.
     The GTM agent has no business in code.

  4. Create a feature branch:
       git checkout -b chore/gtm-$(date -u +%Y%m%d-%H%M)

  5. Commit with message starting `GTM: backlog update YYYY-MM-DD` and the
     trailer exactly:
       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

  6. Push the branch:
       git push -u origin HEAD

  7. Open a PR:
       gh pr create --base main \
         --title "GTM: backlog update YYYY-MM-DD HH:MM UTC" \
         --body "Autonomous backlog refresh.\n\n## Tickets added/changed\n<one bulleted line per ticket id + title + status>"

NEVER push to main directly. NEVER edit src/ or tests/. NEVER force-push.

End with a one-line summary: "<N> tickets touched, PR <url>".
PROMPT

EXIT=$?
echo
echo "=== almanac-groom complete $(date -u) — exit=$EXIT ==="
exit $EXIT
