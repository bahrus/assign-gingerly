# Assign Before Showing

---

## Human Ask

We now have a fairly good pattern set by [manage-template-list](../../../../../docs/manage-template-list.md) for using assignFrom everytime we instantiate a template.

I'm hoping that logic is flexible / portable enough that we can use it in other contexts.  Basically, anywhere we have a handler that instantiates a template.

I.e. can we add something similar to lazyLoad and lazyLoadSwitch with minimal new code?


---

## AI Response

Yes — this is very doable with minimal new code. The `lazyLoad` handler already has a clear hook point for post-clone logic, and the assignment pattern from `manageTemplateList` is self-contained (just a call to `assignFrom` with some options).

### Where it fits

`lazyLoad` has two clone paths:
1. `cloneAndInsert` (async) — already calls `onCloneInserted` hook + `onInstantiated` callback
2. `cloneAndInsertSync` (for view transitions) — no hooks currently

The assignment should happen **after cloning, before insertion** (or immediately after insertion but before showing). The natural place is the `onCloneInserted` hook — or better, directly in the clone methods.

### Proposed API

Reuse the same `fromEachItem`-style config (or a subset of it), nested under a new param — maybe `assign`:

```JS
{
    do: 'builtIns.lazyLoad',
    get: {
        if: '?.isVisible',
        instantiate: 'globalThis://myTemplate',
        assign: {
            assignToFragment: {
                '#[title]?.textContent': '?.title',
                '#[body]?.innerHTML': '?.content'
            },
            withOptions: {
                at: { title: [0], body: [1] }
            }
        }
    }
}
```

Or for multi-element templates, the `configs` array:

```JS
assign: {
    configs: [...],
}
```

The `from` would come from the outer `options.from` (the same source that resolved the `get` params).

### Implementation cost

Very small. In `cloneAndInsert` / `cloneAndInsertSync`, after cloning and before inserting:

```ts
if (resolvedParams.assign) {
    const { configs, assignToFragment, withOptions } = resolvedParams.assign;
    const elements = nodes.filter(n => n instanceof Element);
    
    if (configs) {
        const len = Math.min(elements.length, configs.length);
        for (let j = 0; j < len; j++) {
            assignFrom(elements[j], configs[j].assignToFragment ?? {}, { from: options.from, ...configs[j].withOptions });
        }
    } else if (assignToFragment) {
        assignFrom(elements[0], assignToFragment, { from: options.from, ...withOptions });
    }
}
```

That's ~10-15 lines, using the exact same `assignFrom` call pattern as `manageTemplateList`. The `assignFrom` import is already available (it's a sibling module).

### One consideration: `from` source

In `manageTemplateList`, the `from` is the *item* (per-row data). In `lazyLoad`, there's no "item" — it's a single conditional render. So the `from` should be the outer `options.from` (the view model that drove the condition). This means resolved paths in `assignToFragment` reference the same VM:

```JS
// VM
const vm = { title: 'Hello', isVisible: true };

// Config
get: {
    if: '?.isVisible',
    instantiate: 'globalThis://myTemplate',
    assign: {
        assignToFragment: { '#[t]?.textContent': '?.title' },
        withOptions: { at: { t: [0] } }
    }
}
```

`'?.title'` resolves against `vm` — the same source that `'?.isVisible'` resolved from.

### Does this need changes to `lazyLoadSwitch`?

No — `lazyLoadSwitch` extends `lazyLoad` and delegates via `super.assign(...)`. The `assign` param would flow through `...rest` into `resolvedParams` automatically. Zero additional code in `lazyLoadSwitch`.

### Summary

| Aspect | Detail |
|--------|--------|
| New param | `assign` (in `get`/`resolve` config) |
| Shape | Same as `fromEachItem`: `{ assignToFragment, withOptions }` or `{ configs: [...] }` |
| Source | `options.from` (the outer VM) |
| Code added | ~10-15 lines in `cloneAndInsert` + `cloneAndInsertSync` |
| `lazyLoadSwitch` | Inherits automatically, no changes |
| Existing behavior | Unchanged when `assign` is absent |

This is a clean extension that reuses the exact pattern established by `manageTemplateList` without duplicating logic.
