/**
 * TabSystem Tests
 * Tests for tabbed content switching
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { createContainer, createMockDocument, MockElement } from './DomMock.js';
import { TabSystem } from '../TabSystem.js';

const runner = new TestRunner();

const mockDoc = createMockDocument();

runner.describe('TabSystem - Construction', () => {
  runner.it('should create with container', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    assert.notNull(tabs);
    assert.equal(container.children.length, 1);
  });

  runner.it('should create root with .tabs class', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const root = container.children[0];
    assert.equal(root.className, 'tabs');
  });

  runner.it('should create .tab-header element', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const header = container.querySelector('.tab-header');
    assert.notNull(header);
  });

  runner.it('should create .tab-content element', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const content = container.querySelector('.tab-content');
    assert.notNull(content);
  });
});

runner.describe('TabSystem - addTab', () => {
  runner.it('should add a tab with id, label, and content', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const content = new MockElement('div');
    content.textContent = 'Panel A';
    tabs.addTab('tab1', 'Tab 1', content);
    const header = container.querySelector('.tab-header');
    assert.equal(header.children.length, 1);
  });

  runner.it('should create a .tab-btn for each tab', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    const buttons = container.querySelectorAll('.tab-btn');
    assert.equal(buttons.length, 2);
  });

  runner.it('should set button text to label', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'My Tab', new MockElement('div'));
    const btn = container.querySelector('.tab-btn');
    assert.equal(btn.textContent, 'My Tab');
  });

  runner.it('should auto-activate first tab added', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const content1 = new MockElement('div');
    content1.textContent = 'Panel 1';
    tabs.addTab('tab1', 'Tab 1', content1);
    assert.equal(tabs.getActiveTab(), 'tab1');
    const btn = container.querySelector('.tab-btn');
    assert.true(btn.className.includes('active'));
  });

  runner.it('should not auto-activate subsequent tabs', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    assert.equal(tabs.getActiveTab(), 'tab1');
  });
});

runner.describe('TabSystem - switchTo', () => {
  runner.it('should switch active tab', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    tabs.switchTo('tab2');
    assert.equal(tabs.getActiveTab(), 'tab2');
  });

  runner.it('should update active class on buttons', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    tabs.switchTo('tab2');
    const buttons = container.querySelectorAll('.tab-btn');
    assert.false(buttons[0].className.includes('active'));
    assert.true(buttons[1].className.includes('active'));
  });

  runner.it('should show correct content panel', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    const content1 = new MockElement('div');
    content1.textContent = 'Panel 1';
    const content2 = new MockElement('div');
    content2.textContent = 'Panel 2';
    tabs.addTab('tab1', 'Tab 1', content1);
    tabs.addTab('tab2', 'Tab 2', content2);
    tabs.switchTo('tab2');
    // Content2 should be visible (display not 'none'), content1 should be hidden
    assert.equal(content1.style.display, 'none');
    assert.notNull(content2.style.display);
    assert.true(content2.style.display !== 'none');
  });

  runner.it('should ignore invalid tab id', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.switchTo('nonexistent');
    assert.equal(tabs.getActiveTab(), 'tab1');
  });

  runner.it('should switch on button click', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    const buttons = container.querySelectorAll('.tab-btn');
    buttons[1].click();
    assert.equal(tabs.getActiveTab(), 'tab2');
  });
});

runner.describe('TabSystem - getActiveTab', () => {
  runner.it('should return null when no tabs added', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    assert.equal(tabs.getActiveTab(), null);
  });

  runner.it('should return id of active tab', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tabA', 'A', new MockElement('div'));
    tabs.addTab('tabB', 'B', new MockElement('div'));
    assert.equal(tabs.getActiveTab(), 'tabA');
    tabs.switchTo('tabB');
    assert.equal(tabs.getActiveTab(), 'tabB');
  });
});

runner.describe('TabSystem - onSwitch', () => {
  runner.it('should fire callback on tab switch', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    let switched = null;
    tabs.onSwitch((id) => { switched = id; });
    tabs.switchTo('tab2');
    assert.equal(switched, 'tab2');
  });

  runner.it('should not fire callback when switching to same tab', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    let count = 0;
    tabs.onSwitch(() => { count++; });
    tabs.switchTo('tab1'); // already active
    assert.equal(count, 0);
  });

  runner.it('should support multiple callbacks', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    tabs.addTab('tab2', 'Tab 2', new MockElement('div'));
    let count = 0;
    tabs.onSwitch(() => count++);
    tabs.onSwitch(() => count++);
    tabs.switchTo('tab2');
    assert.equal(count, 2);
  });
});

runner.describe('TabSystem - Destroy', () => {
  runner.it('should remove element from container on destroy()', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.addTab('tab1', 'Tab 1', new MockElement('div'));
    assert.equal(container.children.length, 1);
    tabs.destroy();
    assert.equal(container.children.length, 0);
  });

  runner.it('should be safe to call destroy() twice', () => {
    const container = createContainer();
    const tabs = new TabSystem(container, { _document: mockDoc });
    tabs.destroy();
    tabs.destroy();
    assert.equal(container.children.length, 0);
  });
});

export { runner };
