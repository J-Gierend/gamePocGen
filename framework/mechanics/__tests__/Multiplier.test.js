/**
 * Multiplier Tests
 * Tests for multiplier stacking system
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { MultiplierManager } from '../Multiplier.js';

const runner = new TestRunner();

runner.describe('Multiplier - Registration', () => {
  runner.it('should register an additive multiplier', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'upgrade', target: 'gold_production', type: 'add', value: 5 });
    const mult = mm.getMultiplier('gold_production');
    assert.equal(mult, 6); // base 1 + 5 additive = 6
  });

  runner.it('should register a multiplicative multiplier', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'prestige', target: 'gold_production', type: 'multiply', value: 2 });
    const mult = mm.getMultiplier('gold_production');
    assert.equal(mult, 2); // base 1 * 2 = 2
  });

  runner.it('should return 1 for no multipliers on target', () => {
    const mm = new MultiplierManager();
    const mult = mm.getMultiplier('gold_production');
    assert.equal(mult, 1);
  });
});

runner.describe('Multiplier - Stacking', () => {
  runner.it('should stack additive multipliers', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'upgrade1', target: 'gold', type: 'add', value: 2 });
    mm.register('bonus2', { source: 'upgrade2', target: 'gold', type: 'add', value: 3 });
    // base 1 + 2 + 3 = 6
    assert.equal(mm.getMultiplier('gold'), 6);
  });

  runner.it('should stack multiplicative multipliers', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'prestige', target: 'gold', type: 'multiply', value: 2 });
    mm.register('bonus2', { source: 'artifact', target: 'gold', type: 'multiply', value: 3 });
    // base 1 * 2 * 3 = 6
    assert.equal(mm.getMultiplier('gold'), 6);
  });

  runner.it('should apply additive before multiplicative', () => {
    const mm = new MultiplierManager();
    mm.register('add1', { source: 'upgrade', target: 'gold', type: 'add', value: 4 });
    mm.register('mul1', { source: 'prestige', target: 'gold', type: 'multiply', value: 3 });
    // (base 1 + 4) * 3 = 15
    assert.equal(mm.getMultiplier('gold'), 15);
  });

  runner.it('should handle multiple additive and multiplicative', () => {
    const mm = new MultiplierManager();
    mm.register('add1', { source: 'u1', target: 'gold', type: 'add', value: 2 });
    mm.register('add2', { source: 'u2', target: 'gold', type: 'add', value: 3 });
    mm.register('mul1', { source: 'p1', target: 'gold', type: 'multiply', value: 2 });
    mm.register('mul2', { source: 'p2', target: 'gold', type: 'multiply', value: 1.5 });
    // (1 + 2 + 3) * 2 * 1.5 = 6 * 3 = 18
    assert.equal(mm.getMultiplier('gold'), 18);
  });

  runner.it('should not mix targets', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 10 });
    mm.register('bonus2', { source: 'u2', target: 'gems', type: 'add', value: 5 });
    assert.equal(mm.getMultiplier('gold'), 11); // 1 + 10
    assert.equal(mm.getMultiplier('gems'), 6);  // 1 + 5
  });
});

runner.describe('Multiplier - Enable/Disable', () => {
  runner.it('should disable a multiplier', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    mm.disable('bonus1');
    assert.equal(mm.getMultiplier('gold'), 1); // disabled, so base only
  });

  runner.it('should re-enable a multiplier', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    mm.disable('bonus1');
    assert.equal(mm.getMultiplier('gold'), 1);
    mm.enable('bonus1');
    assert.equal(mm.getMultiplier('gold'), 6);
  });

  runner.it('should only disable targeted multiplier', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    mm.register('bonus2', { source: 'u2', target: 'gold', type: 'multiply', value: 2 });
    mm.disable('bonus1');
    // Only additive disabled: (1 + 0) * 2 = 2
    assert.equal(mm.getMultiplier('gold'), 2);
  });
});

runner.describe('Multiplier - Serialization', () => {
  runner.it('should serialize and deserialize enabled states', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    mm.register('bonus2', { source: 'u2', target: 'gold', type: 'multiply', value: 2 });
    mm.disable('bonus1');

    const data = mm.serialize();

    const mm2 = new MultiplierManager();
    mm2.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    mm2.register('bonus2', { source: 'u2', target: 'gold', type: 'multiply', value: 2 });
    mm2.deserialize(data);

    // bonus1 should still be disabled
    assert.equal(mm2.getMultiplier('gold'), 2); // (1+0)*2
  });

  runner.it('should handle deserialization with unknown multiplier ids', () => {
    const mm = new MultiplierManager();
    mm.register('bonus1', { source: 'u1', target: 'gold', type: 'add', value: 5 });
    // Deserializing data with unknown ids should not throw
    mm.deserialize({ bonus1: true, unknownBonus: false });
    assert.equal(mm.getMultiplier('gold'), 6);
  });
});

export { runner };
