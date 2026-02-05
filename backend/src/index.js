/**
 * GamePocGen Backend - Entry point.
 *
 * Wires together services (QueueManager, ContainerManager, DeploymentManager)
 * with Express and starts listening.
 */

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import Dockerode from 'dockerode';

import { QueueManager } from './services/queueManager.js';
import { ContainerManager } from './services/containerManager.js';
import { DeploymentManager } from './services/deploymentManager.js';
import { createRouter } from './routes/api.js';

const { Pool } = pg;

const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);

async function main() {
  // --- Database ---
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://gamepocgen:gamepocgen@localhost:5432/gamepocgen',
  });

  // --- Services ---
  const queueManager = new QueueManager(pool);
  await queueManager.init();

  const docker = new Dockerode();
  const containerManager = new ContainerManager(docker, {
    workspacePath: process.env.WORKSPACE_PATH || '/app/workspaces',
  });

  const deploymentManager = new DeploymentManager({
    deployDir: process.env.DEPLOY_DIR || '/root/apps',
    traefikDynamicDir: process.env.TRAEFIK_DYNAMIC_DIR || '/root/apps/traefik/dynamic',
    galleryDataPath: process.env.GALLERY_DATA_PATH || '/root/apps/gallery/games.json',
    domain: process.env.DOMAIN || 'namjo-games.com',
  });

  // --- Express ---
  const app = express();
  app.use(cors());
  app.use(express.json());

  const router = await createRouter({ queueManager, containerManager, deploymentManager });
  app.use('/api', router);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Error handler
  app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // --- Job Polling ---
  let running = 0;

  async function pollQueue() {
    if (running >= MAX_CONCURRENT) return;

    const job = await queueManager.getNextJob();
    if (!job) return;

    running++;
    console.log(`[Queue] Starting job ${job.id} (${running}/${MAX_CONCURRENT} active)`);

    processJob(job).finally(() => {
      running--;
      console.log(`[Queue] Job ${job.id} finished (${running}/${MAX_CONCURRENT} active)`);
    });
  }

  async function processJob(job) {
    const phases = ['phase1', 'phase2', 'phase3', 'phase4'];

    for (const phase of phases) {
      try {
        await queueManager.updateStatus(job.id, `phase_${phase.replace('phase', '')}`);
        await queueManager.addLog(job.id, 'info', `Starting ${phase}`);

        const { containerId } = await containerManager.spawnContainer(job, phase);

        // Poll container until done
        let status;
        do {
          await new Promise(r => setTimeout(r, 5000));
          status = await containerManager.getContainerStatus(containerId);
        } while (status?.running);

        const logs = await containerManager.getContainerLogs(containerId);
        await queueManager.addLog(job.id, 'info', `${phase} logs: ${logs.slice(0, 500)}`);

        if (status?.exitCode !== 0) {
          throw new Error(`${phase} failed with exit code ${status?.exitCode}`);
        }

        await queueManager.addLog(job.id, 'info', `${phase} completed successfully`);
      } catch (err) {
        await queueManager.addLog(job.id, 'error', `${phase} error: ${err.message}`);
        await queueManager.updateStatus(job.id, 'failed', { error: `${phase}: ${err.message}` });
        return;
      }
    }

    // Deploy
    try {
      const sourceDir = `${containerManager.workspacePath}/job-${job.id}/output`;
      const result = await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir);
      await queueManager.updatePhaseOutput(job.id, 'deployment', result);
      await queueManager.addLog(job.id, 'info', `Deployed to ${result.url}`);

      // Update gallery
      const games = await deploymentManager.listDeployedGames();
      await deploymentManager.updateGalleryData(games);
    } catch (err) {
      await queueManager.addLog(job.id, 'error', `Deploy error: ${err.message}`);
    }

    await queueManager.updateStatus(job.id, 'completed');
  }

  setInterval(pollQueue, POLL_INTERVAL);

  // --- Start ---
  app.listen(PORT, () => {
    console.log(`GamePocGen backend listening on port ${PORT}`);
    console.log(`Max concurrent jobs: ${MAX_CONCURRENT}`);
    console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
