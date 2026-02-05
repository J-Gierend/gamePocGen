/**
 * Generator Tests
 * Tests for resource production system
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { CurrencyManager } from '../Currency.js';
import { GeneratorManager } from '../Generator.js';

const runner = new TestRunner();

function setup() {
  const cm = new CurrencyManager();
  cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 1000 });
  cm.register({ id: 'gems', name: 'Gems', icon: 'gem' });
  const gm = new GeneratorManager(cm);
  return { cm, gm };
}

runner.describe('Generator - Registration', () => {
  runner.it('should register a generator', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    const all = gm.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'miner');
    assert.equal(all[0].name, 'Gold Miner');
    assert.equal(all[0].count, 0);
  });

  runner.it('should default costCurrency to produces currency', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15
    });
    // Should be able to buy with gold (the produces currency)
    const cost = gm.getCost('miner');
    assert.true(cost.eq(10));
  });
});

runner.describe('Generator - Cost Calculation', () => {
  runner.it('should return base cost for first purchase', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    const cost = gm.getCost('miner');
    assert.true(cost.eq(10));
  });

  runner.it('should scale cost with multiplier after purchase', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner');
    const cost = gm.getCost('miner');
    // 10 * 1.15^1 = 11.5
    assert.approximately(cost.toNumber(), 11.5, 0.01);
  });

  runner.it('should calculate cost for multiple purchases', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    // Cost for buying 3: sum of baseCost * mult^0, baseCost * mult^1, baseCost * mult^2
    const cost = gm.getCost('miner', 3);
    const expected = 10 + 10 * 1.15 + 10 * 1.15 * 1.15;
    assert.approximately(cost.toNumber(), expected, 0.01);
  });
});

runner.describe('Generator - Buying', () => {
  runner.it('should buy a generator and deduct cost', () => {
    const { cm, gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    const result = gm.buy('miner');
    assert.true(result);
    const all = gm.getAll();
    assert.equal(all[0].count, 1);
    assert.true(cm.get('gold').amount.eq(990));
  });

  runner.it('should buy multiple generators', () => {
    const { cm, gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    const result = gm.buy('miner', 3);
    assert.true(result);
    const all = gm.getAll();
    assert.equal(all[0].count, 3);
  });

  runner.it('should fail to buy when insufficient funds', () => {
    const { cm, gm } = setup();
    cm.register({ id: 'silver', name: 'Silver', icon: 's', initial: 5 });
    gm.register({
      id: 'miner',
      name: 'Silver Miner',
      produces: 'silver',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'silver'
    });
    const result = gm.buy('miner');
    assert.false(result);
    assert.equal(gm.getAll().find(g => g.id === 'miner').count, 0);
  });
});

runner.describe('Generator - Production', () => {
  runner.it('should get production rate for a generator', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner');
    const rate = gm.getProduction('miner');
    assert.true(rate.eq(1)); // 1 miner * 1 base production
  });

  runner.it('should scale production with count', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 2,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner', 5);
    const rate = gm.getProduction('miner');
    assert.true(rate.eq(10)); // 5 miners * 2 base production
  });

  runner.it('should produce resources on tick', () => {
    const { cm, gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 10,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner'); // cost: 10 gold, so 990 gold left
    gm.tick(1.0); // 1 second: 1 miner * 10/s = 10 gold produced
    // 990 + 10 = 1000
    assert.true(cm.get('gold').amount.eq(1000));
  });

  runner.it('should produce fractional resources based on dt', () => {
    const { cm, gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 10,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner'); // 990 gold left
    gm.tick(0.5); // 0.5 seconds: 1 miner * 10/s * 0.5 = 5 gold
    assert.approximately(cm.get('gold').amount.toNumber(), 995, 0.01);
  });

  runner.it('should return zero production for zero generators', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 10,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    const rate = gm.getProduction('miner');
    assert.true(rate.eq(0));
  });
});

runner.describe('Generator - getAll', () => {
  runner.it('should return all generators with details', () => {
    const { gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.register({
      id: 'alchemist',
      name: 'Alchemist',
      produces: 'gems',
      baseProduction: 0.5,
      baseCost: 100,
      costMultiplier: 1.2,
      costCurrency: 'gold'
    });
    const all = gm.getAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].id, 'miner');
    assert.equal(all[1].id, 'alchemist');
  });
});

runner.describe('Generator - Serialization', () => {
  runner.it('should serialize and deserialize', () => {
    const { cm, gm } = setup();
    gm.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm.buy('miner', 5);

    const data = gm.serialize();

    // Create fresh instance
    const cm2 = new CurrencyManager();
    cm2.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 0 });
    cm2.register({ id: 'gems', name: 'Gems', icon: 'gem' });
    const gm2 = new GeneratorManager(cm2);
    gm2.register({
      id: 'miner',
      name: 'Gold Miner',
      produces: 'gold',
      baseProduction: 1,
      baseCost: 10,
      costMultiplier: 1.15,
      costCurrency: 'gold'
    });
    gm2.deserialize(data);

    assert.equal(gm2.getAll()[0].count, 5);
  });
});

export { runner };
