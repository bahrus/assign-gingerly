# assign-gingerly Test Suite

This directory contains comprehensive unit tests for the assign-gingerly library using Playwright.

## Test Files

### 1. `basic.spec.ts`
Tests basic object assignment functionality that mirrors `Object.assign`:
- Basic key-value assignment
- Empty source objects
- Multiple properties
- Property preservation and overwriting
- Non-object target handling

### 2. `nested.spec.ts`
Tests nested path assignment using the `?.` notation:
- Single level nesting (`?.key`)
- Multiple level nesting (`?.level1?.level2?.level3`)
- Intermediate object creation
- Mixed nested and non-nested keys
- Recursive merging of nested objects
- Preserving existing nested structures

### 3. `dependency-injection.spec.ts`
Tests the dependency injection system based on symbols and registry:
- Registry creation and item definition
- Finding items by symbol
- Synchronous class spawning
- Asynchronous class spawning with Promises
- Instance reuse and caching
- Multiple symbols in a single call
- Combining nested paths with symbol dependencies
- Lazy `set` property for symbol assignment

### 4. `edge-cases.spec.ts`
Tests edge cases and special scenarios:
- Array values (not recursed into)
- Numeric values (including zero)
- Boolean values
- Null and undefined handling
- String values and special characters
- Very deep nesting
- Special characters in paths
- Sequential calls to assignGingerly

## Running Tests

### Prerequisites
Install Playwright and its dependencies:
```bash
npm install --save-dev @playwright/test @types/node
```

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npx playwright test tests/basic.spec.ts
```

### Run Tests in Debug Mode
```bash
npx playwright test --debug
```

### Run Tests with UI Mode
```bash
npx playwright test --ui
```

### View Test Report
```bash
npx playwright show-report
```

## Test Coverage

The test suite covers:

1. **Basic Functionality**
   - Simple object assignment
   - Property overwriting
   - Multiple properties

2. **Nested Paths**
   - Deep nesting with `?.` notation
   - Creating intermediate objects
   - Preserving existing structures

3. **Dependency Injection**
   - Symbol-based mappings
   - Registry management
   - Instance creation and caching
   - Async class loading
   - Lazy property assignment

4. **Edge Cases**
   - Array handling
   - Various data types
   - Deep nesting
   - Sequential operations

## Configuration

The Playwright configuration in `playwright.config.ts` includes:
- Multiple browser support (Chromium, Firefox, WebKit)
- HTML reporter for visual test results
- Retry configuration (2 retries on CI)
- Parallel execution settings

## Test Examples

### Basic Assignment
```typescript
const target = {};
assignGingerly(target, { hello: 'world' });
expect(target.hello).toBe('world');
```

### Nested Assignment
```typescript
const target = {};
assignGingerly(target, { '?.a?.b?.c': 'value' });
expect(target.a.b.c).toBe('value');
```

### Dependency Injection
```typescript
const registry = new BaseRegistry();
const symbol = Symbol.for('test');

class MyClass { value = 'initial'; }

registry.push({
  symlinks: { [symbol]: 'value' },
  spawn: MyClass
});

const target = assignGingerly({}, { [symbol]: 'new value' }, { registry });
```

## Notes

- All tests are async and use the Playwright test framework
- Tests are isolated and don't depend on external state
- Each test creates its own test data
- Symbols used in tests are created with `Symbol.for()` for consistency
