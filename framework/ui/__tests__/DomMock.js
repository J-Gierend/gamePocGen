/**
 * Minimal DOM mock for testing UI components in Node.js
 * Provides createElement, appendChild, querySelector, etc.
 */

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.childNodes = [];
    this.style = {};
    this.attributes = {};
    this._eventListeners = {};
    this.parentElement = null;
    this.dataset = {};
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      this.childNodes.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  addEventListener(event, handler) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this._eventListeners[event]) {
      this._eventListeners[event] = this._eventListeners[event].filter(h => h !== handler);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const listeners = this._eventListeners[type] || [];
    for (const handler of listeners) {
      handler(event);
    }
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  querySelector(selector) {
    // Simple class-based selector support: .classname
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this._findByClass(cls);
    }
    // Tag selector support
    return this._findByTag(selector);
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      this._findAllByClass(cls, results);
    } else {
      this._findAllByTag(selector, results);
    }
    return results;
  }

  _findByClass(cls) {
    for (const child of this.children) {
      if (child.className && child.className.split(' ').includes(cls)) {
        return child;
      }
      const found = child._findByClass(cls);
      if (found) return found;
    }
    return null;
  }

  _findAllByClass(cls, results) {
    for (const child of this.children) {
      if (child.className && child.className.split(' ').includes(cls)) {
        results.push(child);
      }
      child._findAllByClass(cls, results);
    }
  }

  _findByTag(tag) {
    const upperTag = tag.toUpperCase();
    for (const child of this.children) {
      if (child.tagName === upperTag) return child;
      const found = child._findByTag(tag);
      if (found) return found;
    }
    return null;
  }

  _findAllByTag(tag, results) {
    const upperTag = tag.toUpperCase();
    for (const child of this.children) {
      if (child.tagName === upperTag) results.push(child);
      child._findAllByTag(tag, results);
    }
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  contains(el) {
    if (el === this) return true;
    for (const child of this.children) {
      if (child.contains(el)) return true;
    }
    return false;
  }
}

function createMockDocument() {
  return {
    createElement(tag) {
      return new MockElement(tag);
    }
  };
}

function createContainer() {
  return new MockElement('div');
}

export { MockElement, createMockDocument, createContainer };

if (typeof window !== 'undefined') {
  window.MockElement = MockElement;
  window.createMockDocument = createMockDocument;
  window.createContainer = createContainer;
}
