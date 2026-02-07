/**
 * GamePocGen Gallery
 * Handles password protection, dynamic game listing, and pixel art icon generation
 */

(function() {
    'use strict';

    const CONFIG = {
        password: 'gamepoc2024',
        sessionKey: 'gamepocgen_auth',
        apiEndpoint: '/api/games'
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

    // Map game title keywords to icon combos + background colors
    // More specific compound matches come first, then single-keyword fallbacks
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

    /**
     * Pick icon theme based on game title. Compound keyword matches checked first.
     */
    function getIconTheme(title) {
        const lower = (title || '').toLowerCase();
        for (const theme of ICON_THEMES) {
            // Each entry in keywords is an array of words that ALL must match
            for (const kwGroup of theme.keywords) {
                if (kwGroup.every(kw => lower.includes(kw))) {
                    return theme;
                }
            }
        }
        // Default fallback
        return { icons: ['crystal', 'tower'], bg: '#1a1a2e', accent: '#6366f1' };
    }

    /**
     * Render a pixel art icon onto a canvas
     */
    function renderPixelIcon(canvas, title, gameId) {
        const theme = getIconTheme(title);
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        // Background gradient
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, W, H);

        // Subtle grid pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 16) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Draw two icons side by side
        const iconNames = theme.icons;
        const pixelSize = Math.floor(Math.min(W, H) / 24);

        for (let idx = 0; idx < iconNames.length; idx++) {
            const iconDef = ICONS[iconNames[idx]];
            if (!iconDef) continue;

            const grid = iconDef.grid;
            const palette = iconDef.palette;
            const gridH = grid.length;
            const gridW = grid[0].length;

            // Position: center both icons, offset horizontally
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

        // Accent glow at bottom
        const gradient = ctx.createLinearGradient(0, H - 40, 0, H);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, theme.accent + '40');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, H - 40, W, 40);
    }

    // DOM Elements
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
        gameCount: document.getElementById('gameCount')
    };

    function isAuthenticated() {
        return sessionStorage.getItem(CONFIG.sessionKey) === 'true';
    }

    function setAuthenticated(value) {
        if (value) {
            sessionStorage.setItem(CONFIG.sessionKey, 'true');
        } else {
            sessionStorage.removeItem(CONFIG.sessionKey);
        }
    }

    function validatePassword(input) {
        return input === CONFIG.password;
    }

    function showPasswordError() {
        elements.passwordError.classList.add('show');
        elements.passwordInput.value = '';
        elements.passwordInput.focus();
        setTimeout(() => { elements.passwordError.classList.remove('show'); }, 3000);
    }

    function handlePasswordSubmit() {
        const password = elements.passwordInput.value.trim();
        if (validatePassword(password)) {
            setAuthenticated(true);
            showGallery();
        } else {
            showPasswordError();
        }
    }

    function showGallery() {
        elements.passwordScreen.classList.add('hidden');
        elements.galleryContainer.classList.add('visible');
        loadGames();
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

    function showGames(games) {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'grid';
        elements.gameCount.textContent = `${games.length} game${games.length !== 1 ? 's' : ''}`;
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function createGameCard(game) {
        const card = document.createElement('article');
        card.className = 'game-card';

        const gameUrl = game.url || `https://gamedemo${game.gameId || game.id || ''}.namjo-games.com`;
        const dateStr = game.createdAt
            ? new Date(game.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Recently added';

        card.innerHTML = `
            <div class="game-thumbnail">
                <canvas width="480" height="270"></canvas>
            </div>
            <div class="game-info">
                <h3 class="game-title">${escapeHtml(game.title || 'Untitled Game')}</h3>
                ${game.description ? `<p class="game-description">${escapeHtml(game.description)}</p>` : ''}
                <p class="game-meta">${escapeHtml(dateStr)}</p>
                <a href="${escapeHtml(gameUrl)}" class="play-button" target="_blank" rel="noopener">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    Play Now
                </a>
            </div>
        `;

        // Render pixel art icon on the canvas
        const canvas = card.querySelector('canvas');
        if (canvas) {
            renderPixelIcon(canvas, game.title, game.gameId || game.id);
        }

        return card;
    }

    function renderGames(games) {
        elements.gamesGrid.innerHTML = '';
        if (!games || games.length === 0) { showEmpty(); return; }
        // Sort by date descending (newest first)
        games.sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return db - da;
        });
        games.forEach(game => { elements.gamesGrid.appendChild(createGameCard(game)); });
        showGames(games);
    }

    async function loadGames() {
        showLoading();
        try {
            const response = await fetch(CONFIG.apiEndpoint);
            if (!response.ok) {
                if (response.status === 404) { renderGames([]); return; }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const games = Array.isArray(data) ? data : (data.games || []);
            renderGames(games);
        } catch (error) {
            console.error('Failed to load games:', error);
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                renderGames([]);
            } else {
                showError('Unable to connect to the game server.');
            }
        }
    }

    function initEventListeners() {
        elements.passwordSubmit.addEventListener('click', handlePasswordSubmit);
        elements.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handlePasswordSubmit();
        });
    }

    function init() {
        initEventListeners();
        if (isAuthenticated()) { showGallery(); } else { elements.passwordInput.focus(); }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
