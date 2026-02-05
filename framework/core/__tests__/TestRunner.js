/**
 * Minimal test runner for vanilla JS modules
 * Runs in browser or Node.js environment
 */

class TestRunner {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.results = { passed: 0, failed: 0, errors: [] };
  }

  describe(name, fn) {
    this.currentSuite = { name, tests: [] };
    this.suites.push(this.currentSuite);
    fn();
    this.currentSuite = null;
  }

  it(name, fn) {
    if (!this.currentSuite) {
      throw new Error('it() must be called inside describe()');
    }
    this.currentSuite.tests.push({ name, fn });
  }

  async run() {
    console.log('\n=== Test Runner ===\n');

    for (const suite of this.suites) {
      console.log(`\n📦 ${suite.name}`);

      for (const test of suite.tests) {
        try {
          const result = test.fn();
          // Handle async tests
          if (result && typeof result.then === 'function') {
            await result;
          }
          console.log(`  ✓ ${test.name}`);
          this.results.passed++;
        } catch (error) {
          console.log(`  ✗ ${test.name}`);
          console.log(`    Error: ${error.message}`);
          this.results.failed++;
          this.results.errors.push({
            suite: suite.name,
            test: test.name,
            error: error.message
          });
        }
      }
    }

    console.log('\n=== Results ===');
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);

    if (this.results.failed > 0) {
      console.log('\nFailed tests:');
      for (const err of this.results.errors) {
        console.log(`  ${err.suite} > ${err.test}: ${err.error}`);
      }
    }

    return this.results.failed === 0;
  }
}

// Assertion helpers
const assert = {
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  },

  deepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
    }
  },

  true(value, message = '') {
    if (value !== true) {
      throw new Error(message || `Expected true, got ${value}`);
    }
  },

  false(value, message = '') {
    if (value !== false) {
      throw new Error(message || `Expected false, got ${value}`);
    }
  },

  throws(fn, message = '') {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(message || 'Expected function to throw');
    }
  },

  notNull(value, message = '') {
    if (value === null || value === undefined) {
      throw new Error(message || `Expected non-null value, got ${value}`);
    }
  },

  null(value, message = '') {
    if (value !== null) {
      throw new Error(message || `Expected null, got ${value}`);
    }
  },

  approximately(actual, expected, tolerance = 0.001, message = '') {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(message || `Expected ${expected} ± ${tolerance}, got ${actual}`);
    }
  },

  greaterThan(actual, expected, message = '') {
    if (actual <= expected) {
      throw new Error(message || `Expected ${actual} > ${expected}`);
    }
  },

  lessThan(actual, expected, message = '') {
    if (actual >= expected) {
      throw new Error(message || `Expected ${actual} < ${expected}`);
    }
  }
};

// Export for ES modules
export { TestRunner, assert };

// Also expose globally for browser scripts
if (typeof window !== 'undefined') {
  window.TestRunner = TestRunner;
  window.assert = assert;
}
