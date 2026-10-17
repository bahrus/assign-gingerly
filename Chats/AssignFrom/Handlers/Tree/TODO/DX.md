# DX

## Bruce's Ask

We already have [a folder of utilities](../../../../../DX/), including creating nested paths with typescript support.

I think having a utility to generate the tree syntax would be helpful, similar to lit.  What do you think?  Would it make any difference to an AI engine, or just humans, or would it just as easy to get used to the tree notation?  Is it doable?

Please add your thoughts below.

## Claude's Thoughts

**Short version:** yes, it's doable, and I think worth it. Not because the tree notation is hard to learn, but because **nested positional arrays are error-prone to write and to read, for humans and AI alike.** A tagged template would be authoring sugar that **produces the same tree notation**, which stays the canonical, serializable form.

### What it could look like

```js
import { tree } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';

const p = paths<Launch>();   // typed '?.' paths, as today

const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <h3 class="title">${p.name}</h3>
            <p>Launched ${p.date} by ${p.rocket}</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <button @click=${{ call: 'launch' }}>Launch</button>
        </article>`,
};
```

That would produce exactly what we'd write by hand today:

```js
['article', { 'class :=': 'card', 'aria-label :=': '?.label' }, [
    ['h3', { 'class :=': 'title', textContent: '?.name' }],
    ['p', { '?. =&': { microJoin: ['Launched ', '?.date', ' by ', '?.rocket'] } }],
    ['ul', {}, { each: ['li', { textContent: '?.name' }], of: '?.crew', key: '?.id' }],
    ['button', { 'textContent': 'Launch', ' +=': { on: 'click', call: 'launch' } }],
]]
```

**Mapping rules**, close to lit's so they feel familiar:

| In the template | Becomes |
|---|---|
| `class="card"` (a literal attribute) | `'class :=': 'card'`: **baked under `compile`** |
| `aria-label=${…}` | `'aria-label :=': …` (a dynamic attribute) |
| `.value=${…}` (lit's property prefix) | `value: …` (a property) |
| `@click=${{ call: … }}` | ` +=` event binding |
| `${p.name}` as an element's only content | `textContent: '?.name'` |
| text mixed with `${…}` | a **`microJoin`** (or `join`, if we prefer plain text by default) |
| `${each(…)}` on an element | the repeat object (`{ each, of, key, empty }`) |
| a custom element with `ish=${Manager}` | the `{ tag, ish }` header |

**Two nice properties fall out of this:**
- **The natural way to write markup is also the fast way.** Literal attributes become ` :=` statics, which is exactly what `compile` bakes. Writing statics as ` :=` stops being something to remember.
- **Interpolation that mixes text and values maps straight onto `microJoin`,** which was designed for this.

### Would it help AI, or just humans?

**Both, I think, for the same reason.**
- **Shared failure modes.** The tree notation is positional and deeply nested (`[tag, pattern, children]`, with arrays inside arrays). The typical mistakes there, for a person or a model, are misplaced brackets, a pattern in the children slot, or children in the pattern slot. They aren't misunderstandings of the concepts. HTML-shaped templates make nesting visible and self-closing.
- **For an AI specifically:** models have seen vastly more HTML and lit-html than any project-specific array notation. So they'd produce correct templates more reliably, with less in-context documentation. The notation is learnable from a few examples, but each example costs context, and an error deep in a nested array is hard to spot in review.
- **For humans:** readability and review. A diff of a tagged template reads like a diff of markup.
- **Not a reason by itself:** "getting used to it". People and models do get used to the tree notation. It's the error rate and the review cost that the sugar improves.

**The tree notation should stay first-class.** It's JSON-able (configs from servers, Step 5's build-time route), it needs no parser, and it's CSP-friendly. Everything the tag produces is plain tree notation you can log, inspect, or write by hand.

### Is it doable? Yes, with a few design points

1. **A small parser, not the browser's.** Parsing via `<template>.innerHTML` would hit the HTML-parser fix-ups we found in Step 2: `<tbody>` insertion, `<p>` auto-closing, SVG namespaces. It also wouldn't run on a server. A restricted HTML-ish parser (elements, attributes, text, void elements, entities, comments ignored) is ~200–300 lines and pure. It must decide whitespace handling: trim between elements, like lit; keep inside text.
2. **One spec per call site, cached.** A tagged template's `strings` array is the same object for a given call site, so the tag can cache its result by it. The spec objects are then **stable across calls**, which `compile` (spec identity) and Tree's literal-skipping rebind both rely on. Interpolated values are normally constant path strings, so the result is the same. If interpolations change between calls, the tag returns a new spec, and Tree recompiles, correctly.
3. **Type safety** comes through `paths<T>()`: `${p.name}` is checked against the VM type, as the `sp` / `md` tags already do. The HTML itself isn't type-checked, as with lit without its analyzer plugin.
4. **Optional build step:** because the output is plain data, a bundler plugin could replace each tagged template with its spec at build time, with no runtime parser at all. That's a later nice-to-have, not needed to start.

### A lighter alternative, or a first step

A typed **hyperscript-style builder** needs no parser and is fully type-checked, but it's less readable than markup:

```js
el('article', { class: 'card', '.ariaLabel': p.label },
    el('h3', { class: 'title' }, p.name))
```

I'd go straight to the tagged template, since its readability is the point. But the builder could be its internal intermediate step.

### Questions for you

1. **Tagged template (lit-like) or builder?** I'd recommend the tagged template.
2. **The attribute vs. property default:** a bare `name=` maps to an **attribute** (` :=`, bakeable), with `.name=` for properties, as in lit. That's the reverse of the tree notation, where a bare key is a property. Is that OK?
3. **Mixed text:** `microJoin` (semantic, element per value) or `join` (plain text) by default?
4. **Where it lives:** `DX/tree.ts` (exported `tree`, `each`)?

## Bruce's Response I

1.  lit-like tagged template.
2.  I agree, match lit.
3.  microJoin for purposes of hydrating server rendered eventually.
4.  DX/tree.ts

Please add your implementation notes below.

## Claude's Implementation Notes

It's implemented as decided:
- a lit-like tagged template;
- a bare `name=` maps to an attribute, `.name=` to a property;
- mixed text becomes `microJoin`;
- it lives in **[`DX/tree.ts`](../../../../../DX/tree.ts)**, exported as `assign-gingerly/DX/tree.js`, with `tree` and `each`.

**Results:**
- **Tests:** 23 / 23 in Chromium, Firefox and WebKit, plus a Node-side test.
- **Full suite:** 149 passed, 4 skipped (the 2 new skips are the Node test, which runs once rather than per browser), 0 failed.
- `tsc` is clean, in the scratch copy; no `.js` touched.

### What it produces

The design example now produces exactly the hand-written notation (it's the first test):

```js
tree`<article class="card" aria-label=${p.label}>
       <h3 class="title">${p.name}</h3>
       <p>Launched ${p.date} by ${p.rocket}</p>
       <ul ${each(p.crew, { key: '?.id' })}><li>${'?.name'}</li></ul>
       <button @click=${{ call: 'launch' }}>Launch</button>
     </article>`
```

**The mapping:**
- **Attributes:**
  - literal or boolean → ` :=` (bakeable);
  - `name=${v}` → ` :=`;
  - `.prop=${v}` → property;
  - `@event=${config | 'method'}` → event binding;
  - `ish=${Manager}` → `{ tag, ish }`.
- **Repeats:** `${each(of, { key, empty })}` in attribute position → the repeat, with the single child as the item.
- **Content:**
  - one `${v}` or literal text → `textContent`;
  - mixed → `microJoin`;
  - a `{ prop, val }` segment (e.g. from `md`) → `microJoin`;
  - `` ${tree`…`} `` → a child (composition, including as a repeat's item).
- **Path proxies:** values may be `?.` strings or `paths()` proxies. I exported a small **`pathOf(value)`** from `DX/paths.ts` for that; its internals stay private.

### Design points, as planned

- **Its own small parser** (~150 lines), pure:
  - elements, quoted, unquoted and boolean attributes, void and self-closing elements, comments;
  - entities: named basics, plus decimal and hex.

  It doesn't use the browser's parser, so there are no `<tbody>` or `<p>` fix-ups. And it **runs in Node**: the spec imports the compiled module directly and renders a spec, with no DOM.
- **Whitespace:** whitespace-only text between elements is dropped, and content is trimmed where the whitespace contains a line break (indentation). Other whitespace (`${a} ${b}`) is kept.
- **Cached per call site** (by the `strings` object): the same template with the same values returns **the same spec object**, so `compile` and the literal-skip rebind keep working across calls. Values are compared by identity, by path for proxies, and one level deep for plain objects (`{ call: 'x' }`, `each(…)` results).
- **Clear errors** quote the template:
  - two roots;
  - a mismatched or unclosed tag;
  - text after a child element;
  - a mixed attribute value (`class="a ${x}"`);
  - `each(…)` with more than one child;
  - a third `@event`.

### Two limits worth knowing

1. **At most two `@event`s per element.** An element's own pattern has two self-binding keys, `' +='` and `'?. +='`. A third is an error. If you want more, we could allow an array of event configs under one ` +=` key in the core.
2. **No mixed attribute values** (`class="card ${x}"`). Use a single `${…}`, e.g. a pipe, or an array value with ` :=`, which space-joins tokens.

### Tests: [`tests/dx-tree.html`](../../../../../tests/dx-tree.html) (+ spec)

1. The design example → the exact expected notation; per-call-site caching returns the same object.
2. Rendering through `builtIns.tree` gives the **same DOM** as hand-written notation: repeat items, `empty`, and with `compile: true`.
3. `.prop`, boolean attributes, entities, void and self-closing elements, the `ish` header.
4. `@event` with a method name and a config; the two-binding limit.
5. Text: indentation, leading text plus children, `paths()` proxies with `microJoin`, `md` segments, `microJoin` rendering.
6. Composition (a `` ${tree`…`} `` as a repeat item); caching with changing values.
7. Clear errors (five cases).
8. **Node:** the module imports and works with no DOM.

### Docs

- **`docs/tree.md`:** a new section, *Authoring with `` tree`…` ``*, with an example, the mapping table and the details above.
- **`docs/paths-dx.md`:** a short `tree` section next to `sp` / `md`, and `pathOf`.

### A possible next step (not done)

- **A bundler plugin** that replaces each `` tree`…` `` with its output at build time: no runtime parser at all.
- **Using it in the demos** (e.g. `demos/tree-demo.html`), to show it next to the raw notation.

##  Bruce's Response

Can you please document this DX library in all the appropriate places?  I guess mostly docs/tree.md, but perhaps other places as well as appropriate.

Yes, please use it in the demos as well.  I plan to work on creating a vs code plugin for tree, but I will do that in a separate package.

## Claude's Implementation Notes II

Both are done.

**Results:**
- **Full suite: 149 passed, 4 skipped, 0 failed.**
- **`tests/dx-tree.html`:** grows to 27 checks.
- `tsc` is clean, in the scratch copy; no `.js` touched.

### Documentation, everywhere it belongs

- **`docs/tree.md`:**
  - the *Authoring with `` tree`…` ``* section, with the full mapping, now also listing the two extensions below;
  - a pointer to the demos.
- **`README.md`:**
  - **The `builtIns.tree` section** now mentions `tree` (with an example) and `compile`, with links.
  - **The typed-authoring section** is renamed *"Typed Path Authoring with `paths`, `sp`, `md`, and `tree`"*. It has a new `tree` subsection, with the example, its output, the key rules and a link to the full mapping, plus a table comparing the three tags.
  - **I also fixed a stale `md` example** there that still used the dead `format` field (now `text`, formatted through a pipe).
- **`docs/paths-dx.md`:** a `tree` section next to `sp` / `md`, plus the new `pathOf`.

### The demo: [`demos/tree-demo.html`](../../../../../demos/tree-demo.html) is now authored with `tree`

The whole map is written as markup. The page still shows the resulting config, which is pure JSON, now labeled as what the templates produced. Its intro and "What this demo exercises" list explain the template syntax.

**[`demos/tree-demo-with-managed-template-list.html`](../../../../../demos/tree-demo-with-managed-template-list.html) keeps the raw notation**, and the intro points to it for comparison. Shall I convert that one too?

**Two small extensions to the tag,** which the demo needed (both lit-like, tested, and documented):
1. **Pattern spread:** a plain object in attribute position is merged into the element's pattern. That's the escape hatch for keys markup can't express. The demo's status badge uses ternaries:

   ```js
   success: tree`<span ${{
       '_ ?=': ['$parent?.upcoming', 'Upcoming', ['?.', 'Success', 'Failure']],
       'className ?=': ['$parent?.upcoming', 'badge pending', ['?.', 'badge ok', 'badge bad']],
   }}></span>`
   ```
2. **"Nothing" content:** `${null}`, `${undefined}`, `${false}` or `${''}` as content renders nothing, as in lit. That's what an optional child needs. The demo's `spec(label, value, action = null)` row helper is one template with `${action}` in the middle.

**One visible change in the demo's output:** mixed text now goes through `microJoin`, as decided. So the date renders as `<span>March 14, 2026 at 3:09 PM</span> UTC`, and similarly the crew role and the failure lines. (Before, `join` produced one text string.) It looks the same.

**Checked in a browser** (Chromium):
- all ten sections render with their classes, and the layout is unchanged;
- the manager-driven badge and links state work, including the async "verifying… → ✓ verified";
- "Increase by one" (70 → 71 m), "Toggle units" (no tree rerun, same rows) and "Set details to null" (the placeholder) work;
- reruns reuse 50 of 50 elements;
- no console errors or warnings.

### The VS Code plugin

Since you're planning one: the tag's output is plain data, and it lives in one small, pure, Node-safe module (`DX/tree.ts`). So the plugin could import it to show the produced tree notation on hover, or to surface the tag's errors as diagnostics. The errors quote the template. Exporting the parser's positions (line and column) would make the diagnostics point at the exact spot; that's easy to add if you want it.

## Bruce's Response II

> Exporting the parser's positions (line and column) would make the diagnostics point at the exact spot; that's easy to add if you want it.

Yes, please


