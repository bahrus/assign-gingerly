import { test, expect } from '@playwright/test';

test.describe('manageTemplateList reordering', () => {
  test('should keep items in key order with minimal moves', async ({ page }) => {
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));

    await page.goto('http://localhost:8000/tests/template-list-reorder.html');

    await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 30000, state: 'attached' });

    const status = await page.getAttribute('#test-complete', 'data-status');
    const passed = await page.getAttribute('#test-complete', 'data-passed');
    const failed = await page.getAttribute('#test-complete', 'data-failed');

    console.log(`manageTemplateList reorder tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);

    expect(status).toBe('success');
    expect(failed).toBe('0');
  });
});
