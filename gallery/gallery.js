/**
 * GamePocGen Gallery
 * Shows all jobs with real-time phase progress, repair scores, and unique procedural thumbnails.
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

    const PHASES = [
        { key: 'phase_1', label: 'Idea' },
        { key: 'phase_2', label: 'Design' },
        { key: 'phase_3', label: 'Plan' },
        { key: 'phase_4', label: 'Build' },
        { key: 'phase_5', label: 'QA' },
    ];

    const STATUS_COLORS = {
        queued: '#64748b', running: '#3b82f6',
        phase_1: '#f59e0b', phase_2: '#f59e0b', phase_3: '#d97706',
        phase_4: '#8b5cf6', phase_5: '#6366f1',
        completed: '#22c55e', failed: '#ef4444',
    };

    const STATUS_LABELS = {
        queued: 'Queued', running: 'Starting',
        phase_1: 'Ideation', phase_2: 'Design', phase_3: 'Planning',
        phase_4: 'Building', phase_5: 'Testing',
        completed: 'Complete', failed: 'Failed',
    };

    // --- Procedural thumbnail generator (seeded by job ID) ---
    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return '#' + f(0) + f(8) + f(4);
    }

    function renderProceduralThumbnail(canvas, jobId, gameName) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const rng = seededRandom(jobId * 7919 + 131);

        // Unique hue per game
        const baseHue = Math.floor(rng() * 360);
        const bgColor = hslToHex(baseHue, 30, 8);
        const accentHue = (baseHue + 120 + Math.floor(rng() * 60)) % 360;

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, W, H);

        // Grid pattern (subtle)
        const gridSize = 12 + Math.floor(rng() * 12);
        ctx.strokeStyle = `hsla(${baseHue}, 20%, 20%, 0.15)`;
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Style variation
        const style = Math.floor(rng() * 5);

        if (style === 0) {
            // Terrain: layered mountains
            for (let layer = 0; layer < 4; layer++) {
                const y0 = H * (0.3 + layer * 0.18);
                const lightness = 12 + layer * 5;
                ctx.fillStyle = hslToHex(baseHue, 25 - layer * 3, lightness);
                ctx.beginPath();
                ctx.moveTo(0, H);
                for (let x = 0; x <= W; x += 8) {
                    const noise = Math.sin(x * 0.02 + layer * 2 + rng() * 0.5) * 40 +
                                  Math.sin(x * 0.005 + rng() * 10) * 20;
                    ctx.lineTo(x, y0 + noise);
                }
                ctx.lineTo(W, H);
                ctx.fill();
            }
            // Stars
            for (let i = 0; i < 30; i++) {
                const sx = rng() * W;
                const sy = rng() * H * 0.4;
                const size = 1 + rng() * 2;
                ctx.fillStyle = `hsla(${(baseHue + 60) % 360}, 60%, ${70 + rng() * 30}%, ${0.3 + rng() * 0.7})`;
                ctx.fillRect(sx, sy, size, size);
            }
        } else if (style === 1) {
            // Dungeon grid: rooms and corridors
            const cellW = Math.floor(W / 8);
            const cellH = Math.floor(H / 5);
            for (let cy = 0; cy < 5; cy++) {
                for (let cx = 0; cx < 8; cx++) {
                    if (rng() > 0.45) {
                        const x = cx * cellW + 2;
                        const y = cy * cellH + 2;
                        const w = cellW - 4;
                        const h = cellH - 4;
                        const l = 15 + rng() * 10;
                        ctx.fillStyle = hslToHex(baseHue, 20, l);
                        ctx.fillRect(x, y, w, h);
                        // Door
                        if (rng() > 0.5 && cx < 7) {
                            ctx.fillStyle = hslToHex(accentHue, 50, 30);
                            ctx.fillRect(x + w, y + h / 3, 4, h / 3);
                        }
                    }
                }
            }
            // Accent glow
            const gx = W * (0.3 + rng() * 0.4);
            const gy = H * (0.3 + rng() * 0.4);
            const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 80);
            grad.addColorStop(0, `hsla(${accentHue}, 80%, 50%, 0.25)`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        } else if (style === 2) {
            // Crystal field
            for (let i = 0; i < 12; i++) {
                const cx = rng() * W;
                const cy = H * 0.3 + rng() * H * 0.6;
                const h = 20 + rng() * 60;
                const w = 6 + rng() * 14;
                const hue = (accentHue + rng() * 40 - 20) % 360;
                ctx.fillStyle = hslToHex(hue, 60, 30 + rng() * 20);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx - w / 2, cy + h);
                ctx.lineTo(cx + w / 2, cy + h);
                ctx.fill();
                // Highlight
                ctx.fillStyle = hslToHex(hue, 70, 55 + rng() * 15);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx - w / 4, cy + h * 0.6);
                ctx.lineTo(cx + w / 6, cy + h * 0.4);
                ctx.fill();
            }
            // Ground
            ctx.fillStyle = hslToHex(baseHue, 15, 10);
            ctx.fillRect(0, H * 0.85, W, H * 0.15);
        } else if (style === 3) {
            // Circuit board / tech pattern
            ctx.strokeStyle = hslToHex(accentHue, 50, 25);
            ctx.lineWidth = 2;
            for (let i = 0; i < 15; i++) {
                const x1 = Math.floor(rng() * W / 20) * 20;
                const y1 = Math.floor(rng() * H / 20) * 20;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                let cx = x1, cy = y1;
                for (let s = 0; s < 5; s++) {
                    if (rng() > 0.5) cx += (rng() > 0.5 ? 1 : -1) * 20 * (1 + Math.floor(rng() * 3));
                    else cy += (rng() > 0.5 ? 1 : -1) * 20 * (1 + Math.floor(rng() * 3));
                    ctx.lineTo(cx, cy);
                }
                ctx.stroke();
                // Node
                ctx.fillStyle = hslToHex(accentHue, 70, 45);
                ctx.fillRect(cx - 3, cy - 3, 6, 6);
            }
            // Center glow
            const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 3);
            grad.addColorStop(0, `hsla(${accentHue}, 60%, 40%, 0.15)`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        } else {
            // Particle nebula
            for (let i = 0; i < 200; i++) {
                const px = rng() * W;
                const py = rng() * H;
                const size = 1 + rng() * 4;
                const hue = (baseHue + rng() * 60 - 30) % 360;
                const dist = Math.hypot(px - W / 2, py - H / 2) / (W / 2);
                const alpha = Math.max(0, 0.6 - dist * 0.5) * rng();
                ctx.fillStyle = `hsla(${hue}, 70%, ${40 + rng() * 30}%, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }
            // Bright center
            const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 4);
            grad.addColorStop(0, `hsla(${accentHue}, 80%, 60%, 0.3)`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // Bottom gradient fade
        const bottomGrad = ctx.createLinearGradient(0, H - 50, 0, H);
        bottomGrad.addColorStop(0, 'transparent');
        bottomGrad.addColorStop(1, bgColor);
        ctx.fillStyle = bottomGrad;
        ctx.fillRect(0, H - 50, W, 50);

        // Job ID watermark
        ctx.fillStyle = `hsla(${baseHue}, 20%, 40%, 0.3)`;
        ctx.font = 'bold 48px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`#${jobId}`, W / 2, H / 2 + 16);
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
        const ls = job.phase_outputs.latest_score;
        if (ls) return { attempt: ls.attempt, score: ls.score ?? 0, defectCount: ls.defectCount ?? 0 };
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

    function getLatestDefects(job) {
        if (!job.phase_outputs) return [];
        // Find the highest repair_N with defects array
        let maxAttempt = 0;
        let defects = [];
        for (const [key, val] of Object.entries(job.phase_outputs)) {
            const match = key.match(/^repair_(\d+)$/);
            if (match && val.defects) {
                const attempt = parseInt(match[1], 10);
                if (attempt > maxAttempt) {
                    maxAttempt = attempt;
                    defects = val.defects;
                }
            }
        }
        return defects;
    }

    function getScoreHistory(job) {
        if (!job.phase_outputs) return [];
        const history = [];
        for (const [key, val] of Object.entries(job.phase_outputs)) {
            const match = key.match(/^repair_(\d+)$/);
            if (match) {
                history.push({ attempt: parseInt(match[1], 10), score: val.score ?? 0 });
            }
        }
        return history.sort((a, b) => a.attempt - b.attempt);
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

    // --- Score sparkline (mini chart of repair progress) ---
    function renderSparkline(container, history) {
        if (!history.length) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 24');
        svg.setAttribute('class', 'sparkline');

        const maxScore = 10;
        const points = history.map((h, i) => {
            const x = history.length === 1 ? 50 : (i / (history.length - 1)) * 96 + 2;
            const y = 22 - (h.score / maxScore) * 20;
            return `${x},${y}`;
        });

        // Area fill
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const lastScore = history[history.length - 1].score;
        const color = scoreColor(lastScore);
        area.setAttribute('points', `2,22 ${points.join(' ')} 98,22`);
        area.setAttribute('fill', color);
        area.setAttribute('opacity', '0.15');
        svg.appendChild(area);

        // Line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        line.setAttribute('points', points.join(' '));
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(line);

        // Current score dot
        const lastPt = points[points.length - 1].split(',');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', lastPt[0]);
        dot.setAttribute('cy', lastPt[1]);
        dot.setAttribute('r', '2.5');
        dot.setAttribute('fill', color);
        svg.appendChild(dot);

        container.appendChild(svg);
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
        const defects = getLatestDefects(job);
        const scoreHistory = getScoreHistory(job);
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

        // Score section with sparkline + defect list
        let scoreHtml = '';
        if (repairInfo) {
            const pct = (repairInfo.score / 10) * 100;
            const color = scoreColor(repairInfo.score);

            // Defect pills
            let defectHtml = '';
            if (defects.length > 0) {
                const defectItems = defects.slice(0, 4).map(d => {
                    const text = typeof d === 'string' ? d : (d.description || '');
                    const severity = text.match(/^\[(critical|major|minor)\]/)?.[1] || 'major';
                    const label = text.replace(/^\[(critical|major|minor)\]\s*/, '').substring(0, 60);
                    const sevColor = severity === 'critical' ? '#ef4444' : severity === 'major' ? '#f59e0b' : '#64748b';
                    return `<div class="defect-item" title="${escapeHtml(text)}"><span class="defect-sev" style="color:${sevColor}">${severity[0].toUpperCase()}</span> ${escapeHtml(label)}</div>`;
                }).join('');
                const moreCount = defects.length > 4 ? `<div class="defect-more">+${defects.length - 4} more</div>` : '';
                defectHtml = `<div class="defect-list">${defectItems}${moreCount}</div>`;
            }

            // Repair log link
            let logLinkHtml = '';
            if (gameUrl) {
                logLinkHtml = `<a href="${escapeHtml(gameUrl)}/repair-log.html" class="repair-log-link" target="_blank" rel="noopener">View repair log</a>`;
            }

            scoreHtml = `
                <div class="score-section">
                    <div class="score-header">
                        <span class="score-label">Quality</span>
                        <span class="score-value" style="color:${color}">${repairInfo.score}/10</span>
                    </div>
                    <div class="score-bar"><div class="score-fill" style="width:${pct}%;background:${color}"></div></div>
                    <div class="score-meta-row">
                        <span class="score-meta">Repair #${repairInfo.attempt}${repairInfo.defectCount ? ' \u00b7 ' + repairInfo.defectCount + ' defect' + (repairInfo.defectCount !== 1 ? 's' : '') : ''}</span>
                        ${logLinkHtml}
                    </div>
                    <div class="sparkline-container"></div>
                    ${defectHtml}
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

        // Render unique thumbnail
        const canvas = card.querySelector('canvas');
        if (canvas) renderProceduralThumbnail(canvas, job.id, job.game_name);

        // Render sparkline
        if (scoreHistory.length > 1) {
            const sparkContainer = card.querySelector('.sparkline-container');
            if (sparkContainer) renderSparkline(sparkContainer, scoreHistory);
        }

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

    // --- Process Improvement Timeline ---
    let lastImprovementsJson = '';

    async function loadImprovements() {
        try {
            const res = await fetch('/api/improvements');
            if (!res.ok) return;
            const data = await res.json();
            const json = JSON.stringify(data);
            if (json === lastImprovementsJson) return;
            lastImprovementsJson = json;
            renderImprovements(data);
        } catch { /* non-critical */ }
    }

    function renderImprovements(data) {
        const container = document.getElementById('improvementsTimeline');
        if (!container) return;

        const reports = (data.log?.reports || []).slice().reverse(); // newest first
        const fullReports = data.reports || [];

        if (reports.length === 0) {
            container.innerHTML = '<div class="improvements-empty">No process improvement reports yet. The system will auto-analyze when repair loops plateau.</div>';
            return;
        }

        const items = reports.map((r, idx) => {
            const date = r.timestamp ? new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?';
            const findings = (r.findings || []).slice(0, 3).map(f => `<li>${escapeHtml(f)}</li>`).join('');
            const recs = (r.recommendations || []).slice(0, 3).map(r2 => `<li>${escapeHtml(r2)}</li>`).join('');
            const avgScore = r.avgScore ? r.avgScore.toFixed(1) : '?';
            const jobCount = r.jobsAnalyzed?.length || 0;
            const isLatest = idx === 0;

            // Find matching full report for expandable detail
            const fullReport = fullReports.find(fr => fr.filename && fr.filename.includes(r.timestamp?.split('T')[0]));
            const detailId = `imp-detail-${r.id || idx}`;

            return `
            <div class="improvement-item${isLatest ? ' latest' : ''}">
                <div class="imp-marker"><div class="imp-dot${isLatest ? ' pulse' : ''}"></div></div>
                <div class="imp-content">
                    <div class="imp-header">
                        <span class="imp-title">Report #${r.id || idx + 1}</span>
                        <span class="imp-date">${date}</span>
                    </div>
                    <div class="imp-stats">
                        <span class="imp-stat">${jobCount} jobs analyzed</span>
                        <span class="imp-stat">Avg score: <strong>${avgScore}/10</strong></span>
                    </div>
                    ${findings ? `<div class="imp-section"><span class="imp-label">Findings</span><ul>${findings}</ul></div>` : ''}
                    ${recs ? `<div class="imp-section"><span class="imp-label">Recommendations</span><ul>${recs}</ul></div>` : ''}
                    ${fullReport ? `<button class="imp-expand" onclick="this.nextElementSibling.classList.toggle('hidden');this.textContent=this.nextElementSibling.classList.contains('hidden')?'Show full report':'Hide report'">Show full report</button><div id="${detailId}" class="imp-full-report hidden"><pre>${escapeHtml(fullReport.content)}</pre></div>` : ''}
                </div>
            </div>`;
        }).join('');

        container.innerHTML = items;
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
            if (lastJobsJson) return;
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
        loadImprovements();
        pollTimer = setInterval(() => { loadJobs(); loadImprovements(); }, CONFIG.pollInterval);
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
