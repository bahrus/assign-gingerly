# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: is-allowed-import-path.spec.ts >> isAllowedImportPath >> allows same-origin paths and import-map matches only
- Location: tests\is-allowed-import-path.spec.ts:4:3

# Error details

```
Error: page.evaluate: TypeError: Failed to fetch dynamically imported module: http://localhost:8000/assignPermissions/isAllowedImportPath.js
```

# Page snapshot

```yaml
- list [ref=e2]:
  - listitem [ref=e3]:
    - group [ref=e4]:
      - generic "demo" [ref=e5] [cursor=pointer]
  - listitem [ref=e6]:
    - link "imports.html" [ref=e7] [cursor=pointer]:
      - /url: imports.html
  - listitem [ref=e8]:
    - group [ref=e9]:
      - generic "legacy" [ref=e10] [cursor=pointer]
  - listitem [ref=e11]:
    - link "up-down-counter" [ref=e12] [cursor=pointer]:
      - /url: root.html
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test.describe('isAllowedImportPath', () => {
  4  |   test('allows same-origin paths and import-map matches only', async ({ page }) => {
  5  |     await page.goto('/tests/basic.html');
  6  | 
> 7  |     const results = await page.evaluate(async () => {
     |                                ^ Error: page.evaluate: TypeError: Failed to fetch dynamically imported module: http://localhost:8000/assignPermissions/isAllowedImportPath.js
  8  |       const { isAllowedImportPath } = await import('/assignPermissions/isAllowedImportPath.js');
  9  |       const sameOrigin = [
  10 |         isAllowedImportPath('./module.js'),
  11 |         isAllowedImportPath('../module.js'),
  12 |         isAllowedImportPath('/module.js')
  13 |       ];
  14 | 
  15 |       document.head.insertAdjacentHTML('beforeend', '<base href="https://example.invalid/app/">');
  16 |       const crossOriginBase = isAllowedImportPath('./module.js');
  17 | 
  18 |       document.body.insertAdjacentHTML('beforeend', `
  19 |         <script type="importmap">not json</script>
  20 |         <script type="importmap">{"imports":{"@vendor/":"/vendor/","exact-package":"/exact.js"}}</script>
  21 |       `);
  22 |       const importMapMatches = [
  23 |         isAllowedImportPath('@vendor/widget.js'),
  24 |         isAllowedImportPath('exact-package'),
  25 |         isAllowedImportPath('exact-package/subpath'),
  26 |         isAllowedImportPath('not-@vendor/widget.js'),
  27 |         isAllowedImportPath('unmapped-package')
  28 |       ];
  29 | 
  30 |       return { sameOrigin, crossOriginBase, importMapMatches };
  31 |     });
  32 | 
  33 |     expect(results.sameOrigin).toEqual([true, true, true]);
  34 |     expect(results.crossOriginBase).toBe(false);
  35 |     expect(results.importMapMatches).toEqual([true, true, false, false, false]);
  36 |   });
  37 | });
  38 | 
```