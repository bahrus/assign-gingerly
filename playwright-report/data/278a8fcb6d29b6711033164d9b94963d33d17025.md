# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: find-class-prototype-in-path.spec.ts >> findClassPrototypeInPath >> runs browser tests
- Location: tests\find-class-prototype-in-path.spec.ts:4:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "findClassPrototypeInPath Tests" [level=1] [ref=e2]
  - generic [ref=e3]: 6/6 tests passed
  - generic [ref=e4]:
    - generic [ref=e5]:
      - strong [ref=e6]: ✓
      - text: throws ImportNotAllowedError for cross-origin paths
    - generic [ref=e7]:
      - strong [ref=e8]: ✓
      - text: throws NoMatchingExportError when no class matches
    - generic [ref=e9]:
      - strong [ref=e10]: ✓
      - text: falls back to named export when default is absent
    - generic [ref=e11]:
      - strong [ref=e12]: ✓
      - text: returns default export when it is a class with a prototype
    - generic [ref=e13]:
      - strong [ref=e14]: ✓
      - text: throws NoMatchingExportError when module has no exports
    - generic [ref=e15]:
      - strong [ref=e16]: ✓
      - text: applies criteria after base class check
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('findClassPrototypeInPath', () => {
  4  |   test('runs browser tests', async ({ page }) => {
  5  |     await page.goto('/tests/find-class-prototype-in-path.html');
  6  | 
  7  |     await page.waitForFunction(() => {
  8  |       const el = document.getElementById('test-complete');
  9  |       return el && el.hasAttribute('data-total');
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
  21 |     console.log(`findClassPrototypeInPath tests: ${results.passed}/${results.total} passed`);
  22 | 
  23 |     expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
> 24 |     expect(results.total).toBeGreaterThan(0);
     |                           ^ Error: expect(received).toBeGreaterThan(expected)
  25 |   });
  26 | });
  27 | 
```