# Tree Phase III

## Bruce's Ask

As laid out in the initial [scoping of Trees](./TreePhaseI.md#small-notes-on-treetypesdts) and [cited as a blocker for compiling](TODO/TreeThoughtExperiment.md):


- **The types have no notion of arrays yet** (`crew[]`). That's fine for bare bones, but worth reserving a slot. For example, a tuple whose value is an array could repeat its spec per item, keyed by index, which would be a natural place to delegate to `manageTemplateList` later.

I see some examples of integrating manageTemplateList in [tree-demo.html](../../../../demos/tree-demo.html) already.

My first concern is the idea of having a "fire and forget" handover to manageTemplateList, only because we don't know if the module has been already imported (basically), is not ideal.  I wonder if the tree handler can synchronously import the manageTemplateList at the top, so that no async fire and forget is necessary?

Can you create a second demo page, tree-demo-with-array.html that doesn't work yet, but illustrates how you propose we define the mapping for such arrays?, and summarize what you envision below?

## Claude's Response

### On importing `manageTemplateList` synchronously

A static import would remove the first module load, but **not the asynchrony**. The async part isn't only the import:
- **The ` =>` dispatch awaits at every step.** `processHandlerCommands` awaits the handler lookup (even when it's cached), awaits `resolveValues` for the `resolve:` map, then awaits `handler.assign(...)`.
- **`ManageTemplateListHandler.assign` is itself `async`.** It has optional `yieldEvery` yields and a `waitForSettled` path.

So Tree could import the class and call it directly, but it would still return a promise, and the list would still fill in after Tree's synchronous pass. It would also tie Tree to `manageTemplateList`'s template/`querySelector` model and make every Tree user load it.

**My recommendation is native arrays in Tree, with no delegation.** Tree already has everything a keyed list needs:
- the element-spec grammar for each item;
- `TreeNode`s for rebinding in place;
- `placeInOrder` for moves;
- `syncNode` / `createNode` for reuse and creation.

That makes arrays **fully synchronous**. `manageTemplateList` stays what it's good at: templates authored in HTML.

### The demo

**[demos/tree-demo-with-array.html](../../../../demos/tree-demo-with-array.html)** is the current tree demo with its four lists (links, crew, cores, failures) rewritten in the proposed syntax:
- the `list()` helper, the three item `<template>`s and the `globalThis://` protocol are **gone**;
- the "Change links" log no longer waits 50 ms.

Right now the build stops with a clear notice ("Native arrays aren't implemented in builtIns.tree yet…") and the proposed config is shown below the log. I loaded it in Chromium: the notice appears, there are no uncaught errors, and the config renders. **Once arrays are implemented, the page should work unchanged.**

### The proposed syntax

**An object in the children slot means "repeat"; an array there still means static children.**

```js
crew: ['section', { className: 'card crew' }, [
    ['h3', { textContent: 'Crew' }],
    ['ul', {}, {
        each: ['li', {}, [
            ['strong', { textContent: '?.name' }],
            ['span',   { 'textContent =&': { join: [' — ', '?.role'] } }],
            ['small',  { textContent: '?.agency' }],
        ]],
        key: '?.name',
    }],
]],

failures: ['section', { className: 'card failures' }, [
    ['h3', { textContent: 'Failures' }],
    ['ul', {}, {
        each:  ['li', { 'textContent =&': { join: ['T+', '?.time', 's: ', '?.reason'] } }],
        key:   '?.time',
        empty: ['li', { className: 'muted', textContent: 'No failures recorded.' }],
    }],
]],

links: [{ tag: 'nav', ish: 'links-manager' }, { className: '?.className' }, [
    ['ul', {}, { of: '?.linkList', each: ['li', {}, [['a', { href: '?.href', textContent: '?.name' }]]], key: '?.name' }],
]],
```

| Field | Meaning |
|---|---|
| `each` (required) | An ordinary element specification, stamped once per item. It can have its own children, a `{ tag, ish }` header (one manager per item), and even nested repeats. |
| `of` (default `'?.'`) | The path to the array, relative to the node's value. With the default, the node's value *is* the array (`crew`). With `'?.linkList'`, it repeats over the links manager's getter. A nullish result counts as empty. |
| `key` (default: the index) | A path into each item, used to reuse an item's elements across reruns. For primitives, `'?.'` keys by value. Duplicate keys would fall back to the index, with a dev warning. |
| `empty` (optional) | A specification rendered **instead of** the items when the array is empty or missing. It replaces the `hidden: '?.length'` trick. |

**Data context inside `each`:**
- `?.` is the **item**.
- `$parent` is the **object that holds the array**: the VM for `crew`, the links manager for `linkList`. In other words, an `of: '?.'` repeat doesn't push the array itself, because an array is rarely useful as `$parent`.
- `$root` is unchanged.

### How it would work

- **Ownership.** The repeating element owns its content entirely, which is why `each` and static children are mutually exclusive. The element's own **pattern** still applies (e.g. `className`, or `dataset.count: '?.length'` with the default `of`).
- **Reconciliation.** A `Map<key, TreeNode>` per repeat:
  - items with an existing key go through `syncNode` (rebind in place, rebuild if the structure changed);
  - new keys go through `createNode`;
  - missing keys are removed;
  - order is fixed with the same move-only-what's-out-of-place logic as `placeInOrder`.

  `empty` is just one more `TreeNode`, shown when there are no items.
- **Fully synchronous**, like the rest of Tree. `assignFromAsync` resolving means the lists are rendered.
- **Managers per item** come for free: `each: [{ tag: 'li', ish: 'crew-member' }, …]`. `ctx.rebind()` re-applies just that item.

### Types

```ts
export interface RepeatSpecification {
    each: ElementSpecification;
    of?: string;      // path, default '?.'
    key?: string;     // path, default: index
    empty?: ElementSpecification;
}

export type ElementSpecification =
    | ElementSpecificationHeader
    | [ElementSpecificationHeader, Pattern]
    | [ElementSpecificationHeader, Pattern, ElementSpecification[] | RepeatSpecification];
```

### Link to compiling

The repeat object is the **repeat boundary** from the compiling thought experiment. Later, `each` becomes a per-item `<template>`, cloned and walked per item, which is exactly the "thousands of instances" hot path.

### Open questions

1. **`$index` inside items** (for "Crew #1", or zebra striping). Nice to have, but it doesn't fit `fromStack`. It could be a reserved reference like `$index`, or left to pipes and CSS (`:nth-child`). I'd leave it out of the first version.
2. **Moves vs. reuse when no `key` is given.** Index keys mean that inserting at the front rebinds every item (correct, but more work). That's fine as a default; `key` is the fix.
3. **Top-level array values.** If a *map key's* value is an array but the spec has no repeat, the element is created once, with the array as its value (as today). Repeating only happens when a repeat object asks for it.

If this direction works for you, I'd implement it next: types, Tree, tests, and making `tree-demo-with-array.html` work. After that, the working `tree-demo.html` could drop its `manageTemplateList` composition too, or keep it as the "composition" example.

## Bruce's Response I

Looks like a good suggestion.  Please implement with your recommendations to the open questions.  If you can think of scenarios where the support for arrays would fall short, and using manageTemplateList would be the better route, maybe hold on to tree-demo.html.  Maybe we should rename it tree-demo-with-managed-template-list.html if so.  

If using the array route seems like a "no brainer" in all circumstances, feel free to get rid of the tree-demo-with-array.html after porting in the changes to tree-demo.html (or however it is easiest to get back to one demo).




