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
     */
    async generateGames(req, res) {
      try {
        const { count = 1, options = {} } = req.body;
        const ids = await queueManager.addJob({ count: parseInt(count, 10), options });
        res.status(201).json({ jobIds: ids, count: ids.length });
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
        res.status(200).json(result);
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

  return router;
}
