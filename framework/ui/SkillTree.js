/**
 * SkillTree - Node-based skill tree
 *
 * Displays a tree of nodes that can be unlocked. Nodes can be connected
 * to show dependency paths. Supports click handlers for purchase logic.
 *
 * @example
 * const tree = new SkillTree(container);
 * tree.addNode({ id: 'str', x: 100, y: 100, icon: 'S', name: 'Strength', effect: '+10%', cost: BigNum.from(50), costCurrency: 'sp' });
 * tree.addNode({ id: 'def', x: 200, y: 100, icon: 'D', name: 'Defense', effect: '+5%', cost: BigNum.from(75), costCurrency: 'sp' });
 * tree.connectNodes('str', 'def');
 * tree.setAvailable('str');
 * tree.onClick((id, data) => console.log('Clicked', id));
 * tree.unlock('str');
 * tree.destroy();
 */

import { BigNum } from '../core/BigNum.js';

class SkillTree {
  /**
   * @param {HTMLElement} container - Parent element
   * @param {Object} [options]
   * @param {Object} [options._document] - Document mock for testing
   */
  constructor(container, options = {}) {
    this._container = container;
    this._doc = (options && options._document) || document;
    this._nodes = new Map(); // id -> { data, element, unlocked, available }
    this._connections = []; // { from, to, element }
    this._clickCallbacks = [];
    this._destroyed = false;

    this._build();
  }

  _build() {
    this._root = this._doc.createElement('div');
    this._root.className = 'skill-tree';
    this._root.style.position = 'relative';

    this._container.appendChild(this._root);
  }

  /**
   * Add a skill node
   * @param {Object} nodeData
   * @param {string} nodeData.id - Unique node identifier
   * @param {number} nodeData.x - X position in pixels
   * @param {number} nodeData.y - Y position in pixels
   * @param {string} nodeData.icon - Icon text/emoji
   * @param {string} nodeData.name - Node name
   * @param {string} nodeData.effect - Effect description
   * @param {BigNum|number} nodeData.cost - Purchase cost
   * @param {string} nodeData.costCurrency - Currency id
   */
  addNode(nodeData) {
    if (this._destroyed) return;

    const el = this._doc.createElement('div');
    el.className = 'skill-node';
    el.style.position = 'absolute';
    el.style.left = nodeData.x + 'px';
    el.style.top = nodeData.y + 'px';
    el.dataset.nodeId = nodeData.id;

    // Icon
    const iconEl = this._doc.createElement('span');
    iconEl.className = 'skill-node-icon';
    iconEl.textContent = nodeData.icon || '';
    el.appendChild(iconEl);

    // Name
    const nameEl = this._doc.createElement('span');
    nameEl.className = 'skill-node-name';
    nameEl.textContent = nodeData.name;
    el.appendChild(nameEl);

    // Click handler
    el.addEventListener('click', () => {
      if (this._destroyed) return;
      for (const cb of this._clickCallbacks) {
        cb(nodeData.id, nodeData);
      }
    });

    this._root.appendChild(el);

    this._nodes.set(nodeData.id, {
      data: nodeData,
      element: el,
      unlocked: false,
      available: false
    });
  }

  /**
   * Create a visual connection between two nodes
   * @param {string} fromId - Source node id
   * @param {string} toId - Target node id
   */
  connectNodes(fromId, toId) {
    if (this._destroyed) return;

    const fromNode = this._nodes.get(fromId);
    const toNode = this._nodes.get(toId);
    if (!fromNode || !toNode) return;

    const connEl = this._doc.createElement('div');
    connEl.className = 'skill-connector';
    connEl.style.position = 'absolute';
    connEl.dataset.from = fromId;
    connEl.dataset.to = toId;

    // Position the connector between the two nodes
    const fx = fromNode.data.x;
    const fy = fromNode.data.y;
    const tx = toNode.data.x;
    const ty = toNode.data.y;

    const dx = tx - fx;
    const dy = ty - fy;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    connEl.style.left = fx + 'px';
    connEl.style.top = fy + 'px';
    connEl.style.width = length + 'px';
    connEl.style.transformOrigin = '0 0';
    connEl.style.transform = 'rotate(' + angle + 'deg)';

    this._root.appendChild(connEl);

    this._connections.push({ from: fromId, to: toId, element: connEl });
  }

  /**
   * Mark a node as unlocked
   * @param {string} id - Node identifier
   */
  unlock(id) {
    const node = this._nodes.get(id);
    if (!node) return;

    node.unlocked = true;
    if (!node.element.className.includes('unlocked')) {
      node.element.className = node.element.className + ' unlocked';
    }

    // Update connectors - mark as active if both endpoints are unlocked
    this._updateConnectors();
  }

  /**
   * Mark a node as available for purchase
   * @param {string} id - Node identifier
   */
  setAvailable(id) {
    const node = this._nodes.get(id);
    if (!node) return;

    node.available = true;
    if (!node.element.className.includes('available')) {
      node.element.className = node.element.className + ' available';
    }
  }

  _updateConnectors() {
    for (const conn of this._connections) {
      const fromNode = this._nodes.get(conn.from);
      const toNode = this._nodes.get(conn.to);
      if (fromNode && toNode && fromNode.unlocked && toNode.unlocked) {
        if (!conn.element.className.includes('active')) {
          conn.element.className = conn.element.className + ' active';
        }
      }
    }
  }

  /**
   * Register click handler for nodes
   * @param {Function} callback - Called with (nodeId, nodeData)
   */
  onClick(callback) {
    this._clickCallbacks.push(callback);
  }

  /**
   * Get current state of all nodes
   * @returns {Object} Map of id -> { unlocked, available }
   */
  getState() {
    const state = {};
    for (const [id, node] of this._nodes) {
      state[id] = {
        unlocked: node.unlocked,
        available: node.available
      };
    }
    return state;
  }

  /**
   * Remove element and clean up
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clickCallbacks = [];
    this._nodes.clear();
    this._connections = [];
    if (this._root && this._root.parentElement) {
      this._root.parentElement.removeChild(this._root);
    }
  }
}

export { SkillTree };

if (typeof window !== 'undefined') {
  window.SkillTree = SkillTree;
}
