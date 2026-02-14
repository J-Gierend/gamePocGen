#!/usr/bin/env bash
# session.sh — Start an interactive CLI session inside tmux
# Usage: session.sh --name <session-name> [--cmd <command>] [--no-loop]
set -euo pipefail

SESSION_NAME="glm5-agent"
CMD="claude"
NO_LOOP=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name) SESSION_NAME="$2"; shift 2 ;;
        --cmd) CMD="$2"; shift 2 ;;
        --no-loop) NO_LOOP=true; shift ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Error: Session '$SESSION_NAME' already exists" >&2
    exit 1
fi

# Create detached tmux session running the command
tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50 "$CMD"
echo "Session '$SESSION_NAME' started with: $CMD"
