/**
 * Currency - Currency management system for idle/incremental games
 *
 * Handles registration, tracking, and conversion of in-game currencies.
 * All amounts are stored as BigNum for large number support.
 *
 * @example
 * import { CurrencyManager } from './Currency.js';
 * import { BigNum } from '../core/BigNum.js';
 *
 * const currencies = new CurrencyManager();
 * currencies.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
 * currencies.add('gold', 50);
 * currencies.sub('gold', 30); // true, 120 gold remaining
 */

import { BigNum } from '../core/BigNum.js';

class CurrencyManager {
  constructor() {
    /** @type {Map<string, {id: string, name: string, icon: string, amount: BigNum}>} */
    this._currencies = new Map();
    /** @type {Map<string, {fromId: string, toId: string, rate: number}>} */
    this._converters = new Map();
  }

  /**
   * Register a new currency
   * @param {Object} config
   * @param {string} config.id - Unique currency identifier
   * @param {string} config.name - Display name
   * @param {string} config.icon - Icon identifier
   * @param {number|BigNum} [config.initial=0] - Starting amount
   */
  register({ id, name, icon, initial = 0 }) {
    const amount = initial instanceof BigNum ? BigNum.from(initial) : BigNum.from(initial);
    this._currencies.set(id, { id, name, icon, amount });
  }

  /**
   * Get currency state
   * @param {string} id - Currency identifier
   * @returns {{id: string, name: string, icon: string, amount: BigNum}|null}
   */
  get(id) {
    const currency = this._currencies.get(id);
    if (!currency) return null;
    return { ...currency, amount: BigNum.from(currency.amount) };
  }

  /**
   * Add amount to a currency
   * @param {string} id - Currency identifier
   * @param {number|BigNum} amount - Amount to add
   */
  add(id, amount) {
    const currency = this._currencies.get(id);
    if (!currency) return;
    const toAdd = amount instanceof BigNum ? amount : BigNum.from(amount);
    currency.amount = currency.amount.add(toAdd);
  }

  /**
   * Subtract amount from a currency
   * @param {string} id - Currency identifier
   * @param {number|BigNum} amount - Amount to subtract
   * @returns {boolean} True if successful, false if insufficient
   */
  sub(id, amount) {
    const currency = this._currencies.get(id);
    if (!currency) return false;
    const toSub = amount instanceof BigNum ? amount : BigNum.from(amount);
    if (currency.amount.lt(toSub)) return false;
    currency.amount = currency.amount.sub(toSub);
    return true;
  }

  /**
   * Check if currency has enough for an amount
   * @param {string} id - Currency identifier
   * @param {number|BigNum} amount - Amount to check
   * @returns {boolean}
   */
  canAfford(id, amount) {
    const currency = this._currencies.get(id);
    if (!currency) return false;
    const toCheck = amount instanceof BigNum ? amount : BigNum.from(amount);
    return currency.amount.gte(toCheck);
  }

  /**
   * Register a conversion between two currencies
   * @param {string} fromId - Source currency
   * @param {string} toId - Target currency
   * @param {number} rate - How many 'from' per 1 'to'
   */
  addConverter(fromId, toId, rate) {
    const key = `${fromId}->${toId}`;
    this._converters.set(key, { fromId, toId, rate });
  }

  /**
   * Convert currency from one type to another
   * @param {string} fromId - Source currency
   * @param {string} toId - Target currency
   * @param {number} [amount] - How many 'to' to buy. If omitted, converts max possible.
   * @returns {boolean} True if conversion happened
   */
  convert(fromId, toId, amount) {
    const key = `${fromId}->${toId}`;
    const converter = this._converters.get(key);
    if (!converter) return false;

    const fromCurrency = this._currencies.get(fromId);
    if (!fromCurrency) return false;

    if (amount === undefined) {
      // Convert max possible
      const maxUnits = Math.floor(fromCurrency.amount.toNumber() / converter.rate);
      if (maxUnits <= 0) return false;
      amount = maxUnits;
    }

    const cost = BigNum.from(amount * converter.rate);
    if (!this.canAfford(fromId, cost)) return false;

    this.sub(fromId, cost);
    this.add(toId, amount);
    return true;
  }

  /**
   * Get all registered currencies
   * @returns {Array<{id: string, name: string, icon: string, amount: BigNum}>}
   */
  getAll() {
    const result = [];
    for (const currency of this._currencies.values()) {
      result.push({ ...currency, amount: BigNum.from(currency.amount) });
    }
    return result;
  }

  /**
   * Reset a currency to zero
   * @param {string} id - Currency identifier
   */
  reset(id) {
    const currency = this._currencies.get(id);
    if (currency) {
      currency.amount = BigNum.from(0);
    }
  }

  /**
   * Serialize currency state for saving
   * @returns {Object} Serialized data
   */
  serialize() {
    const data = {};
    for (const [id, currency] of this._currencies) {
      data[id] = { mantissa: currency.amount.mantissa, exponent: currency.amount.exponent };
    }
    return data;
  }

  /**
   * Deserialize currency state from saved data
   * @param {Object} data - Serialized data
   */
  deserialize(data) {
    for (const [id, saved] of Object.entries(data)) {
      const currency = this._currencies.get(id);
      if (currency && saved.mantissa !== undefined && saved.exponent !== undefined) {
        currency.amount = new BigNum(saved.mantissa, saved.exponent);
      }
    }
  }
}

export { CurrencyManager };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.CurrencyManager = CurrencyManager;
}
