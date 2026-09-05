# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resolve-values.spec.ts >> resolveValues & assignFrom >> should run all resolveValues and assignFrom tests in browser
- Location: tests\resolve-values.spec.ts:4:3

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
      - generic "tests" [ref=e10] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('resolveValues & assignFrom', () => {
  4  |   test('should run all resolveValues and assignFrom tests in browser', async ({ page }) => {
  5  |     // Start the server and navigate to the test page
  6  |     await page.goto('http://localhost:8000/tests/resolve-values.html');
  7  |     
  8  |     // Wait for tests to complete
> 9  |     await page.waitForFunction(() => (window as any).__TEST_RESULTS__);
     |                ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  10 |     
  11 |     // Get results
  12 |     const testResults = await page.evaluate(() => (window as any).__TEST_RESULTS__);
  13 |     
  14 |     console.log(`resolveValues & assignFrom tests: ${testResults.passed}/${testResults.total} passed`);
  15 |     
  16 |     // Log individual results
  17 |     for (const result of testResults.results) {
  18 |       console.log(result);
  19 |     }
  20 |     
  21 |     // Assert all tests passed
  22 |     expect(testResults.failed).toBe(0);
  23 |     expect(testResults.passed).toBe(testResults.total);
  24 |     expect(testResults.total).toBeGreaterThan(0);
  25 |   });
  26 | });
  27 | 
```