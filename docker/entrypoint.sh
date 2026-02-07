#!/bin/bash
set -e

# Required environment variables
: "${PHASE:?PHASE is required (phase1|phase2|phase3|phase4)}"
: "${JOB_ID:?JOB_ID is required}"
: "${GAME_NAME:?GAME_NAME is required}"

# Auth mode: "apikey" (default, z.ai) or "subscription" (Claude Code OAuth)
AUTH_MODE="${AUTH_MODE:-apikey}"

if [ "$AUTH_MODE" = "apikey" ]; then
    : "${ZAI_API_KEY:?ZAI_API_KEY is required when AUTH_MODE=apikey}"
fi

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3600}"
STATUS_DIR="${WORKSPACE_DIR}/status"
PROMPTS_DIR="/home/claude/prompts"
FRAMEWORK_DIR="/home/claude/framework"

# Phase 2 sub-agents
PHASE2_AGENTS="currencies progression prestige skill-tree ui-ux psychology-review"

# --- Setup ---

mkdir -p "$WORKSPACE_DIR" "$STATUS_DIR" /home/claude/.claude

# Write initial status
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

# --- Auth Configuration ---
if [ "$AUTH_MODE" = "subscription" ]; then
    # Subscription mode: use OAuth token from Claude Code login
    # Do NOT set ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL
    # Do NOT delete .credentials.json
    echo "[auth] Using subscription mode (OAuth)"

    # Write credentials file if CLAUDE_CODE_OAUTH_TOKEN is provided
    if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
        mkdir -p /home/claude/.claude
        # expiresAt: epoch ms, default far-future if not provided
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

    # Token refresh function - refreshes OAuth access token using refresh token
    refresh_oauth_token() {
        local creds_file="/home/claude/.claude/.credentials.json"
        if [ ! -f "$creds_file" ]; then
            echo "[auth] No credentials file, skipping refresh"
            return 0
        fi

        # Check if we have jq; if not, always refresh (can't check expiry)
        if ! command -v jq &>/dev/null; then
            echo "[auth] jq not available, attempting refresh unconditionally"
        else
            local current_ms=$(date +%s%3N 2>/dev/null || python3 -c "import time; print(int(time.time()*1000))")
            local expires_at=$(jq -r '.claudeAiOauth.expiresAt // 0' "$creds_file" 2>/dev/null || echo "0")
            local buffer_ms=300000  # 5 min buffer

            if [ "$((current_ms + buffer_ms))" -lt "$expires_at" ] 2>/dev/null; then
                echo "[auth] Token still valid (expires in $(( (expires_at - current_ms) / 60000 )) min)"
                return 0
            fi
            echo "[auth] Token expired or expiring soon, refreshing..."
        fi

        local refresh_token=$(jq -r '.claudeAiOauth.refreshToken // empty' "$creds_file" 2>/dev/null || echo "")
        if [ -z "$refresh_token" ]; then
            echo "[auth] No refresh token available, cannot refresh"
            return 1
        fi

        local response=$(curl -s -X POST "https://console.anthropic.com/v1/oauth/token" \
            -H "Content-Type: application/json" \
            -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"${refresh_token}\",\"client_id\":\"9d1c250a-e61b-44d9-88ed-5944d1962f5e\"}" \
            2>/dev/null)

        # Parse response
        local new_access=$(echo "$response" | jq -r '.access_token // empty' 2>/dev/null || echo "")
        local new_refresh=$(echo "$response" | jq -r '.refresh_token // empty' 2>/dev/null || echo "")
        local expires_in=$(echo "$response" | jq -r '.expires_in // 0' 2>/dev/null || echo "0")

        if [ -z "$new_access" ]; then
            echo "[auth] Token refresh failed: $(echo "$response" | head -c 200)"
            return 1
        fi

        # Calculate new expiry
        local new_expires_at=$(( $(date +%s) * 1000 + expires_in * 1000 ))
        local final_refresh="${new_refresh:-$refresh_token}"

        # Update credentials file
        cat > "$creds_file" <<REFRESHEOF
{
  "claudeAiOauth": {
    "accessToken": "${new_access}",
    "refreshToken": "${final_refresh}",
    "expiresAt": ${new_expires_at},
    "scopes": ["user:inference","user:mcp_servers","user:profile","user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
REFRESHEOF
        echo "[auth] Token refreshed successfully (expires in $(( expires_in / 60 )) min)"
        return 0
    }

    # Settings without API key overrides
    cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "API_TIMEOUT_MS": "3600000"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF
else
    # API key mode (default): z.ai proxy
    echo "[auth] Using API key mode (z.ai)"
    export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"
    export ANTHROPIC_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}"

    cat > /home/claude/.claude/settings.json <<EOF
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "${ZAI_API_KEY}",
    "ANTHROPIC_BASE_URL": "${ZAI_BASE_URL:-https://api.z.ai/api/anthropic}",
    "API_TIMEOUT_MS": "3600000"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch(domain:*)", "WebSearch"],
    "deny": []
  }
}
EOF

    # Force API key auth - remove any cached credentials
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

# --- Phase Routing ---

run_claude() {
    local prompt="$1"
    local label="$2"

    # Refresh OAuth token before each run (subscription mode only)
    if [ "$AUTH_MODE" = "subscription" ] && type refresh_oauth_token &>/dev/null; then
        refresh_oauth_token || echo "[${label}] Warning: token refresh failed, proceeding anyway"
    fi

    local model_flag=""
    if [ -n "${MODEL:-}" ]; then
        model_flag="--model ${MODEL}"
        echo "[${label}] Using model: ${MODEL}"
    fi

    echo "[${label}] Starting with ${TIMEOUT_SECONDS}s timeout (auth=${AUTH_MODE})..."

    timeout --signal=TERM --kill-after=30s "${TIMEOUT_SECONDS}" \
        claude -p --dangerously-skip-permissions \
        --verbose \
        $model_flag \
        -- \
        "$prompt"

    return $?
}

cd "$WORKSPACE_DIR"

case "$PHASE" in
    phase1)
        PROMPT_FILE="${PROMPTS_DIR}/phase1-idea-generator.md"
        if [ ! -f "$PROMPT_FILE" ]; then
            write_status "failed" "Missing prompt: ${PROMPT_FILE}"
            exit 1
        fi

        PROMPT="$(cat "$PROMPT_FILE")

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Output directory: ${WORKSPACE_DIR}

Generate the game idea and write the output to ${WORKSPACE_DIR}/idea.json"

        run_claude "$PROMPT" "phase1-idea"
        EXIT_CODE=$?
        ;;

    phase2)
        # Run 6 GDD agents sequentially (each builds on prior context)
        EXIT_CODE=0
        mkdir -p "${WORKSPACE_DIR}/gdd"

        for AGENT in $PHASE2_AGENTS; do
            PROMPT_FILE="${PROMPTS_DIR}/phase2-gdd/${AGENT}.md"
            if [ ! -f "$PROMPT_FILE" ]; then
                echo "[phase2] Warning: Missing prompt ${PROMPT_FILE}, skipping ${AGENT}"
                continue
            fi

            write_status "running" "Phase 2: ${AGENT}"

            PROMPT="$(cat "$PROMPT_FILE")

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE_DIR}
Read the idea from: ${WORKSPACE_DIR}/idea.json
Read any prior GDD sections from: ${WORKSPACE_DIR}/gdd/
Write your output to: ${WORKSPACE_DIR}/gdd/${AGENT}.json"

            run_claude "$PROMPT" "phase2-${AGENT}"
            AGENT_EXIT=$?

            if [ $AGENT_EXIT -eq 124 ]; then
                echo "[phase2] Agent ${AGENT} timed out"
                write_status "failed" "Agent ${AGENT} timed out"
                EXIT_CODE=1
                break
            elif [ $AGENT_EXIT -ne 0 ]; then
                echo "[phase2] Agent ${AGENT} failed with code ${AGENT_EXIT}"
                write_status "failed" "Agent ${AGENT} failed (exit ${AGENT_EXIT})"
                EXIT_CODE=1
                break
            fi

            echo "[phase2] Agent ${AGENT} completed successfully"
        done
        ;;

    phase3)
        PROMPT_FILE="${PROMPTS_DIR}/phase3-implementation-guide.md"
        if [ ! -f "$PROMPT_FILE" ]; then
            write_status "failed" "Missing prompt: ${PROMPT_FILE}"
            exit 1
        fi

        PROMPT="$(cat "$PROMPT_FILE")

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE_DIR}
Read the GDD from: ${WORKSPACE_DIR}/gdd/
Write the implementation plan to: ${WORKSPACE_DIR}/implementation-plan.json"

        run_claude "$PROMPT" "phase3-plan"
        EXIT_CODE=$?
        ;;

    phase4)
        PROMPT_FILE="${PROMPTS_DIR}/phase4-orchestrator.md"
        if [ ! -f "$PROMPT_FILE" ]; then
            write_status "failed" "Missing prompt: ${PROMPT_FILE}"
            exit 1
        fi

        PROMPT="$(cat "$PROMPT_FILE")

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE_DIR}
Read the implementation plan from: ${WORKSPACE_DIR}/implementation-plan.json
Read the GDD from: ${WORKSPACE_DIR}/gdd/
The framework files are already copied into the workspace.
Build the complete playable game in: ${WORKSPACE_DIR}/dist/"

        run_claude "$PROMPT" "phase4-build"
        EXIT_CODE=$?
        ;;

    *)
        echo "Unknown PHASE: ${PHASE}. Must be phase1, phase2, phase3, or phase4."
        write_status "failed" "Unknown phase: ${PHASE}"
        exit 1
        ;;
esac

# --- Status Reporting ---

if [ $EXIT_CODE -eq 124 ]; then
    echo "[${PHASE}] Timed out after ${TIMEOUT_SECONDS}s"
    write_status "timeout" "Timed out after ${TIMEOUT_SECONDS}s"
elif [ $EXIT_CODE -ne 0 ]; then
    echo "[${PHASE}] Failed with exit code ${EXIT_CODE}"
    write_status "failed" "Exit code ${EXIT_CODE}"
else
    echo "[${PHASE}] Completed successfully"
    write_status "completed" "Success"
fi

exit $EXIT_CODE
