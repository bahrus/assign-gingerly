# Dynamic HTML Includes

## Bruce's Ask

From o2h-edge's [SampleStoreApp.md](../../../../../../o2h-edge/Chats/Store/SampleStoreApp.md#bruces-response---implement-in-mirror):

> I would also like to see if lazyLoad can be retrofitted to support dynamic html includes.

## What works today

`instantiate` must resolve to an `HTMLTemplateElement` or a `DocumentFragment`. When it's under **`resolve`** (rather than `get`), protocol handlers may be **async** (`resolveValues`). So a page should already be able to include HTML with its own protocol. That's from reading `resolveValues`; it hasn't been tried yet:

```js
const parse = html => Object.assign(document.createElement('template'), { innerHTML: html });
const included = new Map();   // url → Promise<HTMLTemplateElement>
const include = url => included.get(url) ?? included.set(url, fetch(url).then(r => r.text()).then(parse)).get(url);

await assignFromAsync(document.body, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        resolve: { if: '?.showTerms', instantiate: 'include://parts/terms.html' },
    },
}, { withMethods: ['querySelector'], from: vm, protocols: { include } });
```

Transitions (`transitional`), `forget`, `toggleInert` and `assign` then work as they do for any template.

## Gaps, for a real retrofit

1. **No built-in protocol.** Something like `include://` (or `html://`) would:
   - fetch;
   - parse into a `<template>` (scripts don't run);
   - cache by URL, as above;
   - resolve relative URLs against `options.baseURL`, or the document's.
2. **The URL can't come from the VM.** A reference string is a fixed key (`include://parts/terms.html`), so `include://${'?.page'}` isn't possible. Options:
   - a `src` parameter beside `instantiate`, itself a path (`src: '?.page'`), which lazyLoad fetches;
   - or allow `?.` paths in a protocol's key.
3. **Changing the URL doesn't change the content.** While `if` stays true, lazyLoad keeps what's between its markers, and the marker name comes from the template's id. For includes:
   - the marker would be named by the region (`markerName`), not the URL;
   - the URL last included would be kept (e.g. `data-ag-src` on the start marker);
   - a different URL would replace the content: inside a transition, when `transitional`.

   That is "dynamic".
4. **Loading and failure.** `placeholder` already covers "loading". A failed fetch needs a story: keep the old content, insert a fallback snippet, or throw, so `onRender`-like reporting sees it.
5. **Trust.** Included HTML is inserted as markup. It should be same-origin by default, with other origins opted into. Since a template's scripts don't run, the main risk is markup, such as `on*` attributes, which a template doesn't neutralize. That's worth deciding explicitly; the Sanitizer API (`setHTML`) is an option where it exists.
6. **Retaining.** With 3, a `retain` mode could keep each URL's nodes, hidden, rather than replacing them. That's the same need as navigate-gingerly's [RetainRealizedRoutes.md](../../../../../../navigate-gingerly/Chats/TODO/RetainRealizedRoutes.md).

## Relation to routing

mirror's pages come from the worker as fragments with an embedded VM, and need **hydration** with the route's config, not just insertion. An include region could serve routing if, after inserting, it calls a hook to hydrate (`onInstantiated` already exists, though not on the synchronous transitional path). Even so, mirror would still own:
- matching the route;
- installing the app;
- intercepting navigations.

So lazyLoad would be a building block mirror uses, not a replacement for it.
