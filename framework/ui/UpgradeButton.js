/**
 * UpgradeButton - Purchasable upgrade display
 *
 * Displays an upgrade with name, description, cost, level, and affordability state.
 * Supports click handlers for purchase logic.
 *
 * @example
 * const btn = new UpgradeButton(container, {
 *   id: 'doubleGold',
 *   name: 'Double Gold',
 *   description: 'Doubles gold production',
 *   cost: BigNum.from(100),
 *   costCurrency: 'gold',
 *   level: 0,
 *   maxLevel: 10,
 *   effect: 'x2 gold/s'
 * }, { showLevel: true });
 *
 * btn.onClick((data) => console.log('Clicked', data.id));
 * btn.setAffordable(true);
 * btn.destroy();
 */

import { BigNum } from '../core/BigNum.js';

class UpgradeButton {
  /**
   * @param {HTMLElement} container - Parent element
   * @param {Object} upgradeData
   * @param {string} upgradeData.id - Unique identifier
   * @param {string} upgradeData.name - Display name
   * @param {string} upgradeData.description - Description text
   * @param {BigNum|number} upgradeData.cost - Purchase cost
   * @param {string} upgradeData.costCurrency - Currency id for cost
   * @param {number} upgradeData.level - Current level
   * @param {number} [upgradeData.maxLevel] - Max level cap
   * @param {string} upgradeData.effect - Effect description
   * @param {Object} [options]
   * @param {boolean} [options.tooltip=false] - Show tooltip
   * @param {boolean} [options.showLevel=false] - Show level display
   * @param {Object} [options._document] - Document mock for testing
   */
  constructor(container, upgradeData, options = {}) {
    this._container = container;
    this._options = {
      tooltip: false,
      showLevel: false,
      ...options
    };
    this._doc = options._document || document;
    this._data = { ...upgradeData };
    this._clickCallbacks = [];
    this._destroyed = false;

    this._build();
  }

  _build() {
    this._root = this._doc.createElement('div');
    this._updateRootClass();

    // Icon
    this._iconEl = this._doc.createElement('span');
    this._iconEl.className = 'upgrade-icon';
    this._iconEl.textContent = this._data.name ? this._data.name.charAt(0) : '?';
    this._root.appendChild(this._iconEl);

    // Info section
    this._infoEl = this._doc.createElement('div');
    this._infoEl.className = 'upgrade-info';

    const nameEl = this._doc.createElement('span');
    nameEl.className = 'upgrade-name';
    nameEl.textContent = this._data.name;
    this._infoEl.appendChild(nameEl);

    const descEl = this._doc.createElement('span');
    descEl.className = 'upgrade-desc';
    descEl.textContent = this._data.description || '';
    this._infoEl.appendChild(descEl);

    this._root.appendChild(this._infoEl);

    // Level (optional)
    if (this._options.showLevel) {
      this._levelEl = this._doc.createElement('span');
      this._levelEl.className = 'upgrade-level';
      this._updateLevelText();
      this._root.appendChild(this._levelEl);
    }

    // Cost
    this._costEl = this._doc.createElement('span');
    this._costEl.className = 'upgrade-cost';
    this._updateCostText();
    this._root.appendChild(this._costEl);

    // Click handler
    this._clickHandler = (e) => {
      if (this._destroyed) return;
      for (const cb of this._clickCallbacks) {
        cb(this._data);
      }
    };
    this._root.addEventListener('click', this._clickHandler);

    this._container.appendChild(this._root);
  }

  _updateRootClass() {
    let cls = 'upgrade-btn';
    if (this._affordable) cls += ' affordable';
    if (this._data.maxLevel != null && this._data.level >= this._data.maxLevel) {
      cls += ' locked';
    }
    if (this._root) this._root.className = cls;
  }

  _updateLevelText() {
    if (!this._levelEl) return;
    if (this._data.maxLevel != null) {
      this._levelEl.textContent = `Lv ${this._data.level}/${this._data.maxLevel}`;
    } else {
      this._levelEl.textContent = `Lv ${this._data.level}`;
    }
  }

  _updateCostText() {
    if (!this._costEl) return;
    const cost = this._data.cost instanceof BigNum
      ? this._data.cost
      : BigNum.from(this._data.cost);
    this._costEl.textContent = cost.format() + ' ' + (this._data.costCurrency || '');
  }

  /**
   * Update displayed data
   * @param {Object} upgradeData - New upgrade data
   */
  update(upgradeData) {
    if (this._destroyed) return;
    this._data = { ...this._data, ...upgradeData };
    this._updateRootClass();
    this._updateCostText();
    this._updateLevelText();

    // Update name in info
    const nameEl = this._infoEl.querySelector
      ? this._infoEl.querySelector('.upgrade-name')
      : null;
    if (nameEl) nameEl.textContent = this._data.name;
  }

  /**
   * Toggle affordable state
   * @param {boolean} canAfford
   */
  setAffordable(canAfford) {
    this._affordable = canAfford;
    this._updateRootClass();
  }

  /**
   * Register click handler
   * @param {Function} callback - Called with upgrade data on click
   */
  onClick(callback) {
    this._clickCallbacks.push(callback);
  }

  /**
   * Remove element and clean up
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._root) {
      this._root.removeEventListener('click', this._clickHandler);
    }
    this._clickCallbacks = [];
    if (this._root && this._root.parentElement) {
      this._root.parentElement.removeChild(this._root);
    }
  }
}

export { UpgradeButton };

if (typeof window !== 'undefined') {
  window.UpgradeButton = UpgradeButton;
}
