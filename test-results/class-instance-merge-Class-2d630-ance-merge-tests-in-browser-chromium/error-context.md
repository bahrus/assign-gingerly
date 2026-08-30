# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: class-instance-merge.spec.ts >> Class Instance Merge › should run all class instance merge tests in browser
- Location: tests\class-instance-merge.spec.ts:3:1

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
  3  | test('Class Instance Merge › should run all class instance merge tests in browser', async ({ page }) => {
  4  |   // Start local server and navigate
  5  |   await page.goto('http://localhost:8000/tests/class-instance-merge.html');
  6  |   
  7  |   // Wait for tests to complete
> 8  |   await page.waitForFunction(() => window.testResults !== undefined, { timeout: 5000 });
     |              ^ Error: page.waitForFunction: Test timeout of 30000ms exceeded.
  9  |   
  10 |   // Get test results
  11 |   const results = await page.evaluate(() => window.testResults);
  12 |   
  13 |   // Log results
  14 |   console.log(`Class instance merge tests: ${results.passed}/${results.total} passed`);
  15 |   results.results.forEach((result: string) => console.log(result));
  16 |   
  17 |   // Assert all tests passed
  18 |   expect(results.passed).toBe(results.total);
  19 | });
  20 | 
```