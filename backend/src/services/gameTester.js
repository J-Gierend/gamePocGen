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
 * @param {Function} [options.execSync] - Injected execSync for testing
 * @returns {Promise<{score: number, defects: Array, checks: Object}>}
 */
export async function runPlaywrightTest(url, options = {}) {
  const timeout = options.timeout || 120000;
  const scriptPath = options.scriptPath || '/app/scripts/test-game.js';
  let execSyncFn = options.execSync;

  if (!execSyncFn) {
    const { execSync } = await import('node:child_process');
    execSyncFn = execSync;
  }

  try {
    const result = execSyncFn(`node "${scriptPath}" "${url}"`, {
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
