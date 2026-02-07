/**
 * API route handler tests - uses mock services, no Express needed.
 * Tests the createHandlers() export directly with mock req/res.
 */

import { createHandlers } from '../api.js';

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

// --- Mock factories ---

function createMockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

function createMockServices(overrides = {}) {
  return {
    queueManager: {
      addJob: async () => [1, 2, 3],
      getJob: async () => ({ id: 1, status: 'queued', game_name: null, config: {} }),
      getJobs: async () => [{ id: 1, status: 'queued' }, { id: 2, status: 'running' }],
      getJobLogs: async () => [{ id: 1, job_id: 1, level: 'info', message: 'started' }],
      getStats: async () => ({ queued: 1, running: 2, completed: 3, failed: 0, total: 6 }),
      ...overrides.queueManager,
    },
    containerManager: {
      spawnContainer: async () => ({ containerId: 'abc123', name: 'worker-1' }),
      stopContainer: async () => {},
      getContainerStatus: async () => ({ status: 'running', running: true, exitCode: 0 }),
      cleanupStoppedContainers: async () => 2,
      ...overrides.containerManager,
    },
    deploymentManager: {
      listDeployedGames: async () => [
        { gameId: 1, name: 'gamedemo1', url: 'https://gamedemo1.namjo-games.com', port: 8081 },
      ],
      removeGame: async () => ({ gameId: 1, removed: true }),
      deployGame: async () => ({ gameId: 1, url: 'https://gamedemo1.namjo-games.com', deployPath: '/root/apps/gamedemo1', port: 8081 }),
      updateGalleryData: async () => {},
      ...overrides.deploymentManager,
    },
  };
}

// --- Tests ---

export function runTests() {
  return {
    // === POST /api/generate ===

    'POST /generate - creates jobs and returns IDs with 201': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 3, options: { genre: 'rpg' } } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(res.statusCode, 201, 'status should be 201');
      assertDeepEqual(res.body.jobIds, [1, 2, 3], 'should return job IDs');
      assertEqual(res.body.count, 3, 'should return count');
    },

    'POST /generate - defaults count to 1': async () => {
      const services = createMockServices({
        queueManager: { addJob: async ({ count }) => { assertEqual(count, 1, 'count passed to addJob'); return [10]; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: {} });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(res.statusCode, 201, 'status should be 201');
      assertDeepEqual(res.body.jobIds, [10], 'should return single job ID');
      assertEqual(res.body.count, 1, 'count should be 1');
    },

    'POST /generate - passes options to queueManager': async () => {
      let capturedOptions = null;
      const services = createMockServices({
        queueManager: { addJob: async ({ options }) => { capturedOptions = options; return [1]; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 1, options: { genre: 'idle', theme: 'space' } } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertDeepEqual(capturedOptions, { genre: 'idle', theme: 'space' }, 'options should be forwarded');
    },

    'POST /generate - parses count as integer': async () => {
      let capturedCount = null;
      const services = createMockServices({
        queueManager: { addJob: async ({ count }) => { capturedCount = count; return [1, 2]; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: '2' } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(capturedCount, 2, 'count should be parsed as integer');
      assertEqual(typeof capturedCount, 'number', 'count should be a number type');
    },

    // === GET /api/jobs ===

    'GET /jobs - lists all jobs': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.listJobs(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.jobs.length, 2, 'should return 2 jobs');
    },

    'GET /jobs - passes status filter': async () => {
      let capturedFilter = null;
      const services = createMockServices({
        queueManager: { getJobs: async (filter) => { capturedFilter = filter; return [{ id: 1, status: 'queued' }]; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ query: { status: 'queued' } });
      const res = createMockRes();

      await handlers.listJobs(req, res);

      assertEqual(capturedFilter.status, 'queued', 'should pass status filter');
    },

    'GET /jobs - passes limit and offset as integers': async () => {
      let capturedFilter = null;
      const services = createMockServices({
        queueManager: { getJobs: async (filter) => { capturedFilter = filter; return []; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ query: { limit: '10', offset: '20' } });
      const res = createMockRes();

      await handlers.listJobs(req, res);

      assertEqual(capturedFilter.limit, 10, 'limit should be parsed as integer');
      assertEqual(capturedFilter.offset, 20, 'offset should be parsed as integer');
    },

    // === GET /api/jobs/:id ===

    'GET /jobs/:id - returns job details': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      await handlers.getJob(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.job.id, 1, 'should return job with correct id');
    },

    'GET /jobs/:id - returns 404 for non-existent job': async () => {
      const services = createMockServices({
        queueManager: { getJob: async () => null },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      await handlers.getJob(req, res);

      assertEqual(res.statusCode, 404, 'status should be 404');
      assert(res.body.error, 'should have error message');
    },

    'GET /jobs/:id - passes id as integer to service': async () => {
      let capturedId = null;
      const services = createMockServices({
        queueManager: { getJob: async (id) => { capturedId = id; return { id, status: 'queued' }; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '42' } });
      const res = createMockRes();

      await handlers.getJob(req, res);

      assertEqual(capturedId, 42, 'id should be parsed as integer');
    },

    // === GET /api/jobs/:id/logs ===

    'GET /jobs/:id/logs - returns job logs': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      await handlers.getJobLogs(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.logs.length, 1, 'should return 1 log entry');
      assertEqual(res.body.logs[0].message, 'started', 'log message should match');
    },

    'GET /jobs/:id/logs - returns 404 if job does not exist': async () => {
      const services = createMockServices({
        queueManager: {
          getJob: async () => null,
          getJobLogs: async () => [],
        },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '999' } });
      const res = createMockRes();

      await handlers.getJobLogs(req, res);

      assertEqual(res.statusCode, 404, 'status should be 404');
      assert(res.body.error, 'should have error message');
    },

    'GET /jobs/:id/logs - passes id as integer': async () => {
      let capturedId = null;
      const services = createMockServices({
        queueManager: {
          getJob: async () => ({ id: 7 }),
          getJobLogs: async (id) => { capturedId = id; return []; },
        },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '7' } });
      const res = createMockRes();

      await handlers.getJobLogs(req, res);

      assertEqual(capturedId, 7, 'id should be parsed as integer');
    },

    // === GET /api/stats ===

    'GET /stats - returns queue statistics': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.getStats(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.stats.queued, 1, 'queued count');
      assertEqual(res.body.stats.running, 2, 'running count');
      assertEqual(res.body.stats.completed, 3, 'completed count');
      assertEqual(res.body.stats.failed, 0, 'failed count');
      assertEqual(res.body.stats.total, 6, 'total count');
    },

    'GET /stats - returns stats with zero values': async () => {
      const services = createMockServices({
        queueManager: { getStats: async () => ({ queued: 0, running: 0, completed: 0, failed: 0, total: 0 }) },
      });
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.getStats(req, res);

      assertEqual(res.body.stats.total, 0, 'total should be 0');
    },

    // === GET /api/games ===

    'GET /games - lists deployed games': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.listGames(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.games.length, 1, 'should return 1 game');
      assertEqual(res.body.games[0].gameId, 1, 'game should have correct gameId');
    },

    'GET /games - returns empty array when no games': async () => {
      const services = createMockServices({
        deploymentManager: { listDeployedGames: async () => [] },
      });
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.listGames(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.games.length, 0, 'should return empty array');
    },

    // === DELETE /api/games/:id ===

    'DELETE /games/:id - removes game and returns confirmation': async () => {
      const services = createMockServices();
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      await handlers.removeGame(req, res);

      assertEqual(res.statusCode, 200, 'status should be 200');
      assertEqual(res.body.gameId, 1, 'should return gameId');
      assertEqual(res.body.removed, true, 'should return removed: true');
    },

    'DELETE /games/:id - passes id as integer to service': async () => {
      let capturedId = null;
      const services = createMockServices({
        deploymentManager: { removeGame: async (id) => { capturedId = id; return { gameId: id, removed: true }; } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '5' } });
      const res = createMockRes();

      await handlers.removeGame(req, res);

      assertEqual(capturedId, 5, 'id should be parsed as integer');
    },

    'DELETE /games/:id - returns 500 on service error': async () => {
      const services = createMockServices({
        deploymentManager: { removeGame: async () => { throw new Error('Container in use'); } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ params: { id: '1' } });
      const res = createMockRes();

      await handlers.removeGame(req, res);

      assertEqual(res.statusCode, 500, 'status should be 500');
      assert(res.body.error, 'should have error message');
    },

    // === Comparison mode ===

    'POST /generate with compare=true creates paired jobs': async () => {
      let addJobCalls = [];
      const services = createMockServices({
        queueManager: {
          addJob: async ({ count, options }) => {
            addJobCalls.push({ count, options });
            return [addJobCalls.length * 10]; // 10, 20, 30, 40...
          },
        },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 2, options: { compare: true } } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(res.statusCode, 201, 'status should be 201');
      assertEqual(res.body.jobIds.length, 4, 'should return 4 job IDs (2 pairs)');
      assertEqual(res.body.comparison.pairCount, 2, 'should have 2 pairs');
      // Verify pair structure
      assertEqual(res.body.comparison.pairs[0].zai, 10, 'first pair zai job');
      assertEqual(res.body.comparison.pairs[0].anthropic, 20, 'first pair anthropic job');
    },

    'POST /generate with compare=true sets provider and sourceJobId': async () => {
      let addJobCalls = [];
      let callIndex = 0;
      const services = createMockServices({
        queueManager: {
          addJob: async ({ count, options }) => {
            callIndex++;
            addJobCalls.push({ count, options });
            return [callIndex * 100];
          },
        },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 1, options: { compare: true } } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(addJobCalls.length, 2, 'should call addJob twice');
      assertEqual(addJobCalls[0].options.provider, 'zai', 'first job should be zai provider');
      assertEqual(addJobCalls[1].options.provider, 'anthropic', 'second job should be anthropic provider');
      assertEqual(addJobCalls[1].options.sourceJobId, 100, 'second job sourceJobId should point to first job');
      assertEqual(addJobCalls[1].options.model, 'claude-opus-4-6', 'second job should have model');
    },

    'POST /generate with compare=true strips compare flag from child options': async () => {
      let capturedOptions = [];
      const services = createMockServices({
        queueManager: {
          addJob: async ({ options }) => {
            capturedOptions.push(options);
            return [1];
          },
        },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 1, options: { compare: true, genre: 'rpg' } } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      for (const opts of capturedOptions) {
        assertEqual(opts.compare, undefined, 'compare should be stripped from child options');
        assertEqual(opts.genre, 'rpg', 'other options should be preserved');
      }
    },

    // === Error handling ===

    'service error on generateGames returns 500': async () => {
      const services = createMockServices({
        queueManager: { addJob: async () => { throw new Error('DB connection failed'); } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq({ body: { count: 1 } });
      const res = createMockRes();

      await handlers.generateGames(req, res);

      assertEqual(res.statusCode, 500, 'status should be 500');
      assert(res.body.error, 'should have error message');
    },

    'service error on listJobs returns 500': async () => {
      const services = createMockServices({
        queueManager: { getJobs: async () => { throw new Error('DB timeout'); } },
      });
      const handlers = createHandlers(services);
      const req = createMockReq();
      const res = createMockRes();

      await handlers.listJobs(req, res);

      assertEqual(res.statusCode, 500, 'status should be 500');
      assert(res.body.error, 'should have error message');
    },
  };
}
