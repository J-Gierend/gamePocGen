/**
 * TabSystem - Tabbed content switching
 *
 * Manages a set of tabs with headers and content panels.
 * Clicking a tab header switches the visible content panel.
 *
 * @example
 * const tabs = new TabSystem(container);
 * const panel1 = document.createElement('div');
 * panel1.textContent = 'Inventory content';
 * tabs.addTab('inventory', 'Inventory', panel1);
 * tabs.addTab('stats', 'Stats', statsPanel);
 * tabs.switchTo('stats');
 * tabs.onSwitch((id) => console.log('Switched to', id));
 * tabs.destroy();
 */

class TabSystem {
  /**
   * @param {HTMLElement} container - Parent element
   * @param {Object} [options]
   * @param {Object} [options._document] - Document mock for testing
   */
  constructor(container, options = {}) {
    this._container = container;
    this._doc = (options && options._document) || document;
    this._tabs = new Map(); // id -> { label, contentEl, btnEl }
    this._activeId = null;
    this._switchCallbacks = [];
    this._destroyed = false;

    this._build();
  }

  _build() {
    this._root = this._doc.createElement('div');
    this._root.className = 'tabs';

    this._headerEl = this._doc.createElement('div');
    this._headerEl.className = 'tab-header';
    this._root.appendChild(this._headerEl);

    this._contentEl = this._doc.createElement('div');
    this._contentEl.className = 'tab-content';
    this._root.appendChild(this._contentEl);

    this._container.appendChild(this._root);
  }

  /**
   * Add a tab
   * @param {string} id - Unique tab identifier
   * @param {string} label - Tab button text
   * @param {HTMLElement} contentElement - Content panel element
   */
  addTab(id, label, contentElement) {
    if (this._destroyed) return;

    // Create button
    const btnEl = this._doc.createElement('button');
    btnEl.className = 'tab-btn';
    btnEl.textContent = label;
    btnEl.dataset.tabId = id;

    btnEl.addEventListener('click', () => {
      this.switchTo(id);
    });

    this._headerEl.appendChild(btnEl);

    // Add content to content area (hidden by default)
    contentElement.style.display = 'none';
    this._contentEl.appendChild(contentElement);

    this._tabs.set(id, { label, contentEl: contentElement, btnEl });

    // Auto-activate first tab
    if (this._tabs.size === 1) {
      this._activateTab(id);
    }
  }

  /**
   * Switch to a tab by id
   * @param {string} id - Tab identifier
   */
  switchTo(id) {
    if (this._destroyed) return;
    if (!this._tabs.has(id)) return;
    if (this._activeId === id) return;

    const previousId = this._activeId;
    this._activateTab(id);

    // Fire callbacks
    for (const cb of this._switchCallbacks) {
      cb(id, previousId);
    }
  }

  _activateTab(id) {
    // Deactivate all
    for (const [tabId, tab] of this._tabs) {
      tab.btnEl.className = 'tab-btn';
      tab.contentEl.style.display = 'none';
    }

    // Activate target
    const tab = this._tabs.get(id);
    if (tab) {
      tab.btnEl.className = 'tab-btn active';
      tab.contentEl.style.display = '';
      this._activeId = id;
    }
  }

  /**
   * Get the id of the currently active tab
   * @returns {string|null}
   */
  getActiveTab() {
    return this._activeId;
  }

  /**
   * Register a tab switch callback
   * @param {Function} callback - Called with (newId, previousId)
   */
  onSwitch(callback) {
    this._switchCallbacks.push(callback);
  }

  /**
   * Remove element and clean up
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._switchCallbacks = [];
    this._tabs.clear();
    if (this._root && this._root.parentElement) {
      this._root.parentElement.removeChild(this._root);
    }
  }
}

export { TabSystem };

if (typeof window !== 'undefined') {
  window.TabSystem = TabSystem;
}
