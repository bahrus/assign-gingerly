import { test, expect } from '@playwright/test';

test.describe('assignGingerly - Basic Functionality', () => {
  test('Run tests in browser', async ({ page }) => {
    // Navigate to the HTML test page
    await page.goto('/tests/basic.html');
    
    // Wait for tests to complete (element exists with data-total attribute)
    await page.waitForFunction(() => {
      const el = document.getElementById('test-complete');
      return el && el.hasAttribute('data-total');
    }, { timeout: 10000 });
    
    // Get test results
    const results = await page.evaluate(() => {
      const el = document.getElementById('test-complete');
      return {
        passed: parseInt(el.getAttribute('data-passed') || '0'),
        failed: parseInt(el.getAttribute('data-failed') || '0'),
        total: parseInt(el.getAttribute('data-total') || '0')
      };
    });
    
    // Log results
    console.log(`Basic tests: ${results.passed}/${results.total} passed`);
    
    // Assert all tests passed
    expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
    expect(results.total).toBeGreaterThan(0);
  });
});
