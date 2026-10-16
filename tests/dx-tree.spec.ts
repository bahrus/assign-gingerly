import { test, expect } from '@playwright/test';

test.describe('tree`…` tagged template', () => {
  test('should run all tree`…` tests in browser', async ({ page }) => {
    page.on('console', msg => console.log('Browser console:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));

    await page.goto('http://localhost:8000/tests/dx-tree.html');

    await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 10000, state: 'attached' });

    const status = await page.getAttribute('#test-complete', 'data-status');
    const passed = await page.getAttribute('#test-complete', 'data-passed');
    const failed = await page.getAttribute('#test-complete', 'data-failed');

    console.log(`tree\`…\` tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);

    expect(status).toBe('success');
    expect(failed).toBe('0');
  });

  test('runs without a DOM (Node)', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Node-side check; once is enough');
    // The compiled module, imported straight into Node: no window, no document
    const { tree, each } = await import(new URL('../DX/tree.js', import.meta.url).href);
    const spec = tree`<ul class="list" ${each('?.items', { key: '?.id' })}><li>${'?.name'}</li></ul>`;
    expect(JSON.stringify(spec)).toBe(JSON.stringify(
      ['ul', { 'class :=': 'list' }, { each: ['li', { textContent: '?.name' }], of: '?.items', key: '?.id' }],
    ));
  });
});
