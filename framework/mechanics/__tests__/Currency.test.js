/**
 * Currency Tests
 * Tests for currency management system
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { CurrencyManager } from '../Currency.js';

const runner = new TestRunner();

runner.describe('Currency - Registration', () => {
  runner.it('should register a currency', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    const state = cm.get('gold');
    assert.notNull(state);
    assert.equal(state.id, 'gold');
    assert.equal(state.name, 'Gold');
    assert.equal(state.icon, 'coin');
    assert.true(state.amount.eq(0));
  });

  runner.it('should register with initial amount', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    const state = cm.get('gold');
    assert.true(state.amount.eq(100));
  });

  runner.it('should register with BigNum initial amount', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: BigNum.from(500) });
    const state = cm.get('gold');
    assert.true(state.amount.eq(500));
  });

  runner.it('should return null for unregistered currency', () => {
    const cm = new CurrencyManager();
    const state = cm.get('nonexistent');
    assert.null(state);
  });
});

runner.describe('Currency - Add/Sub', () => {
  runner.it('should add amount as number', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    cm.add('gold', 50);
    assert.true(cm.get('gold').amount.eq(50));
  });

  runner.it('should add amount as BigNum', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    cm.add('gold', BigNum.from(200));
    assert.true(cm.get('gold').amount.eq(200));
  });

  runner.it('should accumulate additions', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    cm.add('gold', 100);
    cm.add('gold', 50);
    assert.true(cm.get('gold').amount.eq(150));
  });

  runner.it('should subtract amount when sufficient', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    const result = cm.sub('gold', 30);
    assert.true(result);
    assert.true(cm.get('gold').amount.eq(70));
  });

  runner.it('should return false when insufficient funds', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 10 });
    const result = cm.sub('gold', 50);
    assert.false(result);
    assert.true(cm.get('gold').amount.eq(10));
  });

  runner.it('should subtract exact amount', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    const result = cm.sub('gold', 100);
    assert.true(result);
    assert.true(cm.get('gold').amount.eq(0));
  });
});

runner.describe('Currency - canAfford', () => {
  runner.it('should return true when enough', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    assert.true(cm.canAfford('gold', 50));
  });

  runner.it('should return true for exact amount', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    assert.true(cm.canAfford('gold', 100));
  });

  runner.it('should return false when not enough', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 10 });
    assert.false(cm.canAfford('gold', 50));
  });

  runner.it('should work with BigNum amounts', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 1000 });
    assert.true(cm.canAfford('gold', BigNum.from(500)));
    assert.false(cm.canAfford('gold', BigNum.from(5000)));
  });
});

runner.describe('Currency - Conversion', () => {
  runner.it('should add and execute a converter', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    cm.addConverter('gold', 'gems', 10); // 10 gold per 1 gem
    const result = cm.convert('gold', 'gems', 1);
    assert.true(result);
    assert.true(cm.get('gold').amount.eq(90));
    assert.true(cm.get('gems').amount.eq(1));
  });

  runner.it('should fail conversion when insufficient funds', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 5 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    cm.addConverter('gold', 'gems', 10);
    const result = cm.convert('gold', 'gems', 1);
    assert.false(result);
    assert.true(cm.get('gold').amount.eq(5));
    assert.true(cm.get('gems').amount.eq(0));
  });

  runner.it('should convert multiple units', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    cm.addConverter('gold', 'gems', 10);
    const result = cm.convert('gold', 'gems', 5);
    assert.true(result);
    assert.true(cm.get('gold').amount.eq(50));
    assert.true(cm.get('gems').amount.eq(5));
  });

  runner.it('should convert max possible when no amount specified', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 25 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    cm.addConverter('gold', 'gems', 10);
    const result = cm.convert('gold', 'gems');
    assert.true(result);
    assert.true(cm.get('gold').amount.eq(5)); // 25 - 20 = 5 leftover
    assert.true(cm.get('gems').amount.eq(2));
  });
});

runner.describe('Currency - getAll', () => {
  runner.it('should return all registered currencies', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 100 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem', initial: 5 });
    const all = cm.getAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].id, 'gold');
    assert.equal(all[1].id, 'gems');
  });
});

runner.describe('Currency - Serialization', () => {
  runner.it('should serialize and deserialize', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 500 });
    cm.register({ id: 'gems', name: 'Gems', icon: 'gem', initial: 10 });

    const data = cm.serialize();

    const cm2 = new CurrencyManager();
    cm2.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    cm2.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    cm2.deserialize(data);

    assert.true(cm2.get('gold').amount.eq(500));
    assert.true(cm2.get('gems').amount.eq(10));
  });

  runner.it('should handle deserialization of unknown currencies gracefully', () => {
    const cm = new CurrencyManager();
    cm.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    // Deserialize data with a currency not registered - should not throw
    cm.deserialize({ gold: { mantissa: 1, exponent: 2 }, unknown: { mantissa: 5, exponent: 0 } });
    assert.true(cm.get('gold').amount.eq(100));
  });
});

export { runner };
