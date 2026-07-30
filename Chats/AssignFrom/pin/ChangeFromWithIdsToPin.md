# Alternative name to withIDs

---

## Human Ask

I wonder if "withIds" is the best name for what it is doing?  

```JS
await assignFrom(document.body, {
    '#[main]?.textContent': '?.greeting',
    '#[main] =>': {
        do: 'builtIns.lazyLoad',
        get: { if: '?.showContent', instantiate: 'globalThis://myTemplate' }
    }
}, {
    from: viewModel,
    withIds: {
        main: { qry: '.mainView' }  // find by class, auto-assign ID, cache
    }
});
```

It may suggest to the casual user that "main" is the name of the id.

I'm thinking that pin and/or 📍 might be better?



---

## AI Response

You're right about the confusion — `withIds: { main: { qry: '.mainView' } }` reads like "main IS the id" rather than "main is a variable name I use to reference this element."

### Evaluating alternatives

| Name | Read-aloud with `#[main]` | Confusion risk |
|------|---------------------------|----------------|
| `withIds` | "with IDs: main is..." | Suggests `main` is the ID value |
| `pin` | "pin: main to `.mainView`" | Clear — "pin a name to an element" |
| `📍` | Same as pin but shorter | Clear, memorable |
| `ref` | "ref: main is..." | Familiar from React, but could imply a live ref object |
| `anchor` | "anchor: main at `.mainView`" | Good metaphor but verbose |
| `el` | "el: main is..." | Too terse, collides with common variable names |
| `bind` | "bind: main to..." | Implies data binding, misleading |

### My take: `pin` is excellent

"Pin" perfectly describes what's happening — you're pinning a short name to a DOM location so you can reference it repeatedly. The metaphor works:

- 📍 You "pin" a location on a map (the DOM tree)
- The pin has a label (the variable name: `main`)
- You can refer to the pin later without re-navigating

```JS
await assignFrom(document.body, {
    '#[main]?.textContent': '?.greeting',
}, {
    from: viewModel,
    pin: {
        main: { qry: '.mainView' }
    }
});
```

That reads naturally: "pin 'main' to the element matching `.mainView`."

### Could `📍` work as the actual key?

```JS
{
    from: viewModel,
    '📍': { main: { qry: '.mainView' } }
}
```

It works syntactically (valid JS object key), but it's harder to type than `pin` and might be jarring in a config object where everything else is words. I'd use `pin` as the primary name and mention `📍` as a documented alias (like `'|'` for `byItemprop`).

### Comparison with `at`

The naming now tells a clear story:
- **`pin`** — "pin a name to an element, give it a stable ID for fast repeated access"
- **`at`** — "the element is *at* this position (child indices), resolve fresh each time"

Both use `#[x]` syntax. `pin` implies permanence (ID assigned, cached). `at` implies a transient positional lookup.

### Recommendation

Rename `withIds` → `pin`. Support `📍` as an alias for those who like it. The `#[x]` syntax on LHS/RHS stays unchanged — it just looks up the name in `pin` (or `at`).

---

## Human Response I

Good point about '📍' being hard to type, especially as pin is such a short name.  Let's just support pin only for now.  Please implement this, including updating the documentation and test / demo files.

---

## AI Implementation Notes

Done. Renamed `withIds` → `pin` across the codebase:

**Files updated:**
- `assignFromAsync.ts` / `.js` — interface field + all usage
- `assignFrom.ts` / `.js` — `getEffectiveIds` helper + all usage
- `resolveIdRef.ts` / `.js` — comments and parameter docs
- `withIdsCorrector.ts` / `.js` — console.warn messages
- `paths.ts` — example usage
- `tests/rhs-id-ref.html` — test configs
- `demos/js-framework-benchmark.html` — demo config
- `README.md` — all documentation references
- `docs/manage-template-list.md` — feature list + examples
- `docs/inferred-assignments.md` — example usage

All diagnostics clean. The `#[x]` syntax is unchanged — it just looks up names in `pin` (or `at`).
