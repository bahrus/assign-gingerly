# Ditto Notation (`` ` `` Keys for Duplicate Targets)

---

## Context

From the [LoopedSubstitutionDuplicateKeys](../Done/AssignFrom/TODO/LoopedSubstitutionDuplicateKeys.md) discussion.

## The Idea

Use backtick-prefixed keys (`` ` ``, `` `2 ``, `` `3 ``, etc.) to express "same key as the entry above" — allowing duplicate keys in a JavaScript object literal without collisions.

```js
assignFrom(el, {
    '?.querySelector?..routerOutlet =>': { do: 'handlerA', resolve: { ... } },
    '`': { do: 'handlerB', resolve: { ... } },    // same key as above
    '`2': { do: 'handlerC', resolve: { ... } },   // same key as above
});
```

The backtick was already reserved in `assignGingerly` (disallowed in `aka` aliases), making it available for special syntax.

## Plausible Use Cases Beyond Handlers

1. **Multiple assignments to the same nested path** — e.g., calling different methods on the same resolved object in sequence (though `withMethods` + array args already handles most of this).

2. **Ordered operations on the same target** — when operation order matters and you want multiple distinct operations on one LHS, not a merge.

3. **Composable config modules** — when spreading multiple config fragments into one pattern object, ditto could express "add another operation to the same target" without the fragments needing to know each other's keys.

## Status

Parked. The immediate need (looped substitution producing duplicate handler keys) is solved by Option 2 (auto-merge into array). Ditto notation is a broader ergonomic pattern that could be useful if non-handler duplicate key scenarios arise.

## If Implemented

- Processing would happen early (alongside or after looped substitution expansion)
- A `` ` `` or `` `N `` key would resolve to "the most recent non-backtick key above me"
- For handler keys: values would auto-merge into the Multiple Handlers array form
- For normal keys: later values would overwrite (same as standard object behavior) — or should they merge? TBD.
