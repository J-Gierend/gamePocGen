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

// Genre seeds for Phase 1 diversity. Each job in a batch gets a different genre.
const GENRE_SEEDS = [
  'dungeon-crawler',
  'space-combat',
  'fishing-and-gathering',
  'factory-automation',
  'monster-tamer',
  'lane-battle',
  'tower-defense',
  'wave-survival',
  'exploration-and-mapping',
  'racing-and-dodging',
  'farming-and-ecosystem',
  'puzzle-combat',
  'pirate-ship-battles',
  'spell-crafting-arena',
  'train-network',
  'underwater-exploration',
];

import { runPlaywrightTest } from './services/gameTester.js';

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
    hostWorkspacePath: process.env.HOST_WORKSPACE_PATH || process.env.WORKSPACE_PATH || '/app/workspaces',
  });

  const deploymentManager = new DeploymentManager({
    deployDir: process.env.DEPLOY_DIR || '/root/apps',
    hostDeployDir: process.env.HOST_DEPLOY_DIR || process.env.DEPLOY_DIR || '/root/apps',
    galleryDataPath: process.env.GALLERY_DATA_PATH || '/root/apps/gallery/games.json',
    domain: process.env.DOMAIN || 'namjo-games.com',
    docker,
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
    const provider = job.config?.provider || 'zai';
    const sourceJobId = job.config?.sourceJobId;

    await queueManager.addLog(job.id, 'info', `Provider: ${provider}${sourceJobId ? `, source job: ${sourceJobId}` : ''}`);

    // Build provider-specific env vars
    const providerEnv = [];
    if (provider === 'anthropic') {
      providerEnv.push(
        'AUTH_MODE=subscription',
        `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN || ''}`,
        `CLAUDE_CODE_REFRESH_TOKEN=${process.env.CLAUDE_CODE_REFRESH_TOKEN || ''}`,
        `CLAUDE_CODE_TOKEN_EXPIRES=${process.env.CLAUDE_CODE_TOKEN_EXPIRES || ''}`,
        `MODEL=${job.config?.model || 'claude-opus-4-6'}`,
      );
    }

    const phases = ['phase1', 'phase2', 'phase3', 'phase4'];

    for (const phase of phases) {
      try {
        await queueManager.updateStatus(job.id, `phase_${phase.replace('phase', '')}`);
        await queueManager.addLog(job.id, 'info', `Starting ${phase}`);

        // For comparison jobs: skip phase1 and copy idea from source
        if (phase === 'phase1' && sourceJobId) {
          await queueManager.addLog(job.id, 'info', `Comparison job: waiting for source job ${sourceJobId} phase1...`);

          // Wait for source job to finish phase1 (poll every 5s, 30min timeout)
          const maxWait = 30 * 60 * 1000;
          const startWait = Date.now();
          let sourceReady = false;
          while (Date.now() - startWait < maxWait) {
            const sourceJob = await queueManager.getJob(sourceJobId);
            if (!sourceJob) throw new Error(`Source job ${sourceJobId} not found`);
            if (sourceJob.status === 'failed') throw new Error(`Source job ${sourceJobId} failed`);
            // Source is past phase1 if status is phase_2 or later
            const pastPhase1 = ['phase_2', 'phase_3', 'phase_4', 'completed'].includes(sourceJob.status);
            if (pastPhase1) { sourceReady = true; break; }
            await new Promise(r => setTimeout(r, 5000));
          }
          if (!sourceReady) throw new Error(`Timeout waiting for source job ${sourceJobId} to complete phase1`);

          // Copy idea.md from source workspace to our workspace
          const sourceDir = `${containerManager.workspacePath}/job-${sourceJobId}`;
          const destDir = `${containerManager.workspacePath}/job-${job.id}`;
          const { mkdirSync, copyFileSync, existsSync } = await import('node:fs');
          mkdirSync(destDir, { recursive: true });
          const ideaSrc = `${sourceDir}/idea.md`;
          const ideaJsonSrc = `${sourceDir}/idea.json`;
          if (existsSync(ideaSrc)) copyFileSync(ideaSrc, `${destDir}/idea.md`);
          if (existsSync(ideaJsonSrc)) copyFileSync(ideaJsonSrc, `${destDir}/idea.json`);

          await queueManager.addLog(job.id, 'info', `Copied idea from source job ${sourceJobId}`);
          await queueManager.updatePhaseOutput(job.id, 'phase1', { copied_from: sourceJobId });
          continue; // Skip spawning phase1 container
        }

        // Pass diversity env vars to phase1
        if (phase === 'phase1') {
          try {
            const extraEnv = [...providerEnv];

            // Existing game names for title/genre diversity
            const existingGames = await deploymentManager.listDeployedGames();
            const names = existingGames.map(g => g.title).filter(Boolean).join(', ');
            if (names) {
              extraEnv.push(`EXISTING_GAME_NAMES=${names}`);
            }

            // Pick a genre seed not recently used by other jobs
            const recentJobs = await queueManager.getJobs({ limit: 20 });
            const usedGenres = new Set(
              recentJobs
                .map(j => j.phase_outputs?.genreSeed)
                .filter(Boolean)
            );
            const available = GENRE_SEEDS.filter(g => !usedGenres.has(g));
            const genrePool = available.length > 0 ? available : GENRE_SEEDS;
            const genreSeed = genrePool[Math.floor(Math.random() * genrePool.length)];
            extraEnv.push(`GENRE_SEED=${genreSeed}`);

            // Store genre seed in phase_outputs for dedup tracking
            await queueManager.updatePhaseOutput(job.id, 'genreSeed', genreSeed);

            job.extraEnv = extraEnv;
            await queueManager.addLog(job.id, 'info', `Genre seed: ${genreSeed}`);
          } catch (err) {
            // Log but don't fail — genre seed is nice-to-have
            console.error(`Genre seed selection failed: ${err.message}`);
          }
        } else {
          // Non-phase1: still pass provider env vars
          job.extraEnv = [...providerEnv];
        }

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
    let deployResult;
    try {
      const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
      const sourceDir = `${workspaceDir}/dist`;
      deployResult = await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir, { workspaceDir });
      await queueManager.updatePhaseOutput(job.id, 'deployment', deployResult);
      await queueManager.addLog(job.id, 'info', `Deployed to ${deployResult.url}`);

      // Update gallery
      const games = await deploymentManager.listDeployedGames();
      await deploymentManager.updateGalleryData(games);
    } catch (err) {
      await queueManager.addLog(job.id, 'error', `Deploy error: ${err.message}`);
      await queueManager.updateStatus(job.id, 'completed');
      return;
    }

    // Phase 5: Repair loop (max 3 iterations)
    const gameUrl = deployResult.url;
    const MAX_REPAIR_ATTEMPTS = 3;
    const PASS_SCORE = 6;
    const FAIL_SCORE = 4;

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      try {
        await queueManager.addLog(job.id, 'info', `Repair loop iteration ${attempt}/${MAX_REPAIR_ATTEMPTS}: testing ${gameUrl}`);
        const testResult = await runPlaywrightTest(gameUrl);
        const score = testResult.score ?? 0;
        await queueManager.addLog(job.id, 'info', `Test score: ${score}/10`);
        await queueManager.updatePhaseOutput(job.id, `repair_${attempt}`, { score, defectCount: testResult.defects?.length ?? 0 });

        if (score >= PASS_SCORE) {
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${PASS_SCORE}, game passes quality gate`);
          break;
        }

        if (attempt === MAX_REPAIR_ATTEMPTS) {
          if (score < FAIL_SCORE) {
            await queueManager.addLog(job.id, 'error', `Score ${score} < ${FAIL_SCORE} after ${MAX_REPAIR_ATTEMPTS} attempts, removing game`);
            await deploymentManager.removeGame(job.id);
            await queueManager.updateStatus(job.id, 'failed', { error: `Quality gate: score ${score}/10 after ${MAX_REPAIR_ATTEMPTS} repair attempts` });
            // Update gallery after removal
            const games = await deploymentManager.listDeployedGames();
            await deploymentManager.updateGalleryData(games);
            return;
          }
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${FAIL_SCORE}, keeping game despite not reaching ${PASS_SCORE}`);
          break;
        }

        // Spawn Phase 5 repair container with defect report
        await queueManager.addLog(job.id, 'info', `Spawning repair container (attempt ${attempt})`);
        const defectReport = JSON.stringify(testResult.defects || []);

        job.extraEnv = [
          ...(provider === 'anthropic' ? [
            'AUTH_MODE=subscription',
            `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN || ''}`,
            `CLAUDE_CODE_REFRESH_TOKEN=${process.env.CLAUDE_CODE_REFRESH_TOKEN || ''}`,
            `CLAUDE_CODE_TOKEN_EXPIRES=${process.env.CLAUDE_CODE_TOKEN_EXPIRES || ''}`,
            `MODEL=${job.config?.model || 'claude-opus-4-6'}`,
          ] : []),
          `GAME_URL=${gameUrl}`,
          `DEFECT_REPORT=${defectReport}`,
        ];

        const { containerId } = await containerManager.spawnContainer(job, 'phase5');

        // Poll container until done
        let status;
        do {
          await new Promise(r => setTimeout(r, 5000));
          status = await containerManager.getContainerStatus(containerId);
        } while (status?.running);

        const logs = await containerManager.getContainerLogs(containerId);
        await queueManager.addLog(job.id, 'info', `phase5 repair logs: ${logs.slice(0, 500)}`);

        if (status?.exitCode !== 0) {
          await queueManager.addLog(job.id, 'error', `Repair container failed with exit code ${status?.exitCode}`);
          continue; // Try next iteration with re-test
        }

        // Redeploy the fixed game
        try {
          const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
          const sourceDir = `${workspaceDir}/dist`;
          await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir, { workspaceDir });
          await queueManager.addLog(job.id, 'info', `Redeployed after repair attempt ${attempt}`);
        } catch (redeployErr) {
          await queueManager.addLog(job.id, 'error', `Redeploy error: ${redeployErr.message}`);
        }
      } catch (err) {
        await queueManager.addLog(job.id, 'error', `Repair iteration ${attempt} error: ${err.message}`);
      }
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
