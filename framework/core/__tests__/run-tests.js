/**
 * Node.js Test Runner for GamePocGen Core Modules
 *
 * Run with: node --experimental-vm-modules run-tests.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Polyfill performance for older Node versions
if (typeof globalThis.performance === 'undefined') {
  const { performance } = await import('perf_hooks');
  globalThis.performance = performance;
}

async function runAllTests() {
  console.log('GamePocGen Core Module Tests');
  console.log('============================\n');

  const testModules = [
    './EventBus.test.js',
    './BigNum.test.js',
    './SaveManager.test.js',
    './GameLoop.test.js'
  ];

  let totalPassed = 0;
  let totalFailed = 0;

  for (const modulePath of testModules) {
    try {
      const { runner } = await import(modulePath);
      await runner.run();
      totalPassed += runner.results.passed;
      totalFailed += runner.results.failed;
    } catch (error) {
      console.log(`\n[ERROR] Failed to load ${modulePath}:`);
      console.log(`  ${error.message}`);
      if (error.stack) {
        console.log(error.stack.split('\n').slice(1, 4).join('\n'));
      }
      totalFailed++;
    }
  }

  console.log('\n============================');
  console.log('TOTAL RESULTS');
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log('============================\n');

  // Exit with error code if tests failed
  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
