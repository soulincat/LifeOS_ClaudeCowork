#!/bin/bash

# Uninstall Life OS Reminders

PLIST_PATH="$HOME/Library/LaunchAgents/com.lifeos.reminder.plist"

if [ -f "$PLIST_PATH" ]; then
    echo "Uninstalling Life OS reminders..."
    launchctl unload "$PLIST_PATH" 2>/dev/null
    rm "$PLIST_PATH"
    echo "✅ Reminders uninstalled successfully!"
else
    echo "⚠️  Reminders not installed (plist not found)"
fi
