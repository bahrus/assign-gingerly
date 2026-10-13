# Tree Thought Experiment.

## Bruce's ask

Suppose we are creating a web component that we expect to repeat thousands of time in a web page.  Suppose that we decide to define the HTML using the tree handler primarily.

Can you think of a way to build the first instance the way we are currently doing, no change.  But we provide a setting somewhere that says:  As you build this, also create a template with the same exact structure (including processing instruction markers) so that with the rest of the instances, you clone the template and then bind and support rebinding.

Could this be done?  Intuitively, do you foresee some scenarios where this could be a performance improvement?  Would going through the exercise result in a strategy where the server could render the template, and even the first instance works this way?

Please don your "creativity hat" and add your speculations below.

## Claude's Speculations

### Short version

- **Yes, it can be done.** Tree's design makes it unusually easy: the structure is static, and *every node in a spec is an element*. So a cloned template's elements, in document order, line up one-to-one with the spec's nodes in preorder. Finding them again after a clone needs **no markers inside the tree, just a walk**.
- **Yes, it can help,** mostly for components with lots of *static* content (wrappers, labels, classes, ARIA). It helps much less for binding-heavy ones. Rebinding doesn't change at all.
- **Yes, the server can render it.** And the exercise points to a cleaner design than "build the first instance, then capture it": **compile the template from the spec**. The spec is JSON, so the same compile step can run on the server, which serves the `<template>`, and then even the first instance is a clone.

### 1. How it could work: compile once, then clone and walk

```js
'?. =>': { do: 'builtIns.tree', compile: 'launch-card', map: { … } }
```

On the first call with `compile: 'launch-card'`:

1. **Compile the spec** (not the built instance) into two things:
   - **A `<template>`** with the full element structure, plus every *static* pattern value baked in (`className: 'card rocket'` → `class="card rocket"`, `textContent: 'Crew'` → a text node).
   - **A binding plan:** the spec nodes in preorder, each with only its *dynamic* pattern keys (anything with `?.`, `$root` / `$parent`, pipes or operators) and its `ish` header, if any.
2. **Build every instance, including the first if you like,** as `template.content.cloneNode(true)`. Walk the clone's elements in document order and zip them with the plan to get the same `TreeNode` tree Tree builds today. Apply only the dynamic keys and attach managers.
3. **Rebinding is unchanged:** it walks `TreeNode`s in lockstep, exactly as now.

**Why compile from the spec rather than capture the first instance?** Capturing has a trap. Patterns set **properties**, and `cloneNode` copies **attributes**. Anything that doesn't reflect (`value`, `checked`, expandos, `ish`) is lost, and anything that does reflect (`className`, `src`) gets copied with *instance-specific* values. You'd have to capture *before* binding, and at that point you're effectively compiling anyway. Compiling from the spec gives the same result, cleanly. It also needs no DOM if the template is produced as an HTML string, which is what makes server rendering possible (section 4).

**Static vs. dynamic, decided once per spec:**
- A literal value is static.
- `?.…`, `$root`, `$parent`, `$0`, protocol strings, and operator keys (`?=`, `=&`, `=>`, `=*`) are dynamic.
- Static keys can only be **baked** if they become attributes or text. That needs a small allowlist (`className`, `id`, `title`, `textContent`, `hidden`, `aria*`, `dataset.*`, plus attributes that reflect on common elements, like `img.width` and `a.href`). Everything else stays in the plan as a "static but applied per instance" key.
- **A nice side effect:** baked keys can be skipped on rebind too, because they never change.

### 2. Rough edges to design around

| Issue | Idea |
|---|---|
| **Keys that vary per instance** (null values skipped, `keepNullish`, `'*'` wildcard keys) | Compile **one template per top-level key** rather than one for the whole tree. Assembling the top level is cheap (it's what `placeInOrder` already does), and skipped or wildcard keys just pick their own template. |
| **Nested `<template>` children** | `cloneNode(true)` on a `<template>` copies its `.content`, so walk into `.content` recursively when zipping. |
| **`manageTemplateList` keys inside patterns** | They're dynamic (handler keys) and fill the `<ul>` after the clone. The template contains an empty `<ul>`, which is exactly right. |
| **Managers (`ish`)** | They're per instance by nature: the plan says "attach `X` here", and nothing about them is baked. |
| **Spec changed between calls** | The compiled template is keyed by `compile: 'name'`. To be safe, store a cheap **structural signature** (the preorder tag/`ish` sequence) next to it, and recompile if the signature doesn't match. |
| **Shadow roots** | Today Tree requires an `Element` target (`lhsTarget instanceof Element`). A web component that repeats thousands of times probably renders into a **`ShadowRoot`**, which is a `DocumentFragment`. Supporting that is a prerequisite: markers and `placeInOrder` already work on any `ParentNode`. |
| **Custom elements in the template** | Template content is inert, so clones upgrade when they're inserted (the same as `createElement` + append today). Use `document.importNode` if you need them to upgrade in the document's registry before insertion. |

### 3. Will it be faster? Where I'd expect a win and where not

The repo's own benchmark (`tests/benchmark.spec.ts`) already shows the raw ratio. Creating 10,000 rows took **278 ms** with plain `createElement` versus **242 ms** with template cloning: about **13% from cloning alone**. So cloning by itself is a modest win. The bigger savings come from what the compile step *removes* from every instance:

| Cost per instance | Today | Compiled |
|---|---|---|
| Normalize the spec + structural checks | every node | once |
| `createElement` + `appendChild` | every node | one `cloneNode(true)` |
| Static pattern keys (labels, classes, ARIA, wrappers) | resolved + assigned per node | **baked: zero** |
| Dynamic keys | resolved + assigned | resolved + assigned (unchanged) |
| Rebinding | lockstep walk | same (no gain, no loss) |

**My intuition:**
- **Clear win:** thousands of instances of a component that's mostly static (cards, rows, form fields with labels and help text). I'd guess **1.5–3× faster creation**, but that's a guess; measure it with the existing benchmark harness.
- **Small win:** binding-heavy components, where nearly every node has `?.` values. The binding cost dominates, and cloning only removes `createElement`.
- **No win, or a loss:** a single instance (you pay to compile and get nothing back), tiny trees, and anything dominated by nested lists (`manageTemplateList` does the real work there).
- **Not affected:** rebinding performance, and memory (the resulting DOM is identical).

There's well-trodden prior art. lit-html (a template plus "parts" found by walking the clone) and Solid (`template()` + `cloneNode` + a walk) both use exactly this pattern. That's reassuring: the approach is proven, and Tree's "every spec node is an element" property makes the walk even simpler than theirs (no comment markers for parts).

### 4. Server rendering: yes, and the first instance can be a clone too

Because compiling is a pure function of the JSON spec, it can be **isomorphic**:

```
compileTree(spec) → { html: '<section class="card rocket"><h3></h3>…', plan, signature }
```

- **Server:** run the same `compileTree` in Node (no DOM needed, since it's string building with escaping) and emit `<template id="tree:launch-card" data-tree-signature="…">…</template>` once per page.
- **Client:** on the first call with `compile: 'launch-card'`, look for `#tree:launch-card` in the target's root node. If the signature matches, adopt it as the compiled template, so **even the first instance is a clone**, and the page's HTML parser did the template-building work for free. If it's missing or doesn't match, compile on the client (the same function, then `template.innerHTML = html`).
- **One step further, still speculative:** the server renders a **bound first instance**, maybe inside declarative shadow DOM. Thanks to the preorder walk, adopting it is nearly free: walk its elements, build `TreeNode`s, then rebind. Rebinding is idempotent, so it just re-applies the same values. That's **hydration**, which Phase I explicitly ruled out for Tree, so it's probably where the line to TreeScope falls. But the compile step makes it cheap enough to be tempting.

### 5. If we try it, I'd go in this order

1. **Support `ShadowRoot` / `DocumentFragment` targets** in Tree. It's a prerequisite, small, and useful anyway.
2. **`compileTree(spec)` as a pure function** (HTML string + plan + signature), with tests that check the clone-and-walk result is identical to today's build.
3. **The `compile: 'name'` option:** a per-key template cache plus a signature check.
4. **A benchmark** in `tests/benchmark.spec.ts`: N instances of the demo's rocket card (static-heavy) and of a binding-heavy row. Compare create and rebind against today's path. Ship only if the static-heavy case shows a clear gain.
5. **Server-side `<template>` adoption** (signature-checked).
6. **Maybe later,** adopting a server-rendered first *instance*, probably as TreeScope.

## Bruce's Response

This sounds very promising.

In the [TreePhaseI](../TreePhaseI.md) chat, you mentioned things like:

>  The types have no notion of arrays yet (crew[]). That's fine for bare bones, but worth reserving a slot. For example, a tuple whose value is an array could repeat its spec per item, keyed by index, which would be a natural place to delegate to manageTemplateList later.

Would it make more sense to resolve those hanging issues first, before embarking on this compiling capability, or are they independent of one another?

## Claude's Response -- Sequencing

**They aren't independent, and arrays should come first.** Arrays determine the *shape* of what compiling produces, while compiling barely constrains how arrays should work.

### Why arrays first

- **Arrays break compiling's core assumption.** The compile sketch relies on "every spec node is exactly one element, so a clone's elements in document order line up with the spec in preorder". An array node produces *N* elements, so a compiled plan needs an explicit notion of a **repeat boundary**: the list container is in the template, and each item has its **own** sub-template. If compiling ships first, its plan format would need reworking once arrays land.
- **Arrays are where compiling pays off most.** "Thousands of instances" usually *are* list items: rows, cards, comments. An item template cloned per item is exactly the hot path that compiling speeds up. Designing arrays with a repeat boundary means compiling later gets per-item templates almost for free.
- **Native arrays clear most of the other open items from Phase I:**

  | Open item (TreePhaseI "rough edges") | Fixed by native arrays? |
  |---|---|
  | #1 Arrays need `<template id>`, `globalThis://`, `querySelector` paths | **Yes**: items reuse the element-spec grammar |
  | #2 Nested handlers run fire-and-forget (lists fill in after the `await`) | **Mostly**: no nested handler for the common case |
  | #3 Root references | Already done |
  | #4 Formatting | Already done (pipes) |
  | #5 `hidden: '?.length'` trick for empty lists | **Yes**, with an `empty` spec (see the strawman below) |

### Independent pieces that can happen any time

| Item | Notes |
|---|---|
| **`ShadowRoot` / `DocumentFragment` targets** | Small, useful on its own, and a prerequisite for compiling (web components render into shadow roots). It could even go first, since it's a warm-up. |
| **Per-key `keepNullish`** | Fixes the demo's trade-off (an `<img>` with no `src` when there's no `patch`). It barely touches compiling. |
| **Phase TBD headers (`$:`, bare class)** | `{ tag, ish }` now covers them. I'd remove them from `treeTypes.d.ts` (or redefine them) rather than carry dead slots. |

### Suggested order

1. **`ShadowRoot` / `DocumentFragment` targets.** Small, and unblocks web components.
2. **Native arrays in Tree,** designed with the repeat boundary in mind. This includes an empty-state affordance and keyed reconciliation, and it resolves rough edges #1, #2 and #5.
3. **Per-key `keepNullish`, and cleaning up the TBD headers.** Small; these can be folded into step 2.
4. **Compiling:** per-key templates plus per-item templates at the repeat boundaries, then the benchmark, then server-side `<template>` adoption.

### A strawman for arrays, to react to

To be designed properly in its own document. One option that stays JSON and reuses the existing tuple: **an object in the children slot means "repeat"**, while an array in that slot still means static children.

```js
crew: ['ul', { className: 'crew' }, {
    each:  ['li', {}, [['strong', { textContent: '?.name' }], ['span', { textContent: '?.role' }]]],
    key:   '?.name',                                             // optional; by index by default
    empty: ['li', { className: 'muted', textContent: 'No crew.' }],   // optional
}],
```

- **Inside `each`, `from` is the item.** `$parent` is the array's enclosing value (the VM here), so items can still reach siblings.
- **Reconciliation** would reuse `TreeNode`s per key. Created and removed items get the same lockstep rebind as everything else. Moved items need the same `placeInOrder` logic Tree already uses at the top level. `manageTemplateList`'s keyed algorithm is a good reference, but Tree wouldn't delegate to it, so no templates or `querySelector` paths are needed.
- **`{ each, key, empty }` is the repeat boundary** that compiling would later turn into a per-item `<template>`.

If this sequencing works for you, I'd start a `TreePhaseIII.md` (or similar) for the arrays design. Alternatively, I could do the small `ShadowRoot` target support first as a warm-up.



