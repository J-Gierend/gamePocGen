#!/usr/bin/env bash
# harness.sh — Main entry point for the GLM-5 Agent Harness
#
# Starts all components:
#   1. Watchdog (crash restart + idle detection)
#   2. Pipe listener (direct prompt injection)
#
# Usage:
#   harness.sh start [--cmd claude] [--queue tasks.txt] [--on-idle ./my-script.sh]
#   harness.sh stop
#   harness.sh status
#   harness.sh send "your prompt here"
#   harness.sh queue "task to add"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_NAME="glm5-agent"
CMD="claude"
QUEUE_FILE="/tmp/glm5-agent.queue"
PIPE_PATH="/tmp/glm5-agent.pipe"
PID_DIR="/tmp/glm5-agent-pids"
ON_IDLE=""
POLL=3

usage() {
    cat <<'EOF'
GLM-5 Agent Harness — Persistent AI coding agent with external control

Commands:
  start     Start the agent session + watchdog + pipe listener
  stop      Stop everything
  status    Show current state
  send      Send a prompt directly into the session
  queue     Add a task to the queue (processed when agent goes idle)
  attach    Attach to the tmux session (Ctrl-B D to detach)
  log       Show watchdog log

Options (for 'start'):
  --cmd <command>      CLI to run (default: claude)
  --queue <file>       Task queue file (default: /tmp/glm5-agent.queue)
  --on-idle <script>   Script called when agent goes idle (stdout = next prompt)
  --poll <seconds>     Idle check interval (default: 3)
  --name <session>     tmux session name (default: glm5-agent)

Examples:
  harness.sh start --cmd "claude --model glm-5"
  harness.sh send "Fix the bug in auth.ts"
  harness.sh queue "Add tests for the user model"
  echo "Refactor the API" > /tmp/glm5-agent.pipe
  harness.sh attach
EOF
}

ensure_pid_dir() { mkdir -p "$PID_DIR"; }

cmd_start() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --cmd) CMD="$2"; shift 2 ;;
            --queue) QUEUE_FILE="$2"; shift 2 ;;
            --on-idle) ON_IDLE="$2"; shift 2 ;;
            --poll) POLL="$2"; shift 2 ;;
            --name) SESSION_NAME="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
    done

    ensure_pid_dir

    # Check if already running
    if [[ -f "$PID_DIR/watchdog.pid" ]] && kill -0 "$(cat "$PID_DIR/watchdog.pid")" 2>/dev/null; then
        echo "Harness already running (watchdog PID $(cat "$PID_DIR/watchdog.pid"))"
        exit 1
    fi

    # Ensure queue file exists
    touch "$QUEUE_FILE"

    echo "Starting GLM-5 Agent Harness..."
    echo "  Session: $SESSION_NAME"
    echo "  Command: $CMD"
    echo "  Queue:   $QUEUE_FILE"
    echo "  Pipe:    $PIPE_PATH"

    # Start watchdog in background
    local watchdog_args=(--name "$SESSION_NAME" --cmd "$CMD" --queue "$QUEUE_FILE" --poll "$POLL")
    [[ -n "$ON_IDLE" ]] && watchdog_args+=(--on-idle "$ON_IDLE")

    "$SCRIPT_DIR/watchdog.sh" "${watchdog_args[@]}" > "/tmp/glm5-watchdog.log" 2>&1 &
    echo $! > "$PID_DIR/watchdog.pid"
    echo "  Watchdog PID: $!"

    # Start pipe listener in background
    "$SCRIPT_DIR/pipe-listener.sh" --session "$SESSION_NAME" --pipe "$PIPE_PATH" > "/tmp/glm5-pipe.log" 2>&1 &
    echo $! > "$PID_DIR/pipe.pid"
    echo "  Pipe PID: $!"

    echo ""
    echo "Harness is running. Use these to interact:"
    echo "  $0 send \"your prompt\"     — inject a prompt now"
    echo "  $0 queue \"task text\"       — add to task queue"
    echo "  echo \"prompt\" > $PIPE_PATH — pipe a prompt in"
    echo "  $0 attach                  — attach to session"
    echo "  $0 status                  — check state"
    echo "  $0 stop                    — stop everything"
}

cmd_stop() {
    ensure_pid_dir
    echo "Stopping GLM-5 Agent Harness..."

    for pidfile in "$PID_DIR"/*.pid; do
        [[ -f "$pidfile" ]] || continue
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            echo "  Stopped PID $pid ($(basename "$pidfile" .pid))"
        fi
        rm -f "$pidfile"
    done

    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        tmux kill-session -t "$SESSION_NAME"
        echo "  Killed tmux session '$SESSION_NAME'"
    fi

    rm -f "$PIPE_PATH"
    echo "Harness stopped."
}

cmd_status() {
    "$SCRIPT_DIR/status.sh" --name "$SESSION_NAME"

    ensure_pid_dir
    echo ""
    for pidfile in "$PID_DIR"/*.pid; do
        [[ -f "$pidfile" ]] || continue
        local name pid
        name=$(basename "$pidfile" .pid)
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "  $name: running (PID $pid)"
        else
            echo "  $name: dead (stale PID $pid)"
        fi
    done

    if [[ -f "$QUEUE_FILE" && -s "$QUEUE_FILE" ]]; then
        local count
        count=$(wc -l < "$QUEUE_FILE")
        echo ""
        echo "Queue: $count task(s) pending"
        head -3 "$QUEUE_FILE" | sed 's/^/  /'
        [[ $count -gt 3 ]] && echo "  ... and $((count - 3)) more"
    else
        echo ""
        echo "Queue: empty"
    fi
}

cmd_send() {
    local text="$*"
    if [[ -z "$text" ]]; then
        echo "Usage: $0 send \"prompt text\"" >&2
        exit 1
    fi
    "$SCRIPT_DIR/send.sh" --session "$SESSION_NAME" "$text"
}

cmd_queue() {
    local text="$*"
    if [[ -z "$text" ]]; then
        echo "Usage: $0 queue \"task text\"" >&2
        exit 1
    fi
    echo "$text" >> "$QUEUE_FILE"
    local count
    count=$(wc -l < "$QUEUE_FILE")
    echo "Added to queue ($count task(s) pending): ${text:0:80}"
}

cmd_attach() {
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "No session '$SESSION_NAME' to attach to" >&2
        exit 1
    fi
    exec tmux attach-session -t "$SESSION_NAME"
}

cmd_log() {
    if [[ -f /tmp/glm5-watchdog.log ]]; then
        tail -50 /tmp/glm5-watchdog.log
    else
        echo "No watchdog log found"
    fi
}

# Main dispatch
case "${1:-}" in
    start)  shift; cmd_start "$@" ;;
    stop)   cmd_stop ;;
    status) cmd_status ;;
    send)   shift; cmd_send "$@" ;;
    queue)  shift; cmd_queue "$@" ;;
    attach) cmd_attach ;;
    log)    cmd_log ;;
    -h|--help|help|"") usage ;;
    *) echo "Unknown command: $1" >&2; usage; exit 1 ;;
esac
