#!/bin/bash
# One-time installer for the local launchd agents.
#
# macOS TCC (Privacy controls) refuses to let launchd-launched processes
# execute scripts under ~/Desktop, ~/Documents, ~/Downloads, etc. — they
# need explicit Full Disk Access to bash, which is more friction than
# we want. So we COPY the scripts to a TCC-safe location and point
# launchd there. The repo remains the source of truth; re-run this
# installer after editing the scripts in scripts/ to refresh.

set -euo pipefail

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
INSTALL_DIR="$HOME/.local/share/almanac-agent/bin"
LOG_DIR="$HOME/.cache/almanac-agent/logs"
AGENTS_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$AGENTS_DIR"

# Copy the runner scripts to the TCC-safe install dir. /bin/cp -f overwrites.
/bin/cp -f "$REPO_ROOT/scripts/agent-ship.sh"  "$INSTALL_DIR/agent-ship.sh"
/bin/cp -f "$REPO_ROOT/scripts/agent-groom.sh" "$INSTALL_DIR/agent-groom.sh"
chmod +x "$INSTALL_DIR/agent-ship.sh" "$INSTALL_DIR/agent-groom.sh"

SHIP_SCRIPT="$INSTALL_DIR/agent-ship.sh"
GROOM_SCRIPT="$INSTALL_DIR/agent-groom.sh"

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

launchctl enable "$DOMAIN/com.almanac.agent-ship"
launchctl enable "$DOMAIN/com.almanac.agent-groom"

echo
echo "✓ installed launchd agents:"
echo "    com.almanac.agent-ship   — every hour at :41 local"
echo "    com.almanac.agent-groom  — every 6h at :17 local (00:17 / 06:17 / 12:17 / 18:17)"
echo
echo "Scripts installed at: $INSTALL_DIR  (TCC-safe; not under ~/Desktop)"
echo "Logs:                 $LOG_DIR/"
echo "Run now:              launchctl kickstart -k $DOMAIN/com.almanac.agent-ship"
echo "                      launchctl kickstart -k $DOMAIN/com.almanac.agent-groom"
echo "Uninstall:            bash $REPO_ROOT/scripts/uninstall-agents.sh"
echo "Status:               launchctl print $DOMAIN/com.almanac.agent-ship"
