/**
 * GameTester tests - uses mock execSync, no actual Playwright needed.
 */

import { runPlaywrightTest } from '../gameTester.js';

// --- Assertion helpers ---

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// --- Tests ---

export function runTests() {
  return {
    'runPlaywrightTest() parses valid JSON from stdout': async () => {
      const mockReport = { score: 7.5, defects: [], checks: { noJsErrors: { pass: true } } };
      const mockExecSync = () => JSON.stringify(mockReport);

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 7.5, 'score');
      assert(Array.isArray(result.defects), 'defects should be array');
      assertEqual(result.defects.length, 0, 'no defects');
    },

    'runPlaywrightTest() handles non-zero exit with valid stdout': async () => {
      const mockReport = { score: 3.2, defects: [{ severity: 'critical', description: 'JS errors' }] };
      const mockExecSync = () => {
        const err = new Error('Process exited with code 1');
        err.stdout = JSON.stringify(mockReport);
        err.status = 1;
        throw err;
      };

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 3.2, 'score from stderr exit');
      assertEqual(result.defects.length, 1, 'should have 1 defect');
    },

    'runPlaywrightTest() returns score 0 on total failure': async () => {
      const mockExecSync = () => {
        const err = new Error('Command failed');
        err.stdout = '';
        throw err;
      };

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 0, 'score on failure');
      assert(result.defects.length > 0, 'should have error defect');
      assert(result.defects[0].description.includes('Test runner error'), 'should include error description');
    },

    'runPlaywrightTest() returns score 0 when stdout is invalid JSON': async () => {
      const mockExecSync = () => {
        const err = new Error('Command failed');
        err.stdout = 'not valid json at all';
        throw err;
      };

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 0, 'score on invalid JSON');
    },

    'runPlaywrightTest() passes URL to command': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://gamedemo42.namjo-games.com', {
        execSync: mockExecSync,
        scriptPath: '/app/scripts/test-game.js',
      });
      assert(capturedCmd.includes('gamedemo42.namjo-games.com'), 'command should include game URL');
      assert(capturedCmd.includes('/app/scripts/test-game.js'), 'command should include script path');
    },

    'runPlaywrightTest() uses custom script path': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://example.com', {
        execSync: mockExecSync,
        scriptPath: '/custom/path/test.js',
      });
      assert(capturedCmd.includes('/custom/path/test.js'), 'should use custom script path');
    },

    'runPlaywrightTest() handles high score game': async () => {
      const mockReport = {
        score: 9.5,
        defects: [],
        checks: {
          noJsErrors: { pass: true },
          canvasRendering: { pass: true },
          controlsVisible: { pass: true },
          tutorialPresent: { pass: true },
        },
      };
      const mockExecSync = () => JSON.stringify(mockReport);

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 9.5, 'high score');
      assertEqual(result.defects.length, 0, 'no defects for high score');
    },

    'runPlaywrightTest() handles game with multiple defects': async () => {
      const mockReport = {
        score: 2.1,
        defects: [
          { severity: 'critical', description: 'No canvas' },
          { severity: 'major', description: 'No controls' },
          { severity: 'minor', description: 'Slow load' },
        ],
        checks: {},
      };
      const mockExecSync = () => {
        const err = new Error('exit 1');
        err.stdout = JSON.stringify(mockReport);
        throw err;
      };

      const result = await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assertEqual(result.score, 2.1, 'low score');
      assertEqual(result.defects.length, 3, 'three defects');
      assertEqual(result.defects[0].severity, 'critical', 'first defect critical');
    },
  };
}
