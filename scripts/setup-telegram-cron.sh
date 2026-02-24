#!/usr/bin/env bash
# setup-telegram-cron.sh
# Installs a macOS LaunchAgent that sends a daily Telegram briefing at 8:00 AM.
#
# Usage: bash scripts/setup-telegram-cron.sh
# To uninstall: launchctl unload ~/Library/LaunchAgents/com.lifeos.telegram-briefing.plist

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_PATH="$HOME/Library/LaunchAgents/com.lifeos.telegram-briefing.plist"
LOG_DIR="$HOME/Library/Logs/LifeOS"
NODE_BIN="$(which node)"

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.telegram-briefing</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/scripts/run-telegram-briefing.js</string>
        <string>all</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/telegram-briefing.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/telegram-briefing-error.log</string>
    <key>RunAtLoad</key>
    <false/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>$HOME</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
EOF

# Load the agent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "✅ Telegram daily briefing LaunchAgent installed."
echo "   Fires every day at 08:00 — sends briefing + todos + urgent inbox."
echo ""
echo "To test now:  node $PROJECT_DIR/scripts/run-telegram-briefing.js all"
echo "To uninstall: launchctl unload $PLIST_PATH && rm $PLIST_PATH"
echo "Logs:         tail -f $LOG_DIR/telegram-briefing.log"
