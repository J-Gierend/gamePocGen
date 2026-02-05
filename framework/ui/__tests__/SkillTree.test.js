/**
 * SkillTree Tests
 * Tests for node-based skill tree
 */

import { TestRunner, assert } from '../../core/__tests__/TestRunner.js';
import { BigNum } from '../../core/BigNum.js';
import { createContainer, createMockDocument } from './DomMock.js';
import { SkillTree } from '../SkillTree.js';

const runner = new TestRunner();

const mockDoc = createMockDocument();

function makeNode(overrides = {}) {
  return {
    id: 'node1',
    x: 100,
    y: 100,
    icon: 'S',
    name: 'Strength',
    effect: '+10% damage',
    cost: BigNum.from(50),
    costCurrency: 'skillPoints',
    ...overrides
  };
}

runner.describe('SkillTree - Construction', () => {
  runner.it('should create with container', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    assert.notNull(tree);
    assert.equal(container.children.length, 1);
  });

  runner.it('should create root with .skill-tree class', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    const root = container.children[0];
    assert.equal(root.className, 'skill-tree');
  });
});

runner.describe('SkillTree - addNode', () => {
  runner.it('should add a node to the tree', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode());
    const nodeEl = container.querySelector('.skill-node');
    assert.notNull(nodeEl);
  });

  runner.it('should position node using x/y', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ x: 200, y: 150 }));
    const nodeEl = container.querySelector('.skill-node');
    assert.equal(nodeEl.style.left, '200px');
    assert.equal(nodeEl.style.top, '150px');
  });

  runner.it('should display node name', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ name: 'Agility' }));
    const nodeEl = container.querySelector('.skill-node');
    assert.true(getAllText(nodeEl).includes('Agility'));
  });

  runner.it('should add multiple nodes', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.addNode(makeNode({ id: 'n2', x: 200, y: 200, name: 'Defense' }));
    const nodes = container.querySelectorAll('.skill-node');
    assert.equal(nodes.length, 2);
  });

  runner.it('should store node data for getState()', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    const state = tree.getState();
    assert.notNull(state.n1);
    assert.equal(state.n1.unlocked, false);
    assert.equal(state.n1.available, false);
  });
});

runner.describe('SkillTree - connectNodes', () => {
  runner.it('should create a connection between two nodes', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1', x: 0, y: 0 }));
    tree.addNode(makeNode({ id: 'n2', x: 100, y: 100 }));
    tree.connectNodes('n1', 'n2');
    const connector = container.querySelector('.skill-connector');
    assert.notNull(connector);
  });

  runner.it('should not create connection for invalid node ids', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.connectNodes('n1', 'nonexistent');
    const connector = container.querySelector('.skill-connector');
    assert.equal(connector, null);
  });

  runner.it('should mark connector as active when both nodes unlocked', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.addNode(makeNode({ id: 'n2', x: 100, y: 100 }));
    tree.connectNodes('n1', 'n2');
    tree.unlock('n1');
    tree.unlock('n2');
    const connector = container.querySelector('.skill-connector');
    assert.true(connector.className.includes('active'));
  });
});

runner.describe('SkillTree - unlock', () => {
  runner.it('should mark node as unlocked', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.unlock('n1');
    const state = tree.getState();
    assert.true(state.n1.unlocked);
  });

  runner.it('should add unlocked class to node element', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.unlock('n1');
    const nodeEl = container.querySelector('.skill-node');
    assert.true(nodeEl.className.includes('unlocked'));
  });

  runner.it('should ignore invalid node id', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.unlock('nonexistent'); // should not throw
    assert.true(true);
  });
});

runner.describe('SkillTree - setAvailable', () => {
  runner.it('should mark node as available for purchase', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.setAvailable('n1');
    const state = tree.getState();
    assert.true(state.n1.available);
  });

  runner.it('should add available class to node element', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.setAvailable('n1');
    const nodeEl = container.querySelector('.skill-node');
    assert.true(nodeEl.className.includes('available'));
  });

  runner.it('should ignore invalid node id', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.setAvailable('nonexistent'); // should not throw
    assert.true(true);
  });
});

runner.describe('SkillTree - onClick', () => {
  runner.it('should register and fire click callback with node id', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    let clickedId = null;
    tree.onClick((id) => { clickedId = id; });
    const nodeEl = container.querySelector('.skill-node');
    nodeEl.click();
    assert.equal(clickedId, 'n1');
  });

  runner.it('should pass node data to click callback', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1', name: 'Strength' }));
    let clickedData = null;
    tree.onClick((id, data) => { clickedData = data; });
    const nodeEl = container.querySelector('.skill-node');
    nodeEl.click();
    assert.equal(clickedData.name, 'Strength');
  });
});

runner.describe('SkillTree - getState', () => {
  runner.it('should return state of all nodes', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode({ id: 'n1' }));
    tree.addNode(makeNode({ id: 'n2', x: 100, y: 100 }));
    tree.unlock('n1');
    tree.setAvailable('n2');
    const state = tree.getState();
    assert.true(state.n1.unlocked);
    assert.false(state.n1.available);
    assert.false(state.n2.unlocked);
    assert.true(state.n2.available);
  });

  runner.it('should return empty object when no nodes', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    const state = tree.getState();
    assert.deepEqual(state, {});
  });
});

runner.describe('SkillTree - Destroy', () => {
  runner.it('should remove element from container on destroy()', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.addNode(makeNode());
    assert.equal(container.children.length, 1);
    tree.destroy();
    assert.equal(container.children.length, 0);
  });

  runner.it('should be safe to call destroy() twice', () => {
    const container = createContainer();
    const tree = new SkillTree(container, { _document: mockDoc });
    tree.destroy();
    tree.destroy();
    assert.equal(container.children.length, 0);
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
