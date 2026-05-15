#!/bin/bash
# One-time installer for the local launchd agents.
#
# Copies the runner scripts to a TCC-safe location (macOS refuses to let
# launchd-launched processes touch ~/Desktop without Full Disk Access on
# bash), generates plists in ~/Library/LaunchAgents/, and bootstraps them.
#
# Idempotent — re-run to refresh after editing the scripts.

set -euo pipefail

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
INSTALL_DIR="$HOME/.local/share/almanac-agent/bin"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
AGENTS_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$AGENTS_DIR"

/bin/cp -f "$REPO_ROOT/scripts/agent-ship.sh"   "$INSTALL_DIR/agent-ship.sh"
/bin/cp -f "$REPO_ROOT/scripts/agent-groom.sh"  "$INSTALL_DIR/agent-groom.sh"
/bin/cp -f "$REPO_ROOT/scripts/agent-review.sh" "$INSTALL_DIR/agent-review.sh"
chmod +x "$INSTALL_DIR"/agent-*.sh

SHIP_SCRIPT="$INSTALL_DIR/agent-ship.sh"
GROOM_SCRIPT="$INSTALL_DIR/agent-groom.sh"
REVIEW_SCRIPT="$INSTALL_DIR/agent-review.sh"

# --- ship (every hour at minute :41 local time) ----------------------------
SHIP_PLIST="$AGENTS_DIR/com.almanac.agent-ship.plist"
cat >"$SHIP_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.almanac.agent-ship</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SHIP_SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>41</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd-ship.out</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd-ship.err</string>
  <key>ProcessType</key>
  <string>Background</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# --- groom (every 6h at minute :17 local — 00:17 06:17 12:17 18:17) -------
GROOM_PLIST="$AGENTS_DIR/com.almanac.agent-groom.plist"
cat >"$GROOM_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.almanac.agent-groom</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$GROOM_SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>17</integer></dict>
    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>17</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>17</integer></dict>
    <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>17</integer></dict>
  </array>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd-groom.out</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd-groom.err</string>
  <key>ProcessType</key>
  <string>Background</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# --- review (every 5 minutes via StartInterval) ----------------------------
# StartInterval is fixed-period (seconds since last fire), simpler than 12
# StartCalendarInterval entries for "every 5 min." The script self-gates
# (exits silently when there are no unreviewed PRs), so quiet ticks are cheap.
REVIEW_PLIST="$AGENTS_DIR/com.almanac.agent-review.plist"
cat >"$REVIEW_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.almanac.agent-review</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REVIEW_SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd-review.out</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd-review.err</string>
  <key>ProcessType</key>
  <string>Background</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

# (Re)load all three jobs into launchd. `bootout` is idempotent on missing labels.
DOMAIN="gui/$UID"
for LABEL in com.almanac.agent-ship com.almanac.agent-groom com.almanac.agent-review; do
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
done

launchctl bootstrap "$DOMAIN" "$SHIP_PLIST"
launchctl bootstrap "$DOMAIN" "$GROOM_PLIST"
launchctl bootstrap "$DOMAIN" "$REVIEW_PLIST"

for LABEL in com.almanac.agent-ship com.almanac.agent-groom com.almanac.agent-review; do
  launchctl enable "$DOMAIN/$LABEL"
done

echo
echo "✓ installed launchd agents:"
echo "    com.almanac.agent-ship   — every hour at :41 local"
echo "    com.almanac.agent-groom  — every 6h at :17 local"
echo "    com.almanac.agent-review — every 5 min (polls; self-gates when nothing to do)"
echo
echo "Scripts installed at: $INSTALL_DIR  (TCC-safe, not under ~/Desktop)"
echo "Logs:                 $LOG_DIR/"
echo "Run now:              launchctl kickstart -k $DOMAIN/com.almanac.agent-ship"
echo "                      launchctl kickstart -k $DOMAIN/com.almanac.agent-groom"
echo "                      launchctl kickstart -k $DOMAIN/com.almanac.agent-review"
echo "Uninstall:            bash $REPO_ROOT/scripts/uninstall-agents.sh"
echo "Status:               launchctl print $DOMAIN/com.almanac.agent-ship"
