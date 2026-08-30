# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: itemscope-managers.spec.ts >> ItemScope Managers >> should run all itemscope manager tests in browser
- Location: tests\itemscope-managers.spec.ts:4:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#test-complete[data-status]:not([data-status=""])')

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
  3  | test.describe('ItemScope Managers', () => {
  4  |   test('should run all itemscope manager tests in browser', async ({ page }) => {
  5  |     // Capture console logs
  6  |     page.on('console', msg => console.log('Browser console:', msg.text()));
  7  |     
  8  |     // Capture errors
  9  |     page.on('pageerror', err => console.error('Browser error:', err));
  10 |     
  11 |     await page.goto('http://localhost:8000/tests/itemscope-managers.html');
  12 |     
  13 |     // Wait for tests to complete (max 10 seconds) - don't require visibility
> 14 |     await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 10000, state: 'attached' });
     |                ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  15 |     
  16 |     // Get test results
  17 |     const status = await page.getAttribute('#test-complete', 'data-status');
  18 |     const passed = await page.getAttribute('#test-complete', 'data-passed');
  19 |     const failed = await page.getAttribute('#test-complete', 'data-failed');
  20 |     
  21 |     console.log(`ItemScope manager tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);
  22 |     
  23 |     // Assert all tests passed
  24 |     expect(status).toBe('success');
  25 |     expect(failed).toBe('0');
  26 |   });
  27 | });
  28 | 
```