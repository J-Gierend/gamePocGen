#!/usr/bin/env bash
# status.sh — Check if agent session is running and its state
# Usage: status.sh [--name <session-name>]
set -euo pipefail

SESSION_NAME="glm5-agent"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name) SESSION_NAME="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Status: not running (no session '$SESSION_NAME')"
    exit 1
fi

# Capture current pane content (last 5 lines)
pane=$(tmux capture-pane -t "$SESSION_NAME" -p -S -5 2>/dev/null || echo "")

# Detect idle state — Claude Code shows ">" prompt or the flower when waiting
# Also detect common CLI prompts: $, %, #
if echo "$pane" | tail -3 | grep -qE '(\$|>|❯|%|#)\s*$'; then
    state="idle"
else
    state="active"
fi

echo "Status: running | State: $state | Session: $SESSION_NAME"
echo "--- Last 5 lines ---"
echo "$pane"
