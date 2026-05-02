import { test, expect } from '@playwright/test';

test.describe('Custom Element Parsing', () => {
  test('should run all custom element parsing tests in browser', async ({ page }) => {
    await page.goto('http://localhost:8000/tests/custom-element-parsing.html');
    
    // Wait for tests to complete
    await page.waitForFunction(() => (window as any).__TEST_RESULTS__);
    
    // Get results
    const testResults = await page.evaluate(() => (window as any).__TEST_RESULTS__);
    
    console.log(`Custom element parsing tests: ${testResults.passed}/${testResults.total} passed`);
    
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
