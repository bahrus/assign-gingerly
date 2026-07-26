# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assign-features-advanced.spec.ts >> assignFeatures - Advanced Features >> should run all advanced assignFeatures tests in browser
- Location: tests\assign-features-advanced.spec.ts:4:3

# Error details

```
Error: 2 test(s) failed

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 2
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - heading "assignFeatures - Advanced Features Tests" [level=1] [ref=e2]
  - generic [ref=e3]: 19/21 tests passed
  - generic [ref=e4]:
    - generic [ref=e5]:
      - strong [ref=e6]: ✓
      - text: "ctx: key is passed correctly"
    - generic [ref=e7]:
      - strong [ref=e8]: ✓
      - text: "ctx: optIn references supportedFeatures entry"
    - generic [ref=e9]:
      - strong [ref=e10]: ✓
      - text: "ctx: injection references the FeatureConfig"
    - generic [ref=e11]:
      - strong [ref=e12]: ✓
      - text: "ctx: featuresRegistry is present"
    - generic [ref=e13]:
      - strong [ref=e14]: ✓
      - text: "sharedContext: getSharedContext provides ctx.shared"
    - generic [ref=e15]:
      - strong [ref=e16]: ✓
      - text: "sharedContext: ctx.shared is undefined when getSharedContext not defined"
    - generic [ref=e17]:
      - strong [ref=e18]: ✓
      - text: "sharedContext: different features get different shared contexts"
    - generic [ref=e19]:
      - strong [ref=e20]: ✓
      - text: "customData: accessible via ctx.injection.customData"
    - generic [ref=e21]:
      - strong [ref=e22]: ✓
      - text: "async: placeholder object returned immediately"
    - generic [ref=e23]:
      - strong [ref=e24]: ✓
      - text: "async: placeholder accumulates properties via assignGingerly"
    - generic [ref=e25]:
      - strong [ref=e26]: ✓
      - text: "async: real instance replaces placeholder after resolution"
    - generic [ref=e27]:
      - strong [ref=e28]: ✓
      - text: "async: error state throws on subsequent access"
    - generic [ref=e29]:
      - strong [ref=e30]: ✓
      - text: "whenFeatureReady: method is installed when lifecycleKeys is true"
    - generic [ref=e31]:
      - strong [ref=e32]: ✓
      - text: "whenFeatureReady: custom method name via lifecycleKeys object"
    - generic [ref=e33]:
      - strong [ref=e34]: ✓
      - text: "whenFeatureReady: resolves immediately for sync features"
    - generic [ref=e35]:
      - strong [ref=e36]: ✓
      - text: "whenFeatureReady: resolves after async spawn completes"
    - generic [ref=e37]:
      - strong [ref=e38]: ✓
      - text: "whenFeatureReady: rejects when async spawn fails"
    - generic [ref=e39]:
      - strong [ref=e40]: ✓
      - text: "withAttrs: parses attributes into initVals"
    - generic [ref=e41]:
      - strong [ref=e42]: ✓
      - text: "withAttrs: programmatic initVals override attributes"
    - generic [ref=e43]:
      - strong [ref=e44]: ✗
      - text: "withAsyncMethods: awaits async method then assigns property"
      - generic [ref=e45]: Expected updated but got initial
    - generic [ref=e46]:
      - strong [ref=e47]: ✗
      - text: "withAsyncMethods: works with sync methods in same path"
      - generic [ref=e48]: Expected 42 but got 0
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('assignFeatures - Advanced Features', () => {
  4  |   test('should run all advanced assignFeatures tests in browser', async ({ page }) => {
  5  |     // Navigate to the HTML test page
  6  |     await page.goto('/tests/assign-features-advanced.html');
  7  |     
  8  |     // Wait for tests to complete (longer timeout for async tests)
  9  |     await page.waitForFunction(() => {
  10 |       const el = document.getElementById('test-complete');
  11 |       return el && el.hasAttribute('data-total') && el.getAttribute('data-total') !== '0';
  12 |     }, { timeout: 30000 });
  13 |     
  14 |     // Get test results
  15 |     const results = await page.evaluate(() => {
  16 |       const el = document.getElementById('test-complete');
  17 |       return {
  18 |         passed: parseInt(el!.getAttribute('data-passed') || '0'),
  19 |         failed: parseInt(el!.getAttribute('data-failed') || '0'),
  20 |         total: parseInt(el!.getAttribute('data-total') || '0')
  21 |       };
  22 |     });
  23 |     
  24 |     // Log results
  25 |     console.log(`Advanced assignFeatures tests: ${results.passed}/${results.total} passed`);
  26 |     
  27 |     // If there are failures, get the failure details
  28 |     if (results.failed > 0) {
  29 |       const failures = await page.evaluate(() => {
  30 |         const items = document.querySelectorAll('.test-item.fail');
  31 |         return Array.from(items).map(item => item.textContent?.trim());
  32 |       });
  33 |       console.log('Failures:', failures);
  34 |     }
  35 |     
  36 |     // Assert all tests passed
> 37 |     expect(results.failed, `${results.failed} test(s) failed`).toBe(0);
     |                                                                ^ Error: 2 test(s) failed
  38 |     expect(results.total).toBeGreaterThan(0);
  39 |   });
  40 | });
  41 | 
```