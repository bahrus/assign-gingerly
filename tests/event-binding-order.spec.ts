import { test, expect } from '@playwright/test';

// Its own page: the event binding module must not be loaded yet
test.describe('+= event binding order', () => {
  test('bindings made before the module loads attach in call order, and the last one with a key prevails', async ({ page }) => {
    page.on('pageerror', err => console.error('Browser error:', err));

    await page.goto('http://localhost:8000/tests/event-binding-order.html');
    const done = page.locator('#test-complete');
    await expect(done).toHaveAttribute('data-status', 'done', { timeout: 10000 });
    await expect(done).toHaveAttribute('data-order', '1,2,3,4,5,6,7,8');
    await expect(done).toHaveAttribute('data-heard', '4');
  });
});
