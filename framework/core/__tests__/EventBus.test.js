/**
 * EventBus Tests
 * Tests for pub/sub event system
 */

import { TestRunner, assert } from './TestRunner.js';
import { EventBus } from '../EventBus.js';

const runner = new TestRunner();

runner.describe('EventBus', () => {
  runner.it('should create an instance', () => {
    const bus = new EventBus();
    assert.notNull(bus);
  });

  runner.it('should subscribe and emit events', () => {
    const bus = new EventBus();
    let received = null;

    bus.on('test', (data) => {
      received = data;
    });

    bus.emit('test', { value: 42 });
    assert.deepEqual(received, { value: 42 });
  });

  runner.it('should support multiple subscribers', () => {
    const bus = new EventBus();
    let count = 0;

    bus.on('increment', () => count++);
    bus.on('increment', () => count++);
    bus.on('increment', () => count++);

    bus.emit('increment');
    assert.equal(count, 3);
  });

  runner.it('should unsubscribe with returned function', () => {
    const bus = new EventBus();
    let count = 0;

    const unsubscribe = bus.on('event', () => count++);

    bus.emit('event');
    assert.equal(count, 1);

    unsubscribe();
    bus.emit('event');
    assert.equal(count, 1); // Should not increment again
  });

  runner.it('should unsubscribe with off()', () => {
    const bus = new EventBus();
    let count = 0;

    const handler = () => count++;
    bus.on('event', handler);

    bus.emit('event');
    assert.equal(count, 1);

    bus.off('event', handler);
    bus.emit('event');
    assert.equal(count, 1); // Should not increment again
  });

  runner.it('should handle once() - fires only once', () => {
    const bus = new EventBus();
    let count = 0;

    bus.once('single', () => count++);

    bus.emit('single');
    bus.emit('single');
    bus.emit('single');

    assert.equal(count, 1);
  });

  runner.it('should pass event data to handlers', () => {
    const bus = new EventBus();
    let receivedData = [];

    bus.on('data', (data) => receivedData.push(data));

    bus.emit('data', 'first');
    bus.emit('data', 'second');
    bus.emit('data', { complex: true });

    assert.equal(receivedData.length, 3);
    assert.equal(receivedData[0], 'first');
    assert.equal(receivedData[1], 'second');
    assert.deepEqual(receivedData[2], { complex: true });
  });

  runner.it('should handle events with no subscribers', () => {
    const bus = new EventBus();
    // Should not throw
    bus.emit('nonexistent', { data: true });
    assert.true(true);
  });

  runner.it('should keep other subscribers when one unsubscribes', () => {
    const bus = new EventBus();
    let results = [];

    const handler1 = () => results.push('a');
    const handler2 = () => results.push('b');

    bus.on('event', handler1);
    bus.on('event', handler2);

    bus.emit('event');
    assert.deepEqual(results, ['a', 'b']);

    bus.off('event', handler1);
    bus.emit('event');
    assert.deepEqual(results, ['a', 'b', 'b']);
  });

  runner.it('should not fail when off() called for non-existent handler', () => {
    const bus = new EventBus();
    // Should not throw
    bus.off('nonexistent', () => {});
    assert.true(true);
  });
});

// Run tests and export
export { runner };
