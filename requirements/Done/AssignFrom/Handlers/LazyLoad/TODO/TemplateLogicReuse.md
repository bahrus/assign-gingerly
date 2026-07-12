# Template Logic Reuse

I raised this topic after successfully incorporating the reusable transition logic that you documented [here](../SupportForTransitionWithLazyLoad.md) into be-switched.


---

## Me:

> Thanks, we've made forward progress in using shared infrastructure.  I was hoping, though, to take advantage of the handlers' code that clones a template and then hides / shows it.  Can you suggest changes if needed to assign-gingerly package so that you could use that?


---

## Kiro

Now let me re-read `be-switched.js`'s `onTrue`/`onFalse` carefully to identify the exact differences:

OK, I have a thorough understanding of both implementations. Let me lay out the analysis:

---

Here's the comparison and what would need to change in `assign-gingerly` to let `be-switched` delegate its clone/show/hide logic to `LazyLoadHandler`:

## Key Differences

| Concern | `be-switched` (current) | `LazyLoadHandler` |
|---------|------------------------|-------------------|
| **Where content is inserted** | After the `<template>` element itself (`enhancedElement.after(clone)`) | Between comment markers inside a target container |
| **How cloned items are tracked** | An `idRefAttr` attribute on the template, storing space-separated IDs | Comment marker pairs (`?start name="..."` / `?end`) |
| **Visibility mechanism** | CSS class `.be-switched-hide` + optional `toggleInert`/`disabled` | `hidden` attribute (non-transitional) or CSS class (transitional) |
| **ID assignment** | Assigns IDs to cloned children (for later retrieval via `idRefAttr`) | No ID assignment — uses marker traversal |
| **Template source** | `enhancedElement.remoteContent || enhancedElement.content` | Passed in via `instantiate` param (resolved externally) |
| **Pre/post clone hooks** | Sets class on template (`be-switched-on`/`be-switched-off`), sets `.value` | `onCloneInserted()` / `onInstantiated` callback |
| **Insertion target** | Sibling of the template (not a child of a container) | Child of `lhsTarget` (appended/prepended inside it) |

## The Core Incompatibility

The biggest gap is **insertion location**. `LazyLoadHandler` inserts content *inside* a target element (between comment markers that are children of `lhsTarget`). `be-switched` inserts content *after* the template element as a sibling.

This isn't just a cosmetic difference — it affects how content is found, shown, and hidden on subsequent calls.

## Suggested Changes to `assign-gingerly`

To make `LazyLoadHandler` usable by `be-switched`, I'd suggest these changes:

### 1. Support sibling insertion mode via a `insertionMode` option

Add an `insertionMode` parameter to `resolvedParams`:

```js
// In assign() destructuring:
const { 
    if: condition, instantiate, method = 'appendChild', 
    forget = false, transitional = false, 
    hideClass = DEFAULT_HIDE_CLASS,
    insertionMode = 'child',  // NEW: 'child' (default, current behavior) or 'sibling'
    anchor = null,            // NEW: the element to insert after (for sibling mode)
} = resolvedParams;
```

When `insertionMode === 'sibling'`:
- `createMarkers` places the comment markers as siblings *after* the `anchor` element instead of inside `lhsTarget`
- `findMarkers` searches the parent of `anchor` rather than walking inside `lhsTarget`

### 2. Support custom visibility via a `changeVisibility` callback

Instead of hardcoding `node.removeAttribute('hidden')` / `node.setAttribute('hidden', '')` and `node.classList.add(hideClass)` / `node.classList.remove(hideClass)`, allow an optional callback:

```js
const {
    // ...existing params...
    onShow = null,   // NEW: (nodes: Node[]) => void
    onHide = null,   // NEW: (nodes: Node[]) => void
} = resolvedParams;
```

When provided, use these instead of the built-in visibility logic. This lets `be-switched` pass its `changeVisibility` function which handles `toggleInert`/`disabled`.

When not provided, fall back to current behavior (hidden attr or class).

### 3. Support a `getTemplate` callback (or accept DocumentFragment directly)

Currently `LazyLoadHandler` expects `instantiate` to be an `HTMLTemplateElement` or `DocumentFragment`. `be-switched` needs to pass `enhancedElement.remoteContent || enhancedElement.content`. Since `LazyLoadHandler` already accepts `DocumentFragment`, this already works — `be-switched` would just pass the fragment directly.

### 4. Expose `onCloneInserted` as a callback param (already partially done)

The existing `onInstantiated` callback covers post-clone hooks. `be-switched` needs a pre-insertion hook to assign IDs to cloned children. Add an `onBeforeInsert` callback:

```js
const {
    onBeforeInsert = null, // NEW: (nodes: Node[]) => void — called after clone, before DOM insertion
} = resolvedParams;
```

## How `be-switched` Would Use It After These Changes

```js
import { LazyLoadHandler } from 'assign-gingerly/handlers/lazyLoad.js';

// In onTrue/onFalse:
const handler = new LazyLoadHandler();
await handler.assign(enhancedElement.parentElement, {
    if: condition,
    instantiate: contentToClone,  // the DocumentFragment
    insertionMode: 'sibling',
    anchor: enhancedElement,
    transitional: transitional2,
    hideClass: 'be-switched-hide',
    onShow: (nodes) => changeVisibility(nodes, toggleInert, 'remove'),
    onHide: (nodes) => changeVisibility(nodes, toggleInert, 'add'),
    onBeforeInsert: (nodes) => {
        // Assign IDs and set idRefAttr
        const refs = [];
        let cnt = 0;
        for (const node of nodes) {
            if (node instanceof Element) {
                const id = node.id || `be-switched-${cnt++}`;
                refs.push(id);
                node.id = id;
            }
        }
        enhancedElement.setAttribute(idRefAttr, refs.join(' '));
    },
});
```

## Summary of Changes Needed in `assign-gingerly`

Here's what you'd pass to the Kiro session working on `assign-gingerly`:

1. **`insertionMode: 'sibling'` + `anchor` param** — When set, place comment markers as next-siblings after `anchor` instead of as children of `lhsTarget`. Search for markers among siblings of `anchor` rather than children of `lhsTarget`.

2. **`onShow` / `onHide` callbacks** — Optional `(nodes: Node[]) => void` callbacks that replace the built-in hidden-attr/class-toggle logic when provided.

3. **`onBeforeInsert` callback** — Optional `(nodes: Node[]) => void` called after cloning but before DOM insertion, allowing consumers to modify/annotate cloned nodes (assign IDs, add attributes, etc.).

4. **Accept `DocumentFragment` for `instantiate` without requiring `id`** — Already works, but the `getMarkerName` function falls through to `'anonymous'` for fragments. For sibling mode, the marker name could default to the `anchor` element's ID or a generated unique name.

Would you like me to write up those changes as a more detailed spec you can hand off to the `assign-gingerly` session, or is this level of detail sufficient?


---

## Me again

Before proceeding down this road, I would like to please add more typing to the resolve object used by lazyLoad.ts and lazyLoadSwitch.ts.  I see "any" where I want to see the supported structure of resolve.  Maybe we already have a way of specify the insertion point?

---

## Response — Typing First

Good instinct to type things before adding features. Let's look at what exists and what's missing.

### What Already Exists (in `types/assign-gingerly/types.d.ts`)

There's a `LazyLoadConfig` interface that types the *config object* (the thing you write in the pattern):

```ts
export interface LazyLoadConfig extends HandlerConfig {
    do: 'builtIns.lazyLoad';
    resolve: {
        if: string;
        instantiate: string;
        method?: string;
        forget?: boolean | string;
        onInstantiated?: string;
    };
}
```

This types the JSON config (pre-resolution). The `resolve` values are strings (path expressions or protocols) because they haven't been resolved yet.

### What's Missing

1. **The *resolved* params interface** — what the handler's `assign()` method actually receives after `resolveValues` processes the `resolve` map. Currently it's `Record<string, any>`. Should be:

```ts
export interface LazyLoadResolvedParams {
    /** Condition — resolved to actual boolean/truthy value */
    if: any;
    /** Template element — resolved to HTMLTemplateElement or DocumentFragment */
    instantiate: HTMLTemplateElement | DocumentFragment;
    /** Insertion method (default: 'appendChild') */
    method?: 'appendChild' | 'prepend';
    /** Remove nodes on hide instead of using hidden attribute */
    forget?: boolean;
    /** Enable view transitions */
    transitional?: boolean;
    /** CSS class for hiding (default: 'ag-hide', only used when transitional: true) */
    hideClass?: string;
    /** Callback after clone+insert */
    onInstantiated?: (ctx: LazyLoadInstantiatedContext) => void | Promise<void>;
}
```

2. **The `LazyLoadConfig.resolve` is out of date** — missing `transitional`, `hideClass` (added recently).

3. **`LazyLoadSwitchHandler` has no typed params** — it adds `lhs`, `op`, `rhs`.

4. **The handler class itself uses `any` everywhere** — `config: any`, `resolvedParams: Record<string, any>`.

### What I'd Suggest

**Step 1: Define `LazyLoadResolvedParams`** in the types file (the post-resolution shape):

```ts
export interface LazyLoadResolvedParams {
    if: any;
    instantiate: HTMLTemplateElement | DocumentFragment;
    method?: 'appendChild' | 'prepend';
    forget?: boolean;
    transitional?: boolean;
    hideClass?: string;
    onInstantiated?: (ctx: LazyLoadInstantiatedContext) => void | Promise<void>;
}
```

**Step 2: Update `LazyLoadConfig.resolve`** to include the new fields:

```ts
export interface LazyLoadConfig extends HandlerConfig {
    do: 'builtIns.lazyLoad';
    resolve: {
        if: string;
        instantiate: string;
        method?: string;
        forget?: boolean | string;
        transitional?: boolean | string;
        hideClass?: string;
        onInstantiated?: string;
    };
}
```

**Step 3: Add `LazyLoadSwitchConfig`** and `LazyLoadSwitchResolvedParams`:

```ts
export interface LazyLoadSwitchConfig extends HandlerConfig {
    do: 'builtIns.lazyLoadSwitch';
    resolve: {
        lhs: string;
        op?: '===' | '!==' | '==' | '!=' | '<' | '>' | '<=' | '>=';
        rhs: string;
        instantiate: string;
        method?: string;
        forget?: boolean | string;
        transitional?: boolean | string;
        hideClass?: string;
        onInstantiated?: string;
    };
}

export interface LazyLoadSwitchResolvedParams extends Omit<LazyLoadResolvedParams, 'if'> {
    lhs: any;
    op?: '===' | '!==' | '==' | '!=' | '<' | '>' | '<=' | '>=';
    rhs: any;
}
```

**Step 4: Update handler classes** to use the typed params:

```ts
// In lazyLoad.ts:
async assign(lhsTarget: any, resolvedParams: LazyLoadResolvedParams): Promise<void> {

// In lazyLoadSwitch.ts:
async assign(lhsTarget: any, resolvedParams: LazyLoadSwitchResolvedParams): Promise<void> {
```

### On Whether We Already Have a Way to Specify Insertion Point

Looking at the current `method` param:
- `'appendChild'` — inserts at the end of `lhsTarget` (inside it)
- `'prepend'` — inserts at the beginning of `lhsTarget` (inside it)

There's **no** existing way to say "insert as a sibling after element X." That's the new capability needed for `be-switched` reuse (`insertionMode: 'sibling'` + `anchor`).

### Recommendation

Let's do typing first (Steps 1-4), then revisit the `be-switched` reuse topic with proper types in place. The typing exercise will also reveal whether adding `insertionMode` / `anchor` / `onShow` / `onHide` to the resolved params makes the interface too heavy — or whether a subclass approach (where `be-switched` extends `LazyLoadHandler` and overrides specific methods) is cleaner.

### Questions

1. **Should I implement the typing now (Steps 1-4)?** It's non-breaking — just adds types that match existing runtime behavior.
2. **Should `LazyLoadResolvedParams` be exported from `handlers/lazyLoad.ts` directly, or only from `types.d.ts`?** I'd say both — the handler module exports it for direct consumers, the types file for ambient/declaration consumers.
