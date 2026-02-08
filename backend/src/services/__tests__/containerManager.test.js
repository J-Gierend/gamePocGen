/**
 * ContainerManager tests - uses mock Dockerode, no actual Docker needed.
 */

import { ContainerManager } from '../containerManager.js';

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

function assertDeepEqual(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${label ? label + ': ' : ''}Expected ${b}, got ${a}`);
  }
}

// --- Mock Dockerode factory ---

function createMockContainer(overrides = {}) {
  const defaults = {
    id: 'abc123def456',
    start: async () => {},
    stop: async () => {},
    remove: async () => {},
    inspect: async () => ({
      State: {
        Status: 'running',
        Running: true,
        ExitCode: 0,
      },
    }),
    logs: async () => Buffer.from('stdout output\nstderr output\n'),
  };
  return { ...defaults, ...overrides };
}

function createMockDocker(overrides = {}) {
  const container = createMockContainer(overrides.container);
  return {
    createContainer: overrides.createContainer || (async () => container),
    getContainer: overrides.getContainer || (() => container),
    buildImage: overrides.buildImage || (async () => {
      // Return a mock stream with on() and pipe()
      const stream = {
        on(event, cb) {
          if (event === 'end') setTimeout(cb, 0);
          return stream;
        },
        pipe() { return stream; },
      };
      return stream;
    }),
    listContainers: overrides.listContainers || (async () => []),
    modem: overrides.modem || {
      followProgress(stream, onFinished) {
        onFinished(null, [{ stream: 'build complete' }]);
      },
    },
    _container: container,
  };
}

// --- Tests ---

export function runTests() {
  return {
    // === Constructor tests ===

    'constructor stores docker instance': () => {
      const docker = createMockDocker();
      const cm = new ContainerManager(docker);
      assert(cm.docker === docker, 'docker should be stored');
    },

    'constructor uses default options': () => {
      const docker = createMockDocker();
      const cm = new ContainerManager(docker);
      assertEqual(cm.workerImage, 'gamepocgen-worker', 'default worker image');
      assertEqual(cm.memoryLimit, 2 * 1024 * 1024 * 1024, 'default memory limit 2GB');
      assertEqual(cm.cpuLimit, 0.5, 'default CPU limit');
    },

    'constructor accepts custom options': () => {
      const docker = createMockDocker();
      const cm = new ContainerManager(docker, {
        workerImage: 'custom-worker',
        memoryLimit: 512 * 1024 * 1024,
        cpuLimit: 1.0,
      });
      assertEqual(cm.workerImage, 'custom-worker', 'custom worker image');
      assertEqual(cm.memoryLimit, 512 * 1024 * 1024, 'custom memory limit');
      assertEqual(cm.cpuLimit, 1.0, 'custom CPU limit');
    },

    'constructor sets phase timeouts': () => {
      const docker = createMockDocker();
      const cm = new ContainerManager(docker);
      assertEqual(cm.timeouts.phase1, 43200, 'phase1 = 12h = 43200s');
      assertEqual(cm.timeouts.phase2, 43200, 'phase2 = 12h = 43200s');
      assertEqual(cm.timeouts.phase3, 43200, 'phase3 = 12h = 43200s');
      assertEqual(cm.timeouts.phase4, 43200, 'phase4 = 12h = 43200s');
      assertEqual(cm.timeouts.phase5, 3600, 'phase5 = 1h = 3600s');
    },

    'constructor accepts custom timeouts': () => {
      const docker = createMockDocker();
      const cm = new ContainerManager(docker, {
        timeouts: { phase1: 100, phase2: 200, phase3: 300, phase4: 400 },
      });
      assertEqual(cm.timeouts.phase1, 100, 'custom phase1 timeout');
      assertEqual(cm.timeouts.phase4, 400, 'custom phase4 timeout');
    },

    // === buildWorkerImage tests ===

    'buildWorkerImage() calls docker.buildImage': async () => {
      let buildCalled = false;
      let buildContext = null;
      const docker = createMockDocker({
        buildImage: async (context, opts) => {
          buildCalled = true;
          buildContext = { context, opts };
          const stream = {
            on(event, cb) {
              if (event === 'end') setTimeout(cb, 0);
              return stream;
            },
            pipe() { return stream; },
          };
          return stream;
        },
      });
      const cm = new ContainerManager(docker);
      await cm.buildWorkerImage();
      assert(buildCalled, 'buildImage should be called');
      assertEqual(buildContext.opts.t, 'gamepocgen-worker', 'Should tag as worker image');
    },

    'buildWorkerImage() uses custom image name': async () => {
      let tagUsed = '';
      const docker = createMockDocker({
        buildImage: async (context, opts) => {
          tagUsed = opts.t;
          const stream = {
            on(event, cb) {
              if (event === 'end') setTimeout(cb, 0);
              return stream;
            },
            pipe() { return stream; },
          };
          return stream;
        },
      });
      const cm = new ContainerManager(docker, { workerImage: 'my-worker' });
      await cm.buildWorkerImage();
      assertEqual(tagUsed, 'my-worker', 'Should use custom image name as tag');
    },

    // === spawnContainer tests ===

    'spawnContainer() creates container with correct name': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 42, game_name: 'TestGame', config: {} };
      await cm.spawnContainer(job, 'phase1');
      assertEqual(
        createOpts.name,
        'gamepocgen-worker-42-phase1',
        'Container name should follow pattern'
      );
    },

    'spawnContainer() sets correct image': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'TestGame', config: {} };
      await cm.spawnContainer(job, 'phase1');
      assertEqual(createOpts.Image, 'gamepocgen-worker', 'Should use worker image');
    },

    'spawnContainer() passes environment variables': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 7, game_name: 'SpaceBlaster', config: {} };
      await cm.spawnContainer(job, 'phase2');

      const env = createOpts.Env;
      assert(Array.isArray(env), 'Env should be an array');
      assert(env.some(e => e === 'PHASE=phase2'), 'Should include PHASE');
      assert(env.some(e => e === 'JOB_ID=7'), 'Should include JOB_ID');
      assert(env.some(e => e === 'GAME_NAME=SpaceBlaster'), 'Should include GAME_NAME');
      assert(env.some(e => e.startsWith('TIMEOUT_SECONDS=')), 'Should include TIMEOUT_SECONDS');
      assert(env.some(e => e.startsWith('WORKSPACE_DIR=')), 'Should include WORKSPACE_DIR');
    },

    'spawnContainer() passes ZAI_API_KEY from environment': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };

      // Temporarily set env var
      const original = process.env.ZAI_API_KEY;
      process.env.ZAI_API_KEY = 'test-key-abc';
      try {
        await cm.spawnContainer(job, 'phase1');
        const env = createOpts.Env;
        assert(
          env.some(e => e === 'ZAI_API_KEY=test-key-abc'),
          'Should pass ZAI_API_KEY from process.env'
        );
      } finally {
        if (original !== undefined) {
          process.env.ZAI_API_KEY = original;
        } else {
          delete process.env.ZAI_API_KEY;
        }
      }
    },

    'spawnContainer() sets phase-specific timeout': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };

      await cm.spawnContainer(job, 'phase1');
      const env = createOpts.Env;
      assert(env.some(e => e === 'TIMEOUT_SECONDS=43200'), 'phase1 timeout should be 43200');

      await cm.spawnContainer(job, 'phase2');
      const env2 = createOpts.Env;
      assert(env2.some(e => e === 'TIMEOUT_SECONDS=43200'), 'phase2 timeout should be 43200');

      await cm.spawnContainer(job, 'phase5');
      const env5 = createOpts.Env;
      assert(env5.some(e => e === 'TIMEOUT_SECONDS=3600'), 'phase5 timeout should be 3600');
    },

    'spawnContainer() sets memory limit': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };
      await cm.spawnContainer(job, 'phase1');

      assertEqual(
        createOpts.HostConfig.Memory,
        2 * 1024 * 1024 * 1024,
        'Should set memory limit to 2GB'
      );
    },

    'spawnContainer() sets CPU limit': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };
      await cm.spawnContainer(job, 'phase1');

      assertEqual(
        createOpts.HostConfig.NanoCpus,
        0.5 * 1e9,
        'Should set CPU limit to 0.5 CPUs'
      );
    },

    'spawnContainer() mounts workspace volume': async () => {
      let createOpts = null;
      const docker = createMockDocker({
        createContainer: async (opts) => {
          createOpts = opts;
          return createMockContainer();
        },
      });
      const cm = new ContainerManager(docker);
      const job = { id: 42, game_name: 'Test', config: {} };
      await cm.spawnContainer(job, 'phase1');

      const binds = createOpts.HostConfig.Binds;
      assert(Array.isArray(binds), 'Binds should be an array');
      assert(
        binds.some(b => b.includes('42') && b.includes('/workspace')),
        'Should mount job workspace volume'
      );
    },

    'spawnContainer() starts the container': async () => {
      let startCalled = false;
      const container = createMockContainer({
        start: async () => { startCalled = true; },
      });
      const docker = createMockDocker({
        createContainer: async () => container,
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };
      await cm.spawnContainer(job, 'phase1');
      assert(startCalled, 'container.start() should be called');
    },

    'spawnContainer() returns container info': async () => {
      const container = createMockContainer({ id: 'container-xyz-789' });
      const docker = createMockDocker({
        createContainer: async () => container,
      });
      const cm = new ContainerManager(docker);
      const job = { id: 1, game_name: 'Test', config: {} };
      const result = await cm.spawnContainer(job, 'phase1');

      assertEqual(result.containerId, 'container-xyz-789', 'Should return container ID');
      assertEqual(result.name, 'gamepocgen-worker-1-phase1', 'Should return container name');
    },

    // === stopContainer tests ===

    'stopContainer() stops a running container': async () => {
      let stopCalled = false;
      const container = createMockContainer({
        stop: async () => { stopCalled = true; },
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      await cm.stopContainer('abc123');
      assert(stopCalled, 'container.stop() should be called');
    },

    'stopContainer() gets container by ID': async () => {
      let requestedId = null;
      const container = createMockContainer();
      const docker = createMockDocker({
        getContainer: (id) => {
          requestedId = id;
          return container;
        },
      });
      const cm = new ContainerManager(docker);
      await cm.stopContainer('xyz789');
      assertEqual(requestedId, 'xyz789', 'Should get container by correct ID');
    },

    'stopContainer() handles already stopped container': async () => {
      const container = createMockContainer({
        stop: async () => {
          const err = new Error('container already stopped');
          err.statusCode = 304;
          throw err;
        },
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      // Should not throw for 304 (already stopped)
      await cm.stopContainer('abc123');
    },

    'stopContainer() rethrows unexpected errors': async () => {
      const container = createMockContainer({
        stop: async () => {
          const err = new Error('Docker daemon error');
          err.statusCode = 500;
          throw err;
        },
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      let threw = false;
      try {
        await cm.stopContainer('abc123');
      } catch (e) {
        threw = true;
        assert(e.message.includes('Docker daemon error'), 'Should rethrow original error');
      }
      assert(threw, 'Should throw on unexpected error');
    },

    // === getContainerStatus tests ===

    'getContainerStatus() returns running status': async () => {
      const container = createMockContainer({
        inspect: async () => ({
          State: {
            Status: 'running',
            Running: true,
            ExitCode: 0,
          },
        }),
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      const status = await cm.getContainerStatus('abc123');
      assertEqual(status.status, 'running', 'Should return running status');
      assertEqual(status.running, true, 'Should indicate running');
      assertEqual(status.exitCode, 0, 'Should return exit code');
    },

    'getContainerStatus() returns exited status': async () => {
      const container = createMockContainer({
        inspect: async () => ({
          State: {
            Status: 'exited',
            Running: false,
            ExitCode: 1,
          },
        }),
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      const status = await cm.getContainerStatus('abc123');
      assertEqual(status.status, 'exited', 'Should return exited status');
      assertEqual(status.running, false, 'Should indicate not running');
      assertEqual(status.exitCode, 1, 'Should return exit code 1');
    },

    'getContainerStatus() returns null for non-existent container': async () => {
      const docker = createMockDocker({
        getContainer: () => ({
          inspect: async () => {
            const err = new Error('no such container');
            err.statusCode = 404;
            throw err;
          },
        }),
      });
      const cm = new ContainerManager(docker);
      const status = await cm.getContainerStatus('nonexistent');
      assertEqual(status, null, 'Should return null for missing container');
    },

    // === getContainerLogs tests ===

    'getContainerLogs() retrieves stdout and stderr': async () => {
      const container = createMockContainer({
        logs: async (opts) => {
          assert(opts.stdout === true, 'Should request stdout');
          assert(opts.stderr === true, 'Should request stderr');
          return Buffer.from('log line 1\nlog line 2\n');
        },
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      const logs = await cm.getContainerLogs('abc123');
      assert(typeof logs === 'string', 'Should return a string');
      assert(logs.includes('log line 1'), 'Should contain log output');
    },

    'getContainerLogs() requests follow=false': async () => {
      let logOpts = null;
      const container = createMockContainer({
        logs: async (opts) => {
          logOpts = opts;
          return Buffer.from('output');
        },
      });
      const docker = createMockDocker({
        getContainer: () => container,
      });
      const cm = new ContainerManager(docker);
      await cm.getContainerLogs('abc123');
      assertEqual(logOpts.follow, false, 'Should not follow logs');
    },

    'getContainerLogs() returns empty string for non-existent container': async () => {
      const docker = createMockDocker({
        getContainer: () => ({
          logs: async () => {
            const err = new Error('no such container');
            err.statusCode = 404;
            throw err;
          },
        }),
      });
      const cm = new ContainerManager(docker);
      const logs = await cm.getContainerLogs('nonexistent');
      assertEqual(logs, '', 'Should return empty string for missing container');
    },

    // === cleanupStoppedContainers tests ===

    'cleanupStoppedContainers() lists containers with worker label': async () => {
      let listOpts = null;
      const docker = createMockDocker({
        listContainers: async (opts) => {
          listOpts = opts;
          return [];
        },
      });
      const cm = new ContainerManager(docker);
      await cm.cleanupStoppedContainers();
      assert(listOpts.all === true, 'Should list all containers (including stopped)');
      assert(
        JSON.stringify(listOpts.filters).includes('gamepocgen-worker'),
        'Should filter by worker label'
      );
    },

    'cleanupStoppedContainers() removes only exited containers': async () => {
      const removedIds = [];
      const containers = [
        {
          Id: 'stopped-1',
          State: 'exited',
          Names: ['/gamepocgen-worker-1-phase1'],
          remove: async () => { removedIds.push('stopped-1'); },
        },
        {
          Id: 'running-1',
          State: 'running',
          Names: ['/gamepocgen-worker-2-phase1'],
          remove: async () => { removedIds.push('running-1'); },
        },
        {
          Id: 'stopped-2',
          State: 'exited',
          Names: ['/gamepocgen-worker-3-phase2'],
          remove: async () => { removedIds.push('stopped-2'); },
        },
      ];

      const docker = createMockDocker({
        listContainers: async () => containers,
        getContainer: (id) => {
          const c = containers.find(c => c.Id === id);
          return { remove: c.remove };
        },
      });
      const cm = new ContainerManager(docker);
      const count = await cm.cleanupStoppedContainers();

      assertEqual(count, 2, 'Should remove 2 stopped containers');
      assert(removedIds.includes('stopped-1'), 'Should remove stopped-1');
      assert(removedIds.includes('stopped-2'), 'Should remove stopped-2');
      assert(!removedIds.includes('running-1'), 'Should NOT remove running container');
    },

    'cleanupStoppedContainers() returns 0 when no stopped containers': async () => {
      const docker = createMockDocker({
        listContainers: async () => [],
      });
      const cm = new ContainerManager(docker);
      const count = await cm.cleanupStoppedContainers();
      assertEqual(count, 0, 'Should return 0 when nothing to clean');
    },

    'cleanupStoppedContainers() continues on individual remove failure': async () => {
      const removedIds = [];
      const containers = [
        {
          Id: 'fail-1',
          State: 'exited',
          Names: ['/gamepocgen-worker-1-phase1'],
          remove: async () => { throw new Error('remove failed'); },
        },
        {
          Id: 'ok-1',
          State: 'exited',
          Names: ['/gamepocgen-worker-2-phase1'],
          remove: async () => { removedIds.push('ok-1'); },
        },
      ];

      const docker = createMockDocker({
        listContainers: async () => containers,
        getContainer: (id) => {
          const c = containers.find(c => c.Id === id);
          return { remove: c.remove };
        },
      });
      const cm = new ContainerManager(docker);
      const count = await cm.cleanupStoppedContainers();
      // Should still remove the second container even though first failed
      assertEqual(count, 1, 'Should count only successfully removed');
      assert(removedIds.includes('ok-1'), 'Should remove ok-1 despite fail-1 error');
    },
  };
}
