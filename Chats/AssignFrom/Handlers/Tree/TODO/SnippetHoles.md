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
