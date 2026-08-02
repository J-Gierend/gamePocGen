#!/bin/bash
set -e

# Required environment variables
: "${JOB_ID:?JOB_ID is required}"
: "${GAME_NAME:?GAME_NAME is required}"

# Auth mode: "apikey" (default, z.ai) or "subscription" (Claude Code OAuth)
AUTH_MODE="${AUTH_MODE:-apikey}"

if [ "$AUTH_MODE" = "apikey" ]; then
    : "${ZAI_API_KEY:?ZAI_API_KEY is required when AUTH_MODE=apikey}"
fi

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
PROMPTS_DIR="/home/claude/prompts"
FRAMEWORK_DIR="/home/claude/framework"
HARNESS_DIR="/home/claude/harness/bin"

# --- One-shot phase mode (process-improvement only) ---
PHASE="${PHASE:-}"
if [ "$PHASE" = "process-improvement" ] || [ "$PHASE" = "phase5-strategy" ]; then
    # Legacy one-shot mode for non-game-generation phases
    TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3600}"
    STATUS_DIR="${WORKSPACE_DIR}/status"
    mkdir -p "$WORKSPACE_DIR" "$STATUS_DIR" /home/claude/.claude

    write_status() {
        local state="$1"
        local detail="$2"
        cat > "${STATUS_DIR}/${PHASE}.json" <<STATUSEOF
{
  "job_id": "${JOB_ID}",
  "phase": "${PHASE}",
  "state": "${state}",
  "detail": "${detail}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
STATUSEOF
    }

    write_status "running" "Starting ${PHASE}"

    # Auth config (same as below, but for one-shot mode)
    if [ "$AUTH_MODE" = "subscription" ]; then
        echo "[auth] Using subscription mode (OAuth)"
        if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
            mkdir -p /home/claude/.claude
            expires_at="${CLAUDE_CODE_TOKEN_EXPIRES:-4102444800000}"
            cat > /home/claude/.claude/.credentials.json <<CREDEOF
{
  "claudeAiOauth": {
    "accessToken": "${CLAUDE_CODE_OAUTH_TOKEN}",
    "refreshToken": "${CLAUDE_CODE_REFRESH_TOKEN:-}",
    "expiresAt": ${expires_at},
    "scopes": ["user:inference","user:mcp_servers","user:profile","user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
CREDEOF
        fi
        cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "API_TIMEOUT_MS": "3600000",
    "CLAUDE_CODE_EFFORT_LEVEL": "${CLAUDE_CODE_EFFORT_LEVEL:-high}"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF
    else
        echo "[auth] Using API key mode (z.ai)"
        export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"
        export ANTHROPIC_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}"
        cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "${ZAI_API_KEY}",
    "ANTHROPIC_BASE_URL": "${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}",
    "API_TIMEOUT_MS": "3600000",
    "CLAUDE_CODE_EFFORT_LEVEL": "${CLAUDE_CODE_EFFORT_LEVEL:-high}"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF
        rm -f /home/claude/.claude/.credentials.json
    fi

    cat > /home/claude/.claude.json <<EOF
{"hasCompletedOnboarding":true,"theme":"dark","autoUpdaterStatus":"disabled","numStartups":1,"projects":{"${WORKSPACE_DIR}":{"allowedTools":["Bash","Read","Write","Edit","Glob","Grep","Task","WebFetch","WebSearch"],"hasTrustDialogAccepted":true}}}
EOF

    git config --global --add safe.directory "$WORKSPACE_DIR"
    if [ ! -d "${WORKSPACE_DIR}/.git" ]; then
        cd "$WORKSPACE_DIR"
        git init
        git add -A 2>/dev/null || true
        git commit -m "initial workspace" --allow-empty 2>/dev/null || true
    fi

    cd "$WORKSPACE_DIR"

    local_model_flag=""
    if [ -n "${MODEL:-}" ]; then
        local_model_flag="--model ${MODEL}"
    fi

    # Build prompt based on phase
    PROMPT_FILE="${PROMPTS_DIR}/${PHASE/phase5-strategy/phase5-strategy-review}.md"

    if [ "$PHASE" = "process-improvement" ]; then
        PROMPT_FILE="${PROMPTS_DIR}/process-improvement-agent.md"
        mkdir -p "${WORKSPACE_DIR}/improvements"

        CROSS_JOB_DATA=""
        if [ -f "${WORKSPACE_DIR}/cross-job-data.md" ]; then
            CROSS_JOB_DATA="$(cat "${WORKSPACE_DIR}/cross-job-data.md")"
        fi

        PROMPT="$(cat "$PROMPT_FILE")

Job ID: ${JOB_ID}
Workspace: ${WORKSPACE_DIR}
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Cross-job data (score progressions, defects, strategy reviews):
${CROSS_JOB_DATA:-No cross-job data provided}

IMPORTANT: You have READ-WRITE access to the pipeline files:
- Prompts: /home/claude/prompts/ (EDIT these to fix systemic issues)
- Framework: /home/claude/framework/ (EDIT these to add missing capabilities)
- Test scripts: /home/claude/scripts/ (EDIT if test expectations are wrong)
- Improvement reports: ${WORKSPACE_DIR}/improvements/

Analyze the cross-job data, identify systemic defects, and DIRECTLY EDIT the pipeline files to fix them."
    else
        # phase5-strategy
        PROMPT="$(cat "${PROMPTS_DIR}/phase5-strategy-review.md")

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE_DIR}
Game URL: ${GAME_URL:-}

Repair History (score progression and recurring defects):
${DEFECT_REPORT:-No history provided}

Analyze why repairs are stuck and write a new strategy to ${WORKSPACE_DIR}/repair-strategy.md"
    fi

    timeout --signal=TERM --kill-after=30s "${TIMEOUT_SECONDS}" \
        claude -p --dangerously-skip-permissions \
        --verbose \
        $local_model_flag \
        -- \
        "$PROMPT"
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 124 ]; then
        write_status "timeout" "Timed out after ${TIMEOUT_SECONDS}s"
    elif [ $EXIT_CODE -ne 0 ]; then
        write_status "failed" "Exit code ${EXIT_CODE}"
    else
        write_status "completed" "Success"
    fi
    exit $EXIT_CODE
fi

# --- Persistent session mode (harness) ---

mkdir -p "$WORKSPACE_DIR" /home/claude/.claude

# --- Auth Configuration ---
if [ "$AUTH_MODE" = "subscription" ]; then
    echo "[auth] Using subscription mode (OAuth)"

    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
        mkdir -p /home/claude/.claude
        expires_at="${CLAUDE_CODE_TOKEN_EXPIRES:-4102444800000}"
        cat > /home/claude/.claude/.credentials.json <<CREDEOF
{
  "claudeAiOauth": {
    "accessToken": "${CLAUDE_CODE_OAUTH_TOKEN}",
    "refreshToken": "${CLAUDE_CODE_REFRESH_TOKEN:-}",
    "expiresAt": ${expires_at},
    "scopes": ["user:inference","user:mcp_servers","user:profile","user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
CREDEOF
        echo "[auth] Credentials file written (expires: ${expires_at})"
    fi

    cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "API_TIMEOUT_MS": "3600000",
    "CLAUDE_CODE_EFFORT_LEVEL": "${CLAUDE_CODE_EFFORT_LEVEL:-high}"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF
else
    echo "[auth] Using API key mode (z.ai)"
    export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"
    export ANTHROPIC_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}"

    cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "${ZAI_API_KEY}",
    "ANTHROPIC_BASE_URL": "${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}",
    "API_TIMEOUT_MS": "3600000",
    "CLAUDE_CODE_EFFORT_LEVEL": "${CLAUDE_CODE_EFFORT_LEVEL:-high}"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF

    rm -f /home/claude/.claude/.credentials.json
fi

# Skip onboarding wizard
cat > /home/claude/.claude.json <<EOF
{"hasCompletedOnboarding":true,"theme":"dark","autoUpdaterStatus":"disabled","numStartups":1,"projects":{"${WORKSPACE_DIR}":{"allowedTools":["Bash","Read","Write","Edit","Glob","Grep","Task","WebFetch","WebSearch"],"hasTrustDialogAccepted":true}}}
EOF

# Git setup (Claude Code requires git)
git config --global --add safe.directory "$WORKSPACE_DIR"
if [ ! -d "${WORKSPACE_DIR}/.git" ]; then
    cd "$WORKSPACE_DIR"
    git init
    git add -A 2>/dev/null || true
    git commit -m "initial workspace" --allow-empty 2>/dev/null || true
fi

# Copy framework files into workspace
cp -rn "$FRAMEWORK_DIR"/* "$WORKSPACE_DIR/" 2>/dev/null || true

# Write CLAUDE.md to workspace to prevent Claude from modifying harness files
cat > "${WORKSPACE_DIR}/CLAUDE.md" <<'CLAUDEMD'
# Workspace Rules

Build all game output files in the `dist/` subdirectory.
The main game entry point MUST be `dist/index.html`.

CRITICAL RULES:
- Do NOT create any `.marker` files anywhere in the workspace.
- Do NOT create or modify `harness-state.json`.
- Do NOT create or modify `next-prompt.md`.
- Do NOT create any files in the workspace root except `idea.json`, `idea.md`, `implementation-plan.json`, and the `gdd/` and `dist/` directories.
- During Phase 5 repairs, edit files ONLY in `dist/`.
- Do NOT write status files, completion signals, or progress markers. The harness system manages all workflow state automatically.
CLAUDEMD

cd "$WORKSPACE_DIR"

# --- Initialize harness state ---
cat > "${WORKSPACE_DIR}/harness-state.json" <<EOF
{
  "current_phase": "starting",
  "status": "starting",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Build the claude command with model and permissions flags
CLAUDE_CMD="claude --dangerously-skip-permissions"
if [ -n "${MODEL:-}" ]; then
    CLAUDE_CMD="$CLAUDE_CMD --model ${MODEL}"
    echo "[harness] Using model: ${MODEL}"
fi

echo "[harness] Starting persistent session for job ${JOB_ID} (${GAME_NAME})"
echo "[harness] Workspace: ${WORKSPACE_DIR}"
echo "[harness] Claude command: ${CLAUDE_CMD}"

# Export env vars that on-idle.sh needs
export WORKSPACE_DIR GAME_NAME JOB_ID PROMPTS_DIR
export GAME_URL="${GAME_URL:-}"
export GENRE_SEED="${GENRE_SEED:-}"
export EXISTING_GAME_NAMES="${EXISTING_GAME_NAMES:-}"

SESSION_NAME="game-worker-${JOB_ID}"

# --- Auto-accept Claude Code TUI prompts ---
# Claude Code interactive mode shows bypass-permissions confirmation and effort
# selection on startup. We auto-accept these before handing off to watchdog.

auto_accept_prompts() {
    echo "[harness] Starting tmux session and auto-accepting prompts..."
    tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50 "$CLAUDE_CMD"
    sleep 5  # Wait for Claude Code to initialize

    local max_attempts=12  # 12 * 5s = 60s max wait
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        local pane
        pane=$(tmux capture-pane -t "$SESSION_NAME" -p -S -20 2>/dev/null || echo "")

        # Check if bypass permissions prompt is showing
        if echo "$pane" | grep -q "Yes, I accept"; then
            echo "[harness] Detected bypass permissions prompt — accepting"
            tmux send-keys -t "$SESSION_NAME" Down
            sleep 0.5
            tmux send-keys -t "$SESSION_NAME" Enter
            sleep 3
            continue
        fi

        # Check if effort selection prompt is showing
        if echo "$pane" | grep -q "Use high effort"; then
            echo "[harness] Detected effort prompt — accepting high"
            tmux send-keys -t "$SESSION_NAME" Enter
            sleep 3
            continue
        fi

        # Check if we're at the idle prompt (ready for input)
        if echo "$pane" | grep -q "bypass permissions on"; then
            echo "[harness] Claude Code is ready at idle prompt"
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 5
    done

    echo "[harness] Warning: auto-accept timed out after ${max_attempts} attempts"
    return 0  # Continue anyway, watchdog will handle
}

auto_accept_prompts

# Run watchdog in foreground — it manages the existing tmux session
exec "$HARNESS_DIR/watchdog.sh" \
    --name "$SESSION_NAME" \
    --cmd "$CLAUDE_CMD" \
    --on-idle /home/claude/on-idle.sh \
    --poll 10 \
    --idle-cooldown 15 \
    --exit-file "${WORKSPACE_DIR}/exit-worker.marker" \
    --max-restarts 3 \
    --restart-delay 5
