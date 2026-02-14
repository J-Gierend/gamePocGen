/**
 * API route handlers for game generation, job management, and deployment.
 *
 * Exports:
 * - createHandlers({ queueManager, containerManager, deploymentManager }) - for testing
 * - createRouter({ queueManager, containerManager, deploymentManager }) - for production
 */

/**
 * Create route handler functions with injected services.
 * Enables direct testing without Express.
 *
 * @param {Object} services
 * @param {Object} services.queueManager
 * @param {Object} services.containerManager
 * @param {Object} services.deploymentManager
 * @returns {Object} Named handler functions
 */
export function createHandlers({ queueManager, containerManager, deploymentManager }) {
  return {
    /**
     * POST /api/generate - Start N game generation jobs.
     *
     * If options.compare is true, creates paired jobs:
     * - Job A: z.ai provider (default)
     * - Job B: anthropic provider (subscription), copies idea from Job A
     *
     * Returns { jobIds, count, comparison? } where comparison has { pairs }.
     */
    async generateGames(req, res) {
      try {
        const { count = 1, options = {} } = req.body;
        const n = parseInt(count, 10);

        if (options.compare) {
          // Comparison mode: create paired jobs with same idea
          const pairs = [];
          for (let i = 0; i < n; i++) {
            const baseName = options.name || `Game-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            // Job A: z.ai provider
            const [jobAId] = await queueManager.addJob({
              count: 1,
              options: { ...options, compare: undefined, provider: 'zai', name: `ZAI-${baseName}` },
            });

            // Job B: anthropic provider, copies idea from Job A
            const [jobBId] = await queueManager.addJob({
              count: 1,
              options: {
                ...options,
                compare: undefined,
                provider: 'anthropic',
                model: options.model || 'claude-opus-4-6',
                sourceJobId: jobAId,
                name: `Claude-${baseName}`,
              },
            });

            pairs.push({ zai: jobAId, anthropic: jobBId });
          }

          const allIds = pairs.flatMap(p => [p.zai, p.anthropic]);
          res.status(201).json({
            jobIds: allIds,
            count: allIds.length,
            comparison: { pairs, pairCount: pairs.length },
          });
        } else {
          const ids = await queueManager.addJob({ count: n, options });
          res.status(201).json({ jobIds: ids, count: ids.length });
        }
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/jobs - List all jobs with optional filters.
     */
    async listJobs(req, res) {
      try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.limit) filter.limit = parseInt(req.query.limit, 10);
        if (req.query.offset) filter.offset = parseInt(req.query.offset, 10);

        const jobs = await queueManager.getJobs(filter);
        res.status(200).json({ jobs });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/jobs/:id - Get specific job details.
     */
    async getJob(req, res) {
      try {
        const id = parseInt(req.params.id, 10);
        const job = await queueManager.getJob(id);
        if (!job) {
          return res.status(404).json({ error: `Job ${id} not found` });
        }
        res.status(200).json({ job });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/jobs/:id/logs - Get logs for a specific job.
     */
    async getJobLogs(req, res) {
      try {
        const id = parseInt(req.params.id, 10);
        const job = await queueManager.getJob(id);
        if (!job) {
          return res.status(404).json({ error: `Job ${id} not found` });
        }
        const logs = await queueManager.getJobLogs(id);
        res.status(200).json({ logs });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/stats - Get queue statistics.
     */
    async getStats(req, res) {
      try {
        const stats = await queueManager.getStats();
        res.status(200).json({ stats });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/games - List deployed games.
     */
    async listGames(req, res) {
      try {
        const games = await deploymentManager.listDeployedGames();
        res.status(200).json({ games });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * DELETE /api/games/:id - Remove a deployed game.
     */
    async removeGame(req, res) {
      try {
        const id = parseInt(req.params.id, 10);
        const result = await deploymentManager.removeGame(id);
        // Refresh gallery data after removal
        const games = await deploymentManager.listDeployedGames();
        await deploymentManager.updateGalleryData(games);
        res.status(200).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * POST /api/jobs/:id/feedback - Submit user feedback for a game.
     * Feedback is appended to existing feedback and triggers a new repair run.
     */
    async submitFeedback(req, res) {
      try {
        const id = parseInt(req.params.id, 10);
        const { feedback } = req.body;
        if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
          return res.status(400).json({ error: 'Feedback text is required' });
        }

        const job = await queueManager.getJob(id);
        if (!job) {
          return res.status(404).json({ error: `Job ${id} not found` });
        }

        // Append to existing feedback with timestamp
        const timestamp = new Date().toISOString();
        const existingFeedback = job.user_feedback || '';
        const newEntry = `[${timestamp}] ${feedback.trim()}`;
        const combined = existingFeedback
          ? `${existingFeedback}\n${newEntry}`
          : newEntry;

        const updated = await queueManager.setUserFeedback(id, combined);

        // If the job is completed, reset it to phase_5 to trigger a new repair run
        if (job.status === 'completed') {
          await queueManager.updateStatus(id, 'phase_5');
        }

        res.status(200).json({
          jobId: id,
          feedback: combined,
          willRepair: job.status === 'completed',
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * POST /api/improvements/run - Manually trigger process improvement agent.
     */
    async runProcessImprovement(req, res) {
      try {
        if (typeof globalThis._maybeRunProcessImprovement !== 'function') {
          return res.status(503).json({ error: 'Process improvement agent not initialized' });
        }
        // Force run by resetting cooldown
        if (typeof globalThis._resetProcessImprovementCooldown === 'function') {
          globalThis._resetProcessImprovementCooldown();
        }
        globalThis._maybeRunProcessImprovement(0).catch(err => {
          console.error(`[ProcessImprovement] Manual trigger failed: ${err.message}`);
        });
        res.status(202).json({ status: 'triggered', message: 'Process improvement agent started in background' });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },

    /**
     * GET /api/improvements - Get process improvement log and reports.
     */
    async getImprovements(req, res) {
      try {
        const { readFileSync, readdirSync, existsSync } = await import('node:fs');
        const improvementsDir = `${process.env.WORKSPACE_PATH || '/app/workspaces'}/shared/improvements`;
        if (!existsSync(improvementsDir)) {
          return res.status(200).json({ log: { reports: [] }, reports: [] });
        }

        // Read the improvement log
        const logPath = `${improvementsDir}/log.json`;
        let log = { reports: [] };
        if (existsSync(logPath)) {
          try { log = JSON.parse(readFileSync(logPath, 'utf-8')); } catch { /* empty */ }
        }

        // Read individual report files
        const reports = [];
        const files = readdirSync(improvementsDir).filter(f => f.startsWith('report-') && f.endsWith('.md')).sort();
        for (const file of files) {
          try {
            const content = readFileSync(`${improvementsDir}/${file}`, 'utf-8');
            reports.push({ filename: file, content });
          } catch { /* skip unreadable */ }
        }

        res.status(200).json({ log, reports });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    },
  };
}

/**
 * Create Express router with all API routes.
 * Used in production - imports Express and wires up handlers.
 *
 * @param {Object} services
 * @param {Object} services.queueManager
 * @param {Object} services.containerManager
 * @param {Object} services.deploymentManager
 * @returns {import('express').Router}
 */
export async function createRouter(services) {
  const { default: express } = await import('express');

  const router = express.Router();
  const handlers = createHandlers(services);

  // Wrap async handlers to forward errors to Express error middleware
  const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  router.post('/generate', asyncHandler(handlers.generateGames));
  router.get('/jobs', asyncHandler(handlers.listJobs));
  router.get('/jobs/:id', asyncHandler(handlers.getJob));
  router.get('/jobs/:id/logs', asyncHandler(handlers.getJobLogs));
  router.get('/stats', asyncHandler(handlers.getStats));
  router.get('/games', asyncHandler(handlers.listGames));
  router.delete('/games/:id', asyncHandler(handlers.removeGame));
  router.post('/jobs/:id/feedback', asyncHandler(handlers.submitFeedback));
  router.post('/improvements/run', asyncHandler(handlers.runProcessImprovement));
  router.get('/improvements', asyncHandler(handlers.getImprovements));

  return router;
}
