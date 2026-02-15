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

import { runPlaywrightTest, buildGameContext } from './services/gameTester.js';

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
    hostProjectRoot: process.env.HOST_PROJECT_ROOT || '',
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
  let queuePaused = false;
  globalThis._pauseQueue = () => { queuePaused = true; console.log('[Queue] PAUSED for process improvement'); };
  globalThis._resumeQueue = () => { queuePaused = false; console.log('[Queue] RESUMED'); };
  globalThis._isQueuePaused = () => queuePaused;

  async function pollQueue() {
    if (queuePaused || running >= MAX_CONCURRENT) return;

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

    // --- Pre-launch: handle comparison jobs (copy idea from source) ---
    if (sourceJobId) {
      await queueManager.addLog(job.id, 'info', `Comparison job: waiting for source job ${sourceJobId} phase1...`);
      const maxWait = 30 * 60 * 1000;
      const startWait = Date.now();
      let sourceReady = false;
      while (Date.now() - startWait < maxWait) {
        const sourceJob = await queueManager.getJob(sourceJobId);
        if (!sourceJob) throw new Error(`Source job ${sourceJobId} not found`);
        if (sourceJob.status === 'failed') throw new Error(`Source job ${sourceJobId} failed`);
        const pastPhase1 = ['phase_2', 'phase_3', 'phase_4', 'completed'].includes(sourceJob.status);
        if (pastPhase1) { sourceReady = true; break; }
        await new Promise(r => setTimeout(r, 5000));
      }
      if (!sourceReady) throw new Error(`Timeout waiting for source job ${sourceJobId} to complete phase1`);

      const { mkdirSync, copyFileSync, existsSync } = await import('node:fs');
      const srcDir = `${containerManager.workspacePath}/job-${sourceJobId}`;
      const destDir = `${containerManager.workspacePath}/job-${job.id}`;
      mkdirSync(destDir, { recursive: true });
      if (existsSync(`${srcDir}/idea.md`)) copyFileSync(`${srcDir}/idea.md`, `${destDir}/idea.md`);
      if (existsSync(`${srcDir}/idea.json`)) copyFileSync(`${srcDir}/idea.json`, `${destDir}/idea.json`);
      await queueManager.addLog(job.id, 'info', `Copied idea from source job ${sourceJobId}`);
      await queueManager.updatePhaseOutput(job.id, 'phase1', { copied_from: sourceJobId });
    }

    // --- Genre seed selection (for phase1 diversity) ---
    const extraEnv = [...providerEnv];
    try {
      const existingGames = await deploymentManager.listDeployedGames();
      const names = existingGames.map(g => g.title).filter(Boolean).join(', ');
      if (names) extraEnv.push(`EXISTING_GAME_NAMES=${names}`);

      const recentJobs = await queueManager.getJobs({ limit: 20 });
      const usedGenres = new Set(recentJobs.map(j => j.phase_outputs?.genreSeed).filter(Boolean));
      const available = GENRE_SEEDS.filter(g => !usedGenres.has(g));
      const genrePool = available.length > 0 ? available : GENRE_SEEDS;
      const genreSeed = genrePool[Math.floor(Math.random() * genrePool.length)];
      extraEnv.push(`GENRE_SEED=${genreSeed}`);
      await queueManager.updatePhaseOutput(job.id, 'genreSeed', genreSeed);
      await queueManager.addLog(job.id, 'info', `Genre seed: ${genreSeed}`);
    } catch (err) {
      console.error(`Genre seed selection failed: ${err.message}`);
    }

    // --- Spawn ONE persistent container for the entire job ---
    await queueManager.updateStatus(job.id, 'phase_1');
    await queueManager.addLog(job.id, 'info', 'Spawning persistent worker container');

    let containerId;
    try {
      const result = await containerManager.spawnPersistentContainer(job, { extraEnv });
      containerId = result.containerId;
      await queueManager.addLog(job.id, 'info', `Container started: ${result.name}`);
    } catch (err) {
      await queueManager.addLog(job.id, 'error', `Failed to spawn container: ${err.message}`);
      await queueManager.updateStatus(job.id, 'failed', { error: `Container spawn: ${err.message}` });
      return;
    }

    // --- Phase 1-4: Poll harness state file for phase transitions ---
    let lastPhase = 'starting';
    let deployResult = null;
    const PHASE_POLL_INTERVAL = 3000;
    const CONTAINER_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours max
    const phaseStartTime = Date.now();

    while (Date.now() - phaseStartTime < CONTAINER_TIMEOUT) {
      await new Promise(r => setTimeout(r, PHASE_POLL_INTERVAL));

      // Check container still alive
      const containerStatus = await containerManager.getContainerStatus(containerId);
      if (!containerStatus?.running) {
        const logs = await containerManager.getContainerLogs(containerId);
        await queueManager.addLog(job.id, 'error', `Container died (exit ${containerStatus?.exitCode}): ${logs.slice(-500)}`);
        await queueManager.updateStatus(job.id, 'failed', { error: `Container exited with code ${containerStatus?.exitCode}` });
        return;
      }

      // Read harness state
      const state = containerManager.readHarnessState(job.id);
      if (!state) continue;

      // Track phase transitions
      if (state.current_phase !== lastPhase) {
        const phaseNum = state.current_phase.replace('phase', '');
        if (['1', '2', '3', '4', '5'].includes(phaseNum)) {
          await queueManager.updateStatus(job.id, `phase_${phaseNum}`);
        }
        await queueManager.addLog(job.id, 'info', `Phase transition: ${lastPhase} → ${state.current_phase} (${state.status})`);
        lastPhase = state.current_phase;
      }

      // After phase1: extract game name from idea.json
      if (state.current_phase !== 'phase1' && state.current_phase !== 'starting') {
        try {
          const { readFileSync } = await import('node:fs');
          const ideaPath = `${containerManager.workspacePath}/job-${job.id}/idea.json`;
          const idea = JSON.parse(readFileSync(ideaPath, 'utf-8'));
          const gameName = idea.name || idea.title || idea.gameName || idea.gameTitle;
          if (gameName && gameName !== job.game_name) {
            await queueManager.pool.query('UPDATE jobs SET game_name = $1 WHERE id = $2', [gameName, job.id]);
            job.game_name = gameName;
            await queueManager.addLog(job.id, 'info', `Game named: ${gameName}`);
          }
        } catch { /* non-critical */ }
      }

      // Container signals failure
      if (state.status === 'failed') {
        await queueManager.addLog(job.id, 'error', `Worker signaled failure in ${state.current_phase}`);
        await queueManager.updateStatus(job.id, 'failed', { error: `Worker failed in ${state.current_phase}` });
        return;
      }

      // Container signals completion (all phases + repairs done)
      if (state.status === 'completed') {
        await queueManager.addLog(job.id, 'info', 'Worker signaled completion');
        await queueManager.updateStatus(job.id, 'completed');
        return;
      }

      // Phase 4 complete: game built, time to deploy and start repair loop
      if (containerManager.hasMarkerFile(job.id, 'phase4-complete.marker')) {
        await queueManager.addLog(job.id, 'info', 'Phase 4 complete — deploying game');
        containerManager.removeMarkerFile(job.id, 'phase4-complete.marker');
        break; // Exit phase polling, enter repair loop
      }
    }

    // Check if we timed out
    if (Date.now() - phaseStartTime >= CONTAINER_TIMEOUT) {
      await queueManager.addLog(job.id, 'error', 'Container timed out during phases 1-4');
      try { await containerManager.stopContainer(containerId); } catch { /* ignore */ }
      await queueManager.updateStatus(job.id, 'failed', { error: 'Timeout during phases 1-4' });
      return;
    }

    // --- fs imports and helpers (needed for deploy + repair loop) ---
    const { writeFileSync, readFileSync, existsSync, cpSync, readdirSync, statSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    // Sync workspace root game files to dist/ before deploy/redeploy.
    // Claude sometimes edits at workspace root instead of dist/.
    // Also fixes ../ references in index.html (games reference framework files outside dist/).
    function syncRootToDist(workspaceDir) {
      const distDir = `${workspaceDir}/dist`;
      mkdirSync(distDir, { recursive: true });

      // Copy flat game files from root if newer
      if (existsSync(`${workspaceDir}/index.html`)) {
        for (const f of readdirSync(workspaceDir)) {
          const full = join(workspaceDir, f);
          if (!statSync(full).isFile()) continue;
          if (/\.(html|js|css)$/.test(f)) {
            const distFile = join(distDir, f);
            try {
              if (!existsSync(distFile) || statSync(full).mtimeMs > statSync(distFile).mtimeMs) {
                writeFileSync(distFile, readFileSync(full));
              }
            } catch { /* ignore */ }
          }
        }
      }

      // Copy framework subdirectories into dist/
      for (const dir of ['css', 'core', 'sprites', 'mechanics', 'ui']) {
        const srcDir = join(workspaceDir, dir);
        const destDir = join(distDir, dir);
        if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
          try {
            cpSync(srcDir, destDir, { recursive: true });
          } catch { /* ignore */ }
        }
      }

      // Fix common path issues in all HTML and JS files in dist/
      fixPathsInDir(distDir);
    }

    function fixPathsInDir(dir) {
      try {
        for (const f of readdirSync(dir)) {
          const full = join(dir, f);
          if (statSync(full).isDirectory()) continue;
          if (!/\.(html|js)$/.test(f)) continue;
          try {
            let content = readFileSync(full, 'utf8');
            let fixed = content;
            // Fix ../core/ → core/, ../css/ → css/, etc.
            fixed = fixed.replace(/\.\.\/(core|css|sprites|mechanics|ui)\//g, '$1/');
            // Fix framework/core/ → core/, framework/sprites/ → sprites/, etc.
            fixed = fixed.replace(/framework\/(core|css|sprites|mechanics|ui)\//g, '$1/');
            // Fix bare module specifiers: from 'core/ → from './core/
            fixed = fixed.replace(/from\s+['"](?!\.\/|\.\.\/|https?:)(core|mechanics|ui|sprites)\//g, "from './$1/");
            // Fix src="dist/config.js" → src="config.js" (self-referential dist/ path)
            fixed = fixed.replace(/(?:src|href)="dist\//g, (m) => m.replace('dist/', ''));
            // Fix from './dist/ → from './ (self-referential dist/ import)
            fixed = fixed.replace(/from\s+['"]\.\/dist\//g, "from './");

            // For HTML files: fix <script src="X.js"> loading ES module files
            if (f.endsWith('.html')) {
              // Convert non-module script tags to module tags for files that use export/import
              fixed = fixed.replace(/<script\s+src="([^"]+\.js)">/g, (match, srcPath) => {
                const jsFile = join(dir, srcPath);
                if (existsSync(jsFile)) {
                  const jsContent = readFileSync(jsFile, 'utf8');
                  if (/^\s*(export|import)\s/m.test(jsContent)) {
                    return `<script type="module" src="${srcPath}">`;
                  }
                }
                return match;
              });
              // Ensure window.CONFIG and window.game are set in the module script
              if (!/window\.CONFIG\s*=/.test(fixed) && /import.*CONFIG/.test(fixed)) {
                fixed = fixed.replace(
                  /(import\s+\{[^}]*CONFIG[^}]*\}\s+from\s+['"][^'"]+['"];?)/,
                  '$1\n    window.CONFIG = CONFIG;'
                );
              }
              if (!/window\.game\s*=/.test(fixed) && /(?:new\s+Game|const\s+game)/.test(fixed)) {
                // If game is created but not exposed, add window.game
                fixed = fixed.replace(
                  /((?:const|let|var)\s+game\s*=\s*new\s+\w+)/,
                  '$1'  // Already matched, add after init
                );
                // Try to find where game is created and add window.game after game.start() or game.init()
                if (!/window\.game\s*=/.test(fixed)) {
                  fixed = fixed.replace(
                    /(game\.(?:start|init)\(\);)/,
                    '$1\n    window.game = game;'
                  );
                }
              }
            }

            if (fixed !== content) {
              writeFileSync(full, fixed);
            }
          } catch { /* ignore individual file errors */ }
        }
      } catch { /* ignore */ }
    }

    // --- Deploy the game ---
    try {
      const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
      syncRootToDist(workspaceDir);
      const sourceDir = `${workspaceDir}/dist`;
      deployResult = await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir, { workspaceDir });
      await queueManager.updatePhaseOutput(job.id, 'deployment', deployResult);
      await queueManager.addLog(job.id, 'info', `Deployed to ${deployResult.url}`);
      const games = await deploymentManager.listDeployedGames();
      await deploymentManager.updateGalleryData(games);
    } catch (err) {
      await queueManager.addLog(job.id, 'error', `Deploy error: ${err.message}`);
      await queueManager.updateStatus(job.id, 'completed');
      return;
    }

    // --- Phase 5: Repair loop ---
    await queueManager.updateStatus(job.id, 'phase_5');
    await queueManager.addLog(job.id, 'info', 'Starting Phase 5 repair loop');

    const gameUrl = deployResult.url;
    const testUrl = `http://gamedemo${job.id}`;
    const MAX_REPAIR_ATTEMPTS = 100;
    const GOOD_ENOUGH_SCORE = 7;
    const FAIL_SCORE = 4;
    const repairLog = [];

    function updateScoreBadge(score, attempt) {
      try {
        const altPath = `${deployResult.deployPath}/html/score-badge.js`;
        const js = `(function(){var d=document.createElement('div');d.id='qa-badge';d.style.cssText='position:fixed;top:8px;right:8px;z-index:999999;background:${score>=7?'#22c55e':score>=4?'#eab308':'#ef4444'};color:#fff;padding:6px 14px;border-radius:20px;font:bold 14px/1 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;';d.textContent='Score: ${score}/10 • Repair #${attempt}';var old=document.getElementById('qa-badge');if(old)old.remove();document.body.appendChild(d);})();`;
        writeFileSync(altPath, js);
      } catch { /* non-critical */ }
    }

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

    function updateRepairLog() {
      try {
        const htmlDir = `${deployResult.deployPath}/html`;
        writeFileSync(`${htmlDir}/repair-log.json`, JSON.stringify(repairLog, null, 2));
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

    // Helper: detect if repair loop is plateaued
    let lastStrategyReviewAtAttempt = 0;
    const PLATEAU_WINDOW = 5;
    const PLATEAU_THRESHOLD = 0.5;
    function isPlateaued(attempt) {
      if (repairLog.length < PLATEAU_WINDOW) return false;
      if (attempt - lastStrategyReviewAtAttempt < PLATEAU_WINDOW) return false;
      const recent = repairLog.slice(-PLATEAU_WINDOW);
      const minScore = Math.min(...recent.map(r => r.score));
      const maxScore = Math.max(...recent.map(r => r.score));
      return (maxScore - minScore) < PLATEAU_THRESHOLD;
    }

    // Helper: spawn one-shot container and wait (for strategy review)
    async function spawnAndWait(phase, phaseExtraEnv) {
      job.extraEnv = [...providerEnv, ...phaseExtraEnv];
      const { containerId: cid } = await containerManager.spawnContainer(job, phase);
      let status;
      do {
        await new Promise(r => setTimeout(r, 5000));
        status = await containerManager.getContainerStatus(cid);
      } while (status?.running);
      const logs = await containerManager.getContainerLogs(cid);
      return { status, logs };
    }

    injectBadgeScript();
    updateScoreBadge(0, 0);
    let consecutiveTimeouts = 0;
    const MAX_CONSECUTIVE_TIMEOUTS = 5;
    const REPAIR_WAIT_TIMEOUT = 10 * 60 * 1000; // 10 min max wait per repair
    let bestScore = 0;
    const bestBackupDir = `${containerManager.workspacePath}/job-${job.id}/dist-best`;

    for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      try {
        // Check container still alive before each repair
        const cStatus = await containerManager.getContainerStatus(containerId);
        if (!cStatus?.running) {
          await queueManager.addLog(job.id, 'error', `Worker container died during repair loop (exit ${cStatus?.exitCode})`);
          break;
        }

        await queueManager.addLog(job.id, 'info', `Repair loop iteration ${attempt}/${MAX_REPAIR_ATTEMPTS}: testing ${testUrl}`);
        const thumbnailPath = `${deployResult.deployPath}/html/thumbnail.png`;

        // Build game context for CONFIG-aware testing
        let gameContextPath = null;
        try {
          const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
          const gameContext = await buildGameContext(workspaceDir);
          if (gameContext) {
            gameContextPath = join(workspaceDir, 'game-context.json');
            writeFileSync(gameContextPath, JSON.stringify(gameContext));
          }
        } catch { /* non-critical, test works without it */ }

        const testResult = await runPlaywrightTest(testUrl, { thumbnailPath, gameContextPath });
        const score = testResult.score ?? 0;

        // Detect infrastructure failures
        const isInfraFailure = score === 0 && testResult.defects?.length === 1 &&
          testResult.defects[0]?.description?.includes('ETIMEDOUT');
        if (isInfraFailure) {
          consecutiveTimeouts++;
          if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
            await queueManager.addLog(job.id, 'error', `${MAX_CONSECUTIVE_TIMEOUTS} consecutive test timeouts — bailing out`);
            containerManager.writeToWorkspace(job.id, 'job-failed.marker', 'Infrastructure failure');
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

        // --- BEST VERSION BACKUP ---
        if (score > bestScore) {
          bestScore = score;
          try {
            const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
            const distDir = join(workspaceDir, 'dist');
            cpSync(distDir, bestBackupDir, { recursive: true });
            await queueManager.addLog(job.id, 'info', `New best score ${score} — backed up dist/`);
          } catch (backupErr) {
            await queueManager.addLog(job.id, 'error', `Backup failed: ${backupErr.message}`);
          }
        }

        // --- REGRESSION DETECTION: restore best if score dropped significantly ---
        if (bestScore >= 4 && score < bestScore - 1) {
          await queueManager.addLog(job.id, 'info', `Score regressed ${bestScore} → ${score} — restoring best version`);
          try {
            const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
            const distDir = join(workspaceDir, 'dist');
            if (existsSync(bestBackupDir)) {
              // Restore game files from best backup
              for (const f of ['index.html', 'game.js', 'entities.js', 'config.js']) {
                const src = join(bestBackupDir, f);
                if (existsSync(src)) writeFileSync(join(distDir, f), readFileSync(src));
              }
              // Also copy to workspace dist/ for Claude
              cpSync(bestBackupDir, distDir, { recursive: true });
              await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, distDir, { workspaceDir });
              injectBadgeScript();
              await queueManager.addLog(job.id, 'info', 'Restored best version and redeployed — skipping repair to retest');
            }
          } catch (restoreErr) {
            await queueManager.addLog(job.id, 'error', `Restore failed: ${restoreErr.message}`);
          }
          // Skip repair prompt — retest the restored version on next iteration
          continue;
        }

        // --- PASS GATE: score >= GOOD_ENOUGH_SCORE ---
        if (score >= GOOD_ENOUGH_SCORE) {
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${GOOD_ENOUGH_SCORE}, game passes quality gate`);
          containerManager.writeToWorkspace(job.id, 'job-complete.marker', 'Quality gate passed');
          break;
        }

        if (attempt === MAX_REPAIR_ATTEMPTS) {
          if (score < FAIL_SCORE) {
            await queueManager.addLog(job.id, 'error', `Score ${score} < ${FAIL_SCORE} after ${MAX_REPAIR_ATTEMPTS} attempts, removing game`);
            await deploymentManager.removeGame(job.id);
            containerManager.writeToWorkspace(job.id, 'job-failed.marker', 'Quality gate failed');
            await queueManager.updateStatus(job.id, 'failed', { error: `Quality gate: score ${score}/10 after ${MAX_REPAIR_ATTEMPTS} repair attempts` });
            const games = await deploymentManager.listDeployedGames();
            await deploymentManager.updateGalleryData(games);
            return;
          }
          await queueManager.addLog(job.id, 'info', `Score ${score} >= ${FAIL_SCORE}, keeping game after ${MAX_REPAIR_ATTEMPTS} attempts`);
          containerManager.writeToWorkspace(job.id, 'job-complete.marker', 'Max attempts reached');
          break;
        }

        // --- PLATEAU DETECTION ---
        if (isPlateaued(attempt)) {
          await queueManager.addLog(job.id, 'info', `PLATEAU DETECTED at attempt ${attempt}. Spawning strategy review...`);
          lastStrategyReviewAtAttempt = attempt;

          const history = buildRepairHistory();
          const { status: reviewStatus, logs: reviewLogs } = await spawnAndWait('phase5-strategy', [
            `GAME_URL=${gameUrl}`,
            `DEFECT_REPORT=${history}`,
          ]);

          await queueManager.addLog(job.id, 'info', `Strategy review ${reviewStatus?.exitCode === 0 ? 'completed' : 'failed'}: ${reviewLogs.slice(0, 300)}`);
          await queueManager.updatePhaseOutput(job.id, `strategy_review_${attempt}`, {
            triggeredAt: attempt, score, exitCode: reviewStatus?.exitCode,
            timestamp: new Date().toISOString(),
          });
        }

        // Process improvement disabled — interferes with prompt changes
        // if (typeof globalThis._maybeRunProcessImprovement === 'function') {
        //   globalThis._maybeRunProcessImprovement(job.id).catch(err => {
        //     console.error(`[ProcessImprovement] Trigger failed: ${err.message}`);
        //   });
        // }

        // Write repair prompt into workspace for the persistent session
        await queueManager.addLog(job.id, 'info', `Writing repair prompt (attempt ${attempt})`);

        // --- GDD CONTEXT: Read idea.json to give repair agent game-specific context ---
        let gddContext = '';
        try {
          const ideaPath = `${containerManager.workspacePath}/job-${job.id}/idea.json`;
          if (existsSync(ideaPath)) {
            const idea = JSON.parse(readFileSync(ideaPath, 'utf-8'));
            const parts = ['=== GAME DESIGN CONTEXT ==='];
            if (idea.name || idea.title) parts.push(`Game: ${idea.name || idea.title}`);
            if (idea.theme) parts.push(`Theme: ${idea.theme}`);
            if (idea.genre) parts.push(`Genre: ${idea.genre}`);
            if (idea.coreLoop) parts.push(`Core Loop: ${idea.coreLoop}`);
            if (idea.currencies) {
              const currNames = Array.isArray(idea.currencies)
                ? idea.currencies.map(c => typeof c === 'string' ? c : c.name || c.id).join(', ')
                : Object.keys(idea.currencies).join(', ');
              parts.push(`Currencies: ${currNames}`);
            }
            if (idea.entities) {
              const entNames = Array.isArray(idea.entities)
                ? idea.entities.map(e => typeof e === 'string' ? e : e.name || e.type).join(', ')
                : Object.keys(idea.entities).join(', ');
              parts.push(`Entities: ${entNames}`);
            }
            if (idea.description) parts.push(`Description: ${idea.description}`);
            parts.push('=== END GAME DESIGN CONTEXT ===\n');
            gddContext = parts.join('\n');
          }
        } catch { /* non-critical, proceed without GDD context */ }

        // Format defects as readable list (not raw JSON) for better Claude comprehension
        const defects = testResult.defects || [];
        let defectReport = gddContext + `Score: ${score}/10 (attempt ${attempt})\n\nDefects found:\n`;
        for (const d of defects) {
          defectReport += `  - [${d.severity}] ${d.description}\n`;
          if (d.suggestion) defectReport += `    Suggestion: ${d.suggestion}\n`;
        }

        // Check for missing files referenced in index.html
        const workspaceDir2 = `${containerManager.workspacePath}/job-${job.id}`;
        const distDir2 = join(workspaceDir2, 'dist');
        try {
          const indexPath = join(distDir2, 'index.html');
          if (existsSync(indexPath)) {
            const html = readFileSync(indexPath, 'utf8');
            // Check for imported JS files that don't exist
            const importRefs = [...html.matchAll(/(?:from\s+['"]\.\/|src=")([^'"]+\.js)/g)];
            const missingFiles = [];
            for (const m of importRefs) {
              const refPath = join(distDir2, m[1]);
              if (!existsSync(refPath)) missingFiles.push(m[1]);
            }
            if (missingFiles.length > 0) {
              defectReport += `\n  MISSING FILES in dist/ (these are imported by index.html but do not exist):\n`;
              for (const f of missingFiles) {
                defectReport += `    - ${f} is MISSING — create this file in dist/\n`;
              }
            }
          }
        } catch { /* ignore validation errors */ }

        const userFeedback = await queueManager.getUserFeedback(job.id);
        if (userFeedback) {
          defectReport += `\n\n=== USER FEEDBACK (implement these requests) ===\n${userFeedback}\n=== END USER FEEDBACK ===`;
          await queueManager.addLog(job.id, 'info', `Including user feedback: ${userFeedback.slice(0, 200)}`);
        }

        // Write repair-prompt.txt — on-idle.sh will pick it up
        containerManager.writeToWorkspace(job.id, 'repair-prompt.txt', defectReport);

        // Wait for Claude to finish repair in two phases:
        // Phase A: Wait for state to change to "running" (prompt was picked up)
        // Phase B: Wait for state to change back to "idle" (repair finished)
        const repairStart = Date.now();
        let repairDone = false;
        let sawRunning = false;

        while (Date.now() - repairStart < REPAIR_WAIT_TIMEOUT) {
          await new Promise(r => setTimeout(r, 3000));

          const repairState = containerManager.readHarnessState(job.id);

          // Check for terminal states
          if (repairState?.status === 'completed' || repairState?.status === 'failed') {
            repairDone = true;
            break;
          }

          // Check container still alive
          const cs = await containerManager.getContainerStatus(containerId);
          if (!cs?.running) {
            await queueManager.addLog(job.id, 'error', 'Container died during repair');
            repairDone = true;
            break;
          }

          // Phase A: wait for "running" (prompt picked up by on-idle.sh)
          if (!sawRunning) {
            if (repairState?.status === 'running') {
              sawRunning = true;
              await queueManager.addLog(job.id, 'info', 'Repair prompt picked up by worker');
            }
            // Also check if repair-prompt.txt was consumed (alternative signal)
            if (!containerManager.hasMarkerFile(job.id, 'repair-prompt.txt')) {
              sawRunning = true;
            }
            continue;
          }

          // Phase B: wait for "idle" (repair finished)
          if (repairState?.current_phase === 'phase5' && repairState?.status === 'idle') {
            repairDone = true;
            break;
          }
        }

        if (!repairDone) {
          await queueManager.addLog(job.id, 'error', `Repair wait timed out (${REPAIR_WAIT_TIMEOUT / 1000}s)`);
        }

        // Redeploy the fixed game (sync root→dist first, Claude may edit at root)
        try {
          const workspaceDir = `${containerManager.workspacePath}/job-${job.id}`;
          syncRootToDist(workspaceDir);
          const sourceDir = `${workspaceDir}/dist`;
          await deploymentManager.deployGame(job.id, job.game_name || `Game ${job.id}`, sourceDir, { workspaceDir });
          injectBadgeScript();
          updateScoreBadge(score, attempt);
          await queueManager.addLog(job.id, 'info', `Redeployed after repair attempt ${attempt}`);
        } catch (redeployErr) {
          await queueManager.addLog(job.id, 'error', `Redeploy error: ${redeployErr.message}`);
        }

        // Set state back to idle so on-idle.sh doesn't re-trigger
        // The next repair-prompt.txt write will trigger the next cycle
      } catch (err) {
        await queueManager.addLog(job.id, 'error', `Repair iteration ${attempt} error: ${err.message}`);
      }
    }

    // Signal container to shut down
    containerManager.writeToWorkspace(job.id, 'job-complete.marker', 'Done');
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
          userFeedback: j.user_feedback || null,
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
        if (jd.userFeedback) {
          lines.push(`User feedback:`);
          lines.push(jd.userFeedback);
        }
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
      const { chmodSync } = await import('node:fs');
      const sharedDir = `${containerManager.workspacePath}/shared`;
      const improvementsDir = `${sharedDir}/improvements`;
      mkdirSync(improvementsDir, { recursive: true });
      // Ensure container user can write (same as spawnContainer does for job workspaces)
      try { chmodSync(sharedDir, 0o777); } catch { /* may already be set */ }
      try { chmodSync(improvementsDir, 0o777); } catch { /* may already be set */ }

      // Copy test scripts and prompts into shared workspace for the agent to read
      const scriptsDir = `${sharedDir}/scripts`;
      const promptsDir = `${sharedDir}/prompts`;
      const statusDir = `${sharedDir}/status`;
      mkdirSync(scriptsDir, { recursive: true });
      mkdirSync(promptsDir, { recursive: true });
      mkdirSync(statusDir, { recursive: true });
      for (const d of [scriptsDir, promptsDir, statusDir]) {
        try { chmodSync(d, 0o777); } catch { /* ignore */ }
      }

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

      // Pause job queue while process improvement runs
      if (typeof globalThis._pauseQueue === 'function') globalThis._pauseQueue();

      // Git checkpoint before changes (so we can revert if broken)
      const hostProjectRoot = process.env.HOST_PROJECT_ROOT || '';
      if (hostProjectRoot) {
        try {
          const { execSync } = await import('node:child_process');
          // The backend can't run git on the host directly, but we'll track via the agent
          console.log(`[ProcessImprovement] Host project root: ${hostProjectRoot}`);
        } catch { /* ignore */ }
      }

      const hostSharedDir = `${containerManager.hostWorkspacePath}/shared`;
      const containerName = `gamepocgen-process-improvement-${Date.now()}`;

      // Mount prompts/framework/scripts from host so agent can edit them directly
      const binds = [`${hostSharedDir}:/workspace`];
      if (hostProjectRoot) {
        binds.push(`${hostProjectRoot}/prompts:/home/claude/prompts`);
        binds.push(`${hostProjectRoot}/framework:/home/claude/framework`);
        binds.push(`${hostProjectRoot}/scripts:/home/claude/scripts`);
      }

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
            `ZAI_BASE_URL=${process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic'}`,
            'MODEL=claude-opus-4-6',
            'CLAUDE_CODE_EFFORT_LEVEL=high',
            'WORKSPACE_DIR=/workspace',
            'TIMEOUT_SECONDS=3600',
            'DEFECT_REPORT=See /workspace/cross-job-data.md for full cross-job analysis data.',
          ],
          HostConfig: {
            Memory: 2 * 1024 * 1024 * 1024,
            NanoCpus: 1e9,
            Binds: binds,
            NetworkMode: 'traefik',
          },
        }).then(c => c.start().then(() => resolve(c.id))).catch(reject);
      });

      // Wait for completion (BLOCKING — queue is paused, we must wait)
      try {
        let status;
        do {
          await new Promise(r => setTimeout(r, 10000));
          try {
            const c = containerManager.docker.getContainer(containerId);
            const info = await c.inspect();
            status = { running: info.State.Running, exitCode: info.State.ExitCode };
          } catch {
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
          const logStream = await c.logs({ stdout: true, stderr: true, tail: 30 });
          console.log(`[ProcessImprovement] Agent logs: ${logStream.toString().replace(/[\x00-\x08]/g, '').slice(0, 1000)}`);
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
        console.error(`[ProcessImprovement] Error waiting for agent: ${err.message}`);
      } finally {
        // Always resume queue, even if agent failed
        if (typeof globalThis._resumeQueue === 'function') globalThis._resumeQueue();
      }

    } catch (err) {
      console.error(`[ProcessImprovement] Failed to run: ${err.message}`);
    }
  }

  // Expose the trigger for the repair loop and manual API
  globalThis._maybeRunProcessImprovement = maybeRunProcessImprovement;
  globalThis._resetProcessImprovementCooldown = () => { lastProcessImprovementRun = 0; };

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
