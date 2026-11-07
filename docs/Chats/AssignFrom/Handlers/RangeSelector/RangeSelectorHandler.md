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

## Human Response I

Good feedback.

Taking a fresh look:

```JS
get: {
    select: '?.count',
    ranges: [
        {'<=': 10, merge: { status: 'low', statusMessage: 'Low count' }},
        {'<': 20, merge: { status: 'medium', statusMessage: 'Medium count' }},
        {merge: { status: 'high', statusMessage: 'High count!' }}
    ],
}
```


We should note when we document/type this that false < true.  And ub/ubInc can also be a string.

What do think?

What about alternatives to select, ranges:

```JS
get: {
    switch: '?.count',
    case: [
        {'<=': 10, merge: { status: 'low', statusMessage: 'Low count' }},
        {'<': 20, merge: { status: 'medium', statusMessage: 'Medium count' }},
        {merge: { status: 'high', statusMessage: 'High count!' }}
    ],
}
```

Or compare/wuth?  Any others?

---

## AI Response II

The inline `merge` per case is a big improvement — it eliminates the indirection of key-matching between `ranges` and a separate `merge` map. Each case is self-contained: condition + result in one object. Much easier to read and maintain.

### On naming: `select`/`ranges` vs `switch`/`case` vs others

| Naming | Pros | Cons |
|--------|------|------|
| `switch`/`case` | Familiar from JS syntax, immediately readable | `switch` is a reserved word — can't destructure without quoting. Also implies exact match, not ranges |
| `select`/`ranges` | Descriptive, no reserved word clash | `ranges` implies numeric only (might not match string/boolean use) |
| `compare`/`with` | Generic, works for any type | `with` is a reserved word (strict mode) |
| `value`/`when` | Clean, evokes pattern matching (`match`/`when` in other languages) | `value` is overloaded in many contexts |
| `on`/`when` | Very concise: "on this value, when..." | `on` might be confused with event handling |

**My pick: `value`/`when`**

```JS
get: {
    value: '?.count',
    when: [
        { '<=': 10, merge: { status: 'low', statusMessage: 'Low count' } },
        { '<': 20, merge: { status: 'medium', statusMessage: 'Medium count' } },
        { merge: { status: 'high', statusMessage: 'High count!' } }
    ],
}
```

Reads naturally: "value is count; when ≤ 10 merge low; when < 20 merge medium; otherwise merge high." No reserved words, no confusion with event handlers or existing `select` DOM semantics.

Runner-up: `switch`/`case` is the most instantly recognizable, and the reserved-word issue is minor since it's inside an object literal (quoted keys are fine in JSON configs anyway).

### On the operator keys (`<=`, `<`)

I like this — it's self-documenting. The supported set would be:

| Key | Meaning |
|-----|---------|
| `<=` | value ≤ threshold |
| `<` | value < threshold |
| `>=` | value ≥ threshold |
| `>` | value > threshold |
| `===` | exact match |
| `!==` | not equal |
| (none) | default/catch-all |

For the common `<=` case (which is what the original `updateStatus` uses), this reads cleanly. And yes, good call that `false < true` and strings compare lexicographically — worth documenting.

### One thought: what about multiple conditions per case?

```JS
{ '>=': 10, '<': 20, merge: { ... } }  // 10 ≤ value < 20
```

This would mean "all conditions must be true" (AND). Gives you open intervals without needing the sequential evaluation trick. The first case in your example would be `{ '<=': 10, merge: {...} }` — just one condition. But `{ '>=': 10, '<': 20 }` gives you a proper range band.

This is a natural extension of the single-operator format — no new syntax, just allows multiple operator keys per case object. The handler checks all operator keys and requires all to pass.

### Summary recommendation

```JS
{
    do: 'builtIns.rangeSelector',
    get: {
        value: '?.count',
        when: [
            { '<=': 10, merge: { status: 'low', statusMessage: 'Low count' } },
            { '<': 20, merge: { status: 'medium', statusMessage: 'Medium count' } },
            { merge: { status: 'high', statusMessage: 'High count!' } }
        ]
    }
}
```

- `value` / `when` naming (or `switch`/`case` if you prefer familiarity over reserved-word avoidance)
- First matching case wins (short-circuit)
- No operator keys = default/catch-all
- Multiple operators per case = AND logic (future-proof)
- `merge` in each case is applied via `assignGingerly(target, merge)`

---

## Human Response II

Let's go with your recommendations.  Please implement.

---

## AI Implementation Notes

Done. Created `builtIns.rangeSelector`:

**Files created:**
- `handlers/rangeSelector.ts` / `.js` — ~50 lines (handler class + condition matching)

**Files updated:**
- `processHandlerCommands.ts` / `.js` — registered in `BUILT_IN_MAP`
- `builtInEmoji.ts` / `.js` — added `📊` mapping
- `README.md` — documented with example, operator table, and behavior notes

**API:**
```JS
{
    do: 'builtIns.rangeSelector',
    get: {
        value: '?.count',
        when: [
            { '<=': 10, merge: { status: 'low' } },
            { '>=': 10, '<': 20, merge: { status: 'medium' } },  // AND logic
            { merge: { status: 'high' } }                         // catch-all
        ]
    }
}
```

First match wins. Merges via `assignGingerly(target, merge)`. Fully JSON-serializable.
