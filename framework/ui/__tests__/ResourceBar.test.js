/**
 * ResourceBar Tests
 * Tests for currency display component
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { createContainer, createMockDocument } from './DomMock.js';
import { ResourceBar } from '../ResourceBar.js';

const runner = new TestRunner();

// Inject mock document for all tests
const mockDoc = createMockDocument();

runner.describe('ResourceBar - Construction', () => {
  runner.it('should create with required parameters', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    assert.notNull(bar);
    assert.equal(container.children.length, 1);
  });

  runner.it('should create root element with .resource-bar class', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    const root = container.children[0];
    assert.equal(root.className, 'resource-bar');
  });

  runner.it('should render name element', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    const nameEl = container.querySelector('.resource-name');
    assert.notNull(nameEl);
    assert.equal(nameEl.textContent, 'Gold');
  });

  runner.it('should render value using BigNum.format()', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(1500) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    const valueEl = container.querySelector('.resource-value');
    assert.notNull(valueEl);
    assert.equal(valueEl.textContent, '1.50K');
  });

  runner.it('should render icon when showIcon is true', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100), icon: 'coin' };
    const bar = new ResourceBar(container, data, { showIcon: true, _document: mockDoc });
    const iconEl = container.querySelector('.resource-icon');
    assert.notNull(iconEl);
    assert.equal(iconEl.textContent, 'coin');
  });

  runner.it('should not render icon when showIcon is false', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100), icon: 'coin' };
    const bar = new ResourceBar(container, data, { showIcon: false, _document: mockDoc });
    const iconEl = container.querySelector('.resource-icon');
    assert.equal(iconEl, null);
  });

  runner.it('should render rate when showRate is true', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100), rate: BigNum.from(5) };
    const bar = new ResourceBar(container, data, { showRate: true, _document: mockDoc });
    const rateEl = container.querySelector('.resource-rate');
    assert.notNull(rateEl);
    assert.true(rateEl.textContent.includes('5'));
  });

  runner.it('should not render rate when showRate is false', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100), rate: BigNum.from(5) };
    const bar = new ResourceBar(container, data, { showRate: false, _document: mockDoc });
    const rateEl = container.querySelector('.resource-rate');
    assert.equal(rateEl, null);
  });
});

runner.describe('ResourceBar - Update', () => {
  runner.it('should update value on update()', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    bar.update({ name: 'Gold', amount: BigNum.from(2000) });
    const valueEl = container.querySelector('.resource-value');
    assert.equal(valueEl.textContent, '2.00K');
  });

  runner.it('should update rate on update()', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100), rate: BigNum.from(5) };
    const bar = new ResourceBar(container, data, { showRate: true, _document: mockDoc });
    bar.update({ name: 'Gold', amount: BigNum.from(200), rate: BigNum.from(10) });
    const rateEl = container.querySelector('.resource-rate');
    assert.true(rateEl.textContent.includes('10'));
  });

  runner.it('should update name on update()', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    bar.update({ name: 'Silver', amount: BigNum.from(100) });
    const nameEl = container.querySelector('.resource-name');
    assert.equal(nameEl.textContent, 'Silver');
  });

  runner.it('should handle amount as raw number', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    bar.update({ name: 'Gold', amount: 3000 });
    const valueEl = container.querySelector('.resource-value');
    assert.equal(valueEl.textContent, '3.00K');
  });
});

runner.describe('ResourceBar - Destroy', () => {
  runner.it('should remove element from container on destroy()', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    assert.equal(container.children.length, 1);
    bar.destroy();
    assert.equal(container.children.length, 0);
  });

  runner.it('should be safe to call destroy() twice', () => {
    const container = createContainer();
    const data = { name: 'Gold', amount: BigNum.from(100) };
    const bar = new ResourceBar(container, data, { _document: mockDoc });
    bar.destroy();
    bar.destroy(); // should not throw
    assert.equal(container.children.length, 0);
  });
});

export { runner };
