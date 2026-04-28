import { test, expect } from '@playwright/test';

test.describe('resolveValues & assignFrom', () => {
  test('should run all resolveValues and assignFrom tests in browser', async ({ page }) => {
    // Start the server and navigate to the test page
    await page.goto('http://localhost:8000/tests/resolve-values.html');
    
    // Wait for tests to complete
    await page.waitForFunction(() => (window as any).__TEST_RESULTS__);
    
    // Get results
    const testResults = await page.evaluate(() => (window as any).__TEST_RESULTS__);
    
    console.log(`resolveValues & assignFrom tests: ${testResults.passed}/${testResults.total} passed`);
    
    // Log individual results
    for (const result of testResults.results) {
      console.log(result);
    }
    
    // Assert all tests passed
    expect(testResults.failed).toBe(0);
    expect(testResults.passed).toBe(testResults.total);
    expect(testResults.total).toBeGreaterThan(0);
  });
});
