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

    // Phase 5: Repair loop — keep iterating until 10/10 or 100 attempts
    await queueManager.updateStatus(job.id, 'phase_5');
    await queueManager.addLog(job.id, 'info', 'Starting Phase 5 repair loop');

    // Use internal Docker network URL for Playwright tests (avoids hairpin NAT)
    const gameUrl = deployResult.url;
    const testUrl = `http://gamedemo${job.id}`;
    const MAX_REPAIR_ATTEMPTS = 100;
    const PASS_SCORE = 10;
    const FAIL_SCORE = 4;

    // Helper: write score badge + repair log into deployed game
    const { writeFileSync, readFileSync } = await import('node:fs');
    const repairLog = []; // Accumulates across all attempts
    function updateScoreBadge(score, attempt) {
      try {
        const badgePath = `${containerManager.workspacePath}/job-${job.id}/../deployed/gamedemo${job.id}/html/score-badge.js`;
        const altPath = `${deployResult.deployPath}/html/score-badge.js`;
        const js = `(function(){var d=document.createElement('div');d.id='qa-badge';d.style.cssText='position:fixed;top:8px;right:8px;z-index:999999;background:${score>=8?'#22c55e':score>=4?'#eab308':'#ef4444'};color:#fff;padding:6px 14px;border-radius:20px;font:bold 14px/1 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;';d.textContent='Score: ${score}/10 • Repair #${attempt}';var old=document.getElementById('qa-badge');if(old)old.remove();document.body.appendChild(d);})();`;
        try { writeFileSync(altPath, js); } catch { writeFileSync(badgePath, js); }
      } catch { /* non-critical */ }
    }

    // Helper: inject badge script tag into game's index.html (once)
    function injectBadgeScript() {
      try {
        const htmlPath = `${deployResult.deployPath}/html/index.html`;
        let html = readFileSync(htmlPath, 'utf8');
        if (!html.includes('score-badge.js')) {
          html = html.replace('</body>', '<script src="score-badge.js"></script></body>');
          writeFileSync(htmlPath, html);
        }
      } catch { /* non-critical */ }
    }

    // Helper: write repair log (JSON + HTML) to deployed game
    function updateRepairLog() {
      try {
        const htmlDir = `${deployResult.deployPath}/html`;
        writeFileSync(`${htmlDir}/repair-log.json`, JSON.stringify(repairLog, null, 2));
        // Human-readable HTML version
        const rows = repairLog.map(e => `<tr style="border-bottom:1px solid #333">
          <td style="padding:6px">${e.attempt}</td>
          <td style="padding:6px;font-weight:bold;color:${e.score>=8?'#22c55e':e.score>=4?'#eab308':'#ef4444'}">${e.score}/10</td>
          <td style="padding:6px">${e.defectCount}</td>
          <td style="padding:6px;font-size:12px">${(e.defects||[]).map(d=>`<b>[${d.severity}]</b> ${d.description}`).join('<br>')}</td>
          <td style="padding:6px;font-size:11px;color:#888">${e.timestamp}</td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Repair Log - ${job.game_name}</title>
<style>body{background:#111;color:#eee;font-family:system-ui;padding:20px;margin:0}
table{border-collapse:collapse;width:100%}th{text-align:left;padding:8px;border-bottom:2px solid #555;color:#aaa}
h1{margin:0 0 4px}h2{margin:0 0 16px;color:#888;font-weight:normal}</style></head>
<body><h1>Repair Log: ${job.game_name}</h1>
<h2>Job #${job.id} | ${repairLog.length} attempts | Latest: ${repairLog.length?repairLog[repairLog.length-1].score:0}/10</h2>
<table><tr><th>#</th><th>Score</th><th>Defects</th><th>Issues</th><th>Time</th></tr>${rows}</table></body></html>`;
        writeFileSync(`${htmlDir}/repair-log.html`, html);
      } catch { /* non-critical */ }
    }

    // Inject badge script on first deploy
    injectBadgeScript();
    updateScoreBadge(0, 0);
    let consecutiveTimeouts = 0;
    const MAX_CONSECUTIVE_TIMEOUTS = 5;
    const PLATEAU_WINDOW = 5; // Check last N attempts for improvement
    const PLATEAU_THRESHOLD = 0.5; // Minimum score delta to count as "improving"
    let lastStrategyReviewAtAttempt = 0; // Don't review more than once every 5 attempts

    // Helper: detect if repair loop is plateaued
    function isPlateaued(attempt) {
      if (repairLog.length < PLATEAU_WINDOW) return false;
      if (attempt - lastStrategyReviewAtAttempt < PLATEAU_WINDOW) return false;
      const recent = repairLog.slice(-PLATEAU_WINDOW);
      const minScore = Math.min(...recent.map(r => r.score));
      const maxScore = Math.max(...recent.map(r => r.score));
      return (maxScore - minScore) < PLATEAU_THRESHOLD;
    }

    // Helper: build repair history summary for strategy review
    function buildRepairHistory() {
      const lines = ['## Score Progression'];
      for (const entry of repairLog) {
        lines.push(`Attempt ${entry.attempt}: ${entry.score}/10 (${entry.defectCount} defects)`);
        if (entry.defects) {
          for (const d of entry.defects.slice(0, 3)) {
            const desc = typeof d === 'string' ? d : `[${d.severity}] ${d.description}`;
            lines.push(`  - ${desc}`);
          }
        }
      }
      // Identify recurring defects
      const defectCounts = {};
      for (const entry of repairLog) {
        for (const d of entry.defects || []) {
          const key = typeof d === 'string' ? d : (d.description || '').substring(0, 60);
          defectCounts[key] = (defectCounts[key] || 0) + 1;
        }
      }
      lines.push('\n## Recurring Defects (appeared in multiple attempts)');
      for (const [defect, count] of Object.entries(defectCounts).sort((a, b) => b[1] - a[1])) {
        if (count >= 2) lines.push(`- [${count}x] ${defect}`);
      }
      return lines.join('\n');
    }

    // Helper: build auth env vars
    function getAuthEnv() {
      return provider === 'anthropic' ? [
        'AUTH_MODE=subscription',
        `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN || ''}`,
        `CLAUDE_CODE_REFRESH_TOKEN=${process.env.CLAUDE_CODE_REFRESH_TOKEN || ''}`,
        `CLAUDE_CODE_TOKEN_EXPIRES=${process.env.CLAUDE_CODE_TOKEN_EXPIRES || ''}`,
        `MODEL=${job.config?.model || 'claude-opus-4-6'}`,
      ] : [];
    }

    // Helper: spawn container and wait for completion
    async function spawnAndWait(phase, extraEnv) {
      job.extraEnv = [...getAuthEnv(), ...extraEnv];
      const { containerId } = await containerManager.spawnContainer(job, phase);
      let status;
      do {
        await new Promise(r => setTimeout(r, 5000));
        status = await containerManager.getContainerStatus(containerId);
      } while (status?.running);
      const logs = await containerManager.getContainerLogs(containerId);
      return { status, logs };
    }

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      try {
        await queueManager.addLog(job.id, 'info', `Repair loop iteration ${attempt}/${MAX_REPAIR_ATTEMPTS}: testing ${testUrl}`);
        const testResult = await runPlaywrightTest(testUrl);
        const score = testResult.score ?? 0;

        // Detect infrastructure failures (ETIMEDOUT, etc.) and bail early
        const isInfraFailure = score === 0 && testResult.defects?.length === 1 &&
          testResult.defects[0]?.description?.includes('ETIMEDOUT');
        if (isInfraFailure) {
          consecutiveTimeouts++;
          if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
            await queueManager.addLog(job.id, 'error', `${MAX_CONSECUTIVE_TIMEOUTS} consecutive test timeouts — bailing out (game may be unreachable or hanging)`);
            await queueManager.updateStatus(job.id, 'failed', { error: `Infrastructure failure: ${MAX_CONSECUTIVE_TIMEOUTS} consecutive ETIMEDOUT` });
            return;
          }
        } else {
          consecutiveTimeouts = 0;
        }

        await queueManager.addLog(job.id, 'info', `Test score: ${score}/10 (attempt ${attempt})`);
        const defectSummaries = (testResult.defects || []).slice(0, 5).map(d => `[${d.severity}] ${d.description?.substring(0, 80)}`);
        await queueManager.updatePhaseOutput(job.id, `repair_${attempt}`, {
          score,
          defectCount: testResult.defects?.length ?? 0,
          defects: defectSummaries,
          timestamp: new Date().toISOString(),
        });
        await queueManager.updatePhaseOutput(job.id, 'latest_score', { score, attempt, defectCount: testResult.defects?.length ?? 0 });

        repairLog.push({
          attempt,
          score,
          defectCount: testResult.defects?.length ?? 0,
          defects: (testResult.defects || []).slice(0, 10),
          checks: testResult.checks || {},
          timestamp: new Date().toISOString(),
        });

        updateScoreBadge(score, attempt);
        updateRepairLog();

        if (score >= PASS_SCORE) {
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${PASS_SCORE}, game passes quality gate`);
          break;
        }

        if (attempt === MAX_REPAIR_ATTEMPTS) {
          if (score < FAIL_SCORE) {
            await queueManager.addLog(job.id, 'error', `Score ${score} < ${FAIL_SCORE} after ${MAX_REPAIR_ATTEMPTS} attempts, removing game`);
            await deploymentManager.removeGame(job.id);
            await queueManager.updateStatus(job.id, 'failed', { error: `Quality gate: score ${score}/10 after ${MAX_REPAIR_ATTEMPTS} repair attempts` });
            const games = await deploymentManager.listDeployedGames();
            await deploymentManager.updateGalleryData(games);
            return;
          }
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${FAIL_SCORE}, keeping game after ${MAX_REPAIR_ATTEMPTS} attempts`);
          break;
        }

        // --- PLATEAU DETECTION: trigger strategy review when stuck ---
        if (isPlateaued(attempt)) {
          await queueManager.addLog(job.id, 'info', `PLATEAU DETECTED at attempt ${attempt} (score ~${score} for last ${PLATEAU_WINDOW} attempts). Spawning strategy review...`);
          lastStrategyReviewAtAttempt = attempt;

          const history = buildRepairHistory();
          const { status: reviewStatus, logs: reviewLogs } = await spawnAndWait('phase5-strategy', [
            `GAME_URL=${gameUrl}`,
            `DEFECT_REPORT=${history}`,
          ]);

          await queueManager.addLog(job.id, 'info', `Strategy review ${reviewStatus?.exitCode === 0 ? 'completed' : 'failed'}: ${reviewLogs.slice(0, 300)}`);
          await queueManager.updatePhaseOutput(job.id, `strategy_review_${attempt}`, {
            triggeredAt: attempt,
            score,
            exitCode: reviewStatus?.exitCode,
            timestamp: new Date().toISOString(),
          });

          // Continue to normal repair — it will now read repair-strategy.md
        }

        // Also check if we should run global process improvement
        if (typeof globalThis._maybeRunProcessImprovement === 'function') {
          globalThis._maybeRunProcessImprovement(job.id).catch(() => {});
        }

        // Spawn Phase 5 repair container with defect report
        await queueManager.addLog(job.id, 'info', `Spawning repair container (attempt ${attempt})`);
        const defectReport = JSON.stringify(testResult.defects || []);

        const { status: repairStatus, logs: repairLogs } = await spawnAndWait('phase5', [
          `GAME_URL=${gameUrl}`,
          `DEFECT_REPORT=${defectReport}`,
        ]);

        await queueManager.addLog(job.id, 'info', `phase5 repair logs: ${repairLogs.slice(0, 500)}`);

        if (repairStatus?.exitCode !== 0) {
          await queueManager.addLog(job.id, 'error', `Repair container failed with exit code ${repairStatus?.exitCode}`);
          continue;
        }

        // Redeploy the fixed game
        try {
          const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
          const sourceDir = `${workspaceDir}/dist`;
          await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir, { workspaceDir });
          injectBadgeScript();
          updateScoreBadge(score, attempt);
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

  // --- Process Improvement Agent (global, cross-job) ---
  let lastProcessImprovementRun = 0;
  const PROCESS_IMPROVEMENT_COOLDOWN = 60 * 60 * 1000; // 1 hour

  async function maybeRunProcessImprovement(triggerJobId) {
    const now = Date.now();
    if (now - lastProcessImprovementRun < PROCESS_IMPROVEMENT_COOLDOWN) return;
    lastProcessImprovementRun = now;

    try {
      console.log(`[ProcessImprovement] Triggered by job ${triggerJobId}, gathering cross-job data...`);

      // Gather data from ALL recent jobs
      const allJobs = await queueManager.getJobs({ limit: 50 });
      const crossJobData = [];

      for (const j of allJobs) {
        const po = j.phase_outputs || {};
        const scores = [];
        for (let i = 1; i <= 200; i++) {
          const k = `repair_${i}`;
          if (po[k]) scores.push({ attempt: i, score: po[k].score, defects: po[k].defects || [] });
        }
        if (scores.length === 0) continue;

        const strategyReviews = Object.entries(po)
          .filter(([k]) => k.includes('strategy'))
          .map(([k, v]) => ({ key: k, ...v }));

        crossJobData.push({
          jobId: j.id,
          gameName: j.game_name,
          status: j.status,
          scores: scores.map(s => s.score),
          latestScore: po.latest_score,
          defects: scores[scores.length - 1]?.defects || [],
          strategyReviews,
          totalAttempts: scores.length,
        });
      }

      if (crossJobData.length === 0) return;

      // Build human-readable summary for the agent
      const lines = [`# Cross-Job Analysis Data (${new Date().toISOString()})`, ''];
      for (const jd of crossJobData) {
        lines.push(`## Job ${jd.jobId}: ${jd.gameName} (${jd.status})`);
        lines.push(`Score progression: ${jd.scores.join(' → ')}`);
        lines.push(`Latest: ${jd.latestScore?.score}/10 (attempt ${jd.latestScore?.attempt})`);
        lines.push(`Strategy reviews: ${jd.strategyReviews.length}`);
        if (jd.defects.length > 0) {
          lines.push('Current defects:');
          for (const d of jd.defects) lines.push(`  - ${typeof d === 'string' ? d : d}`);
        }
        lines.push('');
      }

      // Identify recurring defects across jobs
      const globalDefects = {};
      for (const jd of crossJobData) {
        for (const d of jd.defects) {
          const key = (typeof d === 'string' ? d : JSON.stringify(d)).substring(0, 80);
          if (!globalDefects[key]) globalDefects[key] = { count: 0, jobs: [] };
          globalDefects[key].count++;
          globalDefects[key].jobs.push(jd.jobId);
        }
      }
      lines.push('## Cross-Job Recurring Defects');
      for (const [defect, info] of Object.entries(globalDefects).sort((a, b) => b[1].count - a[1].count)) {
        lines.push(`- [${info.count} jobs: ${info.jobs.join(',')}] ${defect}`);
      }

      const crossJobReport = lines.join('\n');

      // Ensure shared workspace with improvements dir, prompts, and test scripts
      const { mkdirSync, copyFileSync, existsSync, readdirSync } = await import('node:fs');
      const sharedDir = `${containerManager.workspacePath}/shared`;
      const improvementsDir = `${sharedDir}/improvements`;
      mkdirSync(improvementsDir, { recursive: true });

      // Copy test scripts and prompts into shared workspace for the agent to read
      const scriptsDir = `${sharedDir}/scripts`;
      const promptsDir = `${sharedDir}/prompts`;
      mkdirSync(scriptsDir, { recursive: true });
      mkdirSync(promptsDir, { recursive: true });

      // Copy test-game.js from the worker image's location
      // The agent reads from /workspace/scripts/test-game.js (host: sharedDir/scripts/)
      const hostScripts = `${containerManager.hostWorkspacePath}/shared/scripts`;
      const hostPrompts = `${containerManager.hostWorkspacePath}/shared/prompts`;

      // Copy from the project root (mounted into backend)
      const projectRoot = '/app';
      if (existsSync(`${projectRoot}/scripts/test-game.js`)) {
        copyFileSync(`${projectRoot}/scripts/test-game.js`, `${scriptsDir}/test-game.js`);
      }
      if (existsSync(`${projectRoot}/prompts`)) {
        for (const f of readdirSync(`${projectRoot}/prompts`)) {
          if (f.endsWith('.md')) {
            copyFileSync(`${projectRoot}/prompts/${f}`, `${promptsDir}/${f}`);
          }
        }
        // Copy phase2 subdir
        if (existsSync(`${projectRoot}/prompts/phase2-gdd`)) {
          mkdirSync(`${promptsDir}/phase2-gdd`, { recursive: true });
          for (const f of readdirSync(`${projectRoot}/prompts/phase2-gdd`)) {
            copyFileSync(`${projectRoot}/prompts/phase2-gdd/${f}`, `${promptsDir}/phase2-gdd/${f}`);
          }
        }
      }

      // Write cross-job data to a file (env vars have size limits)
      const { writeFileSync: writeSync } = await import('node:fs');
      writeSync(`${sharedDir}/cross-job-data.md`, crossJobReport);

      console.log(`[ProcessImprovement] Spawning agent with ${crossJobData.length} jobs' data...`);

      // Spawn container with shared workspace
      const hostSharedDir = `${containerManager.hostWorkspacePath}/shared`;
      const containerName = `gamepocgen-process-improvement-${Date.now()}`;
      const containerId = await new Promise((resolve, reject) => {
        const docker = containerManager.docker;
        docker.createContainer({
          Image: process.env.WORKER_IMAGE || 'gamepocgen-worker',
          name: containerName,
          Env: [
            'PHASE=process-improvement',
            'JOB_ID=0',
            'GAME_NAME=process-improvement',
            `ZAI_API_KEY=${process.env.ZAI_API_KEY || ''}`,
            `ZAI_BASE_URL=${process.env.ZAI_BASE_URL || ''}`,
            'MODEL=claude-opus-4-6',
            'CLAUDE_CODE_EFFORT_LEVEL=high',
            'WORKSPACE_DIR=/workspace',
            'TIMEOUT_SECONDS=3600',
            'DEFECT_REPORT=See /workspace/cross-job-data.md for full cross-job analysis data.',
          ],
          HostConfig: {
            Memory: 2 * 1024 * 1024 * 1024,
            NanoCpus: 1e9,
            Binds: [`${hostSharedDir}:/workspace`],
          },
          NetworkingMode: 'traefik',
        }).then(c => c.start().then(() => resolve(c.id))).catch(reject);
      });

      // Wait for completion (non-blocking — run in background)
      (async () => {
        try {
          let status;
          do {
            await new Promise(r => setTimeout(r, 10000));
            try {
              const c = containerManager.docker.getContainer(containerId);
              const info = await c.inspect();
              status = { running: info.State.Running, exitCode: info.State.ExitCode };
            } catch {
              // Container might be gone, give it one more try
              await new Promise(r => setTimeout(r, 2000));
              try {
                const c = containerManager.docker.getContainer(containerId);
                const info = await c.inspect();
                status = { running: info.State.Running, exitCode: info.State.ExitCode };
              } catch {
                status = { running: false, exitCode: -1 };
              }
            }
          } while (status?.running);

          // Get logs before cleanup
          try {
            const c = containerManager.docker.getContainer(containerId);
            const logStream = await c.logs({ stdout: true, stderr: true, tail: 20 });
            console.log(`[ProcessImprovement] Agent logs: ${logStream.toString().slice(0, 500)}`);
            await c.remove();
          } catch { /* container might already be removed */ }

          console.log(`[ProcessImprovement] Agent finished (exit=${status?.exitCode})`);

          // Check if reports were written
          const logPath = `${improvementsDir}/log.json`;
          if (existsSync(logPath)) {
            const { readFileSync } = await import('node:fs');
            try {
              const log = JSON.parse(readFileSync(logPath, 'utf-8'));
              console.log(`[ProcessImprovement] ${log.reports?.length || 0} reports in log`);
            } catch { /* ignore */ }
          }
        } catch (err) {
          console.error(`[ProcessImprovement] Error: ${err.message}`);
        }
      })();

    } catch (err) {
      console.error(`[ProcessImprovement] Failed to run: ${err.message}`);
    }
  }

  // Expose the trigger for the repair loop
  // Called from plateau detection inside processJob
  globalThis._maybeRunProcessImprovement = maybeRunProcessImprovement;

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
