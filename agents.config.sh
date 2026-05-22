# agents.config.sh — Almanac fleet manifest (plumbing only).
# Semantics (gating checks, branch prefixes, local gate, hard NOs) live in
# AGENTS.md § Agent parameters. After editing, redeploy:
#   bash ../agent-fleet/lib/install.sh /Users/mutaafaziz/Desktop/projects/almanac

PROJECT_NAME="Almanac"
SLUG="almanac"
NAMESPACE="com.almanac"
REPO_URL="https://github.com/mutaaf/almanac"
MODEL="claude-opus-4-7"

GIT_AUTHOR_NAME="Almanac Agent"
GIT_AUTHOR_EMAIL="noreply@anthropic.com"

# Re-armed 2026-05-22 (was 20260528). 30-day bound.
SELF_CANCEL="20260621"

SHIP_MINUTE=41
GROOM_HOURS="0 6 12 18"
GROOM_MINUTE=17
REVIEW_INTERVAL=300

ENG_ENABLED=0
