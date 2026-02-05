/**
 * EventBus - Pub/sub event system
 *
 * A simple event emitter for decoupled communication between game components.
 *
 * @example
 * const bus = new EventBus();
 *
 * // Subscribe to events
 * const unsubscribe = bus.on('playerDied', (data) => {
 *   console.log('Player died at level', data.level);
 * });
 *
 * // Emit events
 * bus.emit('playerDied', { level: 5 });
 *
 * // Unsubscribe when done
 * unsubscribe();
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Handler function to remove
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Data to pass to handlers
   */
  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: Error in handler for "${event}":`, error);
        }
      }
    }
  }

  /**
   * Subscribe to an event for a single emission
   * @param {string} event - Event name
   * @param {Function} callback - Handler function (called once then removed)
   * @returns {Function} Unsubscribe function
   */
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    return this.on(event, wrapper);
  }
}

export { EventBus };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
}
