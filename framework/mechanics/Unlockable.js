/**
 * Unlockable - Conditional unlock system for idle/incremental games
 *
 * Manages features/content that unlock when certain conditions are met.
 * Once unlocked, items stay unlocked permanently (until save reset).
 *
 * @example
 * import { UnlockManager } from './Unlockable.js';
 *
 * const unlocks = new UnlockManager();
 * unlocks.register({
 *   id: 'prestige_tab',
 *   name: 'Prestige Tab',
 *   condition: () => currencies.get('gold').amount.gte(1000),
 *   onUnlock: () => ui.showTab('prestige')
 * });
 * unlocks.check(); // Call periodically to evaluate conditions
 */

class UnlockManager {
  constructor() {
    /** @type {Map<string, {id: string, name: string, condition: Function, onUnlock?: Function, unlocked: boolean}>} */
    this._unlockables = new Map();
  }

  /**
   * Register a new unlockable
   * @param {Object} config
   * @param {string} config.id - Unique identifier
   * @param {string} config.name - Display name
   * @param {Function} config.condition - Function returning true when condition is met
   * @param {Function} [config.onUnlock] - Callback fired once when unlocked
   */
  register({ id, name, condition, onUnlock }) {
    this._unlockables.set(id, { id, name, condition, onUnlock, unlocked: false });
  }

  /**
   * Check all conditions and fire unlocks for newly met conditions
   * @returns {string[]} Array of newly unlocked IDs
   */
  check() {
    const newlyUnlocked = [];

    for (const unlockable of this._unlockables.values()) {
      if (unlockable.unlocked) continue;

      try {
        if (unlockable.condition()) {
          unlockable.unlocked = true;
          newlyUnlocked.push(unlockable.id);

          if (unlockable.onUnlock) {
            unlockable.onUnlock();
          }
        }
      } catch (error) {
        // Condition threw an error - skip this unlockable
        console.error(`UnlockManager: Error checking condition for "${unlockable.id}":`, error);
      }
    }

    return newlyUnlocked;
  }

  /**
   * Check if a specific item is unlocked
   * @param {string} id - Unlockable identifier
   * @returns {boolean}
   */
  isUnlocked(id) {
    const unlockable = this._unlockables.get(id);
    if (!unlockable) return false;
    return unlockable.unlocked;
  }

  /**
   * Serialize unlock states for saving
   * @returns {Object} Map of id -> unlocked boolean
   */
  serialize() {
    const data = {};
    for (const [id, unlockable] of this._unlockables) {
      data[id] = unlockable.unlocked;
    }
    return data;
  }

  /**
   * Deserialize unlock states from saved data
   * Does NOT fire onUnlock callbacks (those only fire on fresh unlocks)
   * @param {Object} data - Map of id -> unlocked boolean
   */
  deserialize(data) {
    for (const [id, unlocked] of Object.entries(data)) {
      const unlockable = this._unlockables.get(id);
      if (unlockable && typeof unlocked === 'boolean') {
        unlockable.unlocked = unlocked;
      }
    }
  }
}

export { UnlockManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.UnlockManager = UnlockManager;
}
