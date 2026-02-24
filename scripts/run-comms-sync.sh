#!/usr/bin/env bash
# run-comms-sync.sh
# Triggers Claude (via claude CLI) to triage new messages from Gmail, Outlook, and WhatsApp.
# Claude uses the LifeOS MCP server tools to read priorities and ingest triaged messages.
#
# Usage:
#   bash scripts/run-comms-sync.sh            # triage all sources
#   bash scripts/run-comms-sync.sh gmail      # triage one source only
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - .mcp.json present in the project root
#   - Gmail / Outlook / WhatsApp MCP servers configured in .mcp.json
#   - LifeOS server running (for the ingest API)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="${1:-all}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Starting comms sync (source: $SOURCE)..."

cd "$PROJECT_DIR"

# Build the triage prompt
read -r -d '' TRIAGE_PROMPT << 'PROMPT'
You are triaging incoming messages for the LifeOS user. Do the following for each new message across Gmail, Outlook, and WhatsApp:

1. Call get_pending_count to see what's already in the inbox (skip re-ingesting those).
2. Call get_priorities to understand the user's current goals and priorities.
3. Call get_recent_context to understand their communication style.
4. Read new messages from Gmail (if connected), Outlook (if connected), and WhatsApp (if connected).
5. For each message that needs attention, call ingest_message with:
   - A 2-sentence ai_summary (what it's about + what action is needed)
   - An ai_suggested_reply written in the user's voice (direct, professional)
   - An urgency_score (1=FYI, 2=low, 3=medium, 4=high, 5=critical/reply today)
   - Skip newsletters, automated notifications, and messages with urgency 1 where no reply is needed
6. After ingesting, give a brief summary of what you found.

Focus on quality over quantity — only surface messages that genuinely need the user's attention.
PROMPT

# Run claude with the MCP server
if command -v claude &>/dev/null; then
    log "Running claude triage..."
    claude --print "$TRIAGE_PROMPT" 2>&1 | tail -20
    log "Triage complete."
else
    log "ERROR: 'claude' CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi
