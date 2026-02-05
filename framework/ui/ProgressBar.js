/**
 * ProgressBar - Visual progress indicator
 *
 * Displays a progress bar with optional label, custom color, and animation.
 *
 * @example
 * const bar = new ProgressBar(container, { label: 'XP', color: '#4CAF50' });
 * bar.update(75, 100);
 * console.log(bar.getPercent()); // 75
 * bar.setLabel('Level 2');
 * bar.destroy();
 */

class ProgressBar {
  /**
   * @param {HTMLElement} container - Parent element
   * @param {Object} [options]
   * @param {string} [options.label] - Initial label text
   * @param {string} [options.color] - Fill bar color
   * @param {boolean} [options.animated=false] - Enable transition animation
   * @param {Object} [options._document] - Document mock for testing
   */
  constructor(container, options = {}) {
    this._container = container;
    this._options = {
      label: null,
      color: null,
      animated: false,
      ...options
    };
    this._doc = options._document || document;
    this._percent = 0;
    this._destroyed = false;

    this._build();
  }

  _build() {
    // Root container
    this._root = this._doc.createElement('div');
    this._root.className = 'progress-container';

    // Label (optional)
    if (this._options.label) {
      this._labelEl = this._doc.createElement('span');
      this._labelEl.className = 'progress-label';
      this._labelEl.textContent = this._options.label;
      this._root.appendChild(this._labelEl);
    }

    // Bar wrapper
    this._barEl = this._doc.createElement('div');
    this._barEl.className = 'progress-bar';

    // Fill element
    this._fillEl = this._doc.createElement('div');
    this._fillEl.className = 'progress-fill';
    this._fillEl.style.width = '0%';

    if (this._options.color) {
      this._fillEl.style.backgroundColor = this._options.color;
    }

    if (this._options.animated) {
      this._fillEl.style.transition = 'width 0.3s ease';
    }

    this._barEl.appendChild(this._fillEl);
    this._root.appendChild(this._barEl);

    this._container.appendChild(this._root);
  }

  /**
   * Update progress
   * @param {number} current - Current value
   * @param {number} max - Maximum value
   */
  update(current, max) {
    if (this._destroyed) return;

    if (max <= 0) {
      this._percent = 0;
    } else {
      this._percent = Math.max(0, Math.min(100, (current / max) * 100));
    }

    this._fillEl.style.width = this._percent + '%';
  }

  /**
   * Change label text
   * @param {string} text - New label text
   */
  setLabel(text) {
    if (this._destroyed) return;

    if (!this._labelEl) {
      this._labelEl = this._doc.createElement('span');
      this._labelEl.className = 'progress-label';
      // Insert before bar element
      if (this._barEl) {
        this._root.children.length > 0
          ? this._root.appendChild(this._labelEl)
          : this._root.appendChild(this._labelEl);
        // Move label before bar: rebuild order
        // Simple approach: just append, label is found by class
      } else {
        this._root.appendChild(this._labelEl);
      }
    }

    this._labelEl.textContent = text;
  }

  /**
   * Get current progress percentage
   * @returns {number} Percentage (0-100)
   */
  getPercent() {
    return this._percent;
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

export { ProgressBar };

if (typeof window !== 'undefined') {
  window.ProgressBar = ProgressBar;
}
