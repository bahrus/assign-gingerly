import { test, expect } from '@playwright/test';

test.describe('assignGingerly - JSON Symbol.for Support', () => {
  test('should run all JSON symbol support tests in browser', async ({ page }) => {
    await page.goto('/tests/json-symbol-support.html');
    
    await page.waitForFunction(() => {
      const el = document.getElementById('test-complete');
      return el && el.hasAttribute('data-total');
    }, { timeout: 10000 });
    
    const results = await page.evaluate(() => {
      const el = document.getElementById('test-complete');
      return {
        passed: parseInt(el.getAttribute('data-passed') || '0'),
        failed: parseInt(el.getAttribute('data-failed') || '0'),
        total: parseInt(el.getAttribute('data-total') || '0')
      };
    });
    
    console.log(`JSON symbol support tests: ${results.passed}/${results.total} passed`);
    
    expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
    expect(results.total).toBeGreaterThan(0);
  });
});
