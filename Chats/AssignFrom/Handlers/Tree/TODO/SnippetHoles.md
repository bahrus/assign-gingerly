# Snippet holes ("donut holes")

*Step 2 of [InnerTemplates.md](./InnerTemplates.md). Step 1, plain snippets, is done: see [docs/tree.md, Snippets](../../../../../docs/tree.md#snippets-static-html).*

## The idea

A snippet with **holes**: static HTML in which some elements are dynamic. Tree processing continues inside them, and they can also have their own attributes bound. "A snippet with holes" covers both "static wrapper, dynamic inside" and "static markup with a few dynamic bits".

```js
{ snippet: 'card', holes: {
    title: '?.name',                                   // text shorthand, as in tuples
    specs: [{ className: '?.status' }, {               // a pattern for the hole element, then its children
        each: ['li', '?.'], of: '?.specs',
    }],
} }
```

```js
snippets: {
    card: String.raw`
        <header class="card-head">
            <svg class="icon" viewBox="0 0 24 24"><path d="…"/></svg>
            <h3 data-hole="title"></h3>
        </header>
        <ul data-hole="specs"></ul>
        <footer>Data courtesy of the Example API</footer>`,
}
```

There's no `type`: having `holes` makes it a donut.

## The design so far (from InnerTemplates.md, Claude's Thoughts II)

- **Marking:** an **empty element with `data-hole="name"`**.
  - It's a real element, so a hole can bind the element's own attributes and properties.
  - Not `<slot>`, which has shadow DOM meaning.
  - Not a comment, which can't carry attributes.
  - Holes are empty in the snippet: Tree owns their contents.
- **A hole's value:** the element tuple **without the header**, since the snippet supplies the element: text (`'?.name'`), a pattern, or `[pattern, children]`. The children can be static children, a repeat or a nested tree. Everything inside is ordinary Tree, including other snippets. Holes resolve against the same value as the snippet's position.
- **Once per snippet string:** record each hole's **path** (child indices from the root nodes), then remove the `data-hole` attributes from the template.
- **Per instance:** find each hole by its path, and give each hole a normal record. Later runs visit only the holes.
- **`adopt`:** match the roots (as plain snippets do), find the holes by the same paths, and walk each hole's contents as usual.
- **o2h:** fill the holes without a full HTML parser, using a small **tokenizer for well-formed author markup** (tags, quoted attributes, comments). It finds the start tag carrying `data-hole`, rewrites its attributes, and writes the contents after it. It would be a pure function shared from assign-gingerly (e.g. `snippetParts(html)` in `treeSpec.ts`), so Tree and o2h agree on where the holes are.
  - **Fallback if the tokenizer proves fragile:** a tag function that marks holes at definition time: ``snippet`<h3 ${hole('title')}></h3>` ``.

## Already in place from step 1

- **`ParsedSnippet`** (`handlers/snippets.ts`) is computed once per string: the place to record hole paths (there's a comment where they'd go).
- **`snippetSource`** (`treeSpec.ts`) is the shared, trimmed source for Tree and o2h, where `snippetParts` would sit next to it.
- **Snippet instances are records** (`SnippetState` in `handlers/tree.ts`) holding their nodes. Holes would add child records, and `syncNode` would visit only those instead of returning early.
- **Adoption uses a slot cursor,** so a snippet takes as many slots as it has roots. Holes would then walk inside the adopted roots.

## Open questions

1. **Names:** `holes` and `data-hole`?
2. **A hole's value:** the header-less tuple?
3. **Must a hole be empty** in the snippet, or may it hold fallback content that Tree replaces?
4. **Holes inside a snippet's nested `<template>`:** support them, or refuse them (simpler)?
5. **Tokenizer vs tag function** for o2h: start with the tokenizer?
6. **A spec with `holes` whose snippet has a hole the spec doesn't fill** (or the reverse): throw, or leave the hole empty?

## Bruce's Response I

> 1. **Names:** `holes` and `data-hole`?

That works

> 2. **A hole's value:** the header-less tuple?

> 3. **Must a hole be empty** in the snippet, or may it hold fallback content that Tree replaces?

We definitely want to support fallback content that Tree replaces

> 4. **Holes inside a snippet's nested `<template>`:** support them, or refuse them (simpler)?

I could see this scenario coming up.  Can we make this a potential TODO, that depends on a strong use case, or will not supporting it now fence us in in anyway?

> 5. **Tokenizer vs tag function** for o2h: start with the tokenizer?

Start with the tokenizer.

> 6. **A spec with `holes` whose snippet has a hole the spec doesn't fill** (or the reverse): throw, or leave the hole empty?

Definitely not throw.  If/when we support any debugging or tracing support, this would be something to log.  For now, leave it untouched, including fallback.  TODO item, park for now?

If this is all consistent and makes sense to you, please proceed with implementation and add notes below.  Otherwise, feel free to pause for another round of clarifications.


## Claude's Implementation Notes

**All consistent, so holes are implemented** as agreed: `holes` / `data-hole`, fallback content, the tokenizer for o2h, and no throw for unfilled or unknown holes.

**Q2 (a hole's value) was left open,** so I used the proposal: the element tuple **without its header**. That's text, a pattern, `[pattern]`, or `[pattern, children]`.

### On Q4: does refusing holes in a nested `<template>` fence us in?

**No.** A hole inside a nested `<template>` **throws** now ("isn't supported (yet)"), so no snippet relying on it can exist today. Supporting it later only turns an error into a feature.

**What would fence us in** is the alternative: quietly ignoring such a hole, leaving `data-hole` in the markup. Then supporting it later would change what existing snippets render.

The same reasoning applies to the two other refusals: a hole inside another hole, and duplicate names. They're parked below.

### Behavior

- **Filling:**
  - **Content** (text, or children: static, a repeat or a nested tree) replaces a hole's fallback.
  - **A pattern alone** binds the hole element and keeps its fallback.
  - **A hole the spec doesn't name** is left exactly as written, fallback included.
  - **A name the snippet doesn't have** is ignored.
- **Later runs** visit only the filled holes, each an ordinary record around its hole element. If the set of filled holes changes, or a hole's structure does, the instance is replaced, so a hole no longer filled gets its fallback back.
- **Removal:** `data-hole` is removed from the DOM, on the client and in o2h's output.
- **Everywhere snippets work, holes work:**
  - map values, static children, a repeat's `each`, switch cases;
  - `compile`: a snippet among static children has its holes filled when the clone is bound;
  - `adopt`: holes are found by path in the server's markup, checked against the template's hole tags, and adopted like any element.

### Code

| Where | What |
|---|---|
| **`handlers/snippets.ts`** | `ParsedSnippet.holes`: each hole's path, found once per string, with `data-hole` then removed from the template. `holeAt(roots, path)`. The refusals: a hole in a hole, duplicates, and holes in a nested `<template>`. |
| **`handlers/tree.ts`** | `fillHoles`, `sameHoles`, `syncHoles`; `holeSpecOf` builds the hole's element spec from the hole's tag and value. `createNode`'s filling step is split out (`fillNode`), so a hole (an existing element) is filled exactly like a created one. The structure check is shared (`sameStructure`). `adoptNode` adopts holes, and accepts SVG's camelCase tags. |
| **`handlers/treeSpec.ts`** | `snippetParts(html)`: the DOM-free tokenizer. It splits a snippet at its holes (tag, decoded attributes, open tag without `data-hole`, fallback, close tag), skipping comments and raw text, and refuses what the client refuses. It needs **well-formed** hole markup: explicit end tags inside holes, and `/>` only on void elements or in SVG / MathML. A mismatched end tag throws, naming the hole. |
| **`DX/tree.ts`** | `snippet(name, holes?)`. |
| **Types** (submodule) | `SnippetSpecification.holes`, `HoleSpecification`. |
| **o2h `o2h.ts`** | Splits the snippet with `snippetParts` (cached per string). A filled hole goes through `renderSpec`, starting from the hole's own attributes and fallback; an unfilled one is written back without `data-hole`. |
| **Docs** | tree.md, "Holes: dynamic parts inside a snippet" (and the `Snippet` / `Hole` types); o2h's README `snippets` row. |

### Tests

- **assign-gingerly** (scratch copy, three browsers): 169 passed and 8 skipped.
  - **`tree-snippets.html`** grew to 58 cases. The new ones cover:
    - text, repeat and pattern-only holes, and fallback kept or replaced;
    - reruns keeping hole elements and leaving static parts alone;
    - a hole no longer filled showing its fallback again;
    - holes in a repeat's items, moving by key;
    - static children in a hole, via `tree`…`` `snippet(name, holes)`;
    - the three refusals;
    - `compile` giving the same DOM;
    - `adopt` reusing every element, then rebinding the holes.
  - **`pure-modules.spec.ts`:** a Node-side test of `snippetParts`. It covers entities, comments, `<style>`, unquoted attributes, void holes, and nested lists in a fallback. Written back unfilled, the parts equal the source without `data-hole`. It also checks every refusal.
- **o2h, browser tests** (workspace mode): 9 passed. **`tests/snippet-holes.html`** checks, in all three browsers, that o2h's rendering of holes is **the same DOM** builtIns.tree builds, and that Tree adopts it (every element reused) and rebinds the holes. It covers text, repeat, pattern-only and static-children holes, an unfilled hole, an attribute with `&amp;`, SVG, and holes in repeat items.
- **o2h, Node tests:** 4 passed, in the scratch copy linked to the new build. As before, o2h's own `node_modules` needs the new assign-gingerly first.

### Parked (TODO, as you suggested)

1. **Log unfilled holes and unknown hole names** once there's a debugging or tracing facility. For now they're silent, by design.
2. **Holes inside a nested `<template>`,** if a strong use case comes up. It's refused now, so adding it later is safe (see above).
3. **A hole inside another hole** (in its fallback), on the same terms.
4. **SVG children inside holes:** a hole can be an SVG element, and text and attributes work. But elements Tree creates inside it are HTML elements, so this waits on SVG namespace support in Tree's `createElement`. That's worth its own TODO; say if you'd like me to file it.
