/**
 * Multiplier - Multiplier stacking system for idle/incremental games
 *
 * Manages additive and multiplicative bonuses that stack together.
 * Additive bonuses are summed first (base + add1 + add2 + ...),
 * then multiplicative bonuses are applied ((sum) * mul1 * mul2 * ...).
 *
 * @example
 * import { MultiplierManager } from './Multiplier.js';
 *
 * const multipliers = new MultiplierManager();
 * multipliers.register('upgrade1', { source: 'shop', target: 'gold_production', type: 'add', value: 2 });
 * multipliers.register('prestige1', { source: 'prestige', target: 'gold_production', type: 'multiply', value: 3 });
 * const total = multipliers.getMultiplier('gold_production'); // (1 + 2) * 3 = 9
 */

class MultiplierManager {
  constructor() {
    /** @type {Map<string, {id: string, source: string, target: string, type: string, value: number, enabled: boolean}>} */
    this._multipliers = new Map();
  }

  /**
   * Register a multiplier
   * @param {string} id - Unique multiplier identifier
   * @param {Object} config
   * @param {string} config.source - What provides this multiplier
   * @param {string} config.target - What this multiplier affects
   * @param {'add'|'multiply'} config.type - Stacking type
   * @param {number} config.value - Multiplier value
   */
  register(id, { source, target, type, value }) {
    this._multipliers.set(id, { id, source, target, type, value, enabled: true });
  }

  /**
   * Get the combined multiplier for a target
   * Additive bonuses are summed with base 1, then multiplicative bonuses are applied.
   * @param {string} target - Target identifier
   * @returns {number} Combined multiplier value
   */
  getMultiplier(target) {
    let additive = 1; // Base value
    let multiplicative = 1;

    for (const mult of this._multipliers.values()) {
      if (mult.target !== target || !mult.enabled) continue;

      if (mult.type === 'add') {
        additive += mult.value;
      } else if (mult.type === 'multiply') {
        multiplicative *= mult.value;
      }
    }

    return additive * multiplicative;
  }

  /**
   * Enable a multiplier
   * @param {string} id - Multiplier identifier
   */
  enable(id) {
    const mult = this._multipliers.get(id);
    if (mult) {
      mult.enabled = true;
    }
  }

  /**
   * Disable a multiplier
   * @param {string} id - Multiplier identifier
   */
  disable(id) {
    const mult = this._multipliers.get(id);
    if (mult) {
      mult.enabled = false;
    }
  }

  /**
   * Serialize multiplier enabled states for saving
   * @returns {Object} Map of id -> enabled
   */
  serialize() {
    const data = {};
    for (const [id, mult] of this._multipliers) {
      data[id] = mult.enabled;
    }
    return data;
  }

  /**
   * Deserialize multiplier enabled states from saved data
   * @param {Object} data - Map of id -> enabled
   */
  deserialize(data) {
    for (const [id, enabled] of Object.entries(data)) {
      const mult = this._multipliers.get(id);
      if (mult && typeof enabled === 'boolean') {
        mult.enabled = enabled;
      }
    }
  }
}

export { MultiplierManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.MultiplierManager = MultiplierManager;
}
