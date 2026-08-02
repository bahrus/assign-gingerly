import { expect, test } from '@playwright/test';

test.describe('restrictedPropSettings — Phase I', () => {
  test('runs all browser checks', async ({ page }) => {
    await page.goto('/tests/restricted-prop-settings.html');
    await page.waitForFunction(() => {
      const el = document.getElementById('test-complete');
      return el?.getAttribute('data-total') !== '0';
    });

    const result = await page.evaluate(() => {
      const el = document.getElementById('test-complete')!;
      return {
        failed: Number(el.getAttribute('data-failed')),
        total: Number(el.getAttribute('data-total'))
      };
    });

    expect(result.failed).toBe(0);
    expect(result.total).toBeGreaterThan(0);
  });
});
