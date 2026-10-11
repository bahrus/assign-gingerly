# Tree Handler

# Bruce's Ask

As suggested in the [previous discussion](./TreeScope.md#claudes-follow-up), I've created a [specialized type file](/assign-gingerly/types/assign-gingerly/treeTypes.d.ts) that may eventually get merged into the main [assign-gingerly](/assign-gingerly/types/assign-gingerly/types.d.ts) types file.

## Bare bones examples

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JS
const vm = {
    patch: {
        small: "./data/mission-patch.svg",
        alt: "Demo Mission 7 patch"
    },
};
await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.Tree',
        map: {
            patch: ['img',
                // optional 
                { 
                    //assign-from
                    src: '?.small', alt: '?.alt',
                }
            ],
        }
    }
}, {
    from: vm
});
```

This would generate:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img src=./data/mission-patch.svg alt="Demo Mission 7 patch">
</details>
```

## What happens on the second call?

Ideally, during the first render cycle, some sort of map tied to the matching element is established, and a way of looking up already created elements based on the tree structure would be in memory, in which case it could in this reassign the src and alt (if the vm values changed).  Is that doable?

Keep in mind, when evaluating this possibility, that the type definition mentioned initially has a way of specifying siblings (matching other keys of the vm), as well as generating children, in scenarios where 

```JS
patch: ['img',
    // optional assign-from to the newly created img element
    { 
        //assign-from
       src: '?.small', alt: '?.alt'},
    }, 
    //optional children
    [
        ['template', {...}, [...]
    ]
],
```

contains a third element of the tuple, as shown above.

If this is not possible, we can contemplate alternatives:

1.  Throw an error
2.  At least remember the top level children created, and delete them first
3.  Something else?

Please add your thoughts so far, including creative, friendly improvement suggestions.

---

## Claude's Thoughts

### The second call: yes, it's doable, and cheaper than it sounds

The key property of this design is that **the structure is static**. The spec is a fixed tree of tuples. Only the *patterns* (`src: '?.small'`) depend on the VM. That's the same insight behind lit's template parts and Solid's compiled templates: once the structure has been created, a re-render never needs to diff DOM. It just **re-runs the bindings**.

So on the first call, Tree builds a small "instance tree" next to the DOM:

```ts
interface TreeNode {
    spec: ElementSpecification;  // the tuple this node came from
    element: Element;
    children: TreeNode[];        // same order as spec[2]
}
// per target (+ per config, see below)
const state = new WeakMap<Element, Map<string /* vm key */, TreeNode>>();
```

On the second call, it walks the spec and the `TreeNode`s **in lockstep**. For each node it calls `assignFrom(node.element, spec[1], { from: value })`, then recurses into the children by index. There's no querying and no diffing. Because the spec is static, children line up by index, so they need no keys. This answers your question, and also #5 / #10 from the previous discussion: Tree holds the elements strongly in a `WeakMap` keyed by the target, so the instance needs no `WeakRef`.

### Edge cases to decide (none of them blockers)

| Situation | Suggestion |
|---|---|
| **The spec changed between calls** (different `map` object, or a different tuple for a key) | Compare spec **by reference**. If it differs, rebuild just that key's subtree; that's your option 2, scoped to one key. Reference equality is free, and a config object that's typically a module-level constant stays stable. |
| **A VM value appears or disappears** (`patch` is `undefined` on one call, set on the next) | Create or remove that key's subtree. This needs a stable **insertion point**, so... |
| **Where new elements go** | ...wrap Tree's output in **start/end comment markers**, using the existing `markerUtils` (as `manageTemplateList` and `microDataJoin` do). That gives an anchor for inserting in map order, scopes Tree's nodes away from the `<summary>` and any other content, and lets two Tree configs share one target. |
| **External code removed or moved an element** | Check `node.element.parentNode` against the expected parent before re-running bindings. If it's gone, rebuild that subtree (or ignore it; either is defensible for "simple scenarios"). |
| **Two different Tree configs on the same target** | Key the state by marker pair, not just by target. Markers make this fall out naturally. |

So my take on your list: **not 1** (throwing makes the second call useless, and it's the common case), **2 as the per-key fallback**, and **in-place rebinding as the main path**.

### Semantics worth pinning down

1. **What does a child's `from` resolve against?** I'd say the **parent's value**, so `patch`'s children see `vm.patch`. That makes `'?.small'` mean the same thing at every depth. A child that needs the root VM could use a dedicated prefix (or `ctx`) rather than changing the default.
2. **What happens with missing values?** If `vm.patch` is `undefined`, `src: '?.small'` resolves to `undefined`, and `img.src = undefined` makes the browser request a URL literally named `undefined`. I suggest: **don't create the key's element when its value is `null`/`undefined`**, unless the tuple opts in. This also gives the appear/disappear behavior above for free.
3. **`'template'` children should go into `.content`, not into `childNodes`.** Otherwise they render as live, light-DOM children of the template.

### Small notes on [treeTypes.d.ts](../../../../../types/assign-gingerly/treeTypes.d.ts)

- **`itemScopeManagerName`** is `` `$:{RegisteredItemScopeManagerName}` ``. There's no `${…}`, so this is the literal string `$:{RegisteredItemScopeManagerName}`. You probably meant `` `$:${RegisteredItemScopeManagerName}` ``.
- **`{new(): HElement}` puts `tag` / `a` / `c` on the instance**, so Tree would have to construct an instance just to learn which tag to create. Two friendlier options:
  - make them **statics** (`{ new(el: Element): any; tag: string; a?: Pattern; c?: ElementSpecification[] }`), or
  - also accept a **plain object** `{ tag, a, c }` as a header. That form is pure JSON, which would make Tree's config serializable whenever no behavior is attached. That's a nice step toward whatever TreeScope ends up being.
- **The `c: HElement[]` in `HElement` differs from the tuple's `ElementSpecification[]`.** Using `ElementSpecification[]` in both places keeps one recursive grammar.
- **The types have no notion of arrays yet** (`crew[]`). That's fine for bare bones, but worth reserving a slot. For example, a tuple whose value is an array could repeat its spec per item, keyed by index, which would be a natural place to delegate to `manageTemplateList` later.

### One reminder

The example still uses **`await assignFrom(...)`**. The sync `assignFrom` processes handler keys fire-and-forget (`import('./processHandlerCommands.js').then(...)`, [assignFrom.ts:641](../../../../../assignFrom.ts#L641)) and returns synchronously, so the `<img>` won't exist yet when the `await` resolves. The example should use `assignFromAsync`, or `assignFrom` should return the handler promise.

### Friendly extras (take or leave)

- **The "compiled" fast path pays off now.** Since the walk is "for each node: assignFrom(element, pattern, from)", the patterns could be pre-parsed once per spec (cached in a `WeakMap<spec, Parsed>`). Second calls then only resolve paths and assign values.
- **A dev-mode `console.warn` when a spec key has no matching VM key** (on the first call only) would catch typos like `pacth`.
- **`'*': TBD` from the previous round** fits this model nicely as a *default `ElementSpecification`* applied to unmapped keys, e.g. `'*': 'span'`, plus a default pattern of `{ textContent: '?.' }`. That gives an h-style "just show me the data" mode in one line.