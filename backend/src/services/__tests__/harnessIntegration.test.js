/**
 * Integration tests for the harness-based persistent container workflow.
 * Simulates the interaction between ContainerManager and workspace file system
 * without needing real Docker or Claude.
 */

import { ContainerManager } from '../containerManager.js';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

function createMockContainer(overrides = {}) {
  return {
    id: overrides.id || 'mock-container-id',
    start: async () => {},
    stop: async () => {},
    remove: async () => {},
    inspect: async () => ({
      State: {
        Status: overrides.running !== false ? 'running' : 'exited',
        Running: overrides.running !== false,
        ExitCode: overrides.exitCode || 0,
      },
    }),
    logs: async () => Buffer.from('mock logs'),
    ...(overrides.methods || {}),
  };
}

function createMockDocker(container) {
  return {
    createContainer: async () => container,
    getContainer: () => container,
    buildImage: async () => ({}),
    listContainers: async () => [],
    modem: {
      followProgress(stream, cb) { cb(null, []); },
    },
  };
}

export function runTests() {
  return {
    // === spawnPersistentContainer + state file integration ===

    'spawnPersistentContainer creates workspace and allows state reads': async () => {
      const container = createMockContainer();
      const docker = createMockDocker(container);
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir, hostWorkspacePath: tmpDir });

      const job = { id: 1, game_name: 'TestGame', config: {} };
      await cm.spawnPersistentContainer(job);

      // Simulate entrypoint.sh writing initial state
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'starting',
        status: 'starting',
        timestamp: new Date().toISOString(),
      }));

      const state = cm.readHarnessState(1);
      assertEqual(state.current_phase, 'starting', 'Initial phase should be starting');
      assertEqual(state.status, 'starting', 'Initial status should be starting');

      rmSync(tmpDir, { recursive: true });
    },

    'writeToWorkspace creates repair-prompt.txt atomically': () => {
      const container = createMockContainer();
      const docker = createMockDocker(container);
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-1`, { recursive: true });

      const defectReport = JSON.stringify([
        { severity: 'high', description: 'Game crashes on click' },
        { severity: 'medium', description: 'Missing save button' },
      ]);

      cm.writeToWorkspace(1, 'repair-prompt.txt', defectReport);

      assert(existsSync(`${tmpDir}/job-1/repair-prompt.txt`), 'repair-prompt.txt should exist');
      const content = readFileSync(`${tmpDir}/job-1/repair-prompt.txt`, 'utf-8');
      assert(content.includes('Game crashes on click'), 'Should contain defect description');
      assert(!existsSync(`${tmpDir}/job-1/repair-prompt.txt.tmp`), 'Should not leave .tmp file');

      rmSync(tmpDir, { recursive: true });
    },

    'full state transition simulation: phase1 → phase4 → repair': () => {
      const container = createMockContainer();
      const docker = createMockDocker(container);
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-1`, { recursive: true });

      // Phase 1: starting → phase1/running
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase1', status: 'running',
      }));
      let state = cm.readHarnessState(1);
      assertEqual(state.current_phase, 'phase1', 'Phase 1 running');

      // Phase 1 complete: idea.json written
      writeFileSync(`${tmpDir}/job-1/idea.json`, JSON.stringify({ name: 'SpaceBlaster' }));

      // Phase 2: currencies
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase2', status: 'running',
      }));
      state = cm.readHarnessState(1);
      assertEqual(state.current_phase, 'phase2', 'Phase 2 running');

      // All GDD done → Phase 3
      mkdirSync(`${tmpDir}/job-1/gdd`, { recursive: true });
      writeFileSync(`${tmpDir}/job-1/gdd/currencies.json`, '{}');
      writeFileSync(`${tmpDir}/job-1/gdd/progression.json`, '{}');
      writeFileSync(`${tmpDir}/job-1/gdd/ui-ux.json`, '{}');

      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase3', status: 'running',
      }));
      state = cm.readHarnessState(1);
      assertEqual(state.current_phase, 'phase3', 'Phase 3 running');

      // Phase 4
      writeFileSync(`${tmpDir}/job-1/implementation-plan.json`, '{}');
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase4', status: 'running',
      }));

      // Phase 4 complete: game built
      mkdirSync(`${tmpDir}/job-1/dist`, { recursive: true });
      writeFileSync(`${tmpDir}/job-1/dist/index.html`, '<html>game</html>');
      writeFileSync(`${tmpDir}/job-1/phase4-complete.marker`, '');
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase4', status: 'idle',
      }));

      // Backend detects phase4-complete.marker
      assert(cm.hasMarkerFile(1, 'phase4-complete.marker'), 'Should detect phase4-complete marker');
      cm.removeMarkerFile(1, 'phase4-complete.marker');
      assert(!cm.hasMarkerFile(1, 'phase4-complete.marker'), 'Marker should be removed');

      // Backend writes repair prompt
      cm.writeToWorkspace(1, 'repair-prompt.txt', '[{"severity":"high","description":"crash"}]');

      // on-idle.sh would pick up repair-prompt.txt, update state to phase5/running
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase5', status: 'running',
      }));

      state = cm.readHarnessState(1);
      assertEqual(state.current_phase, 'phase5', 'Phase 5 running');

      // Claude repairs, goes idle → on-idle.sh sets phase5/idle
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase5', status: 'idle',
      }));

      state = cm.readHarnessState(1);
      assertEqual(state.status, 'idle', 'Phase 5 idle after repair');

      // Backend writes job-complete.marker
      cm.writeToWorkspace(1, 'job-complete.marker', 'Done');
      assert(cm.hasMarkerFile(1, 'job-complete.marker'), 'Should have completion marker');

      rmSync(tmpDir, { recursive: true });
    },

    'marker files: create, detect, remove cycle': () => {
      const docker = createMockDocker(createMockContainer());
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-5`, { recursive: true });

      // Initially no markers
      assert(!cm.hasMarkerFile(5, 'phase4-complete.marker'), 'No marker initially');
      assert(!cm.hasMarkerFile(5, 'job-complete.marker'), 'No complete marker');
      assert(!cm.hasMarkerFile(5, 'job-failed.marker'), 'No failed marker');

      // Create markers
      cm.writeToWorkspace(5, 'phase4-complete.marker', '');
      assert(cm.hasMarkerFile(5, 'phase4-complete.marker'), 'Should detect marker');

      // Remove markers
      cm.removeMarkerFile(5, 'phase4-complete.marker');
      assert(!cm.hasMarkerFile(5, 'phase4-complete.marker'), 'Should be removed');

      rmSync(tmpDir, { recursive: true });
    },

    'readHarnessState handles corrupt JSON gracefully': () => {
      const docker = createMockDocker(createMockContainer());
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-1`, { recursive: true });
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, 'not json {{{');

      const state = cm.readHarnessState(1);
      assertEqual(state, null, 'Should return null for corrupt JSON');

      rmSync(tmpDir, { recursive: true });
    },

    'writeToWorkspace handles nested paths': () => {
      const docker = createMockDocker(createMockContainer());
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-1`, { recursive: true });

      cm.writeToWorkspace(1, 'repair-prompt.txt', 'test content');
      const content = readFileSync(`${tmpDir}/job-1/repair-prompt.txt`, 'utf-8');
      assertEqual(content, 'test content', 'Should write to correct path');

      rmSync(tmpDir, { recursive: true });
    },

    'spawnPersistentContainer does not include PHASE or TIMEOUT_SECONDS': async () => {
      let capturedOpts = null;
      const container = createMockContainer();
      const docker = {
        ...createMockDocker(container),
        createContainer: async (opts) => { capturedOpts = opts; return container; },
        getContainer: () => ({ remove: async () => {} }),
      };

      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir, hostWorkspacePath: tmpDir });

      await cm.spawnPersistentContainer({ id: 1, game_name: 'Test', config: {} });

      const env = capturedOpts.Env;
      assert(!env.some(e => e.startsWith('PHASE=')), 'Must NOT include PHASE');
      assert(!env.some(e => e.startsWith('TIMEOUT_SECONDS=')), 'Must NOT include TIMEOUT_SECONDS');
      assert(env.some(e => e === 'JOB_ID=1'), 'Must include JOB_ID');
      assert(env.some(e => e === 'GAME_NAME=Test'), 'Must include GAME_NAME');

      rmSync(tmpDir, { recursive: true });
    },

    'repair cycle: write prompt → detect idle → verify state': () => {
      const docker = createMockDocker(createMockContainer());
      const tmpDir = mkdtempSync(`${tmpdir()}/harness-test-`);
      const cm = new ContainerManager(docker, { workspacePath: tmpDir });

      mkdirSync(`${tmpDir}/job-1`, { recursive: true });

      // Backend writes repair prompt
      cm.writeToWorkspace(1, 'repair-prompt.txt', 'fix bugs');
      assert(cm.hasMarkerFile(1, 'repair-prompt.txt'), 'repair-prompt.txt should exist');

      // on-idle.sh consumes it (simulated)
      unlinkSync(`${tmpDir}/job-1/repair-prompt.txt`);

      // State transitions to phase5/running → phase5/idle
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase5', status: 'running',
      }));

      let state = cm.readHarnessState(1);
      assertEqual(state.status, 'running', 'Should be running during repair');

      // Claude finishes
      writeFileSync(`${tmpDir}/job-1/harness-state.json`, JSON.stringify({
        current_phase: 'phase5', status: 'idle',
      }));

      state = cm.readHarnessState(1);
      assertEqual(state.status, 'idle', 'Should be idle after repair');

      rmSync(tmpDir, { recursive: true });
    },
  };
}
