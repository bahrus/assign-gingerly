# Looped Substitution — Duplicate Key Problem

---

## Context

From the [LazyLoadSwitch](./LazyLoadSwitch.md) discussion.

## The Problem

When using looped substitution (`where_x_in`) with handler ` =>` keys, expansion can produce multiple entries with the **same LHS key**. Since the expanded entries are converted to an object via `Object.fromEntries()`, later entries overwrite earlier ones — only the last expansion survives.

Example:

```js
assignFrom(el, {
    '?.querySelector?..routerOutlet =>': {
        do: 'builtIns.lazyLoadSwitch',
        resolve: { lhs: '?.route', rhs: '${x}', instantiate: 'globalThis://${x}View' }
    }
}, {
    from: vm,
    withMethods: ['querySelector'],
    where_x_in: ['home', 'settings', 'profile']
});
```

After expansion, all three entries have the same key `'?.querySelector?..routerOutlet =>'` — only `profile` survives in the resulting object.

## Possible Solutions

1. **Use entries array instead of object** — keep the expanded result as an array of `[key, value]` pairs rather than converting to an object. Process entries sequentially (duplicates are intentional).

2. **Auto-convert to array form** — when expansion produces duplicate keys, automatically merge the values into an array (the Multiple Handlers pattern): one key → array of handler configs.

3. **Document the limitation** — tell users to write the array form manually for this pattern. Simple, but loses the `where_x_in` ergonomic benefit.

## Recommendation

Option 2 seems most natural — if expansion produces duplicate ` =>` keys, combine their RHS values into a single array entry. This leverages the existing Multiple Handlers support and matches the mental model of "expand this template into N handlers on the same target."

## Status

Parked for further consideration.
