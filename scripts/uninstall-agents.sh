#!/bin/bash
# Unload the local launchd agents and remove the plist files.

set -euo pipefail

DOMAIN="gui/$UID"
AGENTS_DIR="$HOME/Library/LaunchAgents"

for LABEL in com.almanac.agent-ship com.almanac.agent-groom; do
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$AGENTS_DIR/$LABEL.plist"
  echo "removed $LABEL"
done

echo
echo "✓ uninstalled. Logs at ~/.cache/almanac-agent/logs/ are kept; rm -rf that dir to wipe them too."
