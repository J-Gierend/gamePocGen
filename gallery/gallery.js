/**
 * GamePocGen Gallery
 * Handles password protection and dynamic game listing
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        password: 'gamepoc2024',
        sessionKey: 'gamepocgen_auth',
        apiEndpoint: '/api/games'
    };

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

    /**
     * Check if user is authenticated
     */
    function isAuthenticated() {
        return sessionStorage.getItem(CONFIG.sessionKey) === 'true';
    }

    /**
     * Set authentication state
     */
    function setAuthenticated(value) {
        if (value) {
            sessionStorage.setItem(CONFIG.sessionKey, 'true');
        } else {
            sessionStorage.removeItem(CONFIG.sessionKey);
        }
    }

    /**
     * Validate password
     */
    function validatePassword(input) {
        return input === CONFIG.password;
    }

    /**
     * Show password error
     */
    function showPasswordError() {
        elements.passwordError.classList.add('show');
        elements.passwordInput.value = '';
        elements.passwordInput.focus();

        // Hide error after 3 seconds
        setTimeout(() => {
            elements.passwordError.classList.remove('show');
        }, 3000);
    }

    /**
     * Handle password submission
     */
    function handlePasswordSubmit() {
        const password = elements.passwordInput.value.trim();

        if (validatePassword(password)) {
            setAuthenticated(true);
            showGallery();
        } else {
            showPasswordError();
        }
    }

    /**
     * Show the gallery and load games
     */
    function showGallery() {
        elements.passwordScreen.classList.add('hidden');
        elements.galleryContainer.classList.add('visible');
        loadGames();
    }

    /**
     * Show loading state
     */
    function showLoading() {
        elements.loadingState.style.display = 'block';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'none';
    }

    /**
     * Show error state
     */
    function showError(message) {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'block';
        elements.errorMessage.textContent = message || 'Please try again later.';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'none';
    }

    /**
     * Show empty state
     */
    function showEmpty() {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'block';
        elements.gamesGrid.style.display = 'none';
        elements.gameCount.textContent = '';
    }

    /**
     * Show games grid
     */
    function showGames(games) {
        elements.loadingState.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
        elements.gamesGrid.style.display = 'grid';
        elements.gameCount.textContent = `${games.length} game${games.length !== 1 ? 's' : ''}`;
    }

    /**
     * Create a game card element
     */
    function createGameCard(game) {
        const card = document.createElement('article');
        card.className = 'game-card';

        // Build the game URL
        const gameUrl = game.url || `https://gamedemo${game.id || ''}.namjo-games.com`;

        // Format date if available
        const dateStr = game.createdAt
            ? new Date(game.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            : 'Recently added';

        card.innerHTML = `
            <div class="game-thumbnail">
                ${game.thumbnail
                    ? `<img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title)} thumbnail" loading="lazy">`
                    : '<span class="game-thumbnail-icon">🎮</span>'
                }
            </div>
            <div class="game-info">
                <h3 class="game-title">${escapeHtml(game.title || 'Untitled Game')}</h3>
                ${game.description ? `<p class="game-description">${escapeHtml(game.description)}</p>` : ''}
                <p class="game-meta">${escapeHtml(dateStr)}</p>
                <a href="${escapeHtml(gameUrl)}" class="play-button" target="_blank" rel="noopener">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    Play Now
                </a>
            </div>
        `;

        return card;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Render games to the grid
     */
    function renderGames(games) {
        elements.gamesGrid.innerHTML = '';

        if (!games || games.length === 0) {
            showEmpty();
            return;
        }

        games.forEach(game => {
            const card = createGameCard(game);
            elements.gamesGrid.appendChild(card);
        });

        showGames(games);
    }

    /**
     * Fetch games from API
     */
    async function loadGames() {
        showLoading();

        try {
            const response = await fetch(CONFIG.apiEndpoint);

            if (!response.ok) {
                // If API returns 404, treat as empty (API might not exist yet)
                if (response.status === 404) {
                    renderGames([]);
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Handle different response formats
            const games = Array.isArray(data) ? data : (data.games || []);
            renderGames(games);

        } catch (error) {
            console.error('Failed to load games:', error);

            // If fetch fails entirely (e.g., no API), show empty state instead of error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                renderGames([]);
            } else {
                showError('Unable to connect to the game server.');
            }
        }
    }

    /**
     * Initialize event listeners
     */
    function initEventListeners() {
        // Password submit button
        elements.passwordSubmit.addEventListener('click', handlePasswordSubmit);

        // Enter key on password input
        elements.passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handlePasswordSubmit();
            }
        });
    }

    /**
     * Initialize the gallery
     */
    function init() {
        initEventListeners();

        // Check if already authenticated
        if (isAuthenticated()) {
            showGallery();
        } else {
            // Focus password input
            elements.passwordInput.focus();
        }
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
