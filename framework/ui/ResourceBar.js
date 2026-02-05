/**
 * ResourceBar - Currency display component
 *
 * Displays a game currency with optional icon, name, value, and rate.
 * Uses BigNum.format() for large number display.
 *
 * @example
 * const bar = new ResourceBar(container, {
 *   name: 'Gold',
 *   amount: BigNum.from(1500),
 *   icon: 'coin',
 *   rate: BigNum.from(10)
 * }, { showRate: true, showIcon: true });
 *
 * bar.update({ name: 'Gold', amount: BigNum.from(3000), rate: BigNum.from(20) });
 * bar.destroy();
 */

import { BigNum } from '../core/BigNum.js';

class ResourceBar {
  /**
   * @param {HTMLElement} container - Parent element to append to
   * @param {Object} currencyData - Currency data
   * @param {string} currencyData.name - Currency name
   * @param {BigNum|number} currencyData.amount - Current amount
   * @param {string} [currencyData.icon] - Icon text/emoji
   * @param {BigNum|number} [currencyData.rate] - Rate per second
   * @param {Object} [options]
   * @param {boolean} [options.showRate=false] - Show rate element
   * @param {boolean} [options.showIcon=false] - Show icon element
   * @param {boolean} [options.animated=false] - Enable animations
   * @param {Object} [options._document] - Document mock for testing
   */
  constructor(container, currencyData, options = {}) {
    this._container = container;
    this._options = {
      showRate: false,
      showIcon: false,
      animated: false,
      ...options
    };
    this._doc = options._document || document;
    this._destroyed = false;

    this._build(currencyData);
  }

  _build(data) {
    this._root = this._doc.createElement('div');
    this._root.className = 'resource-bar';

    // Icon (optional)
    if (this._options.showIcon && data.icon) {
      this._iconEl = this._doc.createElement('span');
      this._iconEl.className = 'resource-icon';
      this._iconEl.textContent = data.icon;
      this._root.appendChild(this._iconEl);
    }

    // Name
    this._nameEl = this._doc.createElement('span');
    this._nameEl.className = 'resource-name';
    this._nameEl.textContent = data.name;
    this._root.appendChild(this._nameEl);

    // Value
    this._valueEl = this._doc.createElement('span');
    this._valueEl.className = 'resource-value';
    this._valueEl.textContent = this._formatAmount(data.amount);
    this._root.appendChild(this._valueEl);

    // Rate (optional)
    if (this._options.showRate && data.rate != null) {
      this._rateEl = this._doc.createElement('span');
      this._rateEl.className = 'resource-rate';
      this._rateEl.textContent = this._formatRate(data.rate);
      this._root.appendChild(this._rateEl);
    }

    this._container.appendChild(this._root);
  }

  _formatAmount(amount) {
    if (amount instanceof BigNum) {
      return amount.format();
    }
    return BigNum.from(amount).format();
  }

  _formatRate(rate) {
    const formatted = rate instanceof BigNum ? rate.format() : BigNum.from(rate).format();
    return formatted + '/s';
  }

  /**
   * Update displayed values
   * @param {Object} currencyData - New currency data
   */
  update(currencyData) {
    if (this._destroyed) return;

    if (currencyData.name != null) {
      this._nameEl.textContent = currencyData.name;
    }

    if (currencyData.amount != null) {
      this._valueEl.textContent = this._formatAmount(currencyData.amount);
    }

    if (this._rateEl && currencyData.rate != null) {
      this._rateEl.textContent = this._formatRate(currencyData.rate);
    }
  }

  /**
   * Remove element and clean up
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._root && this._root.parentElement) {
      this._root.parentElement.removeChild(this._root);
    }
  }
}

export { ResourceBar };

if (typeof window !== 'undefined') {
  window.ResourceBar = ResourceBar;
}
