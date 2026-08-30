# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assignFrom-extension.spec.ts >> assignFrom / assignFromAsync - Object Prototype Extension >> should run all extension tests in browser
- Location: tests\assignFrom-extension.spec.ts:4:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 30000ms exceeded.
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
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('assignFrom / assignFromAsync - Object Prototype Extension', () => {
  4  |   test('should run all extension tests in browser', async ({ page }) => {
  5  |     await page.goto('/tests/assignFrom-extension.html');
  6  |     
> 7  |     await page.waitForFunction(() => {
     |                ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  8  |       const el = document.getElementById('test-complete');
  9  |       return el && el.getAttribute('data-total') !== '0';
  10 |     }, { timeout: 10000 });
  11 |     
  12 |     const results = await page.evaluate(() => {
  13 |       const el = document.getElementById('test-complete');
  14 |       return {
  15 |         passed: parseInt(el.getAttribute('data-passed') || '0'),
  16 |         failed: parseInt(el.getAttribute('data-failed') || '0'),
  17 |         total: parseInt(el.getAttribute('data-total') || '0')
  18 |       };
  19 |     });
  20 |     
  21 |     console.log(`assignFrom extension tests: ${results.passed}/${results.total} passed`);
  22 |     
  23 |     expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
  24 |     expect(results.total).toBeGreaterThan(0);
  25 |   });
  26 | });
  27 | 
```