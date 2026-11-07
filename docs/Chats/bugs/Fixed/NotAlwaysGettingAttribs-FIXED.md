# Bug Fix: withAttrs Not Always Parsing Attributes

## Issue
In `object-extension.ts`, the `ElementEnhancementContainer.get()` method only parsed attributes (via `withAttrs`) when `registryItem.enhKey` was present. This meant that enhancements without an `enhKey` would not receive parsed attributes in their `initVals`, even though `withAttrs` was specified.

## Root Cause
The attribute parsing logic was nested inside the `if (registryItem.enhKey)` block, making it conditional on having an `enhKey`.

## Fix
Moved the attribute parsing logic outside the `enhKey` conditional block so it executes regardless of whether an `enhKey` is present:

1. **Parse attributes first** - Always parse attributes if `withAttrs` is defined
2. **With enhKey** - Merge parsed attributes with existing values from `element.enh[enhKey]`
3. **Without enhKey** - Pass parsed attributes directly to constructor as `initVals`

## Code Changes

### Before (Buggy):
```typescript
if (registryItem.enhKey) {
  // Parse attributes only when enhKey exists
  let attrInitVals = parseWithAttrs(...);
  // ... merge and spawn
} else {
  // No attribute parsing!
  instance = new SpawnClass(element, ctx);
}
```

### After (Fixed):
```typescript
// Parse attributes regardless of enhKey
let attrInitVals = parseWithAttrs(...);

if (registryItem.enhKey) {
  // Merge with existing values
  const initVals = { ...attrInitVals, ...existingInitVals };
  instance = new SpawnClass(element, ctx, initVals);
} else {
  // Pass parsed attributes directly
  instance = new SpawnClass(element, ctx, attrInitVals);
}
```

## Files Modified

1. **object-extension.ts** - Fixed the `ElementEnhancementContainer.get()` method
2. **README.md** - Updated documentation to clarify that `withAttrs` works with or without `enhKey`
3. **wpt/object-extension-withattrs-no-enhkey.html** - Added 8 test cases to verify the fix

## Tests Added

Created comprehensive test suite covering:
- ✅ Basic attribute parsing without enhKey
- ✅ Multiple attributes without enhKey
- ✅ Named parsers without enhKey
- ✅ valIfNull without enhKey
- ✅ parseCache without enhKey
- ✅ Regression test: withAttrs with enhKey still works
- ✅ Edge cases: empty withAttrs, no withAttrs

## Documentation Updates

Updated README.md to clarify:
- `withAttrs` works independently of `enhKey`
- When no `enhKey`: parsed attributes passed directly to constructor
- When `enhKey` present: parsed attributes merged with existing values
- Added example showing `withAttrs` without `enhKey`

## Impact

This fix enables:
- Using `withAttrs` for dependency injection scenarios (no `enhKey` needed)
- Simpler enhancement configurations that don't need enh container storage
- More flexible enhancement patterns

## Backward Compatibility

✅ Fully backward compatible - existing code with `enhKey` continues to work exactly as before.
