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



