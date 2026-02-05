/**
 * Unlockable Tests
 * Tests for conditional unlock system
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { UnlockManager } from '../Unlockable.js';

const runner = new TestRunner();

runner.describe('Unlockable - Registration', () => {
  runner.it('should register an unlockable', () => {
    const um = new UnlockManager();
    um.register({ id: 'feature1', name: 'Feature One', condition: () => true });
    assert.false(um.isUnlocked('feature1')); // Not checked yet
  });

  runner.it('should return false for unregistered unlock', () => {
    const um = new UnlockManager();
    assert.false(um.isUnlocked('nonexistent'));
  });
});

runner.describe('Unlockable - Check', () => {
  runner.it('should unlock when condition is true', () => {
    const um = new UnlockManager();
    um.register({ id: 'feature1', name: 'Feature One', condition: () => true });
    um.check();
    assert.true(um.isUnlocked('feature1'));
  });

  runner.it('should not unlock when condition is false', () => {
    const um = new UnlockManager();
    um.register({ id: 'feature1', name: 'Feature One', condition: () => false });
    um.check();
    assert.false(um.isUnlocked('feature1'));
  });

  runner.it('should unlock based on dynamic condition', () => {
    const um = new UnlockManager();
    let gold = 0;
    um.register({ id: 'goldGate', name: 'Gold Gate', condition: () => gold >= 100 });
    um.check();
    assert.false(um.isUnlocked('goldGate'));

    gold = 100;
    um.check();
    assert.true(um.isUnlocked('goldGate'));
  });

  runner.it('should stay unlocked even when condition becomes false', () => {
    const um = new UnlockManager();
    let gold = 100;
    um.register({ id: 'goldGate', name: 'Gold Gate', condition: () => gold >= 100 });
    um.check();
    assert.true(um.isUnlocked('goldGate'));

    gold = 0; // Condition now false
    um.check();
    assert.true(um.isUnlocked('goldGate')); // Should remain unlocked
  });

  runner.it('should fire onUnlock callback', () => {
    const um = new UnlockManager();
    let fired = false;
    um.register({
      id: 'feature1',
      name: 'Feature One',
      condition: () => true,
      onUnlock: () => { fired = true; }
    });
    um.check();
    assert.true(fired);
  });

  runner.it('should fire onUnlock only once', () => {
    const um = new UnlockManager();
    let count = 0;
    um.register({
      id: 'feature1',
      name: 'Feature One',
      condition: () => true,
      onUnlock: () => { count++; }
    });
    um.check();
    um.check();
    um.check();
    assert.equal(count, 1);
  });

  runner.it('should check multiple unlockables', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => true });
    um.register({ id: 'b', name: 'B', condition: () => false });
    um.register({ id: 'c', name: 'C', condition: () => true });
    um.check();
    assert.true(um.isUnlocked('a'));
    assert.false(um.isUnlocked('b'));
    assert.true(um.isUnlocked('c'));
  });

  runner.it('should return newly unlocked items from check', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => true });
    um.register({ id: 'b', name: 'B', condition: () => false });
    const unlocked = um.check();
    assert.equal(unlocked.length, 1);
    assert.equal(unlocked[0], 'a');
  });

  runner.it('should not return previously unlocked items', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => true });
    um.check(); // First check, 'a' gets unlocked
    const unlocked = um.check(); // Second check
    assert.equal(unlocked.length, 0);
  });
});

runner.describe('Unlockable - Serialization', () => {
  runner.it('should serialize unlocked states', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => true });
    um.register({ id: 'b', name: 'B', condition: () => false });
    um.check();

    const data = um.serialize();
    assert.true(data.a);
    assert.false(data.b);
  });

  runner.it('should deserialize unlocked states', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => false });
    um.register({ id: 'b', name: 'B', condition: () => false });
    um.deserialize({ a: true, b: false });

    assert.true(um.isUnlocked('a'));
    assert.false(um.isUnlocked('b'));
  });

  runner.it('should not fire onUnlock during deserialization', () => {
    const um = new UnlockManager();
    let fired = false;
    um.register({
      id: 'a',
      name: 'A',
      condition: () => false,
      onUnlock: () => { fired = true; }
    });
    um.deserialize({ a: true });
    assert.true(um.isUnlocked('a'));
    assert.false(fired);
  });

  runner.it('should handle unknown ids in deserialization', () => {
    const um = new UnlockManager();
    um.register({ id: 'a', name: 'A', condition: () => false });
    // Should not throw
    um.deserialize({ a: true, unknown: true });
    assert.true(um.isUnlocked('a'));
  });
});

export { runner };
