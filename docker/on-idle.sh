#!/bin/bash
# on-idle.sh — Phase orchestrator for persistent Claude session
#
# Called by watchdog.sh when Claude goes idle (shows > prompt).
# Determines current phase from workspace state, writes next prompt
# to /workspace/next-prompt.md, returns a short instruction to stdout.
#
# State machine:
#   No idea.json           → Phase 1 (idea generation)
#   idea.json, missing GDD → Phase 2 (GDD sub-agents, one at a time)
#   All GDD done           → Phase 3 (implementation planning)
#   implementation-plan    → Phase 4 (build)
#   dist/index.html        → Mark phase4-complete, go idle
#   repair-prompt.txt      → Phase 5 repair (prompt from backend)
#   job-complete.marker    → Signal completion, exit
#   job-failed.marker      → Signal failure, exit
set -euo pipefail

WORKSPACE="${WORKSPACE_DIR:-/workspace}"
PROMPTS_DIR="${PROMPTS_DIR:-/home/claude/prompts}"
STATE_FILE="${WORKSPACE}/harness-state.json"
EXIT_FILE="${WORKSPACE}/exit-worker.marker"
NEXT_PROMPT="${WORKSPACE}/next-prompt.md"
GAME_NAME="${GAME_NAME:-unnamed}"
JOB_ID="${JOB_ID:-0}"

# Phase 2 sub-agents (sequential)
PHASE2_AGENTS="currencies progression ui-ux"

write_state() {
    local phase="$1"
    local status="$2"
    cat > "${STATE_FILE}.tmp" <<EOF
{
  "current_phase": "${phase}",
  "status": "${status}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

write_prompt_file() {
    local content="$1"
    # Atomic write to avoid partial reads
    echo "$content" > "${NEXT_PROMPT}.tmp"
    mv "${NEXT_PROMPT}.tmp" "$NEXT_PROMPT"
}

send_instruction() {
    echo "Read and execute the instructions in /workspace/next-prompt.md"
}

# --- State Machine ---

# Terminal states: job complete or failed
if [[ -f "${WORKSPACE}/job-complete.marker" ]]; then
    write_state "completed" "completed"
    touch "$EXIT_FILE"
    exit 0
fi

if [[ -f "${WORKSPACE}/job-failed.marker" ]]; then
    write_state "failed" "failed"
    touch "$EXIT_FILE"
    exit 0
fi

# Phase 5: repair prompt from backend
if [[ -f "${WORKSPACE}/repair-prompt.txt" ]]; then
    write_state "phase5" "running"

    # Build the full repair prompt from template + defect report
    REPAIR_TEMPLATE="${PROMPTS_DIR}/phase5-repair-agent.md"
    DEFECT_REPORT=$(cat "${WORKSPACE}/repair-prompt.txt")

    # Check for strategy file
    STRATEGY_CONTEXT=""
    if [[ -f "${WORKSPACE}/repair-strategy.md" ]]; then
        STRATEGY_CONTEXT="

=== REPAIR STRATEGY (from automated review) ===
A strategy review identified why previous repairs failed. READ THIS FIRST and follow its guidance:

$(cat "${WORKSPACE}/repair-strategy.md")

=== END REPAIR STRATEGY ==="
    fi

    PROMPT_CONTENT=""
    if [[ -f "$REPAIR_TEMPLATE" ]]; then
        PROMPT_CONTENT="$(cat "$REPAIR_TEMPLATE")"
    fi

    write_prompt_file "${PROMPT_CONTENT}

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE}
Game URL: ${GAME_URL:-}

Defect report:
${DEFECT_REPORT}
${STRATEGY_CONTEXT}

CRITICAL: All game source files are in ${WORKSPACE}/dist/ — edit files ONLY in that directory.
Do NOT edit files in the workspace root. Only ${WORKSPACE}/dist/ files are deployed.
Fix the defects listed above by modifying files in ${WORKSPACE}/dist/
After fixing, ensure all changes are saved in ${WORKSPACE}/dist/

COMMON FIX CHECKLIST:
1. If 'No CONFIG object on window': Add window.CONFIG = CONFIG; inside the <script type=module> in index.html
2. If 'Unexpected token/identifier': Read the exact error, find the file, fix the syntax error at that line
3. If 'Failed to load resource': A file is missing — check all import/src paths resolve to existing files
4. If 'Canvas blank': Check SpriteRenderer initialization and render loop
5. All paths must be relative WITHOUT 'framework/' prefix: use core/, sprites/, mechanics/, ui/, css/
6. ES module imports MUST start with './' — use './core/index.js' not 'core/index.js'"

    # Remove the repair prompt file so we don't re-trigger
    rm -f "${WORKSPACE}/repair-prompt.txt"

    send_instruction
    exit 0
fi

# Phase 4 complete: game built, wait for backend
# Check both dist/index.html and root index.html (Claude sometimes puts it in root)
GAME_INDEX=""
if [[ -f "${WORKSPACE}/dist/index.html" ]]; then
    GAME_INDEX="${WORKSPACE}/dist/index.html"
elif [[ -f "${WORKSPACE}/index.html" ]]; then
    # Move game files to dist/ for consistency
    mkdir -p "${WORKSPACE}/dist"
    cp "${WORKSPACE}/index.html" "${WORKSPACE}/dist/"
    # Copy JS/CSS flat files
    for f in "${WORKSPACE}"/*.js "${WORKSPACE}"/*.css; do
        [[ -f "$f" ]] && cp "$f" "${WORKSPACE}/dist/" 2>/dev/null
    done
    # Copy framework/game subdirectories
    for dir in css core sprites mechanics ui; do
        [[ -d "${WORKSPACE}/$dir" ]] && cp -r "${WORKSPACE}/$dir" "${WORKSPACE}/dist/" 2>/dev/null
    done
    GAME_INDEX="${WORKSPACE}/dist/index.html"
fi

if [[ -n "$GAME_INDEX" && ! -f "${WORKSPACE}/phase4-complete.marker" ]]; then
    touch "${WORKSPACE}/phase4-complete.marker"
    write_state "phase4" "idle"
    # Return nothing — stay idle until backend writes repair-prompt.txt
    exit 0
fi

# Already marked phase4 complete and idle — stay idle, update state
if [[ -f "${WORKSPACE}/phase4-complete.marker" ]]; then
    write_state "phase5" "idle"
    exit 0
fi

# Phase 4: implementation plan exists, build the game
if [[ -f "${WORKSPACE}/implementation-plan.json" ]]; then
    write_state "phase4" "running"

    # Pre-populate dist/ with working starter files + framework
    # This gives Claude a WORKING baseline game to customize
    mkdir -p "${WORKSPACE}/dist"

    # Copy starter game files (index.html, game.js, entities.js, config.js)
    STARTER_DIR="/home/claude/framework/starter"
    if [[ -d "$STARTER_DIR" ]]; then
        cp -n "$STARTER_DIR"/* "${WORKSPACE}/dist/" 2>/dev/null || true
        echo "[on-idle] Copied starter files to dist/"
    fi

    # Copy framework directories into dist/ so the game is self-contained
    for dir in core sprites mechanics ui css; do
        if [[ -d "${WORKSPACE}/$dir" && ! -d "${WORKSPACE}/dist/$dir" ]]; then
            cp -r "${WORKSPACE}/$dir" "${WORKSPACE}/dist/"
        fi
    done

    PROMPT_FILE="${PROMPTS_DIR}/phase4-orchestrator.md"
    PROMPT_CONTENT=""
    if [[ -f "$PROMPT_FILE" ]]; then
        PROMPT_CONTENT="$(cat "$PROMPT_FILE")"
    fi

    write_prompt_file "${PROMPT_CONTENT}

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE}
Read the implementation plan from: ${WORKSPACE}/implementation-plan.json
Read the GDD from: ${WORKSPACE}/gdd/
The framework files are already copied into the workspace.

IMPORTANT: A working starter game has been pre-populated in ${WORKSPACE}/dist/.
It already loads, renders sprites, spawns enemies, handles clicks, earns currency, and advances waves.
Your job is to CUSTOMIZE these files to match the GDD — not build from scratch.
The starter files you should customize:
  - dist/config.js — Replace placeholder values with game-specific values from the GDD
  - dist/game.js — Add game-specific mechanics (custom click behavior, generators, prestige, etc.)
  - dist/entities.js — Add game-specific entity types and behaviors
  - dist/index.html — Update title, add game-specific UI elements, customize controls text
DO NOT delete the working starter code — extend and modify it.
If you create NEW js files, put them in dist/ and import them in the module script."

    send_instruction
    exit 0
fi

# Phase 3: all GDD agents done, create implementation plan
all_gdd_done=true
for agent in $PHASE2_AGENTS; do
    if [[ ! -f "${WORKSPACE}/gdd/${agent}.json" ]]; then
        all_gdd_done=false
        break
    fi
done

if $all_gdd_done && [[ -f "${WORKSPACE}/idea.json" ]]; then
    write_state "phase3" "running"

    PROMPT_FILE="${PROMPTS_DIR}/phase3-implementation-guide.md"
    PROMPT_CONTENT=""
    if [[ -f "$PROMPT_FILE" ]]; then
        PROMPT_CONTENT="$(cat "$PROMPT_FILE")"
    fi

    write_prompt_file "${PROMPT_CONTENT}

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE}
Read the GDD from: ${WORKSPACE}/gdd/
Write the implementation plan to: ${WORKSPACE}/implementation-plan.json"

    send_instruction
    exit 0
fi

# Phase 2: idea exists, run GDD agents sequentially
if [[ -f "${WORKSPACE}/idea.json" ]]; then
    mkdir -p "${WORKSPACE}/gdd"

    for agent in $PHASE2_AGENTS; do
        if [[ ! -f "${WORKSPACE}/gdd/${agent}.json" ]]; then
            write_state "phase2" "running"

            PROMPT_FILE="${PROMPTS_DIR}/phase2-gdd/${agent}.md"
            PROMPT_CONTENT=""
            if [[ -f "$PROMPT_FILE" ]]; then
                PROMPT_CONTENT="$(cat "$PROMPT_FILE")"
            fi

            write_prompt_file "${PROMPT_CONTENT}

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Workspace: ${WORKSPACE}
Read the idea from: ${WORKSPACE}/idea.json
Read any prior GDD sections from: ${WORKSPACE}/gdd/
Write your output to: ${WORKSPACE}/gdd/${agent}.json"

            send_instruction
            exit 0
        fi
    done

    # All GDD done — fall through to phase 3 on next idle
    exit 0
fi

# Phase 1: nothing exists yet, generate idea
write_state "phase1" "running"

PROMPT_FILE="${PROMPTS_DIR}/phase1-idea-generator.md"
PROMPT_CONTENT=""
if [[ -f "$PROMPT_FILE" ]]; then
    PROMPT_CONTENT="$(cat "$PROMPT_FILE")"
fi

# Include genre seed and existing game names if available
GENRE_CONTEXT=""
if [[ -n "${GENRE_SEED:-}" ]]; then
    GENRE_CONTEXT="
Genre seed: ${GENRE_SEED}"
fi
if [[ -n "${EXISTING_GAME_NAMES:-}" ]]; then
    GENRE_CONTEXT="${GENRE_CONTEXT}
Existing game names (avoid duplicating these): ${EXISTING_GAME_NAMES}"
fi

write_prompt_file "${PROMPT_CONTENT}

Game name: ${GAME_NAME}
Job ID: ${JOB_ID}
Output directory: ${WORKSPACE}
${GENRE_CONTEXT}

Generate the game idea and write the output to ${WORKSPACE}/idea.json"

send_instruction
exit 0
