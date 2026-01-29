#!/bin/bash
cd "/Users/cat/code/LifeOS_ClaudeCowork"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Wait for network
sleep 3

# Start server in background
npm start > "/Users/cat/Library/Logs/lifeos-server.log" 2>&1 &

# Wait for server to start
sleep 5

# Open browser
open "http://localhost:3000"
