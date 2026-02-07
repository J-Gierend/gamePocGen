/**
 * Minimal test runner - no external dependencies.
 * Runs all test functions exported from test files.
 */

import { runTests as runQueueManagerTests } from './queueManager.test.js';
import { runTests as runContainerManagerTests } from './containerManager.test.js';
import { runTests as runDeploymentManagerTests } from './deploymentManager.test.js';
import { runTests as runGameTesterTests } from './gameTester.test.js';

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
  await runSuite('QueueManager', runQueueManagerTests());
  await runSuite('ContainerManager', runContainerManagerTests());
  await runSuite('DeploymentManager', runDeploymentManagerTests());
  await runSuite('GameTester', runGameTesterTests());

  console.log(`\n--- Results: ${results.passed} passed, ${results.failed} failed ---\n`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
