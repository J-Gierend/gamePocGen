#!/bin/bash
# Tests for on-idle.sh — the phase orchestrator state machine
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ON_IDLE="${SCRIPT_DIR}/../on-idle.sh"

PASS=0
FAIL=0
ERRORS=""

setup() {
    TEST_WORKSPACE=$(mktemp -d)
    export WORKSPACE_DIR="$TEST_WORKSPACE"
    export PROMPTS_DIR="$TEST_WORKSPACE/prompts"
    export GAME_NAME="TestGame"
    export JOB_ID="42"

    # Create mock prompt files
    mkdir -p "$PROMPTS_DIR/phase2-gdd"
    echo "Phase1 prompt template" > "$PROMPTS_DIR/phase1-idea-generator.md"
    echo "Phase2 currencies prompt" > "$PROMPTS_DIR/phase2-gdd/currencies.md"
    echo "Phase2 progression prompt" > "$PROMPTS_DIR/phase2-gdd/progression.md"
    echo "Phase2 ui-ux prompt" > "$PROMPTS_DIR/phase2-gdd/ui-ux.md"
    echo "Phase3 prompt template" > "$PROMPTS_DIR/phase3-implementation-guide.md"
    echo "Phase4 prompt template" > "$PROMPTS_DIR/phase4-orchestrator.md"
    echo "Phase5 repair prompt" > "$PROMPTS_DIR/phase5-repair-agent.md"
}

teardown() {
    rm -rf "$TEST_WORKSPACE"
}

assert_eq() {
    local actual="$1"
    local expected="$2"
    local msg="$3"
    if [[ "$actual" != "$expected" ]]; then
        echo "  FAIL  $msg"
        echo "        Expected: '$expected'"
        echo "        Got:      '$actual'"
        FAIL=$((FAIL + 1))
        ERRORS="${ERRORS}\n  - $msg"
        return 1
    fi
    return 0
}

assert_file_exists() {
    local path="$1"
    local msg="$2"
    if [[ ! -f "$path" ]]; then
        echo "  FAIL  $msg"
        echo "        File not found: $path"
        FAIL=$((FAIL + 1))
        ERRORS="${ERRORS}\n  - $msg"
        return 1
    fi
    return 0
}

assert_file_contains() {
    local path="$1"
    local pattern="$2"
    local msg="$3"
    if ! grep -q "$pattern" "$path" 2>/dev/null; then
        echo "  FAIL  $msg"
        echo "        Pattern '$pattern' not found in $path"
        FAIL=$((FAIL + 1))
        ERRORS="${ERRORS}\n  - $msg"
        return 1
    fi
    return 0
}

assert_file_not_exists() {
    local path="$1"
    local msg="$2"
    if [[ -f "$path" ]]; then
        echo "  FAIL  $msg"
        echo "        File should not exist: $path"
        FAIL=$((FAIL + 1))
        ERRORS="${ERRORS}\n  - $msg"
        return 1
    fi
    return 0
}

run_test() {
    local name="$1"
    shift
    setup
    if "$@"; then
        echo "  PASS  $name"
        PASS=$((PASS + 1))
    fi
    teardown
}

# ============================================================
# TESTS
# ============================================================

test_empty_workspace_triggers_phase1() {
    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "Read and execute the instructions in /workspace/next-prompt.md" \
        "Empty workspace should return instruction" || return 1

    assert_file_exists "$TEST_WORKSPACE/next-prompt.md" \
        "Should create next-prompt.md" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase1 prompt template" \
        "Prompt should contain phase1 template" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "idea.json" \
        "Prompt should reference idea.json output" || return 1

    # Check state file
    assert_file_exists "$TEST_WORKSPACE/harness-state.json" \
        "Should create state file" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"current_phase": "phase1"' \
        "State should be phase1" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"status": "running"' \
        "Status should be running" || return 1
}

test_phase1_with_genre_seed() {
    export GENRE_SEED="dungeon-crawler"
    export EXISTING_GAME_NAMES="SpaceBlaster, FarmQuest"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "dungeon-crawler" \
        "Prompt should contain genre seed" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "SpaceBlaster" \
        "Prompt should contain existing game names" || return 1

    unset GENRE_SEED EXISTING_GAME_NAMES
}

test_idea_json_triggers_phase2_currencies() {
    # Create idea.json
    echo '{"name": "TestGame", "genre": "idle"}' > "$TEST_WORKSPACE/idea.json"

    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "Read and execute the instructions in /workspace/next-prompt.md" \
        "Should return instruction" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase2 currencies prompt" \
        "Should use currencies prompt" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "currencies.json" \
        "Should reference currencies.json output" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"current_phase": "phase2"' \
        "State should be phase2" || return 1
}

test_currencies_done_triggers_progression() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase2 progression prompt" \
        "Should use progression prompt" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "progression.json" \
        "Should reference progression.json output" || return 1
}

test_currencies_progression_done_triggers_uiux() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/progression.json"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase2 ui-ux prompt" \
        "Should use ui-ux prompt" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "ui-ux.json" \
        "Should reference ui-ux.json output" || return 1
}

test_all_gdd_done_triggers_phase3() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/progression.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/ui-ux.json"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase3 prompt template" \
        "Should use phase3 prompt" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "implementation-plan.json" \
        "Should reference implementation-plan.json output" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"current_phase": "phase3"' \
        "State should be phase3" || return 1
}

test_implementation_plan_triggers_phase4() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/progression.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/ui-ux.json"
    echo '{}' > "$TEST_WORKSPACE/implementation-plan.json"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase4 prompt template" \
        "Should use phase4 prompt" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "dist/" \
        "Should reference dist/ output dir" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"current_phase": "phase4"' \
        "State should be phase4" || return 1
}

test_dist_index_html_creates_phase4_complete_marker() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd" "$TEST_WORKSPACE/dist"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/progression.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/ui-ux.json"
    echo '{}' > "$TEST_WORKSPACE/implementation-plan.json"
    echo '<html></html>' > "$TEST_WORKSPACE/dist/index.html"

    local output
    output=$("$ON_IDLE" 2>&1)

    # Should return nothing (stay idle)
    assert_eq "$output" "" \
        "Should return empty (idle) when phase4 complete" || return 1

    assert_file_exists "$TEST_WORKSPACE/phase4-complete.marker" \
        "Should create phase4-complete.marker" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"status": "idle"' \
        "Status should be idle" || return 1
}

test_phase4_complete_stays_idle() {
    touch "$TEST_WORKSPACE/phase4-complete.marker"
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"
    mkdir -p "$TEST_WORKSPACE/gdd" "$TEST_WORKSPACE/dist"
    echo '{}' > "$TEST_WORKSPACE/gdd/currencies.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/progression.json"
    echo '{}' > "$TEST_WORKSPACE/gdd/ui-ux.json"
    echo '{}' > "$TEST_WORKSPACE/implementation-plan.json"
    echo '<html></html>' > "$TEST_WORKSPACE/dist/index.html"

    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "" \
        "Should return empty (stay idle) when phase4 already complete" || return 1
}

test_repair_prompt_triggers_phase5() {
    touch "$TEST_WORKSPACE/phase4-complete.marker"
    mkdir -p "$TEST_WORKSPACE/dist"
    echo '<html></html>' > "$TEST_WORKSPACE/dist/index.html"
    echo '[{"severity": "high", "description": "Game crashes on load"}]' > "$TEST_WORKSPACE/repair-prompt.txt"

    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "Read and execute the instructions in /workspace/next-prompt.md" \
        "Should return instruction for repair" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Phase5 repair prompt" \
        "Should contain phase5 repair template" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "Game crashes on load" \
        "Should contain defect report" || return 1

    assert_file_not_exists "$TEST_WORKSPACE/repair-prompt.txt" \
        "Should remove repair-prompt.txt after reading" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"current_phase": "phase5"' \
        "State should be phase5" || return 1
}

test_repair_prompt_with_strategy() {
    touch "$TEST_WORKSPACE/phase4-complete.marker"
    mkdir -p "$TEST_WORKSPACE/dist"
    echo '<html></html>' > "$TEST_WORKSPACE/dist/index.html"
    echo '[{"severity": "high", "description": "broken"}]' > "$TEST_WORKSPACE/repair-prompt.txt"
    echo "Focus on fixing the event bus initialization" > "$TEST_WORKSPACE/repair-strategy.md"

    "$ON_IDLE" > /dev/null 2>&1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "REPAIR STRATEGY" \
        "Should include strategy context" || return 1

    assert_file_contains "$TEST_WORKSPACE/next-prompt.md" "event bus initialization" \
        "Should include strategy content" || return 1
}

test_job_complete_marker_signals_exit() {
    touch "$TEST_WORKSPACE/job-complete.marker"

    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "" \
        "Should return empty on completion" || return 1

    assert_file_exists "$TEST_WORKSPACE/exit-worker.marker" \
        "Should create exit marker" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"status": "completed"' \
        "State should be completed" || return 1
}

test_job_failed_marker_signals_exit() {
    touch "$TEST_WORKSPACE/job-failed.marker"

    local output
    output=$("$ON_IDLE" 2>&1)

    assert_eq "$output" "" \
        "Should return empty on failure" || return 1

    assert_file_exists "$TEST_WORKSPACE/exit-worker.marker" \
        "Should create exit marker" || return 1

    assert_file_contains "$TEST_WORKSPACE/harness-state.json" '"status": "failed"' \
        "State should be failed" || return 1
}

test_state_file_atomic_write() {
    "$ON_IDLE" > /dev/null 2>&1

    # Verify no .tmp file left behind
    assert_file_not_exists "$TEST_WORKSPACE/harness-state.json.tmp" \
        "Should not leave .tmp state file" || return 1

    assert_file_not_exists "$TEST_WORKSPACE/next-prompt.md.tmp" \
        "Should not leave .tmp prompt file" || return 1
}

test_gdd_dir_created_for_phase2() {
    echo '{"name": "TestGame"}' > "$TEST_WORKSPACE/idea.json"

    "$ON_IDLE" > /dev/null 2>&1

    if [[ ! -d "$TEST_WORKSPACE/gdd" ]]; then
        echo "  FAIL  Should create gdd directory"
        FAIL=$((FAIL + 1))
        return 1
    fi
}

# ============================================================
# RUN ALL TESTS
# ============================================================

echo ""
echo "=== on-idle.sh Tests ==="
echo ""

run_test "Empty workspace triggers phase 1"                    test_empty_workspace_triggers_phase1
run_test "Phase 1 includes genre seed"                         test_phase1_with_genre_seed
run_test "idea.json triggers phase 2 currencies"               test_idea_json_triggers_phase2_currencies
run_test "currencies done triggers progression"                test_currencies_done_triggers_progression
run_test "currencies+progression done triggers ui-ux"          test_currencies_progression_done_triggers_uiux
run_test "All GDD done triggers phase 3"                       test_all_gdd_done_triggers_phase3
run_test "Implementation plan triggers phase 4"                test_implementation_plan_triggers_phase4
run_test "dist/index.html creates phase4-complete marker"      test_dist_index_html_creates_phase4_complete_marker
run_test "Phase 4 complete stays idle"                         test_phase4_complete_stays_idle
run_test "repair-prompt.txt triggers phase 5"                  test_repair_prompt_triggers_phase5
run_test "Repair prompt includes strategy"                     test_repair_prompt_with_strategy
run_test "job-complete.marker signals exit"                    test_job_complete_marker_signals_exit
run_test "job-failed.marker signals exit"                      test_job_failed_marker_signals_exit
run_test "State file atomic write (no .tmp left)"              test_state_file_atomic_write
run_test "GDD directory created for phase 2"                   test_gdd_dir_created_for_phase2

echo ""
echo "--- Results: ${PASS} passed, ${FAIL} failed ---"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "Failed tests:${ERRORS}"
    exit 1
fi
