import { expect, test } from '@playwright/test';

test.describe('isAllowedImportPath', () => {
  test('allows same-origin paths and import-map matches only', async ({ page }) => {
    await page.goto('/tests/basic.html');

    const results = await page.evaluate(async () => {
      const { isAllowedImportPath } = await import('/assignPermissions/isAllowedImportPath.js');
      const sameOrigin = [
        isAllowedImportPath('./module.js'),
        isAllowedImportPath('../module.js'),
        isAllowedImportPath('/module.js')
      ];

      document.head.insertAdjacentHTML('beforeend', '<base href="https://example.invalid/app/">');
      const crossOriginBase = isAllowedImportPath('./module.js');

      document.body.insertAdjacentHTML('beforeend', `
        <script type="importmap">not json</script>
        <script type="importmap">{"imports":{"@vendor/":"/vendor/","exact-package":"/exact.js"}}</script>
      `);
      const importMapMatches = [
        isAllowedImportPath('@vendor/widget.js'),
        isAllowedImportPath('exact-package'),
        isAllowedImportPath('exact-package/subpath'),
        isAllowedImportPath('not-@vendor/widget.js'),
        isAllowedImportPath('unmapped-package')
      ];

      return { sameOrigin, crossOriginBase, importMapMatches };
    });

    expect(results.sameOrigin).toEqual([true, true, true]);
    expect(results.crossOriginBase).toBe(false);
    expect(results.importMapMatches).toEqual([true, true, false, false, false]);
  });
});
