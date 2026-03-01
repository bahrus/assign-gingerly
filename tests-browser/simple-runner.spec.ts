import { test, expect } from '@playwright/test';

/**
 * Simple test runner that executes tests directly in the browser JavaScript engine.
 * No external test harness needed - tests are self-contained.
 */

test('assignGingerly - All tests in browser', async ({ page, browserName }) => {
  // Navigate to a simple test page we'll create
  await page.goto('/tests-browser/all-tests.html');
  
  // Wait for tests to complete
  await page.waitForFunction(() => {
    return (window as any).testsComplete === true;
  }, { timeout: 30000 });
  
  // Get test results
  const results = await page.evaluate(() => {
    return (window as any).testResults;
  });
  
  console.log(`\n${browserName} Test Results:`);
  console.log(`  Total: ${results.total}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  
  if (results.failures.length > 0) {
    console.log(`\nFailures:`);
    results.failures.forEach((failure: any) => {
      console.log(`  ❌ ${failure.name}: ${failure.error}`);
    });
  }
  
  // Check native support
  const hasNativeSupport = await page.evaluate(() => {
    return typeof WeakMap.prototype.getOrInsertComputed === 'function';
  });
  
  console.log(`\ngetOrInsertComputed: ${hasNativeSupport ? '✓ Native' : '⚠ Polyfill'}`);
  
  // Assert all tests passed
  expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
  expect(results.passed).toBeGreaterThan(0);
});
