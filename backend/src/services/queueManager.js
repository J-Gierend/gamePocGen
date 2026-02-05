/**
 * QueueManager - PostgreSQL-backed job queue for game generation.
 *
 * Uses atomic SQL operations to prevent double-claiming.
 * Jobs progress through phases: queued → running → phase_1..5 → completed/failed.
 */

const VALID_STATUSES = new Set([
  'queued', 'running', 'phase_1', 'phase_2', 'phase_3',
  'phase_4', 'phase_5', 'completed', 'failed',
]);

export class QueueManager {
  /**
   * @param {import('pg').Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create tables if they don't exist.
   */
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'queued',
        game_name VARCHAR(255),
        phase_outputs JSONB DEFAULT '{}',
        config JSONB DEFAULT '{}',
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS job_logs (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        level VARCHAR(10),
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  /**
   * Add new game generation job(s).
   * @param {Object} config
   * @param {number} [config.count=1] - Number of jobs to create
   * @param {Object} [config.options={}] - Job configuration options
   * @returns {Promise<number[]>} Array of created job IDs
   */
  async addJob({ count = 1, options = {} } = {}) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const result = await this.pool.query(
        `INSERT INTO jobs (status, config) VALUES ('queued', $1) RETURNING id`,
        [JSON.stringify(options)]
      );
      ids.push(result.rows[0].id);
    }
    return ids;
  }

  /**
   * Get next queued job and atomically mark it as 'running'.
   * Uses FOR UPDATE SKIP LOCKED to prevent double-claiming.
   * @returns {Promise<Object|null>} The claimed job, or null if queue is empty
   */
  async getNextJob() {
    const result = await this.pool.query(`
      UPDATE jobs
      SET status = 'running', started_at = NOW(), updated_at = NOW()
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);
    return result.rows[0] || null;
  }

  /**
   * Update job status.
   * @param {number} jobId
   * @param {string} status
   * @param {Object} [data] - Optional additional data (e.g., { error: '...' })
   * @returns {Promise<Object>} Updated job
   */
  async updateStatus(jobId, status, data) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid status: "${status}". Valid: ${[...VALID_STATUSES].join(', ')}`);
    }

    let sql;
    let params;

    if (status === 'failed' && data?.error) {
      sql = `UPDATE jobs SET status = $1, error = $2, updated_at = NOW() WHERE id = $3 RETURNING *`;
      params = [status, data.error, jobId];
    } else if (status === 'completed') {
      sql = `UPDATE jobs SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`;
      params = [status, jobId];
    } else if (status === 'running') {
      sql = `UPDATE jobs SET status = $1, started_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`;
      params = [status, jobId];
    } else {
      sql = `UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
      params = [status, jobId];
    }

    const result = await this.pool.query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Store phase output data as JSONB.
   * Merges into existing phase_outputs using || operator.
   * @param {number} jobId
   * @param {string} phase - Phase key (e.g., 'phase_1')
   * @param {Object} output - Phase output data
   * @returns {Promise<Object>} Updated job
   */
  async updatePhaseOutput(jobId, phase, output) {
    const result = await this.pool.query(
      `UPDATE jobs
       SET phase_outputs = phase_outputs || jsonb_build_object($1::text, $2::jsonb),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [phase, JSON.stringify(output), jobId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get a single job by ID.
   * @param {number} jobId
   * @returns {Promise<Object|null>}
   */
  async getJob(jobId) {
    const result = await this.pool.query(
      `SELECT * FROM jobs WHERE id = $1`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  /**
   * List jobs with optional filters.
   * @param {Object} [options]
   * @param {string} [options.status] - Filter by status
   * @param {number} [options.limit=50] - Max results
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {Promise<Object[]>}
   */
  async getJobs({ status, limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM jobs';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Add a log entry for a job.
   * @param {number} jobId
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message
   */
  async addLog(jobId, level, message) {
    await this.pool.query(
      `INSERT INTO job_logs (job_id, level, message) VALUES ($1, $2, $3)`,
      [jobId, level, message]
    );
  }

  /**
   * Get all logs for a job, ordered by creation time.
   * @param {number} jobId
   * @returns {Promise<Object[]>}
   */
  async getJobLogs(jobId) {
    const result = await this.pool.query(
      `SELECT * FROM job_logs WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );
    return result.rows;
  }

  /**
   * Remove jobs older than N days.
   * Deletes associated logs first (foreign key constraint).
   * @param {number} daysOld
   * @returns {Promise<number>} Number of deleted jobs
   */
  async cleanupOld(daysOld) {
    // Delete logs for old jobs first
    await this.pool.query(
      `DELETE FROM job_logs WHERE job_id IN (
        SELECT id FROM jobs WHERE created_at < NOW() - INTERVAL '1 day' * $1
      )`,
      [daysOld]
    );

    // Then delete the jobs
    const result = await this.pool.query(
      `DELETE FROM jobs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [daysOld]
    );
    return result.rowCount;
  }

  /**
   * Get queue statistics.
   * @returns {Promise<{queued: number, running: number, completed: number, failed: number, total: number}>}
   */
  async getStats() {
    const result = await this.pool.query(
      `SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status`
    );

    const stats = { queued: 0, running: 0, completed: 0, failed: 0, total: 0 };
    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      if (row.status in stats) {
        stats[row.status] = count;
      }
      stats.total += count;
    }
    return stats;
  }
}
