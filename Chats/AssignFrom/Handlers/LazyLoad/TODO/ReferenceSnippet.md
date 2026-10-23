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
