/**
 * GameLoop - Game tick and render system
 *
 * Provides a decoupled game loop with fixed-timestep logic updates
 * and variable-timestep rendering using requestAnimationFrame.
 *
 * @example
 * const loop = new GameLoop({ tickRate: 20 }); // 20 ticks/second
 *
 * loop.onTick((deltaTime) => {
 *   // Update game logic
 *   player.update(deltaTime);
 * });
 *
 * loop.onRender((deltaTime) => {
 *   // Render to canvas
 *   renderer.draw();
 * });
 *
 * loop.start();
 */
class GameLoop {
  /**
   * Create a GameLoop
   * @param {Object} [options]
   * @param {number} [options.tickRate=20] - Logic updates per second
   */
  constructor(options = {}) {
    this.tickRate = options.tickRate ?? 20;
    this._tickInterval = 1000 / this.tickRate;

    /** @type {Set<Function>} */
    this._tickHandlers = new Set();
    /** @type {Set<Function>} */
    this._renderHandlers = new Set();

    this._running = false;
    this._tickTimer = null;
    this._animationFrame = null;

    this._lastTickTime = 0;
    this._lastRenderTime = 0;
  }

  /**
   * Register a tick handler (called at fixed rate)
   * @param {Function} callback - Handler receiving deltaTime in seconds
   * @returns {Function} Unsubscribe function
   */
  onTick(callback) {
    this._tickHandlers.add(callback);
    return () => this._tickHandlers.delete(callback);
  }

  /**
   * Register a render handler (called every animation frame)
   * @param {Function} callback - Handler receiving deltaTime in seconds
   * @returns {Function} Unsubscribe function
   */
  onRender(callback) {
    this._renderHandlers.add(callback);
    return () => this._renderHandlers.delete(callback);
  }

  /**
   * Start the game loop
   */
  start() {
    if (this._running) return;
    this._running = true;

    this._lastTickTime = performance.now();
    this._lastRenderTime = performance.now();

    // Start tick loop (fixed timestep)
    this._tickTimer = setInterval(() => {
      this._tick();
    }, this._tickInterval);

    // Start render loop (variable timestep via rAF)
    this._scheduleRender();
  }

  /**
   * Stop the game loop
   */
  stop() {
    this._running = false;

    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }

    if (this._animationFrame) {
      this._cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }
  }

  /**
   * Check if the loop is running
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * Process a tick
   * @private
   */
  _tick() {
    const now = performance.now();
    const deltaTime = (now - this._lastTickTime) / 1000; // Convert to seconds
    this._lastTickTime = now;

    for (const handler of this._tickHandlers) {
      try {
        handler(deltaTime);
      } catch (error) {
        console.error('GameLoop: Error in tick handler:', error);
      }
    }
  }

  /**
   * Process a render frame
   * @private
   */
  _render() {
    if (!this._running) return;

    const now = performance.now();
    const deltaTime = (now - this._lastRenderTime) / 1000; // Convert to seconds
    this._lastRenderTime = now;

    for (const handler of this._renderHandlers) {
      try {
        handler(deltaTime);
      } catch (error) {
        console.error('GameLoop: Error in render handler:', error);
      }
    }

    // Schedule next frame
    this._scheduleRender();
  }

  /**
   * Schedule the next render frame
   * @private
   */
  _scheduleRender() {
    this._animationFrame = this._requestAnimationFrame(() => this._render());
  }

  /**
   * Cross-environment requestAnimationFrame
   * @private
   */
  _requestAnimationFrame(callback) {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(callback);
    }
    // Fallback for Node.js
    return setTimeout(callback, 16);
  }

  /**
   * Cross-environment cancelAnimationFrame
   * @private
   */
  _cancelAnimationFrame(id) {
    if (typeof cancelAnimationFrame !== 'undefined') {
      return cancelAnimationFrame(id);
    }
    // Fallback for Node.js
    return clearTimeout(id);
  }

  /**
   * Get current tick rate
   * @returns {number}
   */
  getTickRate() {
    return this.tickRate;
  }

  /**
   * Set tick rate (takes effect immediately)
   * @param {number} rate - New ticks per second
   */
  setTickRate(rate) {
    this.tickRate = rate;
    this._tickInterval = 1000 / rate;

    // Restart tick timer if running
    if (this._running && this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = setInterval(() => {
        this._tick();
      }, this._tickInterval);
    }
  }
}

export { GameLoop };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.GameLoop = GameLoop;
}
