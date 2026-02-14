/**
 * GameTester - Runs Playwright tests against deployed games.
 * Used by the Phase 5 repair loop to evaluate game quality.
 */

/**
 * Run Playwright test against a deployed game URL.
 * Executes scripts/test-game.js and parses the JSON output from stdout.
 * @param {string} url - The deployed game URL
 * @param {Object} [options]
 * @param {number} [options.timeout=120000] - Test timeout in ms
 * @param {string} [options.scriptPath='/app/scripts/test-game.js'] - Path to test script
 * @param {string} [options.gameContextPath] - Path to game-context.json for CONFIG-aware testing
 * @param {Function} [options.execSync] - Injected execSync for testing
 * @returns {Promise<{score: number, defects: Array, checks: Object}>}
 */
export async function runPlaywrightTest(url, options = {}) {
  const timeout = options.timeout || 180000;
  const scriptPath = options.scriptPath || '/app/scripts/test-game.js';
  let execSyncFn = options.execSync;

  if (!execSyncFn) {
    const { execSync } = await import('node:child_process');
    execSyncFn = execSync;
  }

  try {
    let cmd = `node "${scriptPath}" "${url}"`;
    if (options.thumbnailPath) {
      cmd += ` --thumbnail "${options.thumbnailPath}"`;
    }
    if (options.gameContextPath) {
      cmd += ` --game-context "${options.gameContextPath}"`;
    }
    const result = execSyncFn(cmd, {
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(result);
  } catch (err) {
    // If test-game.js exits non-zero (score < 5), stdout still has valid JSON
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // Fall through
      }
    }
    return {
      score: 0,
      defects: [{ severity: 'critical', description: `Test runner error: ${err.message}` }],
      checks: {},
    };
  }
}

/**
 * Build a lightweight game-context object from workspace files.
 * Used to pass game design info to the test script for richer defect descriptions.
 * @param {string} workspacePath - Path to job workspace directory
 * @returns {Promise<Object|null>} Game context object or null if files not found
 */
export async function buildGameContext(workspacePath) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');

  const context = {};

  // Read idea.json
  try {
    const ideaPath = join(workspacePath, 'idea.json');
    if (existsSync(ideaPath)) {
      const idea = JSON.parse(readFileSync(ideaPath, 'utf-8'));
      if (idea.name || idea.title) context.name = idea.name || idea.title;
      if (idea.theme) context.theme = idea.theme;
      if (idea.genre) context.genre = idea.genre;
      if (idea.coreLoop) context.coreLoop = idea.coreLoop;
      if (idea.description) context.description = idea.description;

      if (idea.currencies) {
        context.currencies = Array.isArray(idea.currencies)
          ? idea.currencies.map(c => typeof c === 'string' ? c : c.name || c.id)
          : Object.keys(idea.currencies);
      }
      if (idea.entities) {
        context.entities = Array.isArray(idea.entities)
          ? idea.entities.map(e => typeof e === 'string' ? e : e.name || e.type)
          : Object.keys(idea.entities);
      }
    }
  } catch { /* non-critical */ }

  // Read GDD files if available
  try {
    const gddDir = join(workspacePath, 'gdd');
    if (existsSync(gddDir)) {
      const { readdirSync } = await import('node:fs');
      for (const f of readdirSync(gddDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const data = JSON.parse(readFileSync(join(gddDir, f), 'utf-8'));
          // Merge relevant GDD data
          if (data.currencies && !context.currencies) {
            context.currencies = Object.keys(data.currencies);
          }
          if (data.entities && !context.entities) {
            context.entities = Object.keys(data.entities);
          }
          if (data.coreLoop && !context.coreLoop) {
            context.coreLoop = data.coreLoop;
          }
        } catch { /* skip malformed files */ }
      }
    }
  } catch { /* non-critical */ }

  return Object.keys(context).length > 0 ? context : null;
}
