# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: itemscope-tree.spec.ts >> builtIns.itemscopeTree >> should run all itemscopeTree tests in browser
- Location: tests\itemscope-tree.spec.ts:4:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "success"
Received: "error"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "builtIns.itemscopeTree Tests" [level=1] [ref=e2]
  - generic [ref=e3]: "Test suite error: Importing a module script failed."
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('builtIns.itemscopeTree', () => {
  4  |   test('should run all itemscopeTree tests in browser', async ({ page }) => {
  5  |     page.on('console', msg => console.log('Browser console:', msg.text()));
  6  |     page.on('pageerror', err => console.error('Browser error:', err));
  7  | 
  8  |     await page.goto('http://localhost:8000/tests/itemscope-tree.html');
  9  | 
  10 |     await page.waitForSelector('#test-complete[data-status]:not([data-status=""])', { timeout: 10000, state: 'attached' });
  11 | 
  12 |     const status = await page.getAttribute('#test-complete', 'data-status');
  13 |     const passed = await page.getAttribute('#test-complete', 'data-passed');
  14 |     const failed = await page.getAttribute('#test-complete', 'data-failed');
  15 | 
  16 |     console.log(`itemscopeTree tests: ${passed}/${parseInt(passed!) + parseInt(failed!)} passed`);
  17 | 
> 18 |     expect(status).toBe('success');
     |                    ^ Error: expect(received).toBe(expected) // Object.is equality
  19 |     expect(failed).toBe('0');
  20 |   });
  21 | });
  22 | 
```