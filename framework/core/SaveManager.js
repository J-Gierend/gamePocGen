/**
 * SaveManager - localStorage persistence for game state
 *
 * Handles saving and loading game state with support for multiple slots,
 * auto-save, and versioning.
 *
 * @example
 * const saves = new SaveManager({
 *   gameId: 'my-idle-game',
 *   autoSaveInterval: 30000 // 30 seconds
 * });
 *
 * // Save state
 * saves.save('slot1', { gold: 1000, level: 5 });
 *
 * // Load state
 * const state = saves.load('slot1');
 *
 * // Auto-save
 * saves.startAutoSave(() => game.getState());
 */
class SaveManager {
  /**
   * Create a SaveManager
   * @param {Object} options
   * @param {string} options.gameId - Unique identifier for this game
   * @param {number} [options.autoSaveInterval=60000] - Auto-save interval in ms
   * @param {string} [options.version='1.0.0'] - Save format version
   * @param {Storage} [options.storage] - Storage backend (default: localStorage)
   */
  constructor(options) {
    this.gameId = options.gameId;
    this.autoSaveInterval = options.autoSaveInterval ?? 60000;
    this.version = options.version ?? '1.0.0';
    this._storage = options.storage ?? this._getStorage();
    this._autoSaveTimer = null;
  }

  /**
   * Get storage backend (with fallback for non-browser environments)
   * @private
   */
  _getStorage() {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    // Fallback for Node.js testing - in-memory storage
    const data = {};
    return {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => { data[key] = value; },
      removeItem: (key) => { delete data[key]; },
      key: (index) => Object.keys(data)[index],
      get length() { return Object.keys(data).length; }
    };
  }

  /**
   * Generate storage key for a slot
   * @private
   */
  _getKey(slot) {
    return `${this.gameId}_${slot}`;
  }

  /**
   * Save state to a slot
   * @param {string} slot - Slot name (e.g., 'slot1', 'auto')
   * @param {Object} state - Game state to save
   * @returns {boolean} Success
   */
  save(slot, state) {
    try {
      const saveData = {
        version: this.version,
        timestamp: Date.now(),
        data: state
      };

      const key = this._getKey(slot);
      this._storage.setItem(key, JSON.stringify(saveData));
      return true;
    } catch (error) {
      console.error('SaveManager: Failed to save:', error);
      return false;
    }
  }

  /**
   * Load state from a slot
   * @param {string} slot - Slot name
   * @returns {Object|null} Saved state or null if not found/invalid
   */
  load(slot) {
    try {
      const key = this._getKey(slot);
      const raw = this._storage.getItem(key);

      if (!raw) return null;

      const saveData = JSON.parse(raw);

      if (!saveData.data) {
        console.warn('SaveManager: Invalid save format (missing data)');
        return null;
      }

      return saveData.data;
    } catch (error) {
      console.error('SaveManager: Failed to load:', error);
      return null;
    }
  }

  /**
   * List all available save slots
   * @returns {string[]} Array of slot names
   */
  listSlots() {
    const slots = [];
    const prefix = `${this.gameId}_`;

    for (let i = 0; i < this._storage.length; i++) {
      const key = this._storage.key(i);
      if (key && key.startsWith(prefix)) {
        const slot = key.slice(prefix.length);
        slots.push(slot);
      }
    }

    return slots;
  }

  /**
   * Delete a save slot
   * @param {string} slot - Slot name to delete
   */
  deleteSave(slot) {
    const key = this._getKey(slot);
    this._storage.removeItem(key);
  }

  /**
   * Get save metadata (timestamp, version) without loading full state
   * @param {string} slot - Slot name
   * @returns {Object|null} Metadata or null
   */
  getMetadata(slot) {
    try {
      const key = this._getKey(slot);
      const raw = this._storage.getItem(key);

      if (!raw) return null;

      const saveData = JSON.parse(raw);
      return {
        version: saveData.version,
        timestamp: saveData.timestamp,
        date: new Date(saveData.timestamp)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Start auto-saving at the configured interval
   * @param {Function} getStateFn - Function that returns current game state
   * @param {string} [slot='auto'] - Slot to save to
   */
  startAutoSave(getStateFn, slot = 'auto') {
    this.stopAutoSave();

    this._autoSaveTimer = setInterval(() => {
      const state = getStateFn();
      this.save(slot, state);
    }, this.autoSaveInterval);
  }

  /**
   * Stop auto-saving
   */
  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  /**
   * Export save as base64 string (for sharing/backup)
   * @param {string} slot - Slot to export
   * @returns {string|null} Base64 encoded save or null
   */
  exportSave(slot) {
    const key = this._getKey(slot);
    const raw = this._storage.getItem(key);

    if (!raw) return null;

    try {
      return btoa(raw);
    } catch {
      // btoa not available (Node.js)
      return Buffer.from(raw).toString('base64');
    }
  }

  /**
   * Import save from base64 string
   * @param {string} slot - Slot to import to
   * @param {string} data - Base64 encoded save
   * @returns {boolean} Success
   */
  importSave(slot, data) {
    try {
      let raw;
      try {
        raw = atob(data);
      } catch {
        // atob not available (Node.js)
        raw = Buffer.from(data, 'base64').toString();
      }

      // Validate it's valid JSON
      const parsed = JSON.parse(raw);
      if (!parsed.data) {
        throw new Error('Invalid save format');
      }

      const key = this._getKey(slot);
      this._storage.setItem(key, raw);
      return true;
    } catch (error) {
      console.error('SaveManager: Failed to import:', error);
      return false;
    }
  }
}

export { SaveManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.SaveManager = SaveManager;
}
