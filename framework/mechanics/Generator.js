/**
 * Generator - Resource production system for idle/incremental games
 *
 * Manages generators that produce resources over time. Each generator
 * has a cost that scales with quantity and a production rate.
 *
 * @example
 * import { GeneratorManager } from './Generator.js';
 *
 * const generators = new GeneratorManager(currencyManager);
 * generators.register({
 *   id: 'miner', name: 'Gold Miner',
 *   produces: 'gold', baseProduction: 1,
 *   baseCost: 10, costMultiplier: 1.15, costCurrency: 'gold'
 * });
 * generators.buy('miner');
 * generators.tick(1.0); // Produce 1 second worth of resources
 */

import { BigNum } from '../core/BigNum.js';

class GeneratorManager {
  /**
   * @param {import('./Currency.js').CurrencyManager} currencyManager
   */
  constructor(currencyManager) {
    this._cm = currencyManager;
    /** @type {Map<string, Object>} */
    this._generators = new Map();
  }

  /**
   * Register a new generator
   * @param {Object} config
   * @param {string} config.id - Unique generator identifier
   * @param {string} config.name - Display name
   * @param {string} config.produces - Currency ID this generator produces
   * @param {number} config.baseProduction - Base production per second per unit
   * @param {number} config.baseCost - Base cost for the first unit
   * @param {number} config.costMultiplier - Cost multiplier per owned unit
   * @param {string} [config.costCurrency] - Currency used to buy (defaults to produces)
   */
  register({ id, name, produces, baseProduction, baseCost, costMultiplier, costCurrency }) {
    this._generators.set(id, {
      id,
      name,
      produces,
      baseProduction,
      baseCost,
      costMultiplier,
      costCurrency: costCurrency || produces,
      count: 0
    });
  }

  /**
   * Get the cost to buy the next N generators
   * @param {string} id - Generator identifier
   * @param {number} [count=1] - Number to buy
   * @returns {BigNum} Total cost
   */
  getCost(id, count = 1) {
    const gen = this._generators.get(id);
    if (!gen) return BigNum.from(0);

    let total = BigNum.from(0);
    for (let i = 0; i < count; i++) {
      const unitCost = gen.baseCost * Math.pow(gen.costMultiplier, gen.count + i);
      total = total.add(BigNum.from(unitCost));
    }
    return total;
  }

  /**
   * Buy generator(s), deducting cost from the appropriate currency
   * @param {string} id - Generator identifier
   * @param {number} [count=1] - Number to buy
   * @returns {boolean} True if purchase succeeded
   */
  buy(id, count = 1) {
    const gen = this._generators.get(id);
    if (!gen) return false;

    const cost = this.getCost(id, count);
    if (!this._cm.canAfford(gen.costCurrency, cost)) return false;

    this._cm.sub(gen.costCurrency, cost);
    gen.count += count;
    return true;
  }

  /**
   * Get production rate for a generator (per second)
   * @param {string} id - Generator identifier
   * @returns {BigNum} Production per second
   */
  getProduction(id) {
    const gen = this._generators.get(id);
    if (!gen) return BigNum.from(0);
    return BigNum.from(gen.baseProduction * gen.count);
  }

  /**
   * Tick all generators, producing resources
   * @param {number} dt - Delta time in seconds
   */
  tick(dt) {
    for (const gen of this._generators.values()) {
      if (gen.count <= 0) continue;
      const produced = BigNum.from(gen.baseProduction * gen.count * dt);
      this._cm.add(gen.produces, produced);
    }
  }

  /**
   * Get all generators with their current state
   * @returns {Array<{id: string, name: string, produces: string, count: number, production: BigNum, cost: BigNum}>}
   */
  getAll() {
    const result = [];
    for (const gen of this._generators.values()) {
      result.push({
        id: gen.id,
        name: gen.name,
        produces: gen.produces,
        count: gen.count,
        production: this.getProduction(gen.id),
        cost: this.getCost(gen.id)
      });
    }
    return result;
  }

  /**
   * Reset a generator's count to zero
   * @param {string} id - Generator identifier
   */
  resetGenerator(id) {
    const gen = this._generators.get(id);
    if (gen) {
      gen.count = 0;
    }
  }

  /**
   * Reset all generators that cost a specific currency
   * @param {string} currencyId - Currency identifier
   */
  resetByCurrency(currencyId) {
    for (const gen of this._generators.values()) {
      if (gen.costCurrency === currencyId) {
        gen.count = 0;
      }
    }
  }

  /**
   * Serialize generator state for saving
   * @returns {Object} Serialized data
   */
  serialize() {
    const data = {};
    for (const [id, gen] of this._generators) {
      data[id] = { count: gen.count };
    }
    return data;
  }

  /**
   * Deserialize generator state from saved data
   * @param {Object} data - Serialized data
   */
  deserialize(data) {
    for (const [id, saved] of Object.entries(data)) {
      const gen = this._generators.get(id);
      if (gen && typeof saved.count === 'number') {
        gen.count = saved.count;
      }
    }
  }
}

export { GeneratorManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.GeneratorManager = GeneratorManager;
}
