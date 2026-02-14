#!/usr/bin/env bash
# watchdog.sh — The brain of the harness
#
# Two jobs:
#   1. CRASH WATCHDOG: If the tmux session dies, restart it
#   2. IDLE DETECTOR: When the agent goes idle (shows prompt),
#      pull next task from the queue and inject it
#
# Usage: watchdog.sh [--name <session>] [--cmd <command>] [--queue <file>]
#        [--poll <seconds>] [--idle-pattern <regex>] [--on-idle <script>]
set -euo pipefail

SESSION_NAME="glm5-agent"
CMD="claude"
QUEUE_FILE=""
POLL_INTERVAL=3
IDLE_PATTERN='(\$|>|❯|%|#)\s*$'
ON_IDLE_SCRIPT=""
IDLE_COOLDOWN=5  # seconds after sending before checking idle again
MAX_RESTARTS=0   # 0 = unlimited
RESTART_DELAY=3
EXIT_FILE=""     # if set, watchdog exits when this file appears

last_send_time=0
restart_count=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name) SESSION_NAME="$2"; shift 2 ;;
        --cmd) CMD="$2"; shift 2 ;;
        --queue) QUEUE_FILE="$2"; shift 2 ;;
        --poll) POLL_INTERVAL="$2"; shift 2 ;;
        --idle-pattern) IDLE_PATTERN="$2"; shift 2 ;;
        --on-idle) ON_IDLE_SCRIPT="$2"; shift 2 ;;
        --max-restarts) MAX_RESTARTS="$2"; shift 2 ;;
        --restart-delay) RESTART_DELAY="$2"; shift 2 ;;
        --exit-file) EXIT_FILE="$2"; shift 2 ;;
        --idle-cooldown) IDLE_COOLDOWN="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

log() { echo "[watchdog $(date +%H:%M:%S)] $*"; }

ensure_session() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        return 0
    fi

    if [[ $MAX_RESTARTS -gt 0 && $restart_count -ge $MAX_RESTARTS ]]; then
        log "Max restarts ($MAX_RESTARTS) reached. Exiting."
        exit 0
    fi

    log "Session '$SESSION_NAME' not found — starting..."
    tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50 "$CMD"
    restart_count=$((restart_count + 1))
    last_send_time=$(date +%s)
    log "Session restarted (attempt $restart_count)"
    sleep "$RESTART_DELAY"
}

is_idle() {
    local now
    now=$(date +%s)
    # Don't check idle if we just sent something
    if (( now - last_send_time < IDLE_COOLDOWN )); then
        return 1
    fi

    local pane
    pane=$(tmux capture-pane -t "$SESSION_NAME" -p -S -3 2>/dev/null || echo "")
    # Check last non-empty line for prompt pattern
    local last_line
    last_line=$(echo "$pane" | grep -v '^$' | tail -1 || echo "")
    if echo "$last_line" | grep -qE "$IDLE_PATTERN"; then
        return 0
    fi
    return 1
}

get_next_task() {
    # Source 1: Queue file (one task per line, pop from top)
    if [[ -n "$QUEUE_FILE" && -f "$QUEUE_FILE" && -s "$QUEUE_FILE" ]]; then
        local task
        task=$(head -1 "$QUEUE_FILE")
        # Remove first line from queue
        tail -n +2 "$QUEUE_FILE" > "${QUEUE_FILE}.tmp" && mv "${QUEUE_FILE}.tmp" "$QUEUE_FILE"
        echo "$task"
        return 0
    fi
    return 1
}

send_to_session() {
    local text="$1"
    tmux send-keys -t "$SESSION_NAME" -l "$text"
    tmux send-keys -t "$SESSION_NAME" Enter
    last_send_time=$(date +%s)
    log "Sent task: ${text:0:80}..."
}

log "Watchdog started for session '$SESSION_NAME'"
log "Command: $CMD"
log "Poll interval: ${POLL_INTERVAL}s"
[[ -n "$QUEUE_FILE" ]] && log "Queue: $QUEUE_FILE"
[[ -n "$ON_IDLE_SCRIPT" ]] && log "On-idle script: $ON_IDLE_SCRIPT"
[[ -n "$EXIT_FILE" ]] && log "Exit file: $EXIT_FILE"

while true; do
    # Check exit file — clean shutdown when job completes
    if [[ -n "$EXIT_FILE" && -f "$EXIT_FILE" ]]; then
        log "Exit file detected ($EXIT_FILE) — shutting down"
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        exit 0
    fi

    # Job 1: Ensure session is alive
    ensure_session

    # Job 2: Check for idle state
    if is_idle; then
        log "Agent is idle — checking for next task..."

        # Try queue file first
        if task=$(get_next_task); then
            send_to_session "$task"
        # Try on-idle script
        elif [[ -n "$ON_IDLE_SCRIPT" && -x "$ON_IDLE_SCRIPT" ]]; then
            task=$("$ON_IDLE_SCRIPT" 2>/dev/null || echo "")
            if [[ -n "$task" ]]; then
                send_to_session "$task"
            else
                log "On-idle script returned nothing, staying idle"
            fi
        else
            log "No tasks in queue, agent idle"
        fi
    fi

    sleep "$POLL_INTERVAL"
done
