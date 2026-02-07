#!/usr/bin/env node
/**
 * GamePocGen Playwright Game Tester
 *
 * Tests a deployed game for completeness and functionality.
 * Produces a structured report with a 10-point score and specific defect list.
 *
 * Scoring rubric (10 checks, 1 point each):
 *  1. Page loads without JS errors
 *  2. Canvas present and rendering content
 *  3. HUD displays currencies with values
 *  4. CONFIG object present with game structure
 *  5. Tabs present and switchable
 *  6. Canvas click interaction works
 *  7. Enemies/entities spawn and move
 *  8. Currencies change during gameplay
 *  9. Upgrades tab has purchasable items
 * 10. Waves advance over time
 *
 * Usage:
 *   node test-game.js <url> [--screenshots ./shots] [--json report.json]
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const args = process.argv.slice(2);
const url = args.find(a => a.startsWith('http'));
if (!url) {
  console.error('Usage: node test-game.js <url> [--screenshots dir] [--json file.json]');
  process.exit(1);
}

const ssIdx = args.indexOf('--screenshots');
const SCREENSHOT_DIR = ssIdx >= 0 ? args[ssIdx + 1] : null;

const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

if (SCREENSHOT_DIR && !existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (JSON_OUT) { const d = dirname(JSON_OUT); if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

async function screenshot(page, name) {
  if (!SCREENSHOT_DIR) return null;
  const p = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

// Helper: safely evaluate in page context
async function safeEval(page, fn) {
  try { return await page.evaluate(fn); }
  catch (e) { return { _error: e.message }; }
}

async function testGame(url) {
  const checks = {
    noJsErrors: { pass: false, detail: '' },
    canvasRendering: { pass: false, detail: '' },
    hudCurrencies: { pass: false, detail: '' },
    configPresent: { pass: false, detail: '' },
    tabsSwitchable: { pass: false, detail: '' },
    canvasInteraction: { pass: false, detail: '' },
    entitiesSpawn: { pass: false, detail: '' },
    currenciesChange: { pass: false, detail: '' },
    upgradesExist: { pass: false, detail: '' },
    wavesAdvance: { pass: false, detail: '' },
  };

  const report = {
    url,
    timestamp: new Date().toISOString(),
    score: 0,
    maxScore: 10,
    checks,
    defects: [],       // ordered list of specific defects
    topDefect: null,   // single worst defect for repair agent
    consoleErrors: [],
    gameState: null,
    configSummary: null,
    screenshots: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const jsErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') jsErrors.push(msg.text());
  });
  page.on('pageerror', err => jsErrors.push(`PageError: ${err.message}`));

  try {
    // === LOAD ===
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000); // let game init
    report.screenshots.push(await screenshot(page, '01-loaded'));

    // Check 1: No JS errors
    report.consoleErrors = jsErrors.filter(e => !e.includes('favicon'));
    if (report.consoleErrors.length === 0) {
      checks.noJsErrors.pass = true;
      checks.noJsErrors.detail = 'No JavaScript errors on load';
    } else {
      checks.noJsErrors.detail = `${report.consoleErrors.length} JS error(s): ${report.consoleErrors[0]?.substring(0, 120)}`;
      report.defects.push({
        severity: 'critical',
        check: 'noJsErrors',
        description: `JavaScript errors on page load: ${report.consoleErrors.map(e => e.substring(0, 150)).join('; ')}`,
        suggestion: 'Fix the JS errors first — the game may not initialize correctly. Check console for undefined variables, missing imports, or syntax errors.',
      });
    }

    // Check 2: Canvas present and rendering
    const canvasInfo = await safeEval(page, () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { present: false };
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i+3] > 0 && (data[i] > 10 || data[i+1] > 10 || data[i+2] > 10)) colored++;
      }
      const total = canvas.width * canvas.height;
      return {
        present: true,
        width: canvas.width,
        height: canvas.height,
        coloredPixels: colored,
        percentColored: +(colored / total * 100).toFixed(1),
      };
    });

    if (canvasInfo?.present && canvasInfo.percentColored > 1) {
      checks.canvasRendering.pass = true;
      checks.canvasRendering.detail = `Canvas ${canvasInfo.width}x${canvasInfo.height}, ${canvasInfo.percentColored}% colored`;
    } else if (canvasInfo?.present) {
      checks.canvasRendering.detail = `Canvas present but only ${canvasInfo?.percentColored || 0}% colored — possibly not rendering`;
      report.defects.push({
        severity: 'critical',
        check: 'canvasRendering',
        description: 'Canvas element exists but appears blank or nearly blank. The game world is not rendering.',
        suggestion: 'Check that SpriteRenderer is initialized, sprites are registered, and the render loop is running. Look for errors in game init().',
      });
    } else {
      checks.canvasRendering.detail = 'No canvas element found on page';
      report.defects.push({
        severity: 'critical',
        check: 'canvasRendering',
        description: 'No <canvas> element found in the HTML. The game has no visual game world.',
        suggestion: 'Check index.html for a canvas element. Check game.js init for canvas creation.',
      });
    }

    // Check 3: HUD currencies
    const hudInfo = await safeEval(page, () => {
      const displays = document.querySelectorAll('[id*="display"], [class*="currency"], [id*="currency"]');
      const found = [];
      displays.forEach(el => {
        const text = el.innerText.trim().substring(0, 50);
        if (text) found.push({ id: el.id, text });
      });
      // Also check header/hud area
      const hud = document.querySelector('#hud, [class*="hud"], header');
      return {
        hudElement: !!hud,
        hudText: hud?.innerText?.substring(0, 200) || '',
        currencyDisplays: found,
      };
    });

    if (hudInfo?.currencyDisplays?.length >= 2) {
      checks.hudCurrencies.pass = true;
      checks.hudCurrencies.detail = `${hudInfo.currencyDisplays.length} currency displays: ${hudInfo.currencyDisplays.map(d => d.text).join(', ')}`;
    } else if (hudInfo?.hudElement) {
      checks.hudCurrencies.detail = `HUD present but only ${hudInfo?.currencyDisplays?.length || 0} currency displays found`;
      report.defects.push({
        severity: 'major',
        check: 'hudCurrencies',
        description: `HUD exists but only ${hudInfo?.currencyDisplays?.length || 0} currency display(s) found. Game should show multiple currencies.`,
        suggestion: 'Check _setupUI() or init() — currency display elements may not be created, or IDs may not match the expected pattern.',
      });
    } else {
      checks.hudCurrencies.detail = 'No HUD element found';
      report.defects.push({
        severity: 'major',
        check: 'hudCurrencies',
        description: 'No HUD/header element found. Player cannot see currency amounts.',
        suggestion: 'Check index.html for #hud or header element. Check game.js for HUD initialization.',
      });
    }

    // Check 4: CONFIG present
    report.configSummary = await safeEval(page, () => {
      const config = window.CONFIG || window.config;
      if (!config) return null;
      return {
        gameId: config.gameId,
        entityTypes: config.entities ? Object.keys(config.entities) : [],
        currencyIds: config.currencies ? Object.keys(config.currencies) : [],
        hasWaves: !!config.waves,
        hasPrestige: !!config.prestige,
        hasSkillTree: !!config.skillTree,
        hasCanvas: !!config.canvas,
        hasUi: !!config.ui,
        hasEffects: !!config.effects,
        structureCosts: config.structureCosts ? Object.keys(config.structureCosts) : [],
        upgradeCosts: config.upgradeCosts ? Object.keys(config.upgradeCosts) : [],
      };
    });

    if (report.configSummary && !report.configSummary._error) {
      checks.configPresent.pass = true;
      const cs = report.configSummary;
      checks.configPresent.detail = `CONFIG: ${cs.entityTypes.length} entities, ${cs.currencyIds.length} currencies, waves=${cs.hasWaves}, prestige=${cs.hasPrestige}, skillTree=${cs.hasSkillTree}`;
    } else {
      checks.configPresent.detail = 'window.CONFIG not found';
      report.defects.push({
        severity: 'critical',
        check: 'configPresent',
        description: 'No CONFIG object on window. Game configuration is missing or not exported.',
        suggestion: 'Check config.js — CONFIG must be exported to window scope. Check index.html for proper script import order.',
      });
    }

    // Check 5: Tabs switchable
    const tabInfo = await safeEval(page, () => {
      const tabs = document.querySelectorAll('[data-tab], .tab, [role="tab"], #tabs button, nav button');
      return Array.from(tabs).map(t => ({
        text: t.textContent.substring(0, 30).trim(),
        dataTab: t.getAttribute('data-tab'),
        visible: t.offsetParent !== null,
      }));
    });

    if (tabInfo?.length >= 2 && !tabInfo._error) {
      // Try clicking second tab
      try {
        const tabLocators = await page.locator('[data-tab], .tab, #tabs button, nav button').all();
        if (tabLocators.length > 1) {
          await tabLocators[1].click();
          await page.waitForTimeout(500);
          const switched = await safeEval(page, () => {
            const active = document.querySelector('.tab.active, [data-tab].active, [aria-selected="true"], #tabs button.active');
            return !!active;
          });
          if (switched) {
            checks.tabsSwitchable.pass = true;
            checks.tabsSwitchable.detail = `${tabInfo.length} tabs found, switching works`;
          }
          // Switch back
          await tabLocators[0].click();
          await page.waitForTimeout(300);
        }
      } catch (e) {
        checks.tabsSwitchable.detail = `Tabs exist but switching failed: ${e.message}`;
      }
    }
    if (!checks.tabsSwitchable.pass) {
      checks.tabsSwitchable.detail = checks.tabsSwitchable.detail || `Only ${tabInfo?.length || 0} tab(s) found`;
      report.defects.push({
        severity: 'major',
        check: 'tabsSwitchable',
        description: `Tab system broken: ${tabInfo?.length || 0} tabs found. Expected at least 2 (Structures/Build + Upgrades).`,
        suggestion: 'Check _setupUI() for tab creation. Check index.html for tab HTML structure. Verify TabSystem or click handler is wired.',
      });
    }

    // === CAPTURE INITIAL STATE ===
    const initialState = await safeEval(page, () => {
      const game = window.game;
      if (!game) return null;
      const currencies = {};
      try {
        const mgr = game.currencies;
        // Try multiple internal storage patterns
        const store = mgr?._currencies || mgr?.currencies || mgr?.data || {};
        const ids = Object.keys(store);
        ids.forEach(id => {
          try {
            const entry = mgr.get?.(id) || store[id];
            const amt = entry?.amount;
            currencies[id] = amt?.toNumber?.() ?? (typeof amt === 'number' ? amt : 0);
          } catch(e) {}
        });
        // Fallback: try getAll()
        if (ids.length === 0 && mgr?.getAll) {
          try {
            const all = mgr.getAll();
            for (const [id, entry] of Object.entries(all)) {
              currencies[id] = entry?.amount?.toNumber?.() ?? (typeof entry?.amount === 'number' ? entry.amount : 0);
            }
          } catch(e) {}
        }
      } catch(e) {}
      // Also grab HUD text for currency fallback
      const hudText = document.querySelector('#hud, #resources, header')?.innerText || '';
      return {
        wave: game.world?.wave ?? game.wave ?? 0,
        entities: game.entities?.length ?? 0,
        structures: game.structures?.length ?? 0,
        collectibles: game.collectibles?.length ?? 0,
        currencies,
        hudText: hudText.substring(0, 300),
      };
    });
    report.gameState = initialState;

    // Check 6: Canvas interaction
    if (canvasInfo?.present) {
      try {
        const canvas = page.locator('canvas').first();
        const box = await canvas.boundingBox();
        if (box) {
          // Try placement button first
          const placeBtns = await page.locator('[id*="place"], button:has-text("Drill"), button:has-text("Tower"), button:has-text("Build"), button:has-text("Place")').all();
          if (placeBtns.length > 0) {
            await placeBtns[0].click();
            await page.waitForTimeout(300);
          }

          // Click canvas at multiple points
          const beforeStructures = initialState?.structures || 0;
          for (const [xf, yf] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.4]]) {
            await page.mouse.click(box.x + box.width * xf, box.y + box.height * yf);
            await page.waitForTimeout(400);
          }

          const afterClick = await safeEval(page, () => {
            const game = window.game;
            return game ? { structures: game.structures?.length || 0 } : null;
          });

          if (afterClick?.structures > beforeStructures) {
            checks.canvasInteraction.pass = true;
            checks.canvasInteraction.detail = `Structure placed! Before: ${beforeStructures}, After: ${afterClick.structures}`;
          } else {
            // Maybe it's not a placement game — check if click did anything
            checks.canvasInteraction.detail = 'Canvas clicked but no visible state change detected';
            report.defects.push({
              severity: 'major',
              check: 'canvasInteraction',
              description: 'Clicking on the Canvas does not produce any observable state change (no structure placed, no collectible gathered).',
              suggestion: 'Check canvas click handler in game.js. Verify placement mode logic, click coordinate translation, and structure creation.',
            });
          }
        }
      } catch (e) {
        checks.canvasInteraction.detail = `Canvas click error: ${e.message}`;
      }
    }

    report.screenshots.push(await screenshot(page, '02-after-interaction'));

    // === WAIT FOR GAMEPLAY (20 seconds) ===
    await page.waitForTimeout(20000);
    report.screenshots.push(await screenshot(page, '03-after-20s'));

    // Collect any new JS errors during gameplay
    const gameplayErrors = jsErrors.filter(e => !report.consoleErrors.includes(e) && !e.includes('favicon'));
    if (gameplayErrors.length > 0) {
      report.consoleErrors.push(...gameplayErrors);
      checks.noJsErrors.pass = false;
      checks.noJsErrors.detail = `${report.consoleErrors.length} total JS errors (${gameplayErrors.length} during gameplay)`;
    }

    const afterWaitState = await safeEval(page, () => {
      const game = window.game;
      if (!game) return null;
      const currencies = {};
      try {
        const mgr = game.currencies;
        const store = mgr?._currencies || mgr?.currencies || mgr?.data || {};
        const ids = Object.keys(store);
        ids.forEach(id => {
          try {
            const entry = mgr.get?.(id) || store[id];
            const amt = entry?.amount;
            currencies[id] = amt?.toNumber?.() ?? (typeof amt === 'number' ? amt : 0);
          } catch(e) {}
        });
        if (ids.length === 0 && mgr?.getAll) {
          try {
            const all = mgr.getAll();
            for (const [id, entry] of Object.entries(all)) {
              currencies[id] = entry?.amount?.toNumber?.() ?? (typeof entry?.amount === 'number' ? entry.amount : 0);
            }
          } catch(e) {}
        }
      } catch(e) {}
      const hudText = document.querySelector('#hud, #resources, header')?.innerText || '';
      return {
        wave: game.world?.wave ?? game.wave ?? 0,
        waveActive: game.world?.waveActive ?? false,
        entities: game.entities?.length ?? 0,
        structures: game.structures?.length ?? 0,
        collectibles: game.collectibles?.length ?? 0,
        currencies,
        hudText: hudText.substring(0, 300),
      };
    });

    // Check 7: Entities spawn
    if (afterWaitState?.entities > 0 || (afterWaitState?.entities === 0 && afterWaitState?.wave > (initialState?.wave || 0))) {
      checks.entitiesSpawn.pass = true;
      checks.entitiesSpawn.detail = `${afterWaitState.entities} entities on canvas at wave ${afterWaitState.wave}`;
    } else {
      checks.entitiesSpawn.detail = `No entities spawned after 20s (entities: ${afterWaitState?.entities || 0}, wave: ${afterWaitState?.wave || 0})`;
      report.defects.push({
        severity: 'critical',
        check: 'entitiesSpawn',
        description: 'No enemies or entities spawned after 20 seconds of gameplay. The game world appears static.',
        suggestion: 'Check wave spawning logic. Verify wave timer triggers enemy creation. Check entity factory and spawn point positioning.',
      });
    }

    // Check 8: Currencies change
    if (initialState && afterWaitState) {
      let anyChanged = false;
      for (const [id, val] of Object.entries(afterWaitState.currencies || {})) {
        const before = initialState.currencies?.[id];
        if (typeof val === 'number' && typeof before === 'number' && val !== before) {
          anyChanged = true;
          break;
        }
      }
      // Fallback: compare HUD text for currency changes
      if (!anyChanged && initialState.hudText && afterWaitState.hudText && initialState.hudText !== afterWaitState.hudText) {
        anyChanged = true;
      }
      if (anyChanged) {
        checks.currenciesChange.pass = true;
        checks.currenciesChange.detail = `Currencies changed: ${JSON.stringify(initialState.currencies)} → ${JSON.stringify(afterWaitState.currencies)}`;
      } else {
        checks.currenciesChange.detail = `No currency change after 20s. Before: ${JSON.stringify(initialState.currencies)}, After: ${JSON.stringify(afterWaitState.currencies)}`;
        report.defects.push({
          severity: 'critical',
          check: 'currenciesChange',
          description: 'No currency values changed after 20 seconds. The economy is not functioning.',
          suggestion: 'Check currency earning events (enemy-killed, wave-complete). Verify CurrencyManager.add() is called. Check EventBus wiring.',
        });
      }
    }

    // Check 9: Upgrades tab has items
    try {
      const upgradesTab = page.locator('[data-tab="upgrades"], .tab:has-text("Upgrade")').first();
      if (await upgradesTab.count() > 0) {
        await upgradesTab.click();
        await page.waitForTimeout(500);

        const upgradeInfo = await safeEval(page, () => {
          // Look for upgrade buttons/cards in the active panel
          const panel = document.querySelector('.game-panel.active, [id*="upgrade"], [class*="upgrade"]');
          const buttons = document.querySelectorAll('.game-panel.active button, [id*="upgrade"] button, .upgrade-card, .upgrade-btn');
          return {
            panelFound: !!panel,
            panelText: panel?.innerText?.substring(0, 200) || '',
            buttonCount: buttons.length,
          };
        });

        if (upgradeInfo?.buttonCount > 0) {
          checks.upgradesExist.pass = true;
          checks.upgradesExist.detail = `${upgradeInfo.buttonCount} upgrade button(s) found in panel`;

          // Try buying one
          const buyBtn = page.locator('.game-panel.active button, [id*="upgrade"] button').first();
          if (await buyBtn.count() > 0) {
            await buyBtn.click();
            await page.waitForTimeout(300);
          }
        } else {
          checks.upgradesExist.detail = `Upgrades panel empty (${upgradeInfo?.buttonCount || 0} buttons)`;
          report.defects.push({
            severity: 'major',
            check: 'upgradesExist',
            description: 'Upgrades tab exists but has no upgrade buttons/cards inside.',
            suggestion: 'Check _setupUpgrades() — upgrade buttons may not be created. Verify config.upgradeCosts is populated.',
          });
        }
      } else {
        checks.upgradesExist.detail = 'No upgrades tab found';
      }

      // Switch back to first tab
      const firstTab = page.locator('[data-tab], .tab').first();
      if (await firstTab.count() > 0) await firstTab.click();
    } catch (e) {
      checks.upgradesExist.detail = `Upgrade test error: ${e.message}`;
    }

    // Check 10: Waves advance
    if (afterWaitState?.wave > (initialState?.wave || 0)) {
      checks.wavesAdvance.pass = true;
      checks.wavesAdvance.detail = `Wave advanced: ${initialState?.wave || 0} → ${afterWaitState.wave}`;
    } else {
      checks.wavesAdvance.detail = `Wave stuck at ${afterWaitState?.wave || initialState?.wave || 0} after 20s`;
      report.defects.push({
        severity: 'major',
        check: 'wavesAdvance',
        description: `Waves did not advance after 20 seconds. Stuck at wave ${afterWaitState?.wave || 0}.`,
        suggestion: 'Check wave completion logic. Verify all enemies are being counted and killed. Check wave timer and transition code.',
      });
    }

    report.screenshots.push(await screenshot(page, '04-final'));

  } catch (e) {
    report.defects.push({
      severity: 'critical',
      check: 'fatal',
      description: `Fatal error during testing: ${e.message}`,
      suggestion: 'The game may not load at all. Check the URL, server, and basic HTML structure.',
    });
  } finally {
    await browser.close();
  }

  // === SCORING ===
  report.score = Object.values(checks).filter(c => c.pass).length;

  // Sort defects: critical first, then major, then minor
  const severityOrder = { critical: 0, major: 1, minor: 2 };
  report.defects.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  // Top defect for repair agent
  report.topDefect = report.defects[0] || null;

  return report;
}

// === MAIN ===
const report = await testGame(url);

// Print summary to stderr
const log = (s) => process.stderr.write(s + '\n');
log('');
log(`╔══════════════════════════════════════════════╗`);
log(`║  GAME TEST REPORT: ${report.score}/${report.maxScore}                     ║`);
log(`╠══════════════════════════════════════════════╣`);
for (const [name, check] of Object.entries(report.checks)) {
  const icon = check.pass ? '✅' : '❌';
  log(`║ ${icon} ${name.padEnd(20)} ${check.detail.substring(0, 50).padEnd(50)} ║`);
}
log(`╠══════════════════════════════════════════════╣`);
if (report.defects.length > 0) {
  log(`║ DEFECTS (${report.defects.length}):`.padEnd(48) + '║');
  for (const d of report.defects.slice(0, 5)) {
    log(`║  [${d.severity.toUpperCase()}] ${d.description.substring(0, 60)}`.padEnd(48) + '║');
  }
} else {
  log(`║ No defects found!                              ║`);
}
log(`╚══════════════════════════════════════════════╝`);
log('');

// JSON to stdout
console.log(JSON.stringify(report, null, 2));

// Write to file if requested
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  log(`Report written to ${JSON_OUT}`);
}
if (SCREENSHOT_DIR) {
  writeFileSync(join(SCREENSHOT_DIR, 'report.json'), JSON.stringify(report, null, 2));
}

process.exit(report.score < 5 ? 1 : 0);
