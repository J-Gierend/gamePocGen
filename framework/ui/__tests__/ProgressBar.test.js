/**
 * ProgressBar Tests
 * Tests for visual progress indicator
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { createContainer, createMockDocument } from './DomMock.js';
import { ProgressBar } from '../ProgressBar.js';

const runner = new TestRunner();

const mockDoc = createMockDocument();

runner.describe('ProgressBar - Construction', () => {
  runner.it('should create with default options', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    assert.notNull(bar);
    assert.equal(container.children.length, 1);
  });

  runner.it('should create root with .progress-container class', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    const root = container.children[0];
    assert.equal(root.className, 'progress-container');
  });

  runner.it('should create .progress-bar child', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    const barEl = container.querySelector('.progress-bar');
    assert.notNull(barEl);
  });

  runner.it('should create .progress-fill child', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    const fillEl = container.querySelector('.progress-fill');
    assert.notNull(fillEl);
  });

  runner.it('should render label when provided', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { label: 'XP', _document: mockDoc });
    const labelEl = container.querySelector('.progress-label');
    assert.notNull(labelEl);
    assert.equal(labelEl.textContent, 'XP');
  });

  runner.it('should set color on fill element', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { color: '#ff0000', _document: mockDoc });
    const fillEl = container.querySelector('.progress-fill');
    assert.equal(fillEl.style.backgroundColor, '#ff0000');
  });

  runner.it('should start at 0% fill', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    assert.equal(bar.getPercent(), 0);
  });
});

runner.describe('ProgressBar - Update', () => {
  runner.it('should update progress with update(current, max)', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(50, 100);
    assert.equal(bar.getPercent(), 50);
  });

  runner.it('should set fill width style on update', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(25, 100);
    const fillEl = container.querySelector('.progress-fill');
    assert.equal(fillEl.style.width, '25%');
  });

  runner.it('should clamp to 100%', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(150, 100);
    assert.equal(bar.getPercent(), 100);
  });

  runner.it('should clamp to 0%', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(-10, 100);
    assert.equal(bar.getPercent(), 0);
  });

  runner.it('should handle zero max gracefully', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(0, 0);
    assert.equal(bar.getPercent(), 0);
  });

  runner.it('should calculate percentage correctly', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(1, 3);
    assert.approximately(bar.getPercent(), 33.33, 0.1);
  });
});

runner.describe('ProgressBar - Label', () => {
  runner.it('should update label with setLabel()', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { label: 'XP', _document: mockDoc });
    bar.setLabel('Level 2');
    const labelEl = container.querySelector('.progress-label');
    assert.equal(labelEl.textContent, 'Level 2');
  });

  runner.it('should create label element if not initially present', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.setLabel('HP');
    const labelEl = container.querySelector('.progress-label');
    assert.notNull(labelEl);
    assert.equal(labelEl.textContent, 'HP');
  });
});

runner.describe('ProgressBar - getPercent', () => {
  runner.it('should return 0 before any update', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    assert.equal(bar.getPercent(), 0);
  });

  runner.it('should return correct value after update', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(75, 100);
    assert.equal(bar.getPercent(), 75);
  });

  runner.it('should return 100 at full', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.update(100, 100);
    assert.equal(bar.getPercent(), 100);
  });
});

runner.describe('ProgressBar - Destroy', () => {
  runner.it('should remove element from container on destroy()', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    assert.equal(container.children.length, 1);
    bar.destroy();
    assert.equal(container.children.length, 0);
  });

  runner.it('should be safe to call destroy() twice', () => {
    const container = createContainer();
    const bar = new ProgressBar(container, { _document: mockDoc });
    bar.destroy();
    bar.destroy();
    assert.equal(container.children.length, 0);
  });
});

export { runner };
