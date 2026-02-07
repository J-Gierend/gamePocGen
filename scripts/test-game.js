#!/usr/bin/env node
/**
 * GamePocGen Playwright Game Tester
 *
 * Tests a deployed game for completeness, functionality, and interactivity.
 * Produces a structured report with a weighted score and specific defect list.
 *
 * Scoring rubric (14 checks, weighted to 10-point scale):
 *
 * Core (1 pt each):
 *  1. noJsErrors         - Page loads without JS errors
 *  2. canvasRendering    - Canvas present and rendering content
 *  3. configPresent      - CONFIG object present with game structure
 *  4. hudCurrencies      - HUD displays currencies with values
 *  5. tabsSwitchable     - Tabs present and switchable
 *  6. upgradesExist      - Upgrades tab has purchasable items
 *
 * Interactivity (1.5 pts each - weighted higher):
 *  7. controlsVisible    - On-screen controls/hotkeys panel visible
 *  8. tutorialPresent    - "How to play" instructions shown on load
 *  9. canvasInteraction  - Canvas clicks produce NEW entities/state changes
 * 10. canvasClickResponsive - 5 clicks at different positions, 3+ produce distinct results
 *
 * Gameplay (1 pt each):
 * 11. entitiesSpawn      - Enemies/entities spawn and move
 * 12. currenciesChange   - Currencies change during gameplay
 * 13. wavesAdvance       - Waves advance over time
 * 14. gameplayLoop       - Player actions (not just timers) drive state changes
 *
 * No-controls penalty: games without visible controls panel cap at 4/10 max
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

// Helper: get game currency state
async function getCurrencyState(page) {
  return safeEval(page, () => {
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
}

// Check weight definitions
const CHECK_WEIGHTS = {
  noJsErrors: 1,
  canvasRendering: 1,
  configPresent: 1,
  hudCurrencies: 1,
  tabsSwitchable: 1,
  upgradesExist: 1,
  controlsVisible: 1.5,
  tutorialPresent: 1.5,
  canvasInteraction: 1.5,
  canvasClickResponsive: 1.5,
  entitiesSpawn: 1,
  currenciesChange: 1,
  wavesAdvance: 1,
  gameplayLoop: 1,
};

const MAX_WEIGHTED = Object.values(CHECK_WEIGHTS).reduce((s, w) => s + w, 0);

async function testGame(url) {
  const checks = {};
  for (const key of Object.keys(CHECK_WEIGHTS)) {
    checks[key] = { pass: false, detail: '', weight: CHECK_WEIGHTS[key] };
  }

  const report = {
    url,
    timestamp: new Date().toISOString(),
    score: 0,
    maxScore: 10,
    weightedRaw: 0,
    maxWeightedRaw: MAX_WEIGHTED,
    checks,
    defects: [],
    topDefect: null,
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
        suggestion: 'Fix the JS errors first — the game may not initialize correctly.',
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
      checks.canvasRendering.detail = `Canvas present but only ${canvasInfo?.percentColored || 0}% colored`;
      report.defects.push({ severity: 'critical', check: 'canvasRendering',
        description: 'Canvas element exists but appears blank. The game world is not rendering.',
        suggestion: 'Check SpriteRenderer init, sprite registration, and render loop.' });
    } else {
      checks.canvasRendering.detail = 'No canvas element found';
      report.defects.push({ severity: 'critical', check: 'canvasRendering',
        description: 'No <canvas> element found.',
        suggestion: 'Check index.html for a canvas element.' });
    }

    // Check 3: CONFIG present
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
      };
    });

    if (report.configSummary && !report.configSummary._error) {
      checks.configPresent.pass = true;
      const cs = report.configSummary;
      checks.configPresent.detail = `CONFIG: ${cs.entityTypes.length} entities, ${cs.currencyIds.length} currencies`;
    } else {
      checks.configPresent.detail = 'window.CONFIG not found';
      report.defects.push({ severity: 'critical', check: 'configPresent',
        description: 'No CONFIG object on window.',
        suggestion: 'Check config.js export and script import order.' });
    }

    // Check 4: HUD currencies
    const hudInfo = await safeEval(page, () => {
      const displays = document.querySelectorAll('[id*="display"], [class*="currency"], [id*="currency"]');
      const found = [];
      displays.forEach(el => {
        const text = el.innerText.trim().substring(0, 50);
        if (text) found.push({ id: el.id, text });
      });
      const hud = document.querySelector('#hud, [class*="hud"], header');
      return {
        hudElement: !!hud,
        hudText: hud?.innerText?.substring(0, 200) || '',
        currencyDisplays: found,
      };
    });

    if (hudInfo?.currencyDisplays?.length >= 2) {
      checks.hudCurrencies.pass = true;
      checks.hudCurrencies.detail = `${hudInfo.currencyDisplays.length} currency displays found`;
    } else {
      checks.hudCurrencies.detail = `Only ${hudInfo?.currencyDisplays?.length || 0} currency display(s)`;
      report.defects.push({ severity: 'major', check: 'hudCurrencies',
        description: `Only ${hudInfo?.currencyDisplays?.length || 0} currency display(s) found.`,
        suggestion: 'Check _setupUI() for currency display creation.' });
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
      try {
        const tabLocators = await page.locator('[data-tab], .tab, #tabs button, nav button').all();
        if (tabLocators.length > 1) {
          await tabLocators[1].click();
          await page.waitForTimeout(500);
          checks.tabsSwitchable.pass = true;
          checks.tabsSwitchable.detail = `${tabInfo.length} tabs found, switching works`;
          await tabLocators[0].click();
          await page.waitForTimeout(300);
        }
      } catch (e) {
        checks.tabsSwitchable.detail = `Tabs exist but switching failed: ${e.message}`;
      }
    }
    if (!checks.tabsSwitchable.pass) {
      checks.tabsSwitchable.detail = checks.tabsSwitchable.detail || `Only ${tabInfo?.length || 0} tab(s) found`;
      report.defects.push({ severity: 'major', check: 'tabsSwitchable',
        description: `Tab system: ${tabInfo?.length || 0} tabs found. Expected >= 2.`,
        suggestion: 'Check _setupUI() for tab creation.' });
    }

    // === NEW CHECK 7: Controls panel visible ===
    const controlsInfo = await safeEval(page, () => {
      const body = document.body.innerText.toLowerCase();
      // Look for a controls/hotkeys reference panel
      const controlKeywords = ['click', 'key', 'controls', 'hotkey', 'press', 'drag', 'space', 'shift'];
      const matchedKeywords = controlKeywords.filter(kw => body.includes(kw));

      // Look for dedicated controls elements
      const controlEls = document.querySelectorAll(
        '[id*="control"], [class*="control"], [id*="hotkey"], [class*="hotkey"], ' +
        '[id*="keybind"], [class*="keybind"], [id*="instructions"], [class*="instructions"]'
      );

      // Check for visible text that looks like key bindings (e.g., "Click: Place", "Space: Start")
      const allText = document.body.innerText;
      const bindingPatterns = /(?:click|left.?click|right.?click|space|shift|[A-Z])\s*[:=→-]\s*\w/gi;
      const bindings = allText.match(bindingPatterns) || [];

      return {
        matchedKeywords,
        controlElements: controlEls.length,
        bindingCount: bindings.length,
        bindings: bindings.slice(0, 10).map(b => b.substring(0, 40)),
        hasControlsSection: controlEls.length > 0 || matchedKeywords.length >= 2,
      };
    });

    if (controlsInfo?.hasControlsSection && controlsInfo.bindingCount >= 2) {
      checks.controlsVisible.pass = true;
      checks.controlsVisible.detail = `Controls visible: ${controlsInfo.bindingCount} bindings (${controlsInfo.bindings.slice(0, 3).join(', ')})`;
    } else if (controlsInfo?.hasControlsSection) {
      checks.controlsVisible.detail = `Controls section found but only ${controlsInfo?.bindingCount || 0} bindings`;
      report.defects.push({ severity: 'major', check: 'controlsVisible',
        description: 'Controls section exists but has insufficient key bindings listed.',
        suggestion: 'Add a visible controls panel listing at least 3 player actions.' });
    } else {
      checks.controlsVisible.detail = 'No controls/hotkeys panel visible';
      report.defects.push({ severity: 'critical', check: 'controlsVisible',
        description: 'No visible controls panel. New players cannot discover how to play.',
        suggestion: 'Add a permanent on-screen controls panel showing all interactions.' });
    }

    // === NEW CHECK 8: Tutorial/instructions overlay ===
    const tutorialInfo = await safeEval(page, () => {
      const body = document.body.innerText.toLowerCase();
      const tutorialKeywords = ['how to play', 'getting started', 'tutorial', 'instructions', 'welcome', 'got it'];
      const matchedTutorial = tutorialKeywords.filter(kw => body.includes(kw));

      // Look for modal/overlay elements that might be a tutorial
      const overlays = document.querySelectorAll(
        '[id*="tutorial"], [class*="tutorial"], [id*="overlay"], [class*="overlay"], ' +
        '[id*="instructions"], [class*="instructions"], [id*="welcome"], [class*="welcome"], ' +
        '[id*="how-to"], [class*="how-to"], .modal'
      );

      // Check for dismiss button
      const dismissBtns = document.querySelectorAll(
        'button:has-text("Got it"), button:has-text("Start"), button:has-text("Play"), ' +
        'button:has-text("Close"), button:has-text("OK"), button:has-text("Begin")'
      );
      // Fallback: search button text content manually
      const allButtons = Array.from(document.querySelectorAll('button'));
      const dismissTexts = allButtons
        .map(b => b.textContent.trim().toLowerCase())
        .filter(t => ['got it', 'start', 'play', 'close', 'ok', 'begin', 'dismiss', 'let\'s go'].some(d => t.includes(d)));

      return {
        matchedKeywords: matchedTutorial,
        overlayElements: overlays.length,
        dismissButtons: dismissTexts.length,
        hasTutorial: matchedTutorial.length >= 1 || overlays.length > 0,
      };
    });

    if (tutorialInfo?.hasTutorial) {
      checks.tutorialPresent.pass = true;
      checks.tutorialPresent.detail = `Tutorial found: ${tutorialInfo.matchedKeywords.join(', ') || 'overlay element detected'}`;
      // Try to dismiss it if there's a button
      try {
        const dismissBtn = page.locator('button').filter({ hasText: /got it|start|play|close|begin|ok|let.*go/i }).first();
        if (await dismissBtn.count() > 0) {
          await dismissBtn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) { /* ignore */ }
    } else {
      checks.tutorialPresent.detail = 'No tutorial/instructions overlay found on load';
      report.defects.push({ severity: 'major', check: 'tutorialPresent',
        description: 'No "How to Play" tutorial overlay shown on first load.',
        suggestion: 'Add a tutorial overlay with 3-4 bullet points shown on first page load.' });
    }

    // === CAPTURE INITIAL STATE ===
    const initialState = await getCurrencyState(page);
    report.gameState = initialState;

    // Check 9: Canvas interaction (NEW entity/structure creation, not detecting existing)
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

          const beforeState = await safeEval(page, () => {
            const g = window.game;
            return g ? {
              structures: g.structures?.length || 0,
              entities: g.entities?.length || 0,
              totalObjects: (g.structures?.length || 0) + (g.entities?.length || 0) + (g.collectibles?.length || 0),
            } : null;
          });

          // Click canvas at 3 points
          for (const [xf, yf] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.4]]) {
            await page.mouse.click(box.x + box.width * xf, box.y + box.height * yf);
            await page.waitForTimeout(400);
          }

          const afterClick = await safeEval(page, () => {
            const g = window.game;
            return g ? {
              structures: g.structures?.length || 0,
              entities: g.entities?.length || 0,
              totalObjects: (g.structures?.length || 0) + (g.entities?.length || 0) + (g.collectibles?.length || 0),
            } : null;
          });

          if (afterClick && beforeState && afterClick.totalObjects > beforeState.totalObjects) {
            checks.canvasInteraction.pass = true;
            checks.canvasInteraction.detail = `New objects created: ${beforeState.totalObjects} → ${afterClick.totalObjects}`;
          } else {
            checks.canvasInteraction.detail = 'Canvas clicked but no new objects created';
            report.defects.push({ severity: 'major', check: 'canvasInteraction',
              description: 'Canvas clicks do not produce new entities/structures.',
              suggestion: 'Check canvas click handler and placement/creation logic.' });
          }
        }
      } catch (e) {
        checks.canvasInteraction.detail = `Canvas click error: ${e.message}`;
      }
    }

    // === NEW CHECK 10: Canvas click responsiveness (5 positions, 3+ distinct results) ===
    if (canvasInfo?.present) {
      try {
        const canvas = page.locator('canvas').first();
        const box = await canvas.boundingBox();
        if (box) {
          const stateSnapshots = [];
          const clickPositions = [[0.2, 0.2], [0.4, 0.3], [0.6, 0.5], [0.8, 0.4], [0.5, 0.7]];

          for (const [xf, yf] of clickPositions) {
            const before = await safeEval(page, () => {
              const g = window.game;
              return g ? {
                structures: g.structures?.length || 0,
                entities: g.entities?.length || 0,
                effects: g.effects?.length || 0,
              } : null;
            });

            await page.mouse.click(box.x + box.width * xf, box.y + box.height * yf);
            await page.waitForTimeout(500);

            const after = await safeEval(page, () => {
              const g = window.game;
              return g ? {
                structures: g.structures?.length || 0,
                entities: g.entities?.length || 0,
                effects: g.effects?.length || 0,
              } : null;
            });

            if (before && after) {
              const changed = (after.structures !== before.structures) ||
                              (after.entities !== before.entities) ||
                              (after.effects !== before.effects);
              stateSnapshots.push({ changed, before, after });
            }
          }

          const distinctChanges = stateSnapshots.filter(s => s.changed).length;
          if (distinctChanges >= 3) {
            checks.canvasClickResponsive.pass = true;
            checks.canvasClickResponsive.detail = `${distinctChanges}/5 clicks produced state changes`;
          } else {
            checks.canvasClickResponsive.detail = `Only ${distinctChanges}/5 clicks produced changes`;
            report.defects.push({ severity: 'major', check: 'canvasClickResponsive',
              description: `Only ${distinctChanges}/5 canvas clicks produced distinct state changes. Need >= 3.`,
              suggestion: 'Ensure canvas clicks at different positions produce different gameplay results.' });
          }
        }
      } catch (e) {
        checks.canvasClickResponsive.detail = `Click test error: ${e.message}`;
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

    const afterWaitState = await getCurrencyState(page);

    // Check 11: Entities spawn
    if (afterWaitState?.entities > 0 || (afterWaitState?.entities === 0 && afterWaitState?.wave > (initialState?.wave || 0))) {
      checks.entitiesSpawn.pass = true;
      checks.entitiesSpawn.detail = `${afterWaitState.entities} entities at wave ${afterWaitState.wave}`;
    } else {
      checks.entitiesSpawn.detail = `No entities after 20s`;
      report.defects.push({ severity: 'critical', check: 'entitiesSpawn',
        description: 'No entities spawned after 20 seconds.',
        suggestion: 'Check wave spawning logic and entity factory.' });
    }

    // Check 12: Currencies change
    if (initialState && afterWaitState) {
      let anyChanged = false;
      for (const [id, val] of Object.entries(afterWaitState.currencies || {})) {
        const before = initialState.currencies?.[id];
        if (typeof val === 'number' && typeof before === 'number' && val !== before) {
          anyChanged = true;
          break;
        }
      }
      if (!anyChanged && initialState.hudText && afterWaitState.hudText && initialState.hudText !== afterWaitState.hudText) {
        anyChanged = true;
      }
      if (anyChanged) {
        checks.currenciesChange.pass = true;
        checks.currenciesChange.detail = `Currencies changed over 20s`;
      } else {
        checks.currenciesChange.detail = 'No currency change after 20s';
        report.defects.push({ severity: 'critical', check: 'currenciesChange',
          description: 'No currency values changed after 20 seconds.',
          suggestion: 'Check currency earning events and EventBus wiring.' });
      }
    }

    // Check 6: Upgrades tab has items
    try {
      const upgradesTab = page.locator('[data-tab="upgrades"], .tab:has-text("Upgrade")').first();
      if (await upgradesTab.count() > 0) {
        await upgradesTab.click();
        await page.waitForTimeout(500);
        const upgradeInfo = await safeEval(page, () => {
          const buttons = document.querySelectorAll('.game-panel.active button, [id*="upgrade"] button, .upgrade-card, .upgrade-btn');
          return { buttonCount: buttons.length };
        });
        if (upgradeInfo?.buttonCount > 0) {
          checks.upgradesExist.pass = true;
          checks.upgradesExist.detail = `${upgradeInfo.buttonCount} upgrade button(s)`;
          const buyBtn = page.locator('.game-panel.active button, [id*="upgrade"] button').first();
          if (await buyBtn.count() > 0) { await buyBtn.click(); await page.waitForTimeout(300); }
        } else {
          checks.upgradesExist.detail = 'Upgrades panel empty';
          report.defects.push({ severity: 'major', check: 'upgradesExist',
            description: 'Upgrades tab has no buttons/cards.',
            suggestion: 'Check _setupUpgrades() and config.' });
        }
      } else {
        checks.upgradesExist.detail = 'No upgrades tab found';
      }
      const firstTab = page.locator('[data-tab], .tab').first();
      if (await firstTab.count() > 0) await firstTab.click();
    } catch (e) {
      checks.upgradesExist.detail = `Upgrade test error: ${e.message}`;
    }

    // Check 13: Waves advance
    if (afterWaitState?.wave > (initialState?.wave || 0)) {
      checks.wavesAdvance.pass = true;
      checks.wavesAdvance.detail = `Wave: ${initialState?.wave || 0} → ${afterWaitState.wave}`;
    } else {
      checks.wavesAdvance.detail = `Stuck at wave ${afterWaitState?.wave || 0}`;
      report.defects.push({ severity: 'major', check: 'wavesAdvance',
        description: `Waves stuck at ${afterWaitState?.wave || 0} after 20s.`,
        suggestion: 'Check wave completion logic.' });
    }

    // === NEW CHECK 14: Gameplay loop (player actions drive state, not just timers) ===
    // Compare: currencies earned during 10s idle vs 10s with clicks
    const preIdleState = await getCurrencyState(page);
    await page.waitForTimeout(10000);
    const postIdleState = await getCurrencyState(page);

    // Now click actively for 10 seconds
    if (canvasInfo?.present) {
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        const clickStart = Date.now();
        while (Date.now() - clickStart < 10000) {
          const xf = 0.2 + Math.random() * 0.6;
          const yf = 0.2 + Math.random() * 0.6;
          await page.mouse.click(box.x + box.width * xf, box.y + box.height * yf);
          await page.waitForTimeout(500);
        }
      }
    }
    const postClickState = await getCurrencyState(page);

    if (preIdleState && postIdleState && postClickState) {
      // Calculate total currency change during idle and during clicks
      let idleChange = 0;
      let clickChange = 0;
      for (const id of Object.keys(postClickState.currencies || {})) {
        const pre = preIdleState.currencies?.[id] || 0;
        const mid = postIdleState.currencies?.[id] || 0;
        const post = postClickState.currencies?.[id] || 0;
        idleChange += Math.abs(mid - pre);
        clickChange += Math.abs(post - mid);
      }

      // Also check if structures/entities changed more during click phase
      const idleEntityDelta = Math.abs((postIdleState.entities || 0) - (preIdleState.entities || 0));
      const clickEntityDelta = Math.abs((postClickState.entities || 0) - (postIdleState.entities || 0));

      if (clickChange > idleChange * 1.2 || clickEntityDelta > idleEntityDelta) {
        checks.gameplayLoop.pass = true;
        checks.gameplayLoop.detail = `Active play earns more: idle=${idleChange.toFixed(0)}, clicks=${clickChange.toFixed(0)}`;
      } else if (clickChange > 0 || idleChange > 0) {
        // At least something is happening
        checks.gameplayLoop.detail = `Economy active but clicks don't earn more: idle=${idleChange.toFixed(0)}, clicks=${clickChange.toFixed(0)}`;
        report.defects.push({ severity: 'minor', check: 'gameplayLoop',
          description: 'Currencies change but player actions do not accelerate earning beyond passive timers.',
          suggestion: 'Ensure canvas interactions (placing, clicking, collecting) earn more than idle income.' });
      } else {
        checks.gameplayLoop.detail = 'No currency changes during either idle or active play';
        report.defects.push({ severity: 'major', check: 'gameplayLoop',
          description: 'No gameplay loop detected - neither idle nor active play produces currency.',
          suggestion: 'Check the entire economy pipeline.' });
      }
    }

    report.screenshots.push(await screenshot(page, '04-final'));

  } catch (e) {
    report.defects.push({
      severity: 'critical', check: 'fatal',
      description: `Fatal error during testing: ${e.message}`,
      suggestion: 'The game may not load at all.',
    });
  } finally {
    await browser.close();
  }

  // === SCORING (weighted, normalized to 10) ===
  let weightedScore = 0;
  for (const [key, check] of Object.entries(checks)) {
    if (check.pass) weightedScore += CHECK_WEIGHTS[key];
  }
  report.weightedRaw = weightedScore;

  // Normalize to 10-point scale
  report.score = Math.round((weightedScore / MAX_WEIGHTED) * 10 * 10) / 10; // 1 decimal

  // No-controls penalty: cap at 4/10 if no controls panel
  if (!checks.controlsVisible.pass && report.score > 4) {
    report.score = 4;
    report.defects.push({
      severity: 'critical', check: 'scoring',
      description: 'Score capped at 4/10 due to missing controls panel. No controls = unplayable.',
      suggestion: 'Add a permanent on-screen controls panel.',
    });
  }

  // Sort defects: critical first
  const severityOrder = { critical: 0, major: 1, minor: 2 };
  report.defects.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  report.topDefect = report.defects[0] || null;

  return report;
}

// === MAIN ===
const report = await testGame(url);

// Print summary to stderr
const log = (s) => process.stderr.write(s + '\n');
log('');
log(`${'='.repeat(74)}`);
log(`  GAME TEST REPORT: ${report.score}/${report.maxScore} (weighted: ${report.weightedRaw}/${report.maxWeightedRaw})`);
log(`${'='.repeat(74)}`);
for (const [name, check] of Object.entries(report.checks)) {
  const icon = check.pass ? 'PASS' : 'FAIL';
  const w = `[${check.weight}pt]`;
  log(`  ${icon}  ${w.padEnd(7)} ${name.padEnd(24)} ${check.detail.substring(0, 60)}`);
}
log(`${'-'.repeat(74)}`);
if (report.defects.length > 0) {
  log(`  DEFECTS (${report.defects.length}):`);
  for (const d of report.defects.slice(0, 5)) {
    log(`    [${d.severity.toUpperCase()}] ${d.description.substring(0, 65)}`);
  }
} else {
  log('  No defects found!');
}
log(`${'='.repeat(74)}`);
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
