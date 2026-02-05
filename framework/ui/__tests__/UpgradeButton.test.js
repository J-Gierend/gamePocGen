/**
 * UpgradeButton Tests
 * Tests for purchasable upgrade display
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { createContainer, createMockDocument } from './DomMock.js';
import { UpgradeButton } from '../UpgradeButton.js';

const runner = new TestRunner();

const mockDoc = createMockDocument();

function makeUpgradeData(overrides = {}) {
  return {
    id: 'upgrade1',
    name: 'Double Gold',
    description: 'Doubles gold production',
    cost: BigNum.from(100),
    costCurrency: 'gold',
    level: 0,
    maxLevel: 10,
    effect: 'x2 gold/s',
    ...overrides
  };
}

runner.describe('UpgradeButton - Construction', () => {
  runner.it('should create with required parameters', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    assert.notNull(btn);
    assert.equal(container.children.length, 1);
  });

  runner.it('should create root element with .upgrade-btn class', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    const root = container.children[0];
    assert.true(root.className.includes('upgrade-btn'));
  });

  runner.it('should render upgrade info with name and description', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    const infoEl = container.querySelector('.upgrade-info');
    assert.notNull(infoEl);
  });

  runner.it('should render cost element using BigNum.format()', () => {
    const container = createContainer();
    const data = makeUpgradeData({ cost: BigNum.from(1500) });
    const btn = new UpgradeButton(container, data, { _document: mockDoc });
    const costEl = container.querySelector('.upgrade-cost');
    assert.notNull(costEl);
    assert.true(costEl.textContent.includes('1.50K'));
  });

  runner.it('should show level when showLevel is true', () => {
    const container = createContainer();
    const data = makeUpgradeData({ level: 3, maxLevel: 10 });
    const btn = new UpgradeButton(container, data, { showLevel: true, _document: mockDoc });
    const root = container.children[0];
    // Level text should appear somewhere in the component
    const allText = getAllText(root);
    assert.true(allText.includes('3'), 'Expected level 3 in text');
  });

  runner.it('should not show level when showLevel is false', () => {
    const container = createContainer();
    const data = makeUpgradeData({ level: 3, maxLevel: 10 });
    const btn = new UpgradeButton(container, data, { showLevel: false, _document: mockDoc });
    // No level element rendered
    const levelEl = container.querySelector('.upgrade-level');
    assert.equal(levelEl, null);
  });

  runner.it('should render icon element', () => {
    const container = createContainer();
    const data = makeUpgradeData();
    const btn = new UpgradeButton(container, data, { _document: mockDoc });
    const iconEl = container.querySelector('.upgrade-icon');
    assert.notNull(iconEl);
  });
});

runner.describe('UpgradeButton - Affordability', () => {
  runner.it('should set affordable class via setAffordable(true)', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    btn.setAffordable(true);
    const root = container.children[0];
    assert.true(root.className.includes('affordable'));
  });

  runner.it('should remove affordable class via setAffordable(false)', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    btn.setAffordable(true);
    btn.setAffordable(false);
    const root = container.children[0];
    assert.false(root.className.includes('affordable'));
  });

  runner.it('should add locked class when at maxLevel', () => {
    const container = createContainer();
    const data = makeUpgradeData({ level: 10, maxLevel: 10 });
    const btn = new UpgradeButton(container, data, { _document: mockDoc });
    const root = container.children[0];
    assert.true(root.className.includes('locked'));
  });

  runner.it('should not have locked class when below maxLevel', () => {
    const container = createContainer();
    const data = makeUpgradeData({ level: 5, maxLevel: 10 });
    const btn = new UpgradeButton(container, data, { _document: mockDoc });
    const root = container.children[0];
    assert.false(root.className.includes('locked'));
  });
});

runner.describe('UpgradeButton - Click Handler', () => {
  runner.it('should register and fire click callback', () => {
    const container = createContainer();
    const data = makeUpgradeData();
    const btn = new UpgradeButton(container, data, { _document: mockDoc });
    let clicked = false;
    let clickedData = null;
    btn.onClick((d) => { clicked = true; clickedData = d; });
    container.children[0].click();
    assert.true(clicked);
    assert.equal(clickedData.id, 'upgrade1');
  });

  runner.it('should support multiple click callbacks', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    let count = 0;
    btn.onClick(() => count++);
    btn.onClick(() => count++);
    container.children[0].click();
    assert.equal(count, 2);
  });
});

runner.describe('UpgradeButton - Update', () => {
  runner.it('should update cost on update()', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    btn.update(makeUpgradeData({ cost: BigNum.from(5000) }));
    const costEl = container.querySelector('.upgrade-cost');
    assert.true(costEl.textContent.includes('5.00K'));
  });

  runner.it('should update level on update()', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData({ level: 1 }), { showLevel: true, _document: mockDoc });
    btn.update(makeUpgradeData({ level: 5 }));
    const allText = getAllText(container.children[0]);
    assert.true(allText.includes('5'), 'Expected level 5 in text');
  });

  runner.it('should set locked on update when reaching maxLevel', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData({ level: 5 }), { _document: mockDoc });
    assert.false(container.children[0].className.includes('locked'));
    btn.update(makeUpgradeData({ level: 10, maxLevel: 10 }));
    assert.true(container.children[0].className.includes('locked'));
  });
});

runner.describe('UpgradeButton - Destroy', () => {
  runner.it('should remove element from container on destroy()', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    assert.equal(container.children.length, 1);
    btn.destroy();
    assert.equal(container.children.length, 0);
  });

  runner.it('should not fire click after destroy', () => {
    const container = createContainer();
    const btn = new UpgradeButton(container, makeUpgradeData(), { _document: mockDoc });
    let clicked = false;
    btn.onClick(() => { clicked = true; });
    const root = container.children[0];
    btn.destroy();
    root.click(); // after removal - should not fire
    assert.false(clicked);
  });
});

// Helper: recursively collect all textContent
function getAllText(el) {
  let text = el.textContent || '';
  for (const child of (el.children || [])) {
    text += ' ' + getAllText(child);
  }
  return text;
}

export { runner };
