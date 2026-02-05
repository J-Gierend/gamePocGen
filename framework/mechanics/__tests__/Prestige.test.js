/**
 * Prestige Tests
 * Tests for reset/prestige layer system
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { CurrencyManager } from '../Currency.js';
import { GeneratorManager } from '../Generator.js';
import { PrestigeManager } from '../Prestige.js';

const runner = new TestRunner();

function setup() {
  const cm = new CurrencyManager();
  cm.register({ id: 'gold', name: 'Gold', icon: 'coin', initial: 10000 });
  cm.register({ id: 'prestige_points', name: 'Prestige Points', icon: 'star' });

  const gm = new GeneratorManager(cm);
  gm.register({
    id: 'miner',
    name: 'Gold Miner',
    produces: 'gold',
    baseProduction: 1,
    baseCost: 10,
    costMultiplier: 1.15,
    costCurrency: 'gold'
  });

  const pm = new PrestigeManager(cm, gm);
  return { cm, gm, pm };
}

runner.describe('Prestige - Layer Registration', () => {
  runner.it('should add a prestige layer', () => {
    const { pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    // Should not throw
    assert.true(true);
  });
});

runner.describe('Prestige - canPrestige', () => {
  runner.it('should return true when requirement is met', () => {
    const { pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    // gold is 10000, requirement is 1000
    assert.true(pm.canPrestige('prestige'));
  });

  runner.it('should return false when requirement is not met', () => {
    const { cm, pm } = setup();
    // Reduce gold below requirement
    cm.sub('gold', 9500); // 500 gold left
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    assert.false(pm.canPrestige('prestige'));
  });
});

runner.describe('Prestige - getPrestigeGain', () => {
  runner.it('should calculate gain without resetting', () => {
    const { cm, pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    // gold = 10000, formula: floor(sqrt(10000/100)) = floor(sqrt(100)) = 10
    const gain = pm.getPrestigeGain('prestige');
    assert.equal(gain.toNumber(), 10);
    // Gold should not have been reset
    assert.true(cm.get('gold').amount.eq(10000));
  });

  runner.it('should return 0 when below requirement', () => {
    const { cm, pm } = setup();
    cm.sub('gold', 9500);
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    const gain = pm.getPrestigeGain('prestige');
    assert.equal(gain.toNumber(), 0);
  });
});

runner.describe('Prestige - Execute Prestige', () => {
  runner.it('should award prestige currency', () => {
    const { cm, pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    const result = pm.prestige('prestige');
    assert.true(result);
    assert.true(cm.get('prestige_points').amount.eq(10));
  });

  runner.it('should reset specified currencies', () => {
    const { cm, pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    pm.prestige('prestige');
    assert.true(cm.get('gold').amount.eq(0));
  });

  runner.it('should keep specified currencies', () => {
    const { cm, pm } = setup();
    cm.add('prestige_points', 5); // Pre-existing prestige points
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    pm.prestige('prestige');
    // Should have 5 (existing) + 10 (gained) = 15
    assert.true(cm.get('prestige_points').amount.eq(15));
  });

  runner.it('should reset generators when their currency is reset', () => {
    const { cm, gm, pm } = setup();
    gm.buy('miner', 5);
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    pm.prestige('prestige');
    // Generators that cost gold should be reset
    assert.equal(gm.getAll()[0].count, 0);
  });

  runner.it('should return false when cannot prestige', () => {
    const { cm, pm } = setup();
    cm.sub('gold', 9500);
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    const result = pm.prestige('prestige');
    assert.false(result);
  });
});

runner.describe('Prestige - Serialization', () => {
  runner.it('should serialize and deserialize', () => {
    const { cm, gm, pm } = setup();
    pm.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    pm.prestige('prestige');

    const data = pm.serialize();

    const cm2 = new CurrencyManager();
    cm2.register({ id: 'gold', name: 'Gold', icon: 'coin' });
    cm2.register({ id: 'prestige_points', name: 'PP', icon: 'star' });
    const gm2 = new GeneratorManager(cm2);
    const pm2 = new PrestigeManager(cm2, gm2);
    pm2.addLayer({
      id: 'prestige',
      currency: 'prestige_points',
      requirement: { currency: 'gold', amount: 1000 },
      formula: (gold) => Math.floor(Math.sqrt(gold.toNumber() / 100)),
      resets: ['gold'],
      keeps: ['prestige_points']
    });
    pm2.deserialize(data);

    // Prestige count should be restored
    assert.equal(pm2.serialize().prestige.count, 1);
  });
});

export { runner };
