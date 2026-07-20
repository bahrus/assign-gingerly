# Multiple Top Level Elements In Template

---

## Human Ask

Can you please create another page like js-framewor-benchmark.html?  No need to include it in any benchmarking tests.  The difference is the template should have two rows, not one, basically a 2x2 square of bindings.  I suspect we will have issues, but I want to verify and stare at the scenario before proposing needed adjustments if any.

---

## AI Implementation Notes

Created `demos/multi-row-template.html`. The template has two `<tr>` elements per item — a 2×2 grid of bindings (`id`, `label` in row 1; `description`, `status` in row 2). Uses `at` with coordinates `[0, 0]`, `[0, 1]`, `[1, 0]`, `[1, 1]` to target each cell.

The key question this tests: when `manageTemplateList` clones a template with multiple top-level elements, does it correctly identify the `rootEl` for `assignFrom` and track all nodes per key for reconciliation? Try it and see what happens.

---

## Human Response I

So here's the proposed syntax that I think should work:

```JS
const assignValues = {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        get: {
            forEach: '?.data',
            instantiate: 'globalThis://item-tpl',
            forget: true,
        },
        fromEachItem: [
            {
                assignToFragment: {
                    '#[a]?.textContent': '?.id',
                    '#[b]?.textContent': '?.label',
                },
                withOptions: {
                    at: {
                        a: [0],  // first tr, first td
                        b: [1],  // first tr, second td

                    }
                },
                resolve: { key: '?.id' }
            }, {
                assignToFragment: {
                    '#[c]?.textContent': '?.description',
                    '#[d]?.textContent': '?.status'
                },
                withOptions: {
                    at: {

                        c: [0],  // second tr, first td
                        d: [1],  // second tr, second td
                    }
                },
                resolve: { key: '?.id' }
            }
        ]
    }
};
```

The ambiguity is what if the numbers of elements of fromEachItem don't match?

I could see the case the maybe if there's only one, for example, not an array, it should apply to all.

But more than one?  I think the numbers should match.  Or alternatives:

1.  If there are more top level elements in the template than elements of fromEachItem, don't do any assignment to the remaining elements.
2.  If there are fewer, ignore the extra assignment configs.

What do you think?


---

## AI Response II

I like the array syntax for `fromEachItem`. It maps cleanly: element N in the template → config N in the array. Here's my take on the mismatch question:

### Recommendation: lenient matching (your options 1 + 2)

Both rules should apply:
- **More template elements than configs** → extra elements get no assignment (pass-through, useful for spacer rows or decorative elements)
- **More configs than template elements** → extra configs are silently ignored (defensive, doesn't throw)

This is the "zip" semantic — pair up as many as you have, ignore the rest on either side. It's the least surprising behavior and matches how destructuring works in JS (`const [a, b] = [1, 2, 3]` — 3 is ignored).

### Single object (non-array) → apply to first element

Current behavior: `fromEachItem` is an object, `assignFrom` is called with `rootEl` = the first Element found in the cloned nodes. This remains unchanged — it's the "one template element" case and the common path.

### `at` coordinates shift per element

With the array form, each config's `at` coordinates are relative to *its* corresponding top-level element (the `<tr>`), not the whole fragment. So:

```JS
// Config[0] targets first <tr> — at: { a: [0], b: [1] } = tr1.children[0], tr1.children[1]
// Config[1] targets second <tr> — at: { c: [0], d: [1] } = tr2.children[0], tr2.children[1]
```

This is the right mental model — each config "owns" its element.

### Implementation sketch

In `manageTemplateList`, the per-item processing currently does:

```js
const rootEl = clonedNodes.find(n => n instanceof Element);
assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
```

With array `fromEachItem`, it becomes:

```js
const elements = clonedNodes.filter(n => n instanceof Element);

if (Array.isArray(fromEachItemConfig)) {
    const len = Math.min(elements.length, fromEachItemConfig.length);
    for (let j = 0; j < len; j++) {
        const { assignToFragment, withOptions, resolve } = fromEachItemConfig[j];
        assignFrom(elements[j], assignToFragment, { from: item, ...withOptions });
    }
} else {
    // Current behavior — single config, first element
    assignFrom(elements[0], fromEachItemConfig.assignToFragment, { from: item, ...fromEachItemConfig.withOptions });
}
```

### One question: `resolve: { key }` in each config element?

In your syntax, each array element has its own `resolve: { key: '?.id' }`. But the key identifies the *item* for reconciliation — it should be the same across all elements in the array (they're all the same item). Having it in each config is redundant.

I'd suggest: the `key` stays at the top level (outside the array), and the array only contains per-element assignment configs:

```JS
fromEachItem: {
    configs: [
        { assignToFragment: { ... }, withOptions: { at: { ... } } },
        { assignToFragment: { ... }, withOptions: { at: { ... } } },
    ],
    resolve: { key: '?.id' }
}
```

Or keep it simpler — `resolve` at the same level as the array:

```JS
fromEachItem: [
    { assignToFragment: { ... }, withOptions: { ... } },
    { assignToFragment: { ... }, withOptions: { ... } },
],
fromEachItemResolve: { key: '?.id' }
```

Though that's less elegant. What's your preference — key inside each (redundant but consistent), or pulled out to a sibling property?

---

# Human Response II

Okay, this is what we should do.  If the current syntax is used, with no configs, aspply to all child elements from the cloned element.

If the configs array is found (it should always be an array), then use the zip semantic, even if there's a single item.

Let's go with:

```JS
fromEachItem: {
    configs: [
        { assignToFragment: { ... }, withOptions: { at: { ... } } },
        { assignToFragment: { ... }, withOptions: { at: { ... } } },
    ],
    resolve: { key: '?.id' }
}
```

If there are no remaining ambiguities, please begin implementing.

---

## AI Implementation Notes

Clear spec. Let me implement the `configs` array support in `manageTemplateList`:

Now I understand the full structure. I need to:
1. Detect `fromEachItem.configs` array
2. When present, zip configs with cloned elements (not just use the first element)
3. For "update in place" path — apply each config to its corresponding element
4. For "new item" path — same zip logic on the cloned elements

Let me refactor the relevant sections:

Now update the "existing item — update in place" section to handle configs:

Now update the "new item — clone template" section:

Now let me check for diagnostics:

Now update the JS file with the same changes:

Good — the JS file is already updated. Now let me update the demo to use the new `configs` syntax:

Ah — you already edited the demo to match your proposed syntax from the chat (array form with `resolve` in each element). But the agreed-upon syntax is `{ configs: [...], resolve: { key } }`. Let me update it:

Now let me run the tests to make sure nothing's broken:

All passing. The implementation is done:

- **`fromEachItem.configs`** — array of per-element configs, zipped with the template's top-level elements
- **`fromEachItem.resolve`** — stays at the top level (shared key for reconciliation)
- **Zip semantics** — pairs configs with elements, ignores extras on either side
- **Single object (no `configs`)** — unchanged behavior, applies to first element

Try `demos/multi-row-template.html` — it should render the 2×2 binding correctly now.

---

## Human Response III

Can you update the relevant documentation to explain how to deal with this scenario?


