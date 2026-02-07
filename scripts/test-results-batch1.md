# GamePocGen Batch 1 Test Results

Generated: 2026-02-07
Pipeline: New Phase 2 prompts (Mermaid-first + CONFIG specs)
Tester: Playwright automated 10-point scoring rubric

## Summary

| Job | Genre | Status | URL | Score | Key Issues |
|-----|-------|--------|-----|-------|------------|
| 1 | puzzle-combat | completed | gamedemo1.namjo-games.com | 5/10 | No match logic, no wave progression, static board |
| 2 | pirate-ship-battles | completed | gamedemo2.namjo-games.com | 3/10 | No CONFIG, no tabs, no wave logic, economy dead |
| 3 | spell-crafting-arena | FAILED | N/A | N/A | OOM (exit 137) during Phase 4 |
| 4 | exploration-and-mapping | FAILED | N/A | N/A | Claude stalled in Phase 4, built 2/10 phases |
| 5 | monster-tamer | completed | gamedemo5.namjo-games.com | 5/10 | No wave logic, entities fight same-team, 1 tab only |
| 6 | train-network | completed | gamedemo6.namjo-games.com | 7/10 | No CONFIG on window, wave active but stuck at wave 1 |
| 7 | wave-survival | completed | gamedemo7.namjo-games.com | 5/10 | No tabs, no currency changes, wave stuck |

**Average score (5 deployed): 5.0/10**
**Best game: Game 6 (train-network) at 7/10**
**Failure rate: 2/7 = 29%** (within expected ~30%)

## Scoring Rubric

10 automated checks, 1 point each:
1. No JavaScript errors on page load
2. Canvas present and rendering content (>1% pixels colored)
3. HUD displays 2+ currencies with values
4. CONFIG object present on window with game structure
5. 2+ tabs present and switchable
6. Canvas click produces observable state change
7. Entities spawn and are visible on canvas
8. Currencies change during 20s of gameplay
9. Upgrades tab has purchasable items
10. Waves advance over time

## Systemic Issues

### 1. Phase 4 Build Agent Only Completes 1-2 of 8-10 Phases
**Root Cause**: The Claude build agent runs out of context/time during Phase 4. Most deployed games only built phases 1-2, leaving:
- No wave/progression logic (or partial wave 1 only)
- No upgrade purchasing flow
- No prestige system
- No skill tree
- Visual scaffolding only (grid/entities render but gameplay loop incomplete)

**Evidence**:
- Game 1: `_drawGrid` and `_initializeGrid` exist, but no `_checkMatches`, `_swapTiles`, `_startWave`
- Game 2: 2 entities on screen but no wave spawning, no tabs, no CONFIG on window
- Game 5: 2 player entities exist but `hasWaveLogic: false`, both idle
- Game 6: Best game — has wave countdown, enemies spawn, combat visible, but wave doesn't advance to wave 2
- Game 7: Wave 1 started, enemy visible, but no combat/economy flow

### 2. CONFIG Export Missing in Some Games
Games 2 and 6 don't expose `window.CONFIG`. The config exists internally but isn't exported to the global scope, breaking external tool access.

### 3. Currency Reading Inconsistency
CurrencyManager internal storage varies between games (`_currencies` vs `currencies` vs other patterns). Fixed in tester v2 with multiple fallbacks + HUD text comparison.

### 4. ~30% Build Failure Rate
2 of 7 jobs failed: one OOM (exit 137), one Claude stall. Matches expected ~30% rate.

### 5. Same-Team Fighting Bug (Game 5)
Firebat (player) had 25/50 HP despite both entities being team=player.

## Individual Game Reports

### Game 1: Dungeon Matcher (puzzle-combat) - 5/10
- Canvas: 1400x774, 100% colored (colorful 8x8 grid with rune icons)
- HUD: 2 currencies (Gold: 20, Gems: 5), Wave 1 display
- CONFIG: 4 entities, 4 currencies, waves=true, prestige=true
- Tabs: 4 (Build, Upgrades, Skills, Prestige) - all switchable
- BROKEN: Grid is visual only - no click handlers, no swap/match logic
- BROKEN: Wave stuck at 0, no entities spawn, currencies never change
- BUILD_LOG: Phases 1-2 completed, phases 3-9 pending

### Game 2: Pirate Ship Battles (pirate-ship-battles) - 3/10
- Canvas: 1400x824, 100% colored (blue ocean with knight+slime)
- HUD: 1 currency display only (Gold: 0)
- CONFIG: NOT on window
- Tabs: None
- BROKEN: No CONFIG exported, no tabs, no wave logic, economy dead
- BUILD_LOG: Only Phase 1 completed

### Game 5: Monster Squad Tactics (monster-tamer) - 5/10
- Canvas: 1400x700, 100% colored (dark green arena)
- HUD: 1 currency display (Essence: 50→65 passive generation working)
- CONFIG: 2 entities, 5 currencies, waves=true, prestige=true, skillTree=true
- Tabs: 1 (Squad) with monster cards (Slime Tank, Firebat DPS)
- WORKING: Currency increases over time, entities animate with health bars
- BROKEN: Wave stuck at 0, no wave spawning logic, only 1 tab
- BUILD_LOG: Only Phase 1 completed

### Game 6: Train Network (train-network) - 7/10 (BEST)
- Canvas: 1400x700, 100% colored (dark green with pen structure)
- HUD: 3 currencies (Gold: 50, Hearts: 0, Crown: 0/5), Wave countdown
- CONFIG: Not on window (but game works)
- Tabs: 2 (Shop, Upgrades) - both switchable with upgrade buttons
- WORKING: Wave countdown ("Wave 1 - Starting in 1s"), enemies spawn ("Wave 1 - 3 enemies")
- WORKING: Entities visible with pen structure showing "PEN (3/5)"
- WORKING: Upgrade buttons present and clickable
- PARTIAL: Wave 1 runs but doesn't advance to wave 2
- BUILD_LOG: Most phases likely completed (best build completion)

### Game 7: Harbor Survival (wave-survival) - 5/10
- Canvas: 1400x730, side-scrolling ship on water
- HUD: 4 currencies (Crystal: 50, Hearts: 0, Spark: 0, Star: 0)
- CONFIG: 5 entities, 4 currencies, waves=true, prestige=true, skillTree=true
- Tabs: None
- WORKING: Wave 1 display, entity with "Lv1" label, enemy spawns
- BROKEN: No tabs, currencies don't change, wave stuck at 1
- BUILD_LOG: Phase 1 completed, partial phase 2

## Recommendations

1. **Phase 4 needs chunking**: Split the monolithic build into multiple smaller Claude sessions. Each session handles 2-3 phases max. This is the #1 improvement needed.
2. **Phase 4 priority ordering**: The implementation guide should put wave/combat/economy in phases 1-2, not phase 3+. If the agent runs out of context, at least the core gameplay loop exists.
3. **CONFIG export enforcement**: Add to Phase 4 prompt: "CONFIG MUST be exported to window.CONFIG for debugging tools."
4. **Memory limit increase**: 256MB causes OOM on complex games. Recommend 512MB.
5. **Review-repair loop**: Build the automated test→fix→retest loop (user's original request, next step).
