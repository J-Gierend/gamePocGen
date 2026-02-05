/**
 * SaveManager Tests
 * Tests for localStorage persistence
 */

import { TestRunner, assert } from './TestRunner.js';
import { SaveManager } from '../SaveManager.js';

const runner = new TestRunner();

// Mock localStorage for testing
class MockStorage {
  constructor() {
    this.data = {};
  }
  getItem(key) {
    return this.data[key] ?? null;
  }
  setItem(key, value) {
    this.data[key] = value;
  }
  removeItem(key) {
    delete this.data[key];
  }
  key(index) {
    return Object.keys(this.data)[index];
  }
  get length() {
    return Object.keys(this.data).length;
  }
  clear() {
    this.data = {};
  }
}

// Inject mock storage
let mockStorage;

runner.describe('SaveManager - Basic Operations', () => {
  runner.it('should create an instance with gameId', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });
    assert.notNull(manager);
  });

  runner.it('should save state to a slot', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    const state = { score: 100, level: 5 };
    manager.save('slot1', state);

    const stored = mockStorage.getItem('test-game_slot1');
    assert.notNull(stored);
    const parsed = JSON.parse(stored);
    assert.equal(parsed.data.score, 100);
    assert.equal(parsed.data.level, 5);
  });

  runner.it('should load state from a slot', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    const state = { score: 200, items: ['sword', 'shield'] };
    manager.save('slot1', state);

    const loaded = manager.load('slot1');
    assert.notNull(loaded);
    assert.equal(loaded.score, 200);
    assert.deepEqual(loaded.items, ['sword', 'shield']);
  });

  runner.it('should return null for non-existent slot', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    const loaded = manager.load('nonexistent');
    assert.null(loaded);
  });

  runner.it('should delete a save slot', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    manager.save('slot1', { data: true });
    assert.notNull(manager.load('slot1'));

    manager.deleteSave('slot1');
    assert.null(manager.load('slot1'));
  });
});

runner.describe('SaveManager - Slot Management', () => {
  runner.it('should list available save slots', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    manager.save('slot1', { a: 1 });
    manager.save('slot2', { b: 2 });
    manager.save('slot3', { c: 3 });

    const slots = manager.listSlots();
    assert.equal(slots.length, 3);
    assert.true(slots.includes('slot1'));
    assert.true(slots.includes('slot2'));
    assert.true(slots.includes('slot3'));
  });

  runner.it('should return empty array when no slots exist', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    const slots = manager.listSlots();
    assert.deepEqual(slots, []);
  });

  runner.it('should only list slots for this gameId', () => {
    mockStorage = new MockStorage();
    const manager1 = new SaveManager({ gameId: 'game-a', storage: mockStorage });
    const manager2 = new SaveManager({ gameId: 'game-b', storage: mockStorage });

    manager1.save('slot1', { game: 'a' });
    manager2.save('slot1', { game: 'b' });
    manager2.save('slot2', { game: 'b' });

    const slotsA = manager1.listSlots();
    const slotsB = manager2.listSlots();

    assert.equal(slotsA.length, 1);
    assert.equal(slotsB.length, 2);
  });
});

runner.describe('SaveManager - Save Metadata', () => {
  runner.it('should include timestamp in save', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    const before = Date.now();
    manager.save('slot1', { data: true });
    const after = Date.now();

    const raw = JSON.parse(mockStorage.getItem('test-game_slot1'));
    assert.true(raw.timestamp >= before);
    assert.true(raw.timestamp <= after);
  });

  runner.it('should include version in save', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', version: '1.2.3', storage: mockStorage });

    manager.save('slot1', { data: true });

    const raw = JSON.parse(mockStorage.getItem('test-game_slot1'));
    assert.equal(raw.version, '1.2.3');
  });
});

runner.describe('SaveManager - Auto Save', () => {
  runner.it('should start and stop auto save', async () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({
      gameId: 'test-game',
      autoSaveInterval: 50, // 50ms for fast testing
      storage: mockStorage
    });

    let saveCount = 0;
    const getState = () => {
      saveCount++;
      return { count: saveCount };
    };

    manager.startAutoSave(getState);

    // Wait for a few auto saves
    await new Promise(resolve => setTimeout(resolve, 130));

    manager.stopAutoSave();

    // Should have auto-saved at least 2 times
    assert.greaterThan(saveCount, 1);

    // Verify the save exists
    const loaded = manager.load('auto');
    assert.notNull(loaded);
  });

  runner.it('should stop auto save when called', async () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({
      gameId: 'test-game',
      autoSaveInterval: 30,
      storage: mockStorage
    });

    let saveCount = 0;
    manager.startAutoSave(() => {
      saveCount++;
      return { count: saveCount };
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 70));
    manager.stopAutoSave();

    const countAfterStop = saveCount;

    // Wait more - count should not increase
    await new Promise(resolve => setTimeout(resolve, 70));

    assert.equal(saveCount, countAfterStop);
  });
});

runner.describe('SaveManager - Error Handling', () => {
  runner.it('should handle corrupted save data gracefully', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    // Manually insert corrupted data
    mockStorage.setItem('test-game_corrupted', 'not valid json {{{');

    const loaded = manager.load('corrupted');
    assert.null(loaded);
  });

  runner.it('should handle missing data field in save', () => {
    mockStorage = new MockStorage();
    const manager = new SaveManager({ gameId: 'test-game', storage: mockStorage });

    // Manually insert incomplete save structure
    mockStorage.setItem('test-game_incomplete', JSON.stringify({ timestamp: Date.now() }));

    const loaded = manager.load('incomplete');
    assert.null(loaded);
  });
});

// Run tests and export
export { runner };
