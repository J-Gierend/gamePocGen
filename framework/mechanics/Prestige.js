/**
 * Prestige - Reset/prestige layer system for idle/incremental games
 *
 * Manages prestige layers that allow players to reset progress
 * in exchange for permanent bonuses/currencies.
 *
 * @example
 * import { PrestigeManager } from './Prestige.js';
 *
 * const prestige = new PrestigeManager(currencyManager, generatorManager);
 * prestige.addLayer({
 *   id: 'prestige',
 *   currency: 'prestige_points',
 *   requirement: { currency: 'gold', amount: 1000 },
 *   formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
 *   resets: ['gold'],
 *   keeps: ['prestige_points']
 * });
 * if (prestige.canPrestige('prestige')) {
 *   prestige.prestige('prestige');
 * }
 */

import { BigNum } from '../core/BigNum.js';

class PrestigeManager {
  /**
   * @param {import('./Currency.js').CurrencyManager} currencyManager
   * @param {import('./Generator.js').GeneratorManager} generatorManager
   */
  constructor(currencyManager, generatorManager) {
    this._cm = currencyManager;
    this._gm = generatorManager;
    /** @type {Map<string, Object>} */
    this._layers = new Map();
  }

  /**
   * Add a prestige layer
   * @param {Object} config
   * @param {string} config.id - Unique layer identifier
   * @param {string} config.currency - Currency awarded on prestige
   * @param {Object} config.requirement - Requirement to prestige
   * @param {string} config.requirement.currency - Currency to check
   * @param {number} config.requirement.amount - Minimum amount needed
   * @param {Function} config.formula - Formula: (currencyAmount: BigNum) => number of prestige currency to award
   * @param {string[]} config.resets - Currency IDs to reset to zero
   * @param {string[]} config.keeps - Currency IDs to keep (not reset)
   */
  addLayer({ id, currency, requirement, formula, resets, keeps }) {
    this._layers.set(id, {
      id,
      currency,
      requirement,
      formula,
      resets,
      keeps,
      count: 0
    });
  }

  /**
   * Check if prestige is possible for a layer
   * @param {string} layerId - Layer identifier
   * @returns {boolean}
   */
  canPrestige(layerId) {
    const layer = this._layers.get(layerId);
    if (!layer) return false;

    return this._cm.canAfford(layer.requirement.currency, layer.requirement.amount);
  }

  /**
   * Calculate prestige gain without executing the prestige
   * @param {string} layerId - Layer identifier
   * @returns {BigNum} Amount of prestige currency that would be gained
   */
  getPrestigeGain(layerId) {
    const layer = this._layers.get(layerId);
    if (!layer) return BigNum.from(0);

    if (!this.canPrestige(layerId)) return BigNum.from(0);

    const reqCurrency = this._cm.get(layer.requirement.currency);
    if (!reqCurrency) return BigNum.from(0);

    const gain = layer.formula(reqCurrency.amount);
    return BigNum.from(gain);
  }

  /**
   * Execute a prestige: award currency, reset specified things
   * @param {string} layerId - Layer identifier
   * @returns {boolean} True if prestige was executed
   */
  prestige(layerId) {
    const layer = this._layers.get(layerId);
    if (!layer) return false;

    if (!this.canPrestige(layerId)) return false;

    // Calculate gain before reset
    const gain = this.getPrestigeGain(layerId);

    // Reset specified currencies
    for (const currencyId of layer.resets) {
      this._cm.reset(currencyId);
      // Also reset generators that cost this currency
      this._gm.resetByCurrency(currencyId);
    }

    // Award prestige currency
    this._cm.add(layer.currency, gain);

    // Track prestige count
    layer.count++;

    return true;
  }

  /**
   * Serialize prestige state for saving
   * @returns {Object} Serialized data
   */
  serialize() {
    const data = {};
    for (const [id, layer] of this._layers) {
      data[id] = { count: layer.count };
    }
    return data;
  }

  /**
   * Deserialize prestige state from saved data
   * @param {Object} data - Serialized data
   */
  deserialize(data) {
    for (const [id, saved] of Object.entries(data)) {
      const layer = this._layers.get(id);
      if (layer && typeof saved.count === 'number') {
        layer.count = saved.count;
      }
    }
  }
}

export { PrestigeManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.PrestigeManager = PrestigeManager;
}
