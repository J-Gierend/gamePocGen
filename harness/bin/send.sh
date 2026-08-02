#!/usr/bin/env bash
# send.sh — Send text into a running tmux session
# Usage: send.sh --session <name> "prompt text here"
#        echo "prompt" | send.sh --session <name> --stdin
set -euo pipefail

SESSION_NAME="glm5-agent"
USE_STDIN=false
TEXT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --session) SESSION_NAME="$2"; shift 2 ;;
        --stdin) USE_STDIN=true; shift ;;
        -*) echo "Unknown option: $1" >&2; exit 1 ;;
        *) TEXT="$1"; shift ;;
    esac
done

# Verify session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Error: Session '$SESSION_NAME' not found" >&2
    exit 1
fi

# Read from stdin if requested
if $USE_STDIN; then
    TEXT=$(cat)
fi

if [[ -z "$TEXT" ]]; then
    echo "Error: No text to send" >&2
    exit 1
fi

# Send text to the tmux session using send-keys
# Use literal mode (-l) to avoid key name interpretation
tmux send-keys -t "$SESSION_NAME" -l "$TEXT"
# Send Enter to submit
tmux send-keys -t "$SESSION_NAME" Enter

echo "Sent to '$SESSION_NAME'"
