/**
 * GamePocGen Gallery
 * Shows all jobs with real-time phase progress, repair scores, and pixel art icons.
 * Polls /api/jobs every 5s for live updates.
 */

(function() {
    'use strict';

    const CONFIG = {
        password: 'gamepoc2024',
        sessionKey: 'gamepocgen_auth',
        apiEndpoint: '/api/jobs',
        pollInterval: 5000,
    };

    // Phase definitions for progress tracking
    const PHASES = [
        { key: 'phase_1', label: 'Idea' },
        { key: 'phase_2', label: 'Design' },
        { key: 'phase_3', label: 'Plan' },
        { key: 'phase_4', label: 'Build' },
        { key: 'phase_5', label: 'QA' },
    ];

    const STATUS_COLORS = {
        queued:    '#64748b',
        running:   '#3b82f6',
        phase_1:   '#f59e0b',
        phase_2:   '#f59e0b',
        phase_3:   '#d97706',
        phase_4:   '#8b5cf6',
        phase_5:   '#6366f1',
        completed: '#22c55e',
        failed:    '#ef4444',
    };

    const STATUS_LABELS = {
        queued:    'Queued',
        running:   'Starting',
        phase_1:   'Ideation',
        phase_2:   'Design',
        phase_3:   'Planning',
        phase_4:   'Building',
        phase_5:   'Testing',
        completed: 'Complete',
        failed:    'Failed',
    };

    // Pixel art icon definitions (16x16 grids, 0=transparent, numbers=palette index)
    const ICONS = {
        pickaxe: {
            grid: [
                [0,0,0,0,0,0,0,0,0,0,0,3,3,3,0,0],
                [0,0,0,0,0,0,0,0,0,0,3,2,2,3,3,0],
                [0,0,0,0,0,0,0,0,0,3,2,1,2,2,3,0],
                [0,0,0,0,0,0,0,0,0,3,2,2,2,3,0,0],
                [0,0,0,0,0,0,0,0,3,3,2,2,3,0,0,0],
                [0,0,0,0,0,0,0,3,0,3,3,3,0,0,0,0],
                [0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,3,4,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,3,4,4,0,0,0,0,0,0,0,0,0],
                [0,0,0,3,4,4,0,0,0,0,0,0,0,0,0,0],
                [0,0,3,4,4,0,0,0,0,0,0,0,0,0,0,0],
                [0,3,4,4,0,0,0,0,0,0,0,0,0,0,0,0],
                [3,4,4,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [3,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            palette: { 1: '#e0e0e0', 2: '#a0a0a0', 3: '#606060', 4: '#8B4513' }
        },
        crystal: {
            grid: [
                [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,1,2,2,1,0,0,0,0,0,0],
                [0,0,0,0,0,1,2,3,3,2,1,0,0,0,0,0],
                [0,0,0,0,1,2,3,4,4,3,2,1,0,0,0,0],
                [0,0,0,1,2,3,4,4,4,4,3,2,1,0,0,0],
                [0,0,1,2,3,4,4,5,5,4,4,3,2,1,0,0],
                [0,0,1,2,3,4,5,5,5,5,4,3,2,1,0,0],
                [0,0,1,2,3,4,5,5,5,5,4,3,2,1,0,0],
                [0,0,1,2,3,4,4,5,5,4,4,3,2,1,0,0],
                [0,0,0,1,2,3,4,4,4,4,3,2,1,0,0,0],
                [0,0,0,1,2,3,3,4,4,3,3,2,1,0,0,0],
                [0,0,0,0,1,2,3,3,3,3,2,1,0,0,0,0],
                [0,0,0,0,1,2,2,3,3,2,2,1,0,0,0,0],
                [0,0,0,0,0,1,2,2,2,2,1,0,0,0,0,0],
                [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            palette: { 1: '#1e3a5f', 2: '#2563eb', 3: '#3b82f6', 4: '#60a5fa', 5: '#bfdbfe' }
        },
        tower: {
            grid: [
                [0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0],
                [0,0,0,0,0,3,2,1,1,2,3,0,0,0,0,0],
                [0,0,0,0,0,3,1,4,4,1,3,0,0,0,0,0],
                [0,0,0,0,0,3,2,1,1,2,3,0,0,0,0,0],
                [0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0],
                [0,0,0,0,3,2,2,1,1,2,2,3,0,0,0,0],
                [0,0,0,0,3,2,1,1,1,1,2,3,0,0,0,0],
                [0,0,0,0,3,2,1,4,4,1,2,3,0,0,0,0],
                [0,0,0,0,3,2,1,4,4,1,2,3,0,0,0,0],
                [0,0,0,0,3,2,1,1,1,1,2,3,0,0,0,0],
                [0,0,0,3,3,3,3,3,3,3,3,3,3,0,0,0],
                [0,0,0,3,2,2,1,1,1,1,2,2,3,0,0,0],
                [0,0,0,3,2,1,1,1,1,1,1,2,3,0,0,0],
                [0,0,0,3,2,1,1,4,4,1,1,2,3,0,0,0],
                [0,0,3,3,3,3,3,3,3,3,3,3,3,3,0,0],
                [0,0,3,3,3,3,3,3,3,3,3,3,3,3,0,0],
            ],
            palette: { 1: '#a0a0a0', 2: '#707070', 3: '#505050', 4: '#2a1a0a' }
        },
        goblin: {
            grid: [
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,3,3,0,0,0,0,3,3,0,0,0,0],
                [0,0,0,3,2,2,3,3,3,3,2,2,3,0,0,0],
                [0,0,3,2,2,2,2,2,2,2,2,2,2,3,0,0],
                [0,0,3,2,1,1,2,2,2,1,1,2,2,3,0,0],
                [0,0,3,2,4,1,2,2,2,4,1,2,2,3,0,0],
                [0,0,3,2,2,2,2,3,2,2,2,2,2,3,0,0],
                [0,0,0,3,2,2,5,5,5,2,2,3,0,0,0,0],
                [0,0,0,3,2,2,2,2,2,2,2,3,0,0,0,0],
                [0,0,0,0,3,3,2,2,2,3,3,0,0,0,0,0],
                [0,0,0,0,0,3,2,2,2,3,0,0,0,0,0,0],
                [0,0,0,0,3,2,2,2,2,2,3,0,0,0,0,0],
                [0,0,0,3,2,2,2,2,2,2,2,3,0,0,0,0],
                [0,0,0,3,2,2,0,0,0,2,2,3,0,0,0,0],
                [0,0,0,3,3,0,0,0,0,0,3,3,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            palette: { 1: '#a8d8a0', 2: '#4a8c3f', 3: '#2d5a27', 4: '#ff3333', 5: '#f5f5dc' }
        },
        shield: {
            grid: [
                [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
                [0,0,0,1,2,2,2,3,3,2,2,2,1,0,0,0],
                [0,0,1,2,2,2,3,4,4,3,2,2,2,1,0,0],
                [0,1,2,2,2,3,4,4,4,4,3,2,2,2,1,0],
                [0,1,2,2,3,4,4,5,5,4,4,3,2,2,1,0],
                [0,1,2,2,3,4,5,5,5,5,4,3,2,2,1,0],
                [0,1,2,2,3,4,5,5,5,5,4,3,2,2,1,0],
                [0,1,2,2,3,4,4,5,5,4,4,3,2,2,1,0],
                [0,1,2,2,3,4,4,4,4,4,4,3,2,2,1,0],
                [0,1,2,2,2,3,4,4,4,4,3,2,2,2,1,0],
                [0,0,1,2,2,3,3,4,4,3,3,2,2,1,0,0],
                [0,0,1,2,2,2,3,3,3,3,2,2,2,1,0,0],
                [0,0,0,1,2,2,2,3,3,2,2,2,1,0,0,0],
                [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
                [0,0,0,0,0,1,1,2,2,1,1,0,0,0,0,0],
                [0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0],
            ],
            palette: { 1: '#4a3520', 2: '#8B4513', 3: '#c0392b', 4: '#e74c3c', 5: '#f1c40f' }
        },
        sword: {
            grid: [
                [0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,1,2,1,0],
                [0,0,0,0,0,0,0,0,0,0,0,1,2,1,0,0],
                [0,0,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
                [0,0,0,0,0,0,0,0,0,1,2,1,0,0,0,0],
                [0,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0],
                [0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0],
                [0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0],
                [0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0],
                [0,0,0,0,1,2,1,0,0,0,0,0,0,0,0,0],
                [0,0,0,3,4,1,0,0,0,0,0,0,0,0,0,0],
                [0,0,3,4,3,4,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,3,5,3,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0],
            ],
            palette: { 1: '#c0c0c0', 2: '#e8e8e8', 3: '#8B4513', 4: '#DAA520', 5: '#654321' }
        },
    };

    const ICON_THEMES = [
        { keywords: [['goblin', 'mine']],          icons: ['goblin', 'pickaxe'], bg: '#1a2e1a', accent: '#4a8c3f' },
        { keywords: [['crystal', 'mine']],          icons: ['pickaxe', 'crystal'],bg: '#2e1a0f', accent: '#d97706' },
        { keywords: [['crystal', 'cavern']],        icons: ['crystal', 'sword'],  bg: '#1a0f2e', accent: '#8b5cf6' },
        { keywords: [['crystal', 'defense']],       icons: ['crystal', 'shield'], bg: '#0f1a2e', accent: '#3b82f6' },
        { keywords: [['goblin']],                   icons: ['goblin', 'sword'],   bg: '#1a2e1a', accent: '#4a8c3f' },
        { keywords: [['crystal'], ['gem']],         icons: ['crystal', 'tower'],  bg: '#0f1a2e', accent: '#3b82f6' },
        { keywords: [['mine'], ['dig'], ['drill']], icons: ['pickaxe', 'crystal'],bg: '#2e1a0f', accent: '#d97706' },
        { keywords: [['tower'], ['turret']],        icons: ['tower', 'shield'],   bg: '#1a1a2e', accent: '#6366f1' },
        { keywords: [['defense'], ['defend']],      icons: ['shield', 'sword'],   bg: '#2e0f1a', accent: '#e11d48' },
        { keywords: [['cavern'], ['cave'], ['dungeon']], icons: ['crystal', 'sword'], bg: '#1a0f2e', accent: '#8b5cf6' },
        { keywords: [['battle'], ['fight'], ['war']],    icons: ['sword', 'shield'],  bg: '#2e1a1a', accent: '#dc2626' },
    ];

    function getIconTheme(title) {
        const lower = (title || '').toLowerCase();
        for (const theme of ICON_THEMES) {
            for (const kwGroup of theme.keywords) {
                if (kwGroup.every(kw => lower.includes(kw))) return theme;
            }
        }
        return { icons: ['crystal', 'tower'], bg: '#1a1a2e', accent: '#6366f1' };
    }

    function renderPixelIcon(canvas, title, gameId) {
        const theme = getIconTheme(title);
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 16) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        const iconNames = theme.icons;
        const pixelSize = Math.floor(Math.min(W, H) / 24);

        for (let idx = 0; idx < iconNames.length; idx++) {
            const iconDef = ICONS[iconNames[idx]];
            if (!iconDef) continue;

            const grid = iconDef.grid;
            const palette = iconDef.palette;
            const gridH = grid.length;
            const gridW = grid[0].length;

            const totalW = iconNames.length * gridW * pixelSize + (iconNames.length - 1) * pixelSize * 2;
            const startX = (W - totalW) / 2 + idx * (gridW * pixelSize + pixelSize * 2);
            const startY = (H - gridH * pixelSize) / 2;

            for (let row = 0; row < gridH; row++) {
                for (let col = 0; col < gridW; col++) {
                    const val = grid[row][col];
                    if (val === 0) continue;
                    ctx.fillStyle = palette[val] || '#fff';
                    ctx.fillRect(
                        Math.floor(startX + col * pixelSize),
                        Math.floor(startY + row * pixelSize),
                        pixelSize,
                        pixelSize
                    );
                }
            }
        }

        const gradient = ctx.createLinearGradient(0, H - 40, 0, H);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, theme.accent + '40');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, H - 40, W, 40);
    }

    // --- DOM ---
    const elements = {
        passwordScreen: document.getElementById('passwordScreen'),
        passwordInput: document.getElementById('passwordInput'),
        passwordSubmit: document.getElementById('passwordSubmit'),
        passwordError: document.getElementById('passwordError'),
        galleryContainer: document.getElementById('galleryContainer'),
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        errorMessage: document.getElementById('errorMessage'),
        emptyState: document.getElementById('emptyState'),
        gamesGrid: document.getElementById('gamesGrid'),
        gameCount: document.getElementById('gameCount'),
    };

    let pollTimer = null;
    let lastJobsJson = '';

    // --- Auth ---
    function isAuthenticated() {
        return sessionStorage.getItem(CONFIG.sessionKey) === 'true';
    }

    function setAuthenticated(value) {
        if (value) sessionStorage.setItem(CONFIG.sessionKey, 'true');
        else sessionStorage.removeItem(CONFIG.sessionKey);
    }

    function showPasswordError() {
        elements.passwordError.classList.add('show');
        elements.passwordInput.value = '';
        elements.passwordInput.focus();
        setTimeout(() => { elements.passwordError.classList.remove('show'); }, 3000);
    }

    function handlePasswordSubmit() {
        const password = elements.passwordInput.value.trim();
        if (password === CONFIG.password) {
            setAuthenticated(true);
            showGallery();
        } else {
            showPasswordError();
        }
    }

    // --- Display States ---
    function showGallery() {
        elements.passwordScreen.classList.add('hidden');
        elements.galleryContainer.classList.add('visible');
        startPolling();
    }

    function showLoading() {
        elements.loadingState.style.display = 'block';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'none';
    }

    function showError(message) {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'block';
        elements.errorMessage.textContent = message || 'Please try again later.';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'none';
    }

    function showEmpty() {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'block';
        elements.gamesGrid.style.display = 'none';
        elements.gameCount.textContent = '';
    }

    function showGrid(jobs) {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'grid';

        const active = jobs.filter(j => !['completed', 'failed'].includes(j.status)).length;
        const total = jobs.length;
        elements.gameCount.textContent = active
            ? `${active} generating / ${total} total`
            : `${total} game${total !== 1 ? 's' : ''}`;
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Job Data Helpers ---
    function getLatestRepairScore(job) {
        if (!job.phase_outputs) return null;
        let latest = null;
        let maxAttempt = 0;
        for (const [key, val] of Object.entries(job.phase_outputs)) {
            const match = key.match(/^repair_(\d+)$/);
            if (match) {
                const attempt = parseInt(match[1], 10);
                if (attempt > maxAttempt) {
                    maxAttempt = attempt;
                    latest = { attempt, score: val.score ?? 0, defectCount: val.defectCount ?? 0 };
                }
            }
        }
        return latest;
    }

    function getPhaseIndex(status) {
        const idx = PHASES.findIndex(p => p.key === status);
        if (idx >= 0) return idx;
        if (status === 'completed') return PHASES.length;
        return -1;
    }

    function scoreColor(score) {
        if (score >= 8) return '#22c55e';
        if (score >= 4) return '#eab308';
        return '#ef4444';
    }

    // --- Card Rendering ---
    function createJobCard(job) {
        const card = document.createElement('article');
        card.className = 'game-card';
        card.dataset.jobId = job.id;

        const statusColor = STATUS_COLORS[job.status] || '#64748b';
        const statusLabel = STATUS_LABELS[job.status] || job.status;
        const deployment = job.phase_outputs?.deployment;
        const gameUrl = deployment?.url;
        const repairInfo = getLatestRepairScore(job);
        const phaseIdx = getPhaseIndex(job.status);
        const isActive = !['completed', 'failed', 'queued'].includes(job.status);

        const dateStr = job.created_at
            ? new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';

        // Phase progress steps
        const phaseDots = PHASES.map((p, i) => {
            let cls = 'phase-step';
            if (job.status === 'completed') cls += ' done';
            else if (job.status === 'failed' && i <= Math.max(0, phaseIdx)) cls += ' done';
            else if (job.status === 'failed') cls += ' pending';
            else if (p.key === job.status) cls += ' active';
            else if (i < phaseIdx) cls += ' done';
            else cls += ' pending';
            return `<div class="${cls}" title="${p.label}"><span class="step-num">${i + 1}</span><span class="step-label">${p.label}</span></div>`;
        }).join('<div class="phase-connector"></div>');

        // Score section
        let scoreHtml = '';
        if (repairInfo) {
            const pct = (repairInfo.score / 10) * 100;
            const color = scoreColor(repairInfo.score);
            scoreHtml = `
                <div class="score-section">
                    <div class="score-header">
                        <span class="score-label">Quality</span>
                        <span class="score-value" style="color:${color}">${repairInfo.score}/10</span>
                    </div>
                    <div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${color}"></div></div>
                    <span class="score-meta">Repair #${repairInfo.attempt}${repairInfo.defectCount ? ' \u00b7 ' + repairInfo.defectCount + ' defect' + (repairInfo.defectCount !== 1 ? 's' : '') : ''}</span>
                </div>`;
        }

        // Action area
        let actionHtml = '';
        if (gameUrl && (job.status === 'completed' || job.status === 'phase_5')) {
            actionHtml = `<a href="${escapeHtml(gameUrl)}" class="play-button" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Play</a>`;
        } else if (job.status === 'failed') {
            const errMsg = job.error ? job.error.substring(0, 60) : 'Generation failed';
            actionHtml = `<span class="fail-label" title="${escapeHtml(job.error || '')}">${escapeHtml(errMsg)}</span>`;
        } else if (isActive) {
            actionHtml = `<span class="generating-label"><span class="pulse-dot"></span>${escapeHtml(statusLabel)}...</span>`;
        }

        card.innerHTML = `
            <div class="game-thumbnail">
                <canvas width="480" height="270"></canvas>
                <div class="status-badge" style="background:${statusColor}">${statusLabel}</div>
            </div>
            <div class="game-info">
                <h3 class="game-title">${escapeHtml(job.game_name || 'Generating...')}</h3>
                <div class="phase-progress">${phaseDots}</div>
                ${scoreHtml}
                <div class="card-footer">
                    ${actionHtml}
                    <span class="game-meta">#${job.id} \u00b7 ${escapeHtml(dateStr)}</span>
                </div>
            </div>`;

        const canvas = card.querySelector('canvas');
        if (canvas) renderPixelIcon(canvas, job.game_name, job.id);

        return card;
    }

    function sortJobs(jobs) {
        const priority = {
            phase_5: 0, phase_4: 1, phase_3: 2, phase_2: 3, phase_1: 4,
            running: 5, queued: 6, completed: 7, failed: 8,
        };
        return jobs.sort((a, b) => {
            const pa = priority[a.status] ?? 99;
            const pb = priority[b.status] ?? 99;
            if (pa !== pb) return pa - pb;
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }

    function renderJobs(jobs) {
        elements.gamesGrid.innerHTML = '';
        if (!jobs || jobs.length === 0) { showEmpty(); return; }
        sortJobs(jobs);
        jobs.forEach(job => elements.gamesGrid.appendChild(createJobCard(job)));
        showGrid(jobs);
    }

    // --- Polling ---
    async function loadJobs() {
        try {
            const response = await fetch(CONFIG.apiEndpoint);
            if (!response.ok) {
                if (response.status === 404) { renderJobs([]); return; }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const jobs = data.jobs || [];

            const newJson = JSON.stringify(jobs);
            if (newJson === lastJobsJson) return;
            lastJobsJson = newJson;

            renderJobs(jobs);
        } catch (error) {
            console.error('Failed to load jobs:', error);
            if (lastJobsJson) return; // Keep showing last known state on transient errors
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                renderJobs([]);
            } else {
                showError('Unable to connect to the game server.');
            }
        }
    }

    function startPolling() {
        showLoading();
        loadJobs();
        pollTimer = setInterval(loadJobs, CONFIG.pollInterval);
    }

    // --- Init ---
    function init() {
        elements.passwordSubmit.addEventListener('click', handlePasswordSubmit);
        elements.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePasswordSubmit();
        });

        if (isAuthenticated()) showGallery();
        else elements.passwordInput.focus();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
