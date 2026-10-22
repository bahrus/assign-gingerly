# Inner Templates

## Bruce's Ask

Related to the [rebinding discussion](../Queries/HowDoesRebindingWork.md)...

Here's what I propose:  We should pass these blobs into the third parameter.  The third parameter is much more likely to contain JavaScript objects.  We could support up to three formats:  string, reduced tree, templates.  Let's start with strings:

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JS
const vm = {
    ...
};

assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            rocket: ['article', {...}, [
                { inner: 'myBlob' }
            ]],
        }
    }
}, { 
    from: vm,
    innerTemplates: {
        myBlob: String.raw `<div>...</div>`
    } 
});
```

I agree this would need to pass through security checks, etc.  

It should definitely be "compiled" to a template if the compile flag is set.

Can you see any advantages of also supporting a subset of tree syntax, instead of a string?  Are the advantages strong enough that strings shouldn't be supported?  Or or the advantages so little, that we should skip over even adding support for a tree like alternative?

Let me know your thoughts below.  I'm totally open to suggestions for improvements, starting with the names I chose.


## Claude's Thoughts

### The proposal: blobs in the options, named in the config

**I like it, more than the `{ html: '…' }` I floated.** It follows the pattern pipes already use (the config names them, the options supply them), and it has real advantages:
- **The config stays JSON-friendly:** only a name appears in it.
- **The blob comes from code, never from data.** The options are what the page's script passes. A config could be loaded as JSON from somewhere, and the data (`from`) comes from an API. Neither can smuggle markup in. That is the most important security property, and the design gets it for free.
- **Sharing:** one blob, used by many specs and trees. Nested trees and repeat items see it too, since options are carried down.
- **o2h takes the same option,** so server and client render the same blob from the same source.

### Strings vs a "reduced tree" vs templates

**Strings first, and I wouldn't add a separate tree-like blob format.**

What a tree-like format would give:
- **Structure without parsing:** checks (`on*` attributes, `<script>`) without an HTML parser, which matters on the server, where o2h has none. But the blob is author content from code, and o2h's output is trusted anyway. On the client, the check happens once per string, after parsing (below).
- **The element count and tags known up front,** for `adopt`. The client gets those from the parsed string anyway.
- **A path to dynamic bits later.** But a tree spec with dynamic bits is just an ordinary spec, which Tree already has.

What it would cost or miss:
- **SVG.** Tree notation would need SVG namespace support, which Tree doesn't have yet. A string parsed by the browser gets the namespaces right for free. Your first example is exactly the case strings handle and a tree format doesn't.
- **Pasting:** markup from a designer, an icon library or a CMS is already a string.
- **A second notation** for something the main notation already expresses.

**So the "tree" variant is better served differently:** by the **automatic static detection** from the rebinding thread. Then an ordinary spec (or `tree`…`` markup) with nothing dynamic in a subtree gets the same treatment as a blob: one record, cloned from a template, never revisited. Authors write ordinary specs, and nothing new needs learning.

**Templates (`HTMLTemplateElement`) as a second format:** cheap to add on the client, since a string becomes a template internally anyway, so a template just skips the parse. Useful for blobs already in the page (`document.querySelector('#logo')`). But o2h can't use them (no DOM), so on the server a template-only blob can't render. I'd add it later, client-only, documented as such.

### How it would work

**The spec:** `{ inner: 'myBlob' }` anywhere an element spec goes (a map value, a static child, a repeat's `each` or `empty`, a switch case).

**On the client**, per blob string, once (cached by string and permission processor):
1. **Parse** into a `<template>`. Its content is inert: no scripts run, no images load.
2. **Check:** walk the content and refuse `<script>`, `on*` attributes and `javascript:` URLs. With a permission processor, run each attribute through it, as `compile`'s `canBake` does. A refused blob throws, naming the blob.
3. **Clone** per instance (`importNode`, so custom elements in it upgrade).

**The record:** one record for the whole blob, holding its root nodes. Later runs skip it entirely (a static spec can't change).

**Several roots are fine:** since the client has the parsed template, it knows how many root elements the blob has. Placement handles a list of nodes, and `adopt` takes that many slots, checking their tags without descending. Top-level text in a blob is kept but isn't a slot.

**`adopt`:** the walk checks the roots' tags, records them, and moves on. There's no binding, ever.

**`compile`:** a blob is already "compiled" (parsed once, cloned). With `compile`, a blob among an element's static children could also be **baked into the parent's template**, so one clone produces both. Without `compile`, it's cloned on its own.

**o2h:** writes the string as is, at that position. It can't count roots or check the markup without a parser, but the blob is trusted author content.

**A missing name** throws on first render, naming the blob, the same way a pipe or manager that's missing is reported.

**`tree`…``:** a helper in child position, like `each` / `choose`:

```js
tree`<article class="card">${inner('myBlob')}<h3>${'?.title'}</h3></article>`
```

### Names

**Your names work.** A few thoughts, in case one fits better:

- **`inner` / `innerTemplates`:** "inner" suggests the content *of* something (like `innerHTML`). But `{ inner: 'myBlob' }` *is* the element(s), placed as a sibling among the others. And "templates" is already used by `compile` (`CompiledTree.templates`), so the two could blur in the docs.
- **`snippet` / `snippets`:** reads naturally (`{ snippet: 'logo' }`), and it's a familiar word for a reusable piece of markup (Svelte 5 uses it, though its snippets take parameters).
- **`blob` / `blobs`:** honest, but "Blob" is a web API (binary data).
- **`partial` / `partials`:** the server-templating term (Handlebars, Rails) for a named, reusable piece of markup. Familiar to people coming from server rendering, which is where o2h lives.

**My preference is `snippet` / `snippets`, then `partial` / `partials`.** But it's your call, and nothing else depends on it.

### Proposal

1. **Strings, in builtIns.tree and o2h:**
   - the spec form, the option, and the parse-check-clone cache;
   - one record (several roots allowed), skipped on reruns;
   - `adopt` support, and baking into the parent's template under `compile`;
   - the `tree`…`` helper.
2. **Tests,** including an SVG blob, and `adopt` of a blob that o2h rendered.
3. **Later:**
   - automatic static detection, which turns static subtrees of ordinary specs into the same thing;
   - template elements as a client-only second format.

### Questions

1. **The names:** `inner` / `innerTemplates`, `snippet` / `snippets`, `partial` / `partials`, or another?
2. **Several root elements per blob:** allow them from the start (as above)?
3. **A refused blob** (a `<script>`, or an `on*` attribute): throw, or drop the offending parts and warn?

## Bruce's Response I

> 2. **Several root elements per blob:** allow them from the start (as above)?

Yes, please

> 3. **A refused blob** (a `<script>`, or an `on*` attribute): throw, or drop the offending parts and warn?

> 1. **The names:** `inner` / `innerTemplates`, `snippet` / `snippets`, `partial` / `partials`, or another?

The reason I was thinking inner, is that I want to also support a "donut hole" option, where a blob of HTML is provided, with a slot (or potentially more than one) inside where the tree processing continues.  That requirement is still vague, and needs to be fleshed out, but how would you propose working this?  Maybe it could work something like:

```JS
assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            rocket: ['article', {...}, [
                { snippet: 'myBlob', type: 'blob' /*blob is default, vs donut? swissCheese? */ }
            ]],
        }
    }
}, { 
    from: vm,
    snippets: {
        myBlob: String.raw `<div>...</div>`
    } 
});
```

Any other suggestions?


## Claude's Thoughts II

**Several roots:** noted, yes.

**A refused blob:** you left this one open, so I'd go with **throw**, naming the blob and what was refused. A blob is author content from code, so a `<script>` or `onclick` in it is a mistake to fix, not a case to handle quietly. Dropping parts would render something other than what was written, and the warning is easy to miss. I'll assume that unless you say otherwise.

### Donut holes: a proposal

**No `type` needed.** The presence of holes makes it a donut:

```js
assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            rocket: ['article', {}, [
                { snippet: 'card', holes: {
                    title: '?.name',                                      // text shorthand, as in tuples
                    specs: [{ className: '?.status' }, {                  // pattern for the hole element, then its children
                        each: ['li', '?.'], of: '?.specs',
                    }],
                } },
            ]],
        },
    },
}, {
    from: vm,
    snippets: {
        card: String.raw`
            <header class="card-head">
                <svg class="icon" viewBox="0 0 24 24"><path d="…"/></svg>
                <h3 data-hole="title"></h3>
            </header>
            <ul data-hole="specs"></ul>
            <footer>Data courtesy of the Example API</footer>`,
    },
});
```

#### How holes are marked: an attribute on an empty element

**`<ul data-hole="specs"></ul>` marks an element in the blob as a hole.** I'd use that rather than `<slot>` or a comment, for these reasons:
- **The hole is a real element,** so a hole can bind the element's own **attributes and properties** (`className` above), not just fill its content. That covers "a static blob with a few dynamic bits" in general, not only "insert here".
- **`<slot>`** already has meaning in shadow DOM. A blob used inside a shadow root's template would be ambiguous.
- **A comment** can't carry attributes, and it's awkward to write.
- **Holes are empty in the blob,** and Tree owns their contents. This rule is what lets o2h fill them without a full HTML parser (below).

`data-hole` is removed from the template once its position is known, so the DOM matches between server and client, and nothing stray is left behind.

#### What a hole's value is

**The same shape as an element spec's tuple, minus the header,** because the blob supplies the element:

| Hole value | Meaning |
|---|---|
| `'?.name'` | Text: `{ textContent: '?.name' }` (the same shorthand as tuples) |
| `{ className: '?.status' }` | A pattern for the hole element |
| `[pattern, children]` | A pattern, then children: an array of specs, a repeat `{ each, … }`, or a nested tree `{ map, … }` |

**Everything inside a hole is ordinary Tree:** repeats, switches, managers, and other snippets, with or without their own holes. Holes resolve against the same value as the snippet's position, as static children do.

#### Records and runs

- **Once per blob string:** parse it, check it, find the holes, and record each one's **path** (child indices from the template's root nodes). Then remove the `data-hole` attributes.
- **Per instance:** clone, then find each hole by its path. That's a few `children[i]` steps, not a query. Each hole gets a normal record, as if Tree had created that element.
- **Later runs** skip the blob and visit only its holes. A blob without holes is never visited again.
- **`adopt`:** checks the roots' tags, finds the holes by the same paths in the server's markup, and walks each hole's contents as usual.

#### o2h

**o2h has no HTML parser**, but because holes are empty elements with a known attribute, it only needs a small tokenizer for **well-formed author markup**. It finds the start tag carrying `data-hole="name"`, rewrites its attributes (dropping `data-hole`, adding the hole's bound attributes), and writes the hole's contents right after the start tag.

That tokenizer understands tags, quoted attributes and comments, not the full HTML parsing rules. It can demand well-formedness: quoted attribute values, explicit end tags for holes, and no holes inside `<template>`, `<script>` or `<style>`. I'd write it as a pure function in assign-gingerly (e.g. `snippetParts(html)` in `treeSpec.ts`), so Tree and o2h agree on what the holes are.

**Or skip parsing altogether,** by authoring donuts with a tag function that marks holes at definition time:

```js
card: snippet`<header><h3 ${hole('title')}></h3></header><ul ${hole('specs')}></ul>`
```

That's nicer for o2h, but it's one more thing to learn, and plain strings with `data-hole` can be pasted from anywhere. I'd start with the attribute, and add the tag function only if the tokenizer turns out to be fragile.

### Names, with holes in mind

- **`snippet` / `snippets`** for the blob, **`holes`** for the donut's dynamic parts, **`data-hole`** in the markup. "A snippet with holes" reads well and covers both cases, without a `type`.
- **If you'd rather keep "inner":** `{ inner: 'card', holes: {…} }` with `innerTemplates` works the same.

### Proposal

**Do it in two steps.**

1. **Plain snippets:**
   - strings in the `snippets` option;
   - parsed once, checked (a refusal throws), cloned;
   - several roots allowed;
   - one record, skipped on reruns;
   - `adopt` support, and baking into the parent's template under `compile`;
   - o2h writes the string;
   - the `tree`…`` helper.
2. **Holes:**
   - `data-hole` with path recording;
   - per-hole records (pattern and children);
   - `adopt` through the holes;
   - the shared tokenizer, so o2h can fill them.

Step 1 doesn't depend on any of step 2's open questions, so it can start now.

### Questions

1. **Names:** `snippet` / `snippets` / `holes` / `data-hole`?
2. **A hole's value** as the header-less tuple (text, pattern, or `[pattern, children]`)?
3. **Go ahead with step 1** while the hole details settle?

## Bruce's Response II

On drop vs throw, let's go with your recommendation -- throw.

Let's only do simple plain snippet/snippets, but where it makes sense to "prep" for holes, do so.  I want to think further about what you are proposing, but it is looking quite promising.  Go ahead and start another todo item for step 2 (holes).

Please add your implementation notes below.
