import { test, expect } from '@playwright/test';

test.describe('builtIns.tree snippets', () => {
  test('should run all snippet tests in browser', async ({ page }) => {
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));

    await page.goto('http://localhost:8000/tests/tree-snippets.html');

    await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 10000, state: 'attached' });

    const status = await page.getAttribute('#test-complete', 'data-status');
    const passed = await page.getAttribute('#test-complete', 'data-passed');
    const failed = await page.getAttribute('#test-complete', 'data-failed');

    console.log(`tree snippet tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);

    expect(status).toBe('success');
    expect(failed).toBe('0');
  });
});
