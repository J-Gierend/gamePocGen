/**
 * GameLoop Tests
 * Tests for game tick system
 */

import { TestRunner, assert } from './TestRunner.js';
import { GameLoop } from '../GameLoop.js';

const runner = new TestRunner();

runner.describe('GameLoop - Basic Creation', () => {
  runner.it('should create an instance with default tick rate', () => {
    const loop = new GameLoop();
    assert.notNull(loop);
  });

  runner.it('should create an instance with custom tick rate', () => {
    const loop = new GameLoop({ tickRate: 60 });
    assert.notNull(loop);
  });
});

runner.describe('GameLoop - Tick Handlers', () => {
  runner.it('should register tick handler with onTick', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let called = false;

    loop.onTick(() => {
      called = true;
    });

    // Start and immediately stop to trigger at least one tick
    loop.start();

    // Wait for tick
    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        assert.true(called, 'Tick handler should have been called');
        resolve();
      }, 100);
    });
  });

  runner.it('should pass deltaTime to tick handler', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let receivedDelta = null;

    loop.onTick((deltaTime) => {
      receivedDelta = deltaTime;
    });

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        assert.notNull(receivedDelta);
        assert.true(typeof receivedDelta === 'number', 'deltaTime should be a number');
        assert.true(receivedDelta > 0, 'deltaTime should be positive');
        resolve();
      }, 100);
    });
  });

  runner.it('should call multiple tick handlers', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let count1 = 0;
    let count2 = 0;

    loop.onTick(() => count1++);
    loop.onTick(() => count2++);

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        assert.true(count1 > 0, 'First handler should be called');
        assert.true(count2 > 0, 'Second handler should be called');
        assert.equal(count1, count2, 'Both handlers should be called same number of times');
        resolve();
      }, 100);
    });
  });
});

runner.describe('GameLoop - Render Handlers', () => {
  runner.it('should register render handler with onRender', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let called = false;

    loop.onRender(() => {
      called = true;
    });

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        assert.true(called, 'Render handler should have been called');
        resolve();
      }, 50);
    });
  });

  runner.it('should pass deltaTime to render handler', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let receivedDelta = null;

    loop.onRender((deltaTime) => {
      receivedDelta = deltaTime;
    });

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        assert.notNull(receivedDelta);
        assert.true(typeof receivedDelta === 'number', 'deltaTime should be a number');
        resolve();
      }, 50);
    });
  });
});

runner.describe('GameLoop - Start/Stop Control', () => {
  runner.it('should not call handlers when not started', async () => {
    const loop = new GameLoop({ tickRate: 20 });
    let tickCount = 0;

    loop.onTick(() => tickCount++);

    // Don't start, just wait
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(tickCount, 0, 'Should not tick when not started');
  });

  runner.it('should stop calling handlers after stop()', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let tickCount = 0;

    loop.onTick(() => tickCount++);

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        const countAtStop = tickCount;

        setTimeout(() => {
          // Count should not have increased after stop
          assert.equal(tickCount, countAtStop, 'Should not tick after stop');
          resolve();
        }, 100);
      }, 100);
    });
  });

  runner.it('should be able to restart after stop', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let tickCount = 0;

    loop.onTick(() => tickCount++);

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        loop.stop();
        const countAfterFirstRun = tickCount;

        loop.start();

        setTimeout(() => {
          loop.stop();
          assert.true(tickCount > countAfterFirstRun, 'Should tick again after restart');
          resolve();
        }, 100);
      }, 100);
    });
  });

  runner.it('should report running state', () => {
    const loop = new GameLoop({ tickRate: 20 });

    assert.false(loop.isRunning());

    loop.start();
    assert.true(loop.isRunning());

    loop.stop();
    assert.false(loop.isRunning());
  });
});

runner.describe('GameLoop - Tick Rate', () => {
  runner.it('should tick at approximately the correct rate', () => {
    const tickRate = 20; // 20 ticks per second = 50ms per tick
    const loop = new GameLoop({ tickRate });
    let tickCount = 0;

    loop.onTick(() => tickCount++);

    loop.start();

    return new Promise((resolve) => {
      // Run for 500ms, expect ~10 ticks (20 ticks/sec * 0.5 sec)
      setTimeout(() => {
        loop.stop();
        // Allow some tolerance (8-12 ticks expected)
        assert.true(tickCount >= 8, `Expected at least 8 ticks, got ${tickCount}`);
        assert.true(tickCount <= 15, `Expected at most 15 ticks, got ${tickCount}`);
        resolve();
      }, 500);
    });
  });
});

runner.describe('GameLoop - Unsubscribe', () => {
  runner.it('should unsubscribe tick handler', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let count = 0;

    const unsubscribe = loop.onTick(() => count++);

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        unsubscribe();
        const countAfterUnsub = count;

        setTimeout(() => {
          loop.stop();
          // Count should be same (maybe +1 for timing)
          assert.true(count <= countAfterUnsub + 1, 'Should not tick after unsubscribe');
          resolve();
        }, 100);
      }, 100);
    });
  });

  runner.it('should unsubscribe render handler', () => {
    const loop = new GameLoop({ tickRate: 20 });
    let count = 0;

    const unsubscribe = loop.onRender(() => count++);

    loop.start();

    return new Promise((resolve) => {
      setTimeout(() => {
        unsubscribe();
        const countAfterUnsub = count;

        setTimeout(() => {
          loop.stop();
          // Count should be same (maybe +1 for timing)
          assert.true(count <= countAfterUnsub + 1, 'Should not render after unsubscribe');
          resolve();
        }, 100);
      }, 100);
    });
  });
});

// Run tests and export
export { runner };
