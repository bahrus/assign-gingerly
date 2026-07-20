# Range Selector Handler


---

## Human Ask

In looking at the roundabout documentation, we were able to convert a typical web component with lots of JavaScript into a 95% JSON configuration, thanks to merging with assignFrom.  The reason it wasn't 100% was due to this function:

```JS
updateStatus(self) {
    const { count } = self;
    if (count <= 10) return { status: 'low', statusMessage: 'Low count' };
    if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
    return { status: 'high', statusMessage: 'High count!' };
}
```

The closest thing we currenlt have for this is ' ?=' operator, but I think extending that to support this scenario is too big a stretch.

Since builtins are loaded on demand asynchronously (but can be invoked synchronously by pointing to it in the handlers option), I think we can justify defining a "rangeSelector" handler to make the first example 100% JSON, even if it isn't altogether pleasant to look at.

I'm thinking:

```JS
oCustomEl.assignFrom(
    {
        '?. =>': {
            do: 'builtins.rangeSelector',
            get: {
                select: '?.count',
                ranges: {
                    low: 10, //up to, including 10
                    med: [20], //last value (10) up to, not including 20
                    high: []
                },
                merge: {
                    low: {status: 'low', statusMessage: 'Low count' },
                    med: { status: 'medium', statusMessage: 'Medium count' },
                    high: { status: 'high', statusMessage: 'High count!' }
                }
            }
        }
    },
    {
        from: vm
    }
);
```

I'm open to alternative suggestions.


---

## AI Response

Good use case — converting the last piece of imperative logic into declarative config. A few thoughts on the API:

### The `ranges` format

The proposed format is clever but has some readability concerns:

```JS
ranges: {
    low: 10,        // ≤ 10
    med: [20],      // > 10 and < 20
    high: []        // ≥ 20 (everything else)
}
```

- `10` = "up to and including" — clear
- `[20]` = "up to but not including" — the array wrapper as a signal for exclusive bound is non-obvious
- `[]` = "everything else" — empty array as catch-all is opaque

Someone reading this cold would struggle to understand the semantics of `[20]` vs `20` vs `[]`.

### Alternative: explicit thresholds as an ordered array

```JS
get: {
    select: '?.count',
    ranges: [
        { max: 10, key: 'low' },
        { max: 20, key: 'med' },
        { key: 'high' }          // no max = catch-all
    ],
    merge: {
        low: { status: 'low', statusMessage: 'Low count' },
        med: { status: 'medium', statusMessage: 'Medium count' },
        high: { status: 'high', statusMessage: 'High count!' }
    }
}
```

**Pros:** Reads like a decision table. No ambiguity about inclusive/exclusive — `max` means "up to and including" (or we document it as exclusive — either way it's explicit). Order determines evaluation. No max = default.

**Cons:** More verbose than the object form.

### Alternative: concise tuple format

```JS
get: {
    select: '?.count',
    ranges: [
        [10, 'low'],      // ≤ 10 → 'low'
        [20, 'med'],      // ≤ 20 → 'med'
        ['high']          // else → 'high'
    ],
    merge: {
        low: { status: 'low', statusMessage: 'Low count' },
        med: { status: 'medium', statusMessage: 'Medium count' },
        high: { status: 'high', statusMessage: 'High count!' }
    }
}
```

**Pros:** Very compact, JSON-friendly, ordered evaluation. Last element without a threshold is the default.

**Cons:** Positional (threshold, key) requires documentation.

### My recommendation: your original format, with a small tweak

Your original is the most compact and JSON-friendly. I'd just clarify the empty-array semantics with a named constant or simpler sigil:

```JS
ranges: {
    low: 10,        // ≤ 10
    med: 20,        // ≤ 20 (evaluated in order, so this means 11-20)
    high: Infinity  // everything else
}
```

Wait — if we make it simpler: **all values are upper bounds (inclusive), evaluated in object key order.** The first range whose bound is ≥ the value wins. `Infinity` (or just omitting a bound) means "catch-all."

But `Infinity` isn't JSON-serializable. For JSON configs:

```JS
ranges: {
    low: 10,
    med: 20,
    high: null  // null = no upper bound (catch-all)
}
```

This is the cleanest:
- Numeric value = upper bound (inclusive, `≤`)
- `null` = catch-all (everything not matched above)
- Evaluation order = object key order (which is insertion order in modern JS)

### Handler behavior (return-value protocol)

The handler should use the **merge** approach — it returns the matched `merge` object, and `processHandlerCommands` merges it into the LHS target via `assignGingerly`:

Actually, looking at this more carefully — the `'?. =>'` LHS means the handler targets the entire element. If the handler returns an object, `processHandlerCommands` would assign it back to `lhsTarget` (which is the element). But you actually want to merge the result into the element's *properties* — which is what `assignGingerly` does.

So the handler's `assign()` method should:
1. Resolve `select` from the VM
2. Walk `ranges` in order to find the matching key
3. Look up that key in `merge`
4. Return the merge object (return-value protocol assigns it back to lhsTarget via `assignGingerly`)

Wait — the return-value protocol does `lhsParent[lhsKey] = result`, not merge. For merging into the target, the handler should call `assignGingerly` internally:

```ts
assign(lhsTarget, resolvedParams, options) {
    const { select, ranges, merge } = resolvedParams;
    const matchedKey = findMatchingRange(select, ranges);
    if (matchedKey && merge[matchedKey]) {
        assignGingerly(lhsTarget, merge[matchedKey]);
    }
}
```

This is ~10 lines of handler code. Very lightweight.

### Summary

| Aspect | Recommendation |
|--------|---------------|
| Range format | Numeric upper bounds + `null` for catch-all, evaluated in key order |
| Merge behavior | Handler calls `assignGingerly(target, merge[key])` internally |
| Implementation | ~20 lines (handler class + range matching) |
| JSON-serializable | Yes (no Infinity, no functions) |
| Lazy-loadable | Yes (built-in, loaded on demand) |

Want me to implement with the `null` catch-all format, or do you prefer your original `[]`/`[20]` distinction?
