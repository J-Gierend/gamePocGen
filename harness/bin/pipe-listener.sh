#!/usr/bin/env bash
# pipe-listener.sh — Listen on a named pipe (FIFO) and forward to tmux session
# Usage: pipe-listener.sh --session <name> [--pipe /path/to/fifo]
#
# Anything written to the pipe gets sent into the session immediately.
# This allows direct prompt injection at any time, independent of the watchdog.
set -euo pipefail

SESSION_NAME="glm5-agent"
PIPE_PATH="/tmp/glm5-agent.pipe"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --session) SESSION_NAME="$2"; shift 2 ;;
        --pipe) PIPE_PATH="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

# Create FIFO if it doesn't exist
if [[ ! -p "$PIPE_PATH" ]]; then
    mkfifo "$PIPE_PATH"
fi

echo "Pipe listener started: $PIPE_PATH -> session '$SESSION_NAME'"

# Read loop — reopens pipe after each write (FIFO semantics)
while true; do
    if read -r line < "$PIPE_PATH"; then
        if [[ -n "$line" ]]; then
            # Check session still exists
            if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
                echo "Warning: Session '$SESSION_NAME' gone, waiting..." >&2
                sleep 2
                continue
            fi
            tmux send-keys -t "$SESSION_NAME" -l "$line"
            tmux send-keys -t "$SESSION_NAME" Enter
            echo "[pipe] Sent: ${line:0:80}..."
        fi
    fi
done
