# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> assignGingerly - Basic Functionality >> Run tests in browser
- Location: tests\basic.spec.ts:4:3

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
  3  | test.describe('assignGingerly - Basic Functionality', () => {
  4  |   test('Run tests in browser', async ({ page }) => {
  5  |     // Navigate to the HTML test page
  6  |     await page.goto('/tests/basic.html');
  7  |     
  8  |     // Wait for tests to complete (element exists with data-total attribute)
> 9  |     await page.waitForFunction(() => {
     |                ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  10 |       const el = document.getElementById('test-complete');
  11 |       return el && el.hasAttribute('data-total');
  12 |     }, { timeout: 10000 });
  13 |     
  14 |     // Get test results
  15 |     const results = await page.evaluate(() => {
  16 |       const el = document.getElementById('test-complete');
  17 |       return {
  18 |         passed: parseInt(el.getAttribute('data-passed') || '0'),
  19 |         failed: parseInt(el.getAttribute('data-failed') || '0'),
  20 |         total: parseInt(el.getAttribute('data-total') || '0')
  21 |       };
  22 |     });
  23 |     
  24 |     // Log results
  25 |     console.log(`Basic tests: ${results.passed}/${results.total} passed`);
  26 |     
  27 |     // Assert all tests passed
  28 |     expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
  29 |     expect(results.total).toBeGreaterThan(0);
  30 |   });
  31 | });
  32 | 
```