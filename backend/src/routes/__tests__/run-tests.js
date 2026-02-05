/**
 * Minimal test runner for API route tests - no external dependencies.
 */

import { runTests as runApiTests } from './api.test.js';

const results = { passed: 0, failed: 0, errors: [] };

async function runSuite(name, tests) {
  console.log(`\n=== ${name} Tests ===\n`);

  for (const [testName, fn] of Object.entries(tests)) {
    try {
      await fn();
      results.passed++;
      console.log(`  PASS  ${testName}`);
    } catch (err) {
      results.failed++;
      results.errors.push({ name: testName, error: err });
      console.log(`  FAIL  ${testName}`);
      console.log(`        ${err.message}`);
    }
  }
}

async function run() {
  await runSuite('API Routes', runApiTests());

  console.log(`\n--- Results: ${results.passed} passed, ${results.failed} failed ---\n`);

  if (results.failed > 0) {
    console.log('Failed tests:');
    for (const { name, error } of results.errors) {
      console.log(`  - ${name}: ${error.message}`);
    }
    console.log('');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
