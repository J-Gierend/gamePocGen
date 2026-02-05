/**
 * QueueManager tests - uses mock pg Pool, no actual PostgreSQL needed.
 */

import { QueueManager } from '../queueManager.js';

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

// --- Mock Pool factory ---

function createMockPool(queryHandler) {
  const client = {
    query: queryHandler || (() => ({ rows: [] })),
    release: () => {},
  };
  return {
    query: queryHandler || (() => ({ rows: [] })),
    connect: () => client,
  };
}

// --- Tests ---

export function runTests() {
  return {
    'constructor takes a pool instance': () => {
      const pool = createMockPool();
      const qm = new QueueManager(pool);
      assert(qm.pool === pool, 'pool should be stored');
    },

    'init() creates tables': async () => {
      const queries = [];
      const pool = createMockPool((sql) => {
        queries.push(sql);
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      await qm.init();
      // Should execute CREATE TABLE statements
      assert(queries.length >= 2, `Expected at least 2 queries, got ${queries.length}`);
      assert(
        queries.some(q => q.includes('CREATE TABLE') && q.includes('jobs')),
        'Should create jobs table'
      );
      assert(
        queries.some(q => q.includes('CREATE TABLE') && q.includes('job_logs')),
        'Should create job_logs table'
      );
    },

    'addJob() creates N jobs and returns IDs': async () => {
      const insertedRows = [];
      let callCount = 0;
      const pool = createMockPool((sql, params) => {
        callCount++;
        if (sql.includes('INSERT INTO jobs')) {
          const id = callCount;
          insertedRows.push({ id, params });
          return { rows: [{ id }] };
        }
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      const ids = await qm.addJob({ count: 3, options: { genre: 'rpg' } });
      assertEqual(ids.length, 3, 'Should return 3 IDs');
      assert(ids.every(id => typeof id === 'number'), 'IDs should be numbers');
    },

    'addJob() defaults count to 1': async () => {
      const pool = createMockPool((sql) => {
        if (sql.includes('INSERT INTO jobs')) {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      const ids = await qm.addJob({ options: { genre: 'rpg' } });
      assertEqual(ids.length, 1, 'Should default to 1 job');
    },

    'getNextJob() uses atomic UPDATE ... RETURNING': async () => {
      let capturedSql = '';
      const mockJob = {
        id: 5, status: 'running', game_name: null,
        phase_outputs: '{}', config: '{"genre":"rpg"}',
        error: null, created_at: new Date(), updated_at: new Date(),
        started_at: new Date(), completed_at: null,
      };
      const pool = createMockPool((sql) => {
        capturedSql = sql;
        return { rows: [mockJob] };
      });
      const qm = new QueueManager(pool);
      const job = await qm.getNextJob();

      assert(capturedSql.includes('UPDATE'), 'Should use UPDATE for atomicity');
      assert(capturedSql.includes('RETURNING'), 'Should use RETURNING');
      assert(
        capturedSql.includes('queued') || capturedSql.includes("'queued'"),
        'Should filter by queued status'
      );
      assertEqual(job.id, 5, 'Should return the job');
    },

    'getNextJob() returns null when queue empty': async () => {
      const pool = createMockPool(() => ({ rows: [] }));
      const qm = new QueueManager(pool);
      const job = await qm.getNextJob();
      assertEqual(job, null, 'Should return null when no jobs');
    },

    'getNextJob() prevents double-claiming via atomic SQL': async () => {
      // The atomicity guarantee comes from the SQL itself:
      // UPDATE ... WHERE id = (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT 1)
      let capturedSql = '';
      const pool = createMockPool((sql) => {
        capturedSql = sql;
        return { rows: [{ id: 1, status: 'running' }] };
      });
      const qm = new QueueManager(pool);
      await qm.getNextJob();
      // Verify the SQL uses a locking pattern
      assert(
        capturedSql.includes('FOR UPDATE SKIP LOCKED') || capturedSql.includes('LIMIT 1'),
        'Should use row-level locking or subquery to prevent double-claiming'
      );
    },

    'updateStatus() updates job status': async () => {
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedParams = params;
        return { rows: [{ id: 1, status: 'phase_1' }] };
      });
      const qm = new QueueManager(pool);
      const result = await qm.updateStatus(1, 'phase_1');
      assert(capturedParams.includes('phase_1'), 'Should pass status as param');
      assert(capturedParams.includes(1), 'Should pass job ID as param');
    },

    'updateStatus() with data stores error on failure': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [{ id: 1, status: 'failed' }] };
      });
      const qm = new QueueManager(pool);
      await qm.updateStatus(1, 'failed', { error: 'something broke' });
      assert(capturedSql.includes('error'), 'Should include error field in update');
    },

    'updateStatus() sets completed_at on completed': async () => {
      let capturedSql = '';
      const pool = createMockPool((sql) => {
        capturedSql = sql;
        return { rows: [{ id: 1, status: 'completed' }] };
      });
      const qm = new QueueManager(pool);
      await qm.updateStatus(1, 'completed');
      assert(capturedSql.includes('completed_at'), 'Should set completed_at timestamp');
    },

    'updateStatus() sets started_at on running': async () => {
      let capturedSql = '';
      const pool = createMockPool((sql) => {
        capturedSql = sql;
        return { rows: [{ id: 1, status: 'running' }] };
      });
      const qm = new QueueManager(pool);
      await qm.updateStatus(1, 'running');
      assert(capturedSql.includes('started_at'), 'Should set started_at timestamp');
    },

    'updatePhaseOutput() stores phase output as JSONB': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [{ id: 1 }] };
      });
      const qm = new QueueManager(pool);
      const output = { name: 'Space Invaders', description: 'A shooter game' };
      await qm.updatePhaseOutput(1, 'phase_1', output);
      assert(capturedSql.includes('phase_outputs'), 'Should update phase_outputs');
      assert(capturedSql.includes('jsonb_set') || capturedSql.includes('||'), 'Should use JSONB merge');
    },

    'getJob() retrieves job by ID': async () => {
      const mockJob = {
        id: 3, status: 'running', game_name: 'TestGame',
        phase_outputs: '{}', config: '{}',
        error: null, created_at: new Date(), updated_at: new Date(),
      };
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedParams = params;
        return { rows: [mockJob] };
      });
      const qm = new QueueManager(pool);
      const job = await qm.getJob(3);
      assertEqual(job.id, 3, 'Should return correct job');
      assert(capturedParams.includes(3), 'Should query by ID');
    },

    'getJob() returns null for non-existent job': async () => {
      const pool = createMockPool(() => ({ rows: [] }));
      const qm = new QueueManager(pool);
      const job = await qm.getJob(999);
      assertEqual(job, null, 'Should return null for missing job');
    },

    'getJobs() lists all jobs': async () => {
      const mockJobs = [
        { id: 1, status: 'queued' },
        { id: 2, status: 'running' },
      ];
      const pool = createMockPool(() => ({ rows: mockJobs }));
      const qm = new QueueManager(pool);
      const jobs = await qm.getJobs();
      assertEqual(jobs.length, 2, 'Should return all jobs');
    },

    'getJobs() filters by status': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [{ id: 1, status: 'queued' }] };
      });
      const qm = new QueueManager(pool);
      await qm.getJobs({ status: 'queued' });
      assert(capturedSql.includes('status'), 'Should filter by status');
      assert(capturedParams.includes('queued'), 'Should pass status param');
    },

    'getJobs() applies limit and offset': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      await qm.getJobs({ limit: 10, offset: 20 });
      assert(capturedSql.includes('LIMIT'), 'Should include LIMIT');
      assert(capturedSql.includes('OFFSET'), 'Should include OFFSET');
    },

    'addLog() inserts log entry': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      await qm.addLog(1, 'info', 'Starting phase 1');
      assert(capturedSql.includes('INSERT INTO job_logs'), 'Should insert into job_logs');
      assert(capturedParams.includes(1), 'Should include job_id');
      assert(capturedParams.includes('info'), 'Should include level');
      assert(capturedParams.includes('Starting phase 1'), 'Should include message');
    },

    'getJobLogs() retrieves logs for a job': async () => {
      const mockLogs = [
        { id: 1, job_id: 5, level: 'info', message: 'Started', created_at: new Date() },
        { id: 2, job_id: 5, level: 'error', message: 'Failed', created_at: new Date() },
      ];
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedParams = params;
        return { rows: mockLogs };
      });
      const qm = new QueueManager(pool);
      const logs = await qm.getJobLogs(5);
      assertEqual(logs.length, 2, 'Should return all logs for the job');
      assert(capturedParams.includes(5), 'Should filter by job_id');
    },

    'cleanupOld() removes jobs older than N days': async () => {
      let capturedSql = '';
      let capturedParams = [];
      const pool = createMockPool((sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [], rowCount: 5 };
      });
      const qm = new QueueManager(pool);
      const count = await qm.cleanupOld(30);
      assert(capturedSql.includes('DELETE'), 'Should use DELETE');
      assert(capturedSql.includes('job_logs') || capturedSql.includes('jobs'), 'Should target correct table');
      assert(capturedParams.includes(30), 'Should pass days parameter');
    },

    'cleanupOld() deletes logs before jobs (foreign key)': async () => {
      const queries = [];
      const pool = createMockPool((sql, params) => {
        queries.push(sql);
        return { rows: [], rowCount: 3 };
      });
      const qm = new QueueManager(pool);
      await qm.cleanupOld(7);
      assert(queries.length >= 2, 'Should execute at least 2 queries (logs then jobs)');
      const logsIdx = queries.findIndex(q => q.includes('job_logs'));
      const jobsIdx = queries.findIndex(q => q.includes('DELETE') && q.includes('jobs') && !q.includes('job_logs'));
      assert(logsIdx < jobsIdx, 'Should delete logs before jobs');
    },

    'getStats() returns queue statistics': async () => {
      const mockStats = [
        { status: 'queued', count: '5' },
        { status: 'running', count: '2' },
        { status: 'completed', count: '10' },
        { status: 'failed', count: '1' },
      ];
      const pool = createMockPool((sql) => {
        if (sql.includes('GROUP BY')) {
          return { rows: mockStats };
        }
        return { rows: [] };
      });
      const qm = new QueueManager(pool);
      const stats = await qm.getStats();
      assertEqual(stats.queued, 5, 'queued count');
      assertEqual(stats.running, 2, 'running count');
      assertEqual(stats.completed, 10, 'completed count');
      assertEqual(stats.failed, 1, 'failed count');
      assertEqual(stats.total, 18, 'total count');
    },

    'getStats() returns zeros when no jobs': async () => {
      const pool = createMockPool(() => ({ rows: [] }));
      const qm = new QueueManager(pool);
      const stats = await qm.getStats();
      assertEqual(stats.queued, 0, 'queued should be 0');
      assertEqual(stats.running, 0, 'running should be 0');
      assertEqual(stats.completed, 0, 'completed should be 0');
      assertEqual(stats.failed, 0, 'failed should be 0');
      assertEqual(stats.total, 0, 'total should be 0');
    },

    'valid statuses are enforced': async () => {
      const pool = createMockPool(() => ({ rows: [{ id: 1 }] }));
      const qm = new QueueManager(pool);
      const validStatuses = [
        'queued', 'running', 'phase_1', 'phase_2', 'phase_3',
        'phase_4', 'phase_5', 'completed', 'failed'
      ];
      // Valid statuses should not throw
      for (const status of validStatuses) {
        await qm.updateStatus(1, status); // should not throw
      }
      // Invalid status should throw
      let threw = false;
      try {
        await qm.updateStatus(1, 'invalid_status');
      } catch (e) {
        threw = true;
        assert(e.message.includes('Invalid status'), 'Error should mention invalid status');
      }
      assert(threw, 'Should throw on invalid status');
    },
  };
}
