# Looped Substitution — Duplicate Key Problem

---

## Context

From the [LazyLoadSwitch](../Handlers/LazyLoadSwitch.md) discussion.

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

---

## Human Response

First, I moved this TODO item up a level,  as I think it could be more applicable.  For now, maybe it should only be an issue with AssignFrom.

Option 2 does seem like a very natural solution.  It solves the handler use case nicely.

But the reason I moved it up.  Are there other scenarios where we might want duplicate keys:

If so, I think we could develop a special syntax to represent duplicate keys.  What I call "ditto" notation, coming from the convention that if writing a sentence on a chalkboard, if the line below is another sentence that has words replaced by a double quote  - " - it is treated as a ditto, meaning transpose the word from the line before (or the first line if multiple lines with " in that placeholder).

So maybe that's how we should interpret:


```js
assignFrom(el, {
    '?.querySelector?..routerOutlet =>': {
        do: 'builtIns.lazyLoadSwitch',
        resolve: { lhs: '?.route', rhs: 'home', instantiate: 'globalThis://homeView' }
    },
    '`': {
        do: 'builtIns.lazyLoadSwitch',
        resolve: { lhs: '?.route', rhs: 'settings', instantiate: 'globalThis://settingView' }
    },
    '`2': {
        do: 'builtIns.lazyLoadSwitch',
        resolve: { lhs: '?.route', rhs: 'profile', instantiate: 'globalThis://profileView' }
    }
}
```

If no immediate use cases come to mind (outside of a looped handler), but such a use case seems plausible, and if such a use comes up that is more than plausible, and this seems like a reasonable solution, please create a TODO item in the highest folder where it makes sense.  And for now, proceed with Option 2, and move this file to requirements/assignFrom/Handlers when done.

---

## Kiro's Response

The ditto notation idea is interesting — backtick is already reserved (disallowed in `aka`), so it's available for special syntax. I can see it being useful for:
- Composable config fragments that add operations to the same target
- Ordered multi-step operations on one LHS without array-wrapping

I've created a [TODO at the top level](../../TODO/DittoNotation.md) since it's a broader concept that could apply beyond just `assignFrom`.

For now, proceeding with **Option 2** — auto-merge duplicate ` =>` keys into arrays during looped substitution expansion.

### Implementation

The change is in `expandSubstitutions` in `assignFrom.ts`. After expansion, instead of `Object.fromEntries(entries)` (which drops duplicates), I'll detect duplicate keys and merge their values into arrays — but only for ` =>` handler keys, since normal keys overwriting is standard/expected behavior.

Actually, even for normal keys, duplicate expansion is likely intentional (the user wants multiple operations). But merging non-handler values into arrays would change semantics — for normal keys, later values should still overwrite (that's how objects work). So the merge-into-array logic should only apply to ` =>` keys.
