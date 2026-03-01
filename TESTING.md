# Testing Guide for assign-gingerly

## Understanding the Test Setup

This project has two parallel test systems:

### 1. Playwright Tests (tests/*.spec.ts)
- **Purpose**: Automated CI/CD testing across multiple browsers
- **Runtime**: Node.js via Playwright
- **Command**: `npx playwright test`
- **Polyfill**: Required (Node.js doesn't have `getOrInsertComputed` yet)

### 2. WPT Tests (wpt/*.html)
- **Purpose**: Manual debugging and browser testing
- **Runtime**: Real browsers (Chrome, Firefox, Safari)
- **Access**: Open HTML files in browser via local server
- **Polyfill**: Not needed in modern browsers (Chrome 146+, Firefox 134+, Safari 18.2+)

## Why the Polyfill?

You noticed that `getOrInsertComputed` exists in Chrome but we still have a polyfill in the code. Here's why:

```typescript
// In assignGingerly.ts (line 7)
if (typeof WeakMap.prototype.getOrInsertComputed !== 'function') {
  WeakMap.prototype.getOrInsertComputed = function(key, insert) {
    // ... polyfill implementation
  };
}
```

**The polyfill is needed for Playwright tests**, which run in Node.js, not in a browser. Node.js doesn't have `getOrInsertComputed` yet.

**In actual browsers** (Chrome 146+), the polyfill check fails and the native implementation is used.

## Debugging Tests in Browser

### Quick Start

1. **Start a local web server:**
   ```bash
   # Option 1: Python
   python -m http.server 8000
   
   # Option 2: Node.js
   npx http-server
   ```

2. **Open the test index page:**
   ```
   http://localhost:8000/wpt/index.html
   ```

3. **Run all tests in one page (recommended for debugging):**
   ```
   http://localhost:8000/wpt/assignGingerly-all-tests.html
   ```

### Debugging a Failed Test

When a Playwright test fails:

1. **Find the corresponding WPT test:**
   - Playwright test: `tests/basic.spec.ts` → WPT test: `wpt/assignGingerly-all-tests.html`
   - Or use the comprehensive test: `wpt/assignGingerly-all-tests.html` (has all tests)

2. **Open in browser:**
   ```
   http://localhost:8000/wpt/assignGingerly-all-tests.html
   ```

3. **Use browser DevTools:**
   - Open Console (F12)
   - Set breakpoints in the test code
   - Step through the implementation
   - Inspect variables and state

4. **Check for polyfill usage:**
   The test page shows whether native `getOrInsertComputed` is available or if the polyfill is being used.

### Example: Debugging a Specific Test

If `tests/basic.spec.ts` test "should handle multiple key-value pairs" fails:

1. Open `wpt/assignGingerly-all-tests.html` in browser
2. Find the test "Basic: should handle multiple key-value pairs"
3. Open DevTools Console
4. Add breakpoint in the test code or in `assignGingerly.js`
5. Refresh page to re-run tests
6. Step through the code to find the issue

## Test Coverage Comparison

| Feature | Playwright Tests | WPT Tests |
|---------|-----------------|-----------|
| Basic functionality | ✓ | ✓ |
| Nested paths | ✓ | ✓ |
| Dependency injection | ✓ | ✓ |
| Edge cases | ✓ | ✓ |
| Commands (+=, =!, -=) | ✓ | ✓ |
| assignTentatively | ✓ | ✓ |
| JSON Symbol.for | ✓ | ✓ |
| **Debuggable in browser** | ✗ | ✓ |
| **Automated CI/CD** | ✓ | ✗ |

## Running Tests

### Automated Testing (CI/CD)
```bash
# Run all Playwright tests
npx playwright test

# Run specific test file
npx playwright test tests/basic.spec.ts

# Run with UI
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed
```

### Manual Browser Testing
```bash
# Start server
python -m http.server 8000

# Open in browser:
# http://localhost:8000/wpt/index.html
# http://localhost:8000/wpt/assignGingerly-all-tests.html
```

## Checking getOrInsertComputed Support

### In Browser Console
```javascript
// Check if native support exists
typeof WeakMap.prototype.getOrInsertComputed === 'function'
// Chrome 146+: true
// Older browsers: false (polyfill will be used)

// Check if Map also has it
typeof Map.prototype.getOrInsertComputed === 'function'
```

### In Node.js
```javascript
// Node.js doesn't have it yet
typeof WeakMap.prototype.getOrInsertComputed === 'function'
// Returns: false (polyfill is needed)
```

## Best Practices

1. **Write tests in Playwright format** (`tests/*.spec.ts`) for CI/CD
2. **Debug in browser** using WPT tests (`wpt/*.html`)
3. **Keep both in sync** - the comprehensive test file mirrors Playwright tests
4. **Use browser DevTools** for step-by-step debugging
5. **Check polyfill status** on the test page to understand which implementation is running

## Troubleshooting

### "Tests pass in browser but fail in Playwright"
- Check if the issue is Node.js-specific
- Verify polyfill implementation matches native behavior
- Look for timing issues (Playwright tests are synchronous)

### "Can't access /resources/testharness.js"
- Make sure you're using a web server (not file:// protocol)
- Check that you're in the project root directory
- Verify the server is running on the correct port

### "getOrInsertComputed is not a function"
- In browser: Update to Chrome 146+, Firefox 134+, or Safari 18.2+
- In Node.js: This is expected - the polyfill should handle it
- Check that the polyfill code is being loaded

## Additional Resources

- [Web Platform Tests Documentation](https://web-platform-tests.org/)
- [Playwright Documentation](https://playwright.dev/)
- [getOrInsert Proposal](https://web-platform-dx.github.io/web-features-explorer/features/getorinsert/)
