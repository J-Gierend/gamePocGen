/**
 * GameTester tests - uses mock execSync, no actual Playwright needed.
 */

import { runPlaywrightTest, buildGameContext } from '../gameTester.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

    'runPlaywrightTest() passes --thumbnail flag when thumbnailPath is set': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://example.com', {
        execSync: mockExecSync,
        thumbnailPath: '/deploy/gamedemo1/html/thumbnail.png',
      });
      assert(capturedCmd.includes('--thumbnail'), 'command should include --thumbnail flag');
      assert(capturedCmd.includes('/deploy/gamedemo1/html/thumbnail.png'), 'command should include thumbnail path');
    },

    'runPlaywrightTest() does not pass --thumbnail flag when thumbnailPath is not set': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assert(!capturedCmd.includes('--thumbnail'), 'command should NOT include --thumbnail flag');
    },

    'runPlaywrightTest() passes --game-context flag when gameContextPath is set': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://example.com', {
        execSync: mockExecSync,
        gameContextPath: '/tmp/test-context.json',
      });
      assert(capturedCmd.includes('--game-context'), 'command should include --game-context flag');
      assert(capturedCmd.includes('/tmp/test-context.json'), 'command should include context path');
    },

    'runPlaywrightTest() does not pass --game-context when not set': async () => {
      let capturedCmd = '';
      const mockExecSync = (cmd) => {
        capturedCmd = cmd;
        return JSON.stringify({ score: 5, defects: [], checks: {} });
      };

      await runPlaywrightTest('https://example.com', { execSync: mockExecSync });
      assert(!capturedCmd.includes('--game-context'), 'command should NOT include --game-context flag');
    },

    'buildGameContext() returns null for empty workspace': async () => {
      const tmpDir = '/tmp/test-gameTester-empty-' + Date.now();
      mkdirSync(tmpDir, { recursive: true });
      try {
        const ctx = await buildGameContext(tmpDir);
        assertEqual(ctx, null, 'should return null for empty workspace');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    'buildGameContext() extracts game data from idea.json': async () => {
      const tmpDir = '/tmp/test-gameTester-idea-' + Date.now();
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'idea.json'), JSON.stringify({
        name: 'Crystal Defenders',
        theme: 'Tower defense with crystals',
        genre: 'tower-defense',
        coreLoop: 'Place units -> kill enemies -> earn gold',
        currencies: { gold: {}, crystals: {} },
        entities: { slime: {}, knight: {} },
      }));
      try {
        const ctx = await buildGameContext(tmpDir);
        assert(ctx !== null, 'should return context');
        assertEqual(ctx.name, 'Crystal Defenders', 'name');
        assertEqual(ctx.theme, 'Tower defense with crystals', 'theme');
        assert(ctx.currencies.includes('gold'), 'should have gold currency');
        assert(ctx.currencies.includes('crystals'), 'should have crystals currency');
        assert(ctx.entities.includes('slime'), 'should have slime entity');
        assert(ctx.entities.includes('knight'), 'should have knight entity');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    'buildGameContext() handles array currencies in idea.json': async () => {
      const tmpDir = '/tmp/test-gameTester-array-' + Date.now();
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'idea.json'), JSON.stringify({
        title: 'Space Battle',
        currencies: [{ name: 'credits' }, { name: 'energy' }],
        entities: ['fighter', 'bomber'],
      }));
      try {
        const ctx = await buildGameContext(tmpDir);
        assert(ctx !== null, 'should return context');
        assertEqual(ctx.name, 'Space Battle', 'title as name');
        assert(ctx.currencies.includes('credits'), 'should have credits');
        assert(ctx.entities.includes('fighter'), 'should have fighter');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    'buildGameContext() handles malformed idea.json gracefully': async () => {
      const tmpDir = '/tmp/test-gameTester-malformed-' + Date.now();
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'idea.json'), 'not valid json');
      try {
        const ctx = await buildGameContext(tmpDir);
        assertEqual(ctx, null, 'should return null for malformed JSON');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },

    'buildGameContext() reads gdd directory files': async () => {
      const tmpDir = '/tmp/test-gameTester-gdd-' + Date.now();
      const gddDir = join(tmpDir, 'gdd');
      mkdirSync(gddDir, { recursive: true });
      writeFileSync(join(gddDir, 'economy.json'), JSON.stringify({
        currencies: { mana: {}, crystals: {} },
        coreLoop: 'cast spells to earn mana',
      }));
      writeFileSync(join(gddDir, 'entities.json'), JSON.stringify({
        entities: { wizard: {}, imp: {} },
      }));
      try {
        const ctx = await buildGameContext(tmpDir);
        assert(ctx !== null, 'should have context from gdd');
        assert(ctx.currencies.includes('mana'), 'mana from gdd');
        assert(ctx.currencies.includes('crystals'), 'crystals from gdd');
        assert(ctx.entities.includes('wizard'), 'wizard from gdd');
        assertEqual(ctx.coreLoop, 'cast spells to earn mana', 'coreLoop from gdd');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  };
}
