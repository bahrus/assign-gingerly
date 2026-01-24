# Web Platform Tests (WPT) for Object.prototype.assignGingerly

This directory contains Web Platform Tests for the `Object.prototype.assignGingerly` extension.

## Test Files

### 1. object-extension-basic.html
Tests basic functionality of the assignGingerly prototype method:
- Simple property assignment
- Preserving existing properties
- Overwriting properties
- Multiple property assignment
- Merging nested objects
- Array handling
- Various data types (string, number, boolean, null, undefined)
- Independence on multiple objects
- Method chaining
- Non-enumerable property verification

**Test Count:** 10 tests

### 2. object-extension-nested.html
Tests nested path assignment with `?.` notation:
- Single-level nested paths
- Two-level nested paths
- Deeply nested paths
- Multiple nested paths
- Mixed simple and nested properties
- Preserving existing nested structures
- Recursive merging of nested objects
- Complex nested structures (style objects)
- README example 3
- Deeply nested value overwriting
- Nested arrays with objects
- Special characters in property names

**Test Count:** 12 tests

### 3. object-extension-di.html
Tests dependency injection functionality:
- Basic registry-based dependency injection
- Multiple symbol dependencies
- Async class spawning with Promises
- Instance reuse and caching
- Combining nested paths with dependencies
- Lazy `set` property creation
- Set proxy symbol assignment
- Full README example 4 with multiple symbols and features

**Test Count:** 8 tests

### 4. object-extension-edge-cases.html
Tests edge cases and special scenarios:
- Arrays as values (not recursed into)
- Arrays within nested structures
- Numeric values (positive, decimal, zero)
- Boolean values (true/false)
- Null and undefined handling
- String values (regular, emoji, empty)
- Complex nested structures with arrays and objects
- Very deeply nested paths
- Special characters in property names
- Type preservation for primitives
- Reassignment of values
- Empty source objects
- Sequential calls with multiple assignments
- Sequential nested assignments
- Independence of multiple objects

**Test Count:** 15 tests

## Total Test Coverage

| File | Tests |
|------|-------|
| object-extension-basic.html | 10 |
| object-extension-nested.html | 12 |
| object-extension-di.html | 8 |
| object-extension-edge-cases.html | 15 |
| **Total** | **45** |

## Running Tests

### Option 1: Using WPT Test Runner (Official)
If you have the WPT test runner installed:

```bash
wpt run --continue-on-error chrome webpt/
```

### Option 2: Using a Local HTTP Server
The tests use `/resources/testharness.js` which requires a web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (with http-server package)
npx http-server

# Using Python 2
python -m SimpleHTTPServer 8000
```

Then open in your browser:
- `http://localhost:8000/wpt/object-extension-basic.html`
- `http://localhost:8000/wpt/object-extension-nested.html`
- `http://localhost:8000/wpt/object-extension-di.html`
- `http://localhost:8000/wpt/object-extension-edge-cases.html`

### Option 3: Using WPT Server
If you have the WPT server:

```bash
python wpt.py serve
# Then navigate to http://localhost:8000 in your browser
```

## Test Framework

These tests use the standardized WPT testing framework:
- `promise_test()` - For async test functions
- `assert_equals()` - For value comparison
- `assert_true()`/`assert_false()` - For boolean assertions
- `assert_array_equals()` - For array comparison

## Importing the Module

All tests import the extension:
```javascript
import assignGingerly, { BaseRegistry } from '../object-extension.js';
```

This automatically extends the Object prototype with the `assignGingerly` method.

## Test Structure

Each test follows the WPT standard structure:
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test Name</title>
    <link rel="help" href="...">
    <script src="/resources/testharness.js"></script>
    <script src="/resources/testharnessreport.js"></script>
</head>
<body>
<script type="module">
    // Test code here
</script>
</body>
</html>
```

## Test Examples

### Basic Usage
```javascript
promise_test(async (t) => {
    const target = {};
    const result = await target.assignGingerly({ hello: 'world' });
    
    assert_equals(target.hello, 'world');
    assert_equals(result, target);
}, 'description of what is being tested');
```

### Nested Paths
```javascript
promise_test(async (t) => {
    const target = {};
    await target.assignGingerly({ '?.level1?.level2': 'value' });
    
    assert_equals(target.level1.level2, 'value');
}, 'should handle nested paths');
```

### Dependency Injection
```javascript
promise_test(async (t) => {
    const registry = new BaseRegistry();
    const sym = Symbol.for('test');
    
    class TestClass { value = 'initial'; }
    
    registry.push({ map: { [sym]: 'value' }, spawn: TestClass });
    
    const target = {};
    await target.assignGingerly({ [sym]: 'updated' }, { registry });
}, 'should support DI');
```

## Browser Compatibility

These tests are designed to work with:
- Chrome/Chromium
- Firefox
- Safari/WebKit
- Edge

## Expected Results

All tests should PASS. If a test fails, it indicates:
- A regression in the implementation
- An issue with the browser's module loading
- A problem with the test environment setup

## Notes

- Tests use `Symbol.for()` for consistency (symbols persist across realms)
- Tests are isolated and independent
- No external dependencies beyond the module under test
- Tests follow WPT conventions for compatibility with official test harness
- Async operations are properly awaited
- Type assertions handle both native and prototype-extended methods

## Debugging Failed Tests

If tests fail:

1. Check browser console for error messages
2. Verify the `object-extension.js` is properly loaded
3. Ensure the module path in import statements is correct
4. Check that `/resources/testharness.js` is accessible
5. Verify module support in your test environment
