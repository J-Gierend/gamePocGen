# GamePocGen Batch 1 Test Results

Generated: 2026-02-07
Pipeline: New Phase 2 prompts (Mermaid-first + CONFIG specs)

## Summary

| Job | Genre | Status | URL | Score | Key Issues |
|-----|-------|--------|-----|-------|------------|
| 1 | puzzle-combat | completed | gamedemo1.namjo-games.com | 5/10 | No match logic, no wave progression, static board |
| 2 | pirate-ship-battles | completed | gamedemo2.namjo-games.com | 3/10 | No CONFIG, no tabs, no wave logic, economy dead |
| 3 | spell-crafting-arena | FAILED | N/A | N/A | OOM (exit 137) during Phase 4 |
| 4 | exploration-and-mapping | FAILED | N/A | N/A | Claude stalled in Phase 4, built 2/10 phases |
| 5 | monster-tamer | completed | gamedemo5.namjo-games.com | 5/10 | No wave logic, entities fight same-team, 1 tab only |
| 6 | train-network | building | pending | pending | Replacement job, in phase_2 |
| 7 | wave-survival | building | pending | pending | Replacement job, in phase_2 |

## Systemic Issues

### 1. Phase 4 Build Agent Only Completes 1-2 of 8-10 Phases
**Root Cause**: The Claude build agent runs out of context/time during Phase 4. All 3 deployed games only built phases 1-2, leaving:
- No wave/progression logic
- No upgrade purchasing
- No prestige system
- No skill tree
- Visual scaffolding only (grid/entities render but don't interact)

**Evidence**:
- Game 1: `_drawGrid` and `_initializeGrid` exist, but no `_checkMatches`, `_swapTiles`, `_startWave`
- Game 2: 2 entities on screen but no wave spawning, no tabs, no CONFIG on window
- Game 5: 2 player entities exist but `hasWaveLogic: false`, both idle, no enemies spawn

### 2. Same-Team Fighting Bug (Game 5)
Firebat (player) had 25/50 HP despite both entities being team=player. Entity `_findTarget` may not properly filter by opposing team.

### 3. Currency Reading Inconsistency
CurrencyManager internal storage varies between games (`_currencies` vs other patterns). Fixed in tester v2 with multiple fallbacks + HUD text comparison.

### 4. ~40% Build Failure Rate
2 of 5 jobs failed: one OOM (exit 137), one Claude stall. Matches expected ~30% rate.

## Individual Game Reports

### Game 1: Dungeon Matcher (puzzle-combat) - 5/10
- Canvas: 1400x774, 100% colored (colorful grid renders)
- HUD: 2 currencies (Gold: 20, Gems: 5), Wave 1 display
- CONFIG: 4 entities, 4 currencies, waves=true, prestige=true
- Tabs: 4 (Build, Upgrades, Skills, Prestige)
- Grid: Renders 8x8 colored tiles with rune icons (hearts, shields, swords)
- BROKEN: Grid is visual only - no click handlers, no swap/match logic
- BROKEN: Wave stuck at 0, no entities spawn, currencies never change
- BUILD_LOG: Completed Phase 1 (grid+hero) and Phase 2 (match detection), phases 3-9 pending

### Game 2: Pirate Ship Battles (pirate-ship-battles) - 3/10
- Canvas: 1400x824, 100% colored (blue ocean background)
- HUD: 1 currency display only (Gold: 0)
- CONFIG: NOT on window
- Tabs: None
- Entities: 2 visible (knight + slime sprites on ocean)
- BROKEN: No CONFIG exported, no tabs, no wave logic, economy dead
- BUILD_LOG: Only Phase 1 completed (canvas + basic entities)

### Game 5: Monster Squad Tactics (monster-tamer) - 5/10
- Canvas: 1400x700, 100% colored (dark green background)
- HUD: 1 currency display (Essence: 50→65 over time)
- CONFIG: 2 entities, 5 currencies, waves=true, prestige=true, skillTree=true
- Tabs: 1 (Squad)
- Entities: 2 player monsters (Slime Tank, Firebat DPS) with health bars
- WORKING: Currency increases over time (passive generation)
- WORKING: Entities animate and show health bars
- BROKEN: Wave stuck at 0, no wave spawning logic implemented
- BROKEN: Only 1 tab (Squad), no Upgrades/Skills/Prestige tabs
- BROKEN: Same-team entities may fight each other
- BUILD_LOG: Only Phase 1 completed

## Recommendations

1. **Phase 4 needs chunking**: The build prompt tries to implement 8-10 phases in one Claude session. This exceeds context limits. Consider splitting Phase 4 into multiple smaller passes or using a resumable approach.
2. **Phase 4 priority ordering**: Wave/combat logic should be Phase 1-2, not Phase 3+. If the agent times out, at least the core gameplay loop exists.
3. **CONFIG export enforcement**: Add explicit check in Phase 5 review that `window.CONFIG` exists.
4. **Memory limit increase**: 256MB causes OOM on complex games. Consider 512MB.
