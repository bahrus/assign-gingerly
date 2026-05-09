import { test, expect } from '@playwright/test';

test.describe('assignFeatures - Advanced Features', () => {
  test('should run all advanced assignFeatures tests in browser', async ({ page }) => {
    // Navigate to the HTML test page
    await page.goto('/tests/assign-features-advanced.html');
    
    // Wait for tests to complete (longer timeout for async tests)
    await page.waitForFunction(() => {
      const el = document.getElementById('test-complete');
      return el && el.hasAttribute('data-total') && el.getAttribute('data-total') !== '0';
    }, { timeout: 30000 });
    
    // Get test results
    const results = await page.evaluate(() => {
      const el = document.getElementById('test-complete');
      return {
        passed: parseInt(el!.getAttribute('data-passed') || '0'),
        failed: parseInt(el!.getAttribute('data-failed') || '0'),
        total: parseInt(el!.getAttribute('data-total') || '0')
      };
    });
    
    // Log results
    console.log(`Advanced assignFeatures tests: ${results.passed}/${results.total} passed`);
    
    // If there are failures, get the failure details
    if (results.failed > 0) {
      const failures = await page.evaluate(() => {
        const items = document.querySelectorAll('.test-item.fail');
        return Array.from(items).map(item => item.textContent?.trim());
      });
      console.log('Failures:', failures);
    }
    
    // Assert all tests passed
    expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
    expect(results.total).toBeGreaterThan(0);
  });
});
