#!/bin/bash
# Unicorn Session Starter for Apple Shortcuts
#
# This script can be triggered by an Apple Shortcut to:
# 1. Copy a starter prompt to clipboard
# 2. Optionally open Claude desktop app
#
# To use with Apple Shortcuts:
# 1. Create a new Shortcut
# 2. Add "Run Shell Script" action
# 3. Paste: /path/to/unicorn/scripts/start-unicorn-session.sh
# 4. Optionally add "Open App" action for Claude

STARTER_PROMPT="Read START-SESSION.md from my unicorn folder, then help me with: "

# Copy to clipboard (macOS)
echo "$STARTER_PROMPT" | pbcopy

# Notify user
osascript -e 'display notification "Unicorn session prompt copied to clipboard!" with title "🦄 Unicorn"'

echo "Starter prompt copied to clipboard!"
echo ""
echo "Paste into Claude and add your task at the end."
