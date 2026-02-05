/**
 * Node.js Test Runner for GamePocGen UI Modules
 *
 * Run with: node --experimental-vm-modules run-tests.js
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runAllTests() {
  console.log('GamePocGen UI Module Tests');
  console.log('============================\n');

  const testModules = [
    './ResourceBar.test.js',
    './UpgradeButton.test.js',
    './ProgressBar.test.js',
    './TabSystem.test.js',
    './SkillTree.test.js'
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

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
