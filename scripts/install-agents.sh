#!/bin/bash
# One-time installer for the local launchd agents.
#
# Generates two .plist files in ~/Library/LaunchAgents/ pointing at the
# scripts in this repo, then loads them. Idempotent — re-run to refresh
# after editing the scripts (it will re-load).

set -euo pipefail

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
SHIP_SCRIPT="$REPO_ROOT/scripts/agent-ship.sh"
GROOM_SCRIPT="$REPO_ROOT/scripts/agent-groom.sh"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
AGENTS_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$LOG_DIR" "$AGENTS_DIR"
chmod +x "$SHIP_SCRIPT" "$GROOM_SCRIPT"

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

# (Re)load both jobs into launchd. `bootout` is idempotent on missing labels.
DOMAIN="gui/$UID"
launchctl bootout "$DOMAIN/com.almanac.agent-ship"  2>/dev/null || true
launchctl bootout "$DOMAIN/com.almanac.agent-groom" 2>/dev/null || true

launchctl bootstrap "$DOMAIN" "$SHIP_PLIST"
launchctl bootstrap "$DOMAIN" "$GROOM_PLIST"

# Set a sane nice level so the agents don't fight foreground work.
launchctl enable "$DOMAIN/com.almanac.agent-ship"
launchctl enable "$DOMAIN/com.almanac.agent-groom"

echo
echo "✓ installed two launchd agents:"
echo "    com.almanac.agent-ship   — every hour at :41 local"
echo "    com.almanac.agent-groom  — every 6h at :17 local (00:17 / 06:17 / 12:17 / 18:17)"
echo
echo "Logs:        $LOG_DIR/"
echo "Run now:     launchctl kickstart -k $DOMAIN/com.almanac.agent-ship"
echo "             launchctl kickstart -k $DOMAIN/com.almanac.agent-groom"
echo "Uninstall:   bash $REPO_ROOT/scripts/uninstall-agents.sh"
echo "Status:      launchctl print $DOMAIN/com.almanac.agent-ship"
