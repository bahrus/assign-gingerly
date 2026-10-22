# How Does Rebinding Work?

## Bruce's Ask

I was thinking about how the tree does rebinding, and I realized I have a dim and probably wrong model in my mind how it works.

During the initial rendering, are weak references established between the rules and the created (or discovered) nodes?  Is that how the elements are found to update?

Or is a tree walk made, based on the position of the nodes only?  How do you protect against other libraries inserting nodes between renders?

Please explain below how that works.


## Claude's Answer

**Neither, exactly.** Tree keeps its own **records**: a tree of plain objects, one per rendered spec, each holding a direct (strong) reference to its element. The only weak link is the one that finds those records: a `WeakMap` keyed by the tree's **start marker comment**. Rebinding follows the records, not positions. Positions only matter when Tree *places* elements, and once, in hydration, when it *adopts* them.

### What's kept after a render

```
treeStates: WeakMap<start marker Comment, Map<map key, TreeNode>>

TreeNode {
  element        // the element itself (strong reference)
  spec, options  // what was last applied, so ctx.rebind() can re-apply it
  children       // TreeNode[]: static children, by index in the spec
  repeat?        // { items: Map<item key, TreeNode>, empty?: TreeNode }
  switch?        // { caseKey, inner: TreeNode, placeholder?: Comment }
  appliedPattern // to skip re-applying unchanged literals
}
```

(See `TreeNode` and `treeStates` in `handlers/tree.ts`.)

- **Map keys** → a `Map` from key to record.
- **Static children** → an array, in spec order.
- **Repeat items** → a `Map` from **item key** (the `key` path, or the index) to record. That's what makes reordering move elements rather than rebind them by position.
- **Switches** → the case rendered last, plus its record, or the placeholder comment when nothing renders.
- **Nested trees** keep their own state, keyed by their own start marker inside the host element.

**Why a WeakMap on the marker:** nothing on the elements points back to the records, apart from closures such as a manager's `ctx.rebind`. If the container is dropped, the marker goes with it, and so do the records. Nothing has to be cleaned up.

### What a later run does

`assign()`, for a target and a config:
1. **Finds the markers** among the target's **direct children**, by their comment text (`?start name="tree"` … `?end`), and looks up the records with the start marker.
2. **Decides what renders** with `mapEntries` (the same pure function used the first time), and for each key takes its record.
3. **Syncs each record** (`syncNode`). If the structure still matches (same tag, same manager, same number of static children, still a repeat / nested tree), it **rebinds the same element**: it applies the pattern and recurses into the children, repeat items (by key) and switch case. Otherwise it creates a new element.
4. **Removes** the elements of keys that no longer render, and **places** the rest in order between the markers.

**A manager's `ctx.rebind()`** doesn't even do step 1: its closure holds its own record, so it re-applies just that subtree (`rebindNode`).

So no element is ever *found* by its position. The records point at the elements.

### Where positions do matter

- **Placement** (`placeNodes`): after a run, Tree makes the DOM order match the records' order. It moves as few elements as possible: what's already in order stays, and only the rest moves (a longest-increasing-subsequence pass, so swapping two items is two moves).
- **Adoption** (`adopt`, hydration only): server markup has no records, so the first run builds them by walking the spec and the markup together, by position (see tree.md, "How the walk pairs spec and markup"). From then on, it's records as above.

### When other code changes the DOM between runs

| What the other code did | What the next run does |
|---|---|
| **Inserted nodes** among the tree's elements (between the markers) | Leaves them in the DOM, but placement puts Tree's elements first, so the foreign nodes end up after them, before the end marker |
| **Inserted nodes inside** a Tree element | Leaves them alone, unless that element's pattern replaces its content (e.g. `textContent`). In a repeat's container, they end up after the items. |
| **Removed** a map entry's or a repeat item's element (or moved it out of its parent) | Notices (`element.parentNode` isn't where the record says) and **creates a new element** for it. A moved element stays wherever it was moved. |
| **Removed a static child** | Rebinds the same element, and puts it back in its parent |
| **Changed a bound property, attribute or text** | Overwrites it, if the run computes something different from what's in the DOM. Unbound attributes and properties are never touched. |
| **Reordered** Tree's elements | Puts them back in the records' order, moving as few as possible |
| **Removed the markers** | This is the one thing that breaks it. Without its start marker, Tree finds no records, so it starts a new region (new markers, appended to the target) and renders fresh. The old elements are left orphaned beside it. |

**The rule for other libraries:** don't remove the markers, and expect Tree to keep "its" elements in order between them. Anything else is either left alone or repaired on the next run.

### On weak references "between the rules and the nodes"

There aren't any, and none are needed. The rules (the specs) are referenced *from* the records (`node.spec`). They don't key anything, except that `compile`'s templates are cached in a `WeakMap` keyed by the map object.

The elements are referenced strongly from the records. That's safe, because the records themselves are only reachable through the marker's WeakMap entry, or through closures living on those same elements.

## Bruce's Response I

Do you have any idea if this resembles how preact works?  Or other libraries?


## Claude's Answer II

**Tree is closest to Lit.** It shares Lit's structure fixed by a template, per-binding records with direct node references, and comment markers bounding the regions it owns. It differs from Preact and React in one basic way: they rebuild a description of the UI on every render and diff it against the last one. The comparisons below come from my knowledge of these libraries' designs, not from reading their current source, so treat the internals as approximate.

### Preact (and React)

**How it works:**
- **Each render builds a new virtual DOM tree** (vnodes) from the components' output.
- **It's diffed against the previous one,** which is kept on the container element as a property (a strong reference, like Tree's records).
- **Each vnode remembers its DOM node,** so the diff finds elements through the previous vnode tree, not by position. That's the same idea as Tree's records.
- **Children are matched by `key`** when keys are given, otherwise by index. That's like Tree's repeats, whose `key` defaults to the index.

**Differences:**
- **What's compared:** Preact compares new vnode props with old vnode props. Tree compares what it computes with the DOM (or skips literals it applied last time). Tree never rebuilds a description of the structure, because the spec *is* the structure and only the data changes.
- **Foreign DOM changes:** React and Preact assume they own the container. Foreign nodes can confuse their `insertBefore` positions, and React is known to throw (`removeChild` errors) when, e.g., a browser translation extension rewrites text nodes. Tree is more tolerant: foreign nodes are kept and pushed after its own, and removed elements are recreated.
- **Hydration:** both walk the server markup by position, like `adopt`'s walk. Preact patches mismatches in place, silently. React warns, and since React 18 falls back to client-rendering the nearest Suspense boundary. That's similar to Tree's all-or-nothing rebuild, at a finer grain.

### Lit

**How it matches Tree:**
- **Structure:** a template's structure is fixed, and only values change, as with Tree's spec.
- **Records:** the first render clones a `<template>` and creates **parts** (child, attribute, property, event) that hold direct references to their nodes. Those are Tree's records.
- **State:** stored on the container as a property, holding the root part.
- **Comment markers:** a child part is the range between two comment nodes. It's the same idea as Tree's `<!--?start-->` / `<!--?end-->`, and the same weak spot: remove a marker and the part is lost.
- **Comparing:** each part compares the new value with the **last value it committed** (not with the DOM), and writes only on change. Tree's fast path is similar, but compares with the DOM.
- **Keyed repeats:** the `repeat` directive reorders by key with a key→index map and a two-ended diff. Tree's `placeNodes` uses a longest-increasing-subsequence pass instead. Same goal: move as few nodes as possible.

**Differences:**
- **Tree** has no template literal per render. The spec is data (JSON-friendly, or built with tree`…`), and patterns can be pipes, joins and managers.
- **Hydration:** Lit's SSR emits a digest of the template in its markers (`<!--lit-part DIGEST-->`). Its hydration checks that digest and **errors on a mismatch** rather than rebuilding. Tree's compiled templates already carry a `signature` intended for the same check; `adopt` doesn't use it yet.

### Solid

**Fine-grained reactivity:** there's no rebind pass. Each binding is an effect, a closure holding its own node, re-run when a signal it read changes. So updates are pushed per value, while Tree pulls: it reruns the whole tree, or a manager's subtree via `ctx.rebind()`, and skips what didn't change. A Tree manager calling `ctx.rebind()` from a setter is a coarse version of the same idea.

**Hydration** finds nodes by **hydration keys** (`data-hk` attributes) rather than by walking positions.

### Svelte

**The compiler generates the records:** each component keeps its nodes in local variables, and an update function patches only the values that changed. Same idea as Tree's records, but as generated code instead of data. Svelte 5's hydration walks by position, with comment markers (`<!--[-->` … `<!--]-->`) bounding blocks, much like Tree's markers and switch placeholders.

### Vue

**A virtual DOM with compiler hints:** static subtrees are hoisted, and "patch flags" tell the diff which bindings are dynamic, so static parts are skipped. Tree's `compile` (baking literals into templates) and `skipLiterals` serve the same purpose. Hydration walks by position, warns on mismatches, and patches in place.

### Beyond rebinding: the hydration strategies

| Idea here | Elsewhere |
|---|---|
| **`adopt: true`:** re-run the config against the server's elements | Classic hydration: Preact, React, Vue, Lit SSR |
| **`adopt: 'pending'`:** bind only what the server marked | **Partial hydration / islands** (Astro, Fresh): only the interactive islands hydrate, and the static HTML around them is left alone |
| **The residue (removed):** ship what HTML can't carry, apply it without re-running anything | **Resumability** (Qwik): state and listener references are serialized into the HTML, and nothing re-runs on load |
| **`data-pending` + CSS:** hide what isn't live yet | Islands' "not hydrated yet" states, and the common "hide until upgraded" `:not(:defined)` trick for custom elements |

### Summary

| | Finds elements by | Compares | Foreign DOM changes | Hydration mismatch |
|---|---|---|---|---|
| **Tree** | Records (direct references), found via the start marker | Computed values with the DOM | Tolerated; markers must stay | Rebuild the whole tree |
| **Preact / React** | The previous vnode tree | New props with old props | Fragile (React: errors) | Patch (Preact); fall back to a client render (React) |
| **Lit** | Parts (direct references), between comment markers | New values with the last committed ones | Tolerated outside its markers | Error |
| **Solid** | Closures per binding | Nothing: signals push changes | Tolerated | Keyed by `data-hk` |
| **Svelte** | Generated local variables | Changed values only | Fragile within blocks | Patch |
| **Vue** | The previous vnode tree, with patch flags | Dynamic props only | Fragile | Warn, patch |

**One idea worth taking from Lit:** check the compiled template's `signature` during `adopt`, as a cheap "this markup came from this spec" test before walking it.
