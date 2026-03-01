# Browser-Based Testing

This directory contains Playwright tests that run in **actual browser JavaScript engines**, not in Node.js.

## Key Differences from `tests/` Directory

| Feature | `tests/` (Old) | `tests-browser/` (New) |
|---------|---------------|----------------------|
| **JavaScript Engine** | Node.js | Browser (V8, SpiderMonkey, JavaScriptCore) |
| **Polyfill Needed** | Yes (Node.js lacks getOrInsertComputed) | No (modern browsers have it natively) |
| **Test Format** | Playwright .spec.ts files | Playwright opens HTML pages |
| **Debugging** | Node.js debugger | Browser DevTools |
| **Native APIs** | Node.js APIs | Browser APIs (DOM, etc.) |

## Why This Matters

### The getOrInsertComputed Issue

The code uses `WeakMap.prototype.getOrInsertComputed`, which is:
- ✅ **Available in modern browsers** (Chrome 146+, Firefox 134+, Safari 18.2+)
- ❌ **Not available in Node.js** (requires polyfill)

When tests run in Node.js (`tests/` directory), they need a polyfill. But when you open the same code in Chrome, the native implementation is used. This can lead to confusion when debugging.

### Solution: Run Tests in Real Browsers

The `tests-browser/` directory uses Playwright to:
1. Start a local web server
2. Open HTML test pages in real browsers
3. Run tests using the browser's JavaScript engine
4. Report results back to Playwright

This means:
- Tests run with the same JavaScript engine as production
- No polyfill needed in modern browsers
- You can debug by opening the HTML files directly
- Test results accurately reflect browser behavior

## Running Tests

### Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Run all tests in browser engines
npm run test:browser

# Or use the default test command (now points to browser tests)
npm test
```

### Run Specific Browsers

```bash
# Chrome only
npx playwright test --config=playwright-browser.config.ts --project=chromium

# Firefox only
npx playwright test --config=playwright-browser.config.ts --project=firefox

# Safari only
npx playwright test --config=playwright-browser.config.ts --project=webkit
```

### Debug Mode

```bash
# Run with UI (see tests running in real browsers)
npx playwright test --config=playwright-browser.config.ts --ui

# Run in headed mode (see browser windows)
npx playwright test --config=playwright-browser.config.ts --headed

# Debug specific test
npx playwright test --config=playwright-browser.config.ts --debug
```

## Manual Debugging

If a test fails, you can debug it manually:

1. **Start the web server:**
   ```bash
   npx http-server -p 8000
   ```

2. **Open the test page in your browser:**
   ```
   http://localhost:8000/wpt/assignGingerly-all-tests.html
   ```

3. **Use browser DevTools:**
   - Open Console (F12)
   - Set breakpoints in test code
   - Step through implementation
   - Inspect variables

4. **Check getOrInsertComputed support:**
   The test page shows whether native support is available or if polyfill is used.

## Test Structure

### WPT Runner (`wpt-runner.spec.ts`)

This file contains a single Playwright test that:
1. Opens each HTML test page in the browser
2. Waits for tests to complete
3. Extracts test results from the page
4. Reports pass/fail to Playwright

The actual test logic is in the HTML files (`wpt/*.html`), which use the Web Platform Tests framework.

### HTML Test Files (`wpt/*.html`)

Each HTML file contains:
- Test harness setup (`testharness.js`)
- Module imports (actual browser module loading)
- Test cases using WPT API (`test()`, `assert_equals()`, etc.)

Example structure:
```html
<!DOCTYPE html>
<html>
<head>
    <script src="/resources/testharness.js"></script>
    <script src="/resources/testharnessreport.js"></script>
</head>
<body>
<script type="module">
    import assignGingerly from '../assignGingerly.js';
    
    test(() => {
        const target = {};
        assignGingerly(target, { hello: 'world' });
        assert_equals(target.hello, 'world');
    }, 'Test description');
</script>
</body>
</html>
```

## Verifying Native Support

To check if your browser has native `getOrInsertComputed` support:

```javascript
// In browser console
typeof WeakMap.prototype.getOrInsertComputed === 'function'
// Chrome 146+: true
// Older browsers: false
```

The test suite includes a special test that reports this for each browser.

## Comparison with Old Tests

### Old Approach (`tests/` directory)
```typescript
// tests/basic.spec.ts
import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';  // Runs in Node.js!

test('basic test', () => {
    const target = {};
    assignGingerly(target, { hello: 'world' });
    expect(target.hello).toBe('world');
});
```
**Problem**: Runs in Node.js, needs polyfill, doesn't match browser behavior exactly.

### New Approach (`tests-browser/` directory)
```typescript
// tests-browser/wpt-runner.spec.ts
test('Basic Functionality', async ({ page }) => {
    await page.goto('/wpt/assignGingerly-basic.html');  // Opens in real browser!
    // Test runs in browser JavaScript engine
    const results = await page.evaluate(() => /* extract results */);
    expect(results.success).toBe(true);
});
```
**Benefit**: Runs in actual browser, uses native APIs, matches production exactly.

## CI/CD Integration

The browser-based tests work in CI/CD environments:

```yaml
# .github/workflows/test.yml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Run tests
  run: npm test
```

Playwright will:
1. Install browser binaries (Chromium, Firefox, WebKit)
2. Start the web server
3. Run tests in each browser
4. Report results

## Troubleshooting

### "Cannot find module '/resources/testharness.js'"
- Make sure the web server is running
- Check that you're accessing via `http://localhost:8000`, not `file://`

### "Tests timeout"
- Increase timeout in `playwright-browser.config.ts`
- Check browser console for JavaScript errors
- Verify the test page loads correctly

### "getOrInsertComputed is not a function"
- This is expected in older browsers
- The polyfill in `assignGingerly.ts` should handle it
- Check that the polyfill is being loaded

### "All tests show as passed but functionality is broken"
- Open the HTML file directly in browser
- Check browser console for errors
- Verify test assertions are correct

## Best Practices

1. **Write tests in HTML files** (`wpt/*.html`) using WPT framework
2. **Run via Playwright** for automated testing across browsers
3. **Debug in browser** by opening HTML files directly
4. **Check native support** to understand which implementation is running
5. **Keep tests simple** - each HTML file should test one feature area

## Migration from Old Tests

If you have tests in the `tests/` directory that you want to migrate:

1. **Create an HTML test file** in `wpt/` directory
2. **Convert test syntax** from Playwright to WPT format
3. **Add to test list** in `wpt-runner.spec.ts`
4. **Verify** by running both old and new tests

Example migration:

**Old (Node.js):**
```typescript
test('should handle empty object', () => {
    const target = {};
    assignGingerly(target, {});
    expect(Object.keys(target).length).toBe(0);
});
```

**New (Browser):**
```javascript
test(() => {
    const target = {};
    assignGingerly(target, {});
    assert_equals(Object.keys(target).length, 0);
}, 'should handle empty object');
```

## Resources

- [Web Platform Tests](https://web-platform-tests.org/)
- [Playwright Documentation](https://playwright.dev/)
- [getOrInsert Proposal](https://web-platform-dx.github.io/web-features-explorer/features/getorinsert/)
