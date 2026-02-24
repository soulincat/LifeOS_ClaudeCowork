#!/bin/bash
# LifeOS — First-time setup
# Copies example config files so you can fill in your own values.

set -e

echo "Setting up LifeOS..."

# Create config directory from examples
if [ ! -d "config" ]; then
    mkdir -p config
    echo "Created config/ directory"
fi

# Copy example configs if not already present
for f in config.example/*; do
    base=$(basename "$f")
    # Map example names to config names (strip .example suffix)
    target="config/${base/.example/}"
    if [ ! -f "$target" ]; then
        cp "$f" "$target"
        echo "  Copied $base → $target"
    else
        echo "  Skipped $target (already exists)"
    fi
done

echo ""
echo "Next steps:"
echo "  1. Edit config/.env with your API keys"
echo "  2. Edit config/user.json with your name and preferences"
echo "  3. Edit config/integrations.json to enable your integrations"
echo "  4. Run: npm start"
echo "  5. Open http://localhost:3001 — the setup wizard will guide you"
echo ""
echo "Or just run 'npm start' and use the web-based setup wizard."
