import { test, expect } from '@playwright/test';

test.describe('assignFrom - RHS #[x] Reference', () => {
  test('should run all RHS #[x] reference tests in browser', async ({ page }) => {
    await page.goto('/tests/rhs-id-ref.html');
    
    await page.waitForFunction(() => {
      const el = document.getElementById('test-complete');
      return el && el.getAttribute('data-total') !== '0';
    }, { timeout: 10000 });
    
    const results = await page.evaluate(() => {
      const el = document.getElementById('test-complete');
      return {
        passed: parseInt(el.getAttribute('data-passed') || '0'),
        failed: parseInt(el.getAttribute('data-failed') || '0'),
        total: parseInt(el.getAttribute('data-total') || '0')
      };
    });
    
    console.log(`RHS #[x] reference tests: ${results.passed}/${results.total} passed`);
    
    expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
    expect(results.total).toBeGreaterThan(0);
  });
});
