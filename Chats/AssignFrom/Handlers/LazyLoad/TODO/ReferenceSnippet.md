# Reference Snippet

## Bruce's Ask

Currently, the lazy load handler needs a template passed into instantiate, as shown below:

```JS
await assignFromAsync(document.body, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        get: {
            if: '?.isVisible',
            instantiate: 'globalThis://myTemplate',
        }
    }
}, { 
    withMethods: ['querySelector'], 
    from: myVM, 
    protocols: { globalThis: k => globalThis[k] } }
);
```

Now that we have snippets that get turned into templates, can we now alternatively do:

```JS
await assignFromAsync(document.body, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        get: {
            if: '?.isVisible',
            instantiate: 'snippets://myTemplate'
        },
        
    }
}, { 
    withMethods: ['querySelector'], 
    from: myVM, 
    snippets: {
        myTemplate: String.raw `<div>...</div>`
    }
);
```

... or maybe:

```JS
await assignFromAsync(document.body, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        get: {
            if: '?.isVisible',
        },
        snippet: 'myTemplate'
        
    }
}, { 
    withMethods: ['querySelector'], 
    from: myVM, 
    snippets: {
        myTemplate: String.raw `<div>...</div>`
    }
);
```

This would also be nice to have for the ManageTemplateList handler (and maybe others now or in the future?) so I'm hoping this sets the trend in a flexible way.

Please suggest how you would do define this.


## Claude's Suggestion

**Your first form, a `snippets://` protocol, is the one I'd define.** It's what sets the trend you're after:
- **Every handler gets it without changes,** because handlers don't resolve their template parameters themselves. `instantiate` in lazyLoad, manageTemplateList and lazyLoadSwitch is resolved from `get` / `resolve` the same way as any other value: through `options.protocols`, as `globalThis://myTemplate` is today.
- **So any parameter that accepts a template accepts a snippet,** today's handlers and future ones alike, with nothing to add per handler.

The second form (a `snippet:` key next to `get`) would have to be added to each handler separately, and documented separately. It also couldn't be used anywhere a template is expected but isn't a top-level config key, such as each `lazyLoadSwitch` case's `instantiate`.

```JS
await assignFromAsync(document.body, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        get: {
            if: '?.isVisible',
            instantiate: 'snippets://myTemplate',
        },
    },
}, {
    withMethods: ['querySelector'],
    from: myVM,
    snippets: {
        myTemplate: String.raw`<div>...</div>`,
    },
});
```

### What `snippets://name` resolves to

**The snippet's parsed `<template>`:** the same one builtIns.tree clones, from the same cache (per string and permission processor). That means:
- **checked the same way:** no `<script>`, no `on*` attributes, no `javascript:` URLs, and the permission profile; a refused snippet throws, naming it;
- **parsed once** per string, however many handlers use it;
- **SVG and MathML** get their namespaces, since the browser parses it;
- **several root elements** are fine. lazyLoad and manageTemplateList already clone a template's whole `content`. manageTemplateList's multi-element mode (`configs`) maps onto them.

The handlers clone the template's content (they already do), and must never modify the template itself, since it's shared. They don't today.

**Holes don't apply here:** filling them is a Tree concept. A snippet with `data-hole` elements still works, with the holes left as written (fallback content) and the attribute removed. If lazyLoad or manageTemplateList later want to bind inside the cloned content, they already have their own mechanisms for that (lazyLoad's assign step, manageTemplateList's `fromEachItem`).

### Details

- **A built-in protocol.** It works as soon as `snippets` is in the options, with nothing to register. If `options.protocols` defines its own `snippets`, that one wins, as for any protocol name.
- **The protocol name, `snippets://`:** it reads as "from the `snippets` option", as `globalThis://` reads as "from `globalThis`". The singular `snippet://` would match the tree spec's key (`{ snippet: 'name' }`). I'd go with the plural, since it names where the snippet comes from.
- **Marker names:** lazyLoad and manageTemplateList name their comment markers after the template's `id`, and a snippet's template has none. So a snippet's template should default to the **snippet's name** (`<!--?start name="myTemplate"-->`), as `globalThis://myTemplate` gets its name from `<template id="myTemplate">`. That needs a small lookup from template to name in `snippets.ts`, which both handlers' `getMarkerName` would consult.
- **Synchronous:** parsing is synchronous, so it works wherever synchronous protocols do, ` =&` included.
- **Where it plugs in:** protocol handlers only receive the key, but this one needs the options (`snippets`, and the permission processor). So the options should get it where `assignFrom` sets them up, rather than inside `resolve/getValues.ts`, which stays pure and DOM-free: when `options.snippets` is present and `options.protocols` has no `snippets`, `assignFrom` adds a `snippets` handler bound to those options. Handlers then receive it with the rest of the options, as nested trees and handlers already receive `pipes` and `protocols`.
- **o2h:** nothing to do. These handlers only run on the client.

### Questions

1. **`snippets://`** as the name (or `snippet://`)?
2. **Built in** when `snippets` is in the options (as above), or an explicit helper to register, e.g. `protocols: { snippets: snippetTemplates(snippets) }`? Built in is less boilerplate; explicit is more visible.
3. **Marker names** defaulting to the snippet's name?
4. **Should I implement it,** with tests for lazyLoad, lazyLoadSwitch and manageTemplateList?

## Bruce's Response I

1. **`snippets://`** as the name (or `snippet://`)?

That's a tough one.  I think snippets.

2. **Built in** when `snippets`

Yes, built in, no explicit protocol should be required.

3. **Marker names** defaulting to the snippet's name?

Yes, I think we should document that an effort should be made to make it somewhat unique.

4. **Should I implement it,** with tests for lazyLoad, lazyLoadSwitch and manageTemplateList?

Yes, please.


## Claude's Implementation Notes

`snippets://name` is built in, as agreed. It works whenever `snippets` is in the options, and markers are named after the snippet.

### Code

| Where | What |
|---|---|
| **`handlers/snippets.ts`** | `withSnippetProtocol(options, permissionProcessor)`: when the options have `snippets` and no `snippets` protocol of their own, it returns them with a built-in one added. `snippets://name` resolves to the snippet's parsed, checked `<template>`, from the same cache builtIns.tree uses. It's synchronous. `snippetNameOf(template)` gives back the name a template was resolved under, for marker names. |
| **`assignFrom.ts`, `assignFromAsync.ts`** | Call `withSnippetProtocol` first, so every handler (and nested call) gets the protocol through its options. Nothing is added to the pure `resolve/getValues.ts`. |
| **`handlers/lazyLoad.ts`** (so `lazyLoadSwitch` too) **and `handlers/manageTemplateList.ts`** | `getMarkerName`: a template's `id`, then its snippet name, then the old fallback. |
| **Docs** | The README's lazyLoad section has a "Templates from snippets" block, with the uniqueness advice you asked for. Plus the `instantiate` row, a line in tree.md's Snippets section, the manage-template-list.md config comment, and the `snippets` option's doc comment in the types (submodule). |

**The built-in protocol remembers the snippets it was made for.** A nested call with the same options keeps it. A call with different `snippets` (or another permission processor) gets its own. A page's own `options.protocols.snippets` always wins.

**Other `://` strings are unaffected:** a literal `https://…` was already treated as a possible protocol reference, and it resolves to itself when no protocol matches. The test checks that.

### One build issue to know about

**`handlers/lazyLoad.ts` wasn't being compiled.** It isn't in tsconfig's `include`, and nothing imports it statically, because it's loaded by path when a config names it. So `handlers/lazyLoad.js` was stale, last built on October 3, and neither `tsc -p .` nor your watcher would have picked up this change.

**I added `handlers/lazyLoad.ts` to `include`.** Compiling it reproduces the committed `lazyLoad.js` exactly, apart from this change. So nothing else in it had drifted.

**`handlers/lazyLoadSwitch.ts` has an existing type error,** which is why I didn't add it as well. Its `assign` takes `LazyLoadSwitchResolvedParams` where the base class takes `LazyLoadResolvedParams`. Its `.js` doesn't need rebuilding for this change, since it imports `./lazyLoad.js`. But it is in the same "not compiled" state, so say if you'd like me to fix the type and include it too.

**Other handlers might be in the same situation:** loaded by path, and not in `include`. manageTemplateList is compiled, because something imports it.

### Tests

**`tests/snippet-protocol.html` / `.spec.ts`,** with 17 cases:
- **lazyLoad:** a snippet with two roots, markers named after it, SVG in its namespace, and separate copies per instance with the shared template left intact;
- **lazyLoadSwitch:** one snippet per case, switching between them, and per-case marker names. Before the naming change, the two cases shared "anonymous" markers, and the second case hid the first;
- **manageTemplateList:** a snippet per item, and the marker name;
- **refusals:** a refused or missing snippet throws, naming it;
- **precedence and literals:** a page's own protocol wins, and other `://` literals stay literal;
- **reuse:** the protocol is reused with the same options, and replaced for other snippets.

**Full suite** (scratch copy, three browsers): 172 passed and 8 skipped.

### For you

- **New files:** `tests/snippet-protocol.html` and `tests/snippet-protocol.spec.ts`.
- **`tsconfig.json` changed:** it now includes `handlers/lazyLoad.ts`, so your watcher rebuilds `lazyLoad.js`.
- **The types submodule** needs its own commit.
