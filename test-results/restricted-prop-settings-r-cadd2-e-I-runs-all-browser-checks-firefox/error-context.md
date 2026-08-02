# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: restricted-prop-settings.spec.ts >> restrictedPropSettings — Phase I >> runs all browser checks
- Location: tests\restricted-prop-settings.spec.ts:4:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 1
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "Restricted Property Settings — Phase I Tests" [level=1] [ref=e2]
  - generic [ref=e3]: 6/7 tests passed
  - generic [ref=e4]:
    - generic [ref=e5]: "fail: blocks plain and nested property assignments while allowing siblings — Expected {\"innerHTML\":\"safe\",\"title\":\"allowed\",\"nested\":{\"innerHTML\":\"safe\",\"title\":\"allowed\"}} but got {\"innerHTML\":\"safe\",\"nested\":{\"innerHTML\":\"safe\",\"title\":\"allowed\"},\"title\":\"allowed\"}"
    - generic [ref=e6]: "pass: blocks += and =! assignments but does not block -="
    - generic [ref=e7]: "pass: preserves restrictions during readonly recursive merges"
    - generic [ref=e8]: "pass: preserves restrictions through @each"
    - generic [ref=e9]: "pass: assignFrom forwards permissions to resolved assignments"
    - generic [ref=e10]: "pass: assignTentatively skips restricted settings without a reversal entry"
    - generic [ref=e11]: "pass: event-vector assignments inherit permissions"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test.describe('restrictedPropSettings — Phase I', () => {
  4  |   test('runs all browser checks', async ({ page }) => {
  5  |     await page.goto('/tests/restricted-prop-settings.html');
  6  |     await page.waitForFunction(() => {
  7  |       const el = document.getElementById('test-complete');
  8  |       return el?.getAttribute('data-total') !== '0';
  9  |     });
  10 | 
  11 |     const result = await page.evaluate(() => {
  12 |       const el = document.getElementById('test-complete')!;
  13 |       return {
  14 |         failed: Number(el.getAttribute('data-failed')),
  15 |         total: Number(el.getAttribute('data-total'))
  16 |       };
  17 |     });
  18 | 
> 19 |     expect(result.failed).toBe(0);
     |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  20 |     expect(result.total).toBeGreaterThan(0);
  21 |   });
  22 | });
  23 | 
```