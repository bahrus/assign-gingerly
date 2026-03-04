import { test, expect } from '@playwright/test';

test.describe('ItemScope Managers', () => {
  test('should run all itemscope manager tests in browser', async ({ page }) => {
    // Capture console logs
    page.on('console', msg => console.log('Browser console:', msg.text()));
    
    // Capture errors
    page.on('pageerror', err => console.error('Browser error:', err));
    
    await page.goto('http://localhost:8000/tests/itemscope-managers.html');
    
    // Wait for tests to complete (max 10 seconds) - don't require visibility
    await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 10000, state: 'attached' });
    
    // Get test results
    const status = await page.getAttribute('#test-complete', 'data-status');
    const passed = await page.getAttribute('#test-complete', 'data-passed');
    const failed = await page.getAttribute('#test-complete', 'data-failed');
    
    console.log(`ItemScope manager tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);
    
    // Assert all tests passed
    expect(status).toBe('success');
    expect(failed).toBe('0');
  });
});
