#!/bin/bash
# Unload the local launchd agents and remove their plists + installed scripts.

set -euo pipefail

DOMAIN="gui/$UID"
AGENTS_DIR="$HOME/Library/LaunchAgents"
INSTALL_DIR="$HOME/.local/share/almanac-agent/bin"

for LABEL in com.almanac.agent-ship com.almanac.agent-groom; do
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$AGENTS_DIR/$LABEL.plist"
  echo "removed $LABEL"
done

rm -f "$INSTALL_DIR/agent-ship.sh" "$INSTALL_DIR/agent-groom.sh"
rmdir "$INSTALL_DIR" 2>/dev/null || true

echo
echo "✓ uninstalled. Logs at ~/.cache/almanac-agent/logs/ are kept; rm -rf that dir to wipe them too."
