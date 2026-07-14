# Reusable Conditional Display Utils

Let me remind you of the conversation I had in the be-switch enhancement:

I raised this topic after successfully incorporating the reusable transition logic that you documented [here](../SupportForTransitionWithLazyLoad.md) into [be-switched](https://github.com/bahrus/be-switched).


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

I think one insertionMode we should support is 'after' which uses the relatively new after() method than can append a documentfragment after the target element.

I guess I prefer 'after' over 'sibling', as it is more specific.

I also think I would rather we take a close look at features that be-switched supports, and see if it makes sense to support directly in the handler, like setting inert and/or disabled, rather than so many callbacks.

I also want to make be-switched use markers rather than id's, like this package does.  Again fewer callbacks needed.

We do need to decide how to name the markers.

---

---

## Response

### On `insertionMode: 'after'`

Good — `'after'` is more specific than `'sibling'` and aligns with the DOM API name (`element.after(...)`). The modes would be:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `'child'` (default) | `target.appendChild(markers)` / `target.prepend(markers)` | Normal lazyLoad — content inside a container |
| `'after'` | `anchor.after(startMarker, ...content, endMarker)` | be-switched — content after a template element |

For the `'after'` mode, the `lhsTarget` (or a new `anchor` param) is the element to insert *after*. Markers and content become siblings following the anchor.

For `findMarkers` in `'after'` mode, we'd search the parent's children (siblings of the anchor) rather than walking the subtree of a container. This is where `markerUtils` comes in — we can add a sibling-searching variant.

### On Reducing Callbacks — Supporting Features Directly

I agree. Rather than generic `onShow`/`onHide`/`onBeforeInsert` callbacks, let's look at what `be-switched` actually does and support those as first-class options:

**What `be-switched` does that lazyLoad doesn't:**

1. **`toggleInert`** — when hiding, sets `disabled = true` on form-associated elements (not just visual hiding). When showing, sets `disabled = false`.

2. **Setting a CSS class** — already supported via `transitional: true` + `hideClass`. ✓

3. **ID assignment to cloned nodes** — but you said you want to move to markers instead. So this goes away. ✓

4. **Setting `.value` on the template element** — sets `enhancedElement.value = true/false` to reflect state. This is enhancement-specific and probably doesn't belong in the generic handler.

So the only real addition needed is:

```ts
interface LazyLoadResolvedParams {
    // ...existing...
    toggleInert?: boolean;  // NEW: disable/enable form elements on hide/show
}
```

When `toggleInert: true` and hiding:
- For each node between markers, if it has a `disabled` property, set `disabled = true`

When showing:
- Set `disabled = false`

This eliminates the need for `onShow`/`onHide` callbacks for `be-switched`'s use case.

### On Switching `be-switched` to Markers

If `be-switched` uses comment markers instead of ID tracking:
- No need for `onBeforeInsert` callback (ID assignment goes away)
- Finding content uses `getNodesBetweenMarkers` from `markerUtils` — same as lazyLoad
- The marker pair lives as siblings after the template element

This simplifies the integration significantly — `be-switched` just calls the handler with `insertionMode: 'after'` and gets markers-based tracking for free.

### On Marker Naming

In `'child'` mode, the marker name comes from the template's `id` (via `getMarkerName`). For `'after'` mode:

**Options:**
1. **Use the anchor element's `id`** — `<!--?start name="myTemplateId"-->`. Works when the template has an ID. Natural.
2. **Auto-generate** — like `_ag0`. Works when no ID exists, but less debuggable.
3. **Explicit `markerName` param** — let the caller specify. Most flexible.

**My suggestion:** Use the anchor element's `id` if it has one; otherwise auto-generate. Add an optional `markerName` param to override:

```ts
interface LazyLoadResolvedParams {
    // ...existing...
    insertionMode?: 'child' | 'after';
    anchor?: Element;           // required for 'after' mode
    markerName?: string;        // override auto-derived name
    toggleInert?: boolean;
}
```

For `be-switched`, the template element always has an implicit or explicit identity — using its `id` (or a generated one based on position) is natural.

### Revised Summary — What Changes

| Feature | Approach |
|---------|----------|
| Sibling insertion | `insertionMode: 'after'` + `anchor` param |
| Custom visibility | Not needed — `transitional` + `hideClass` covers it |
| Toggle disabled/inert | `toggleInert: boolean` param (built-in) |
| Pre-insert hook | Not needed — switching to markers eliminates ID assignment |
| Marker naming | Auto from anchor `id`, or explicit `markerName` param |
| `markerUtils` for sibling search | Add a sibling-mode variant to `findMarkers` |

### Updated `LazyLoadResolvedParams`

```ts
export interface LazyLoadResolvedParams {
    if: any;
    instantiate: HTMLTemplateElement | DocumentFragment;
    method?: 'appendChild' | 'prepend';
    forget?: boolean;
    transitional?: boolean;
    hideClass?: string;
    onInstantiated?: (ctx: LazyLoadInstantiatedContext) => void | Promise<void>;
    
    // New for be-switched reuse:
    insertionMode?: 'child' | 'after';
    anchor?: Element;
    markerName?: string;
    toggleInert?: boolean;
}
```

### Questions

1. **Should `toggleInert` set the `inert` attribute (HTML5 inert) or `disabled` property?** `be-switched` currently uses `disabled`. The `inert` attribute is broader (hides from a11y tree entirely). Both? Configurable?
2. **For `'after'` mode, should `lhsTarget` serve as the anchor, or should there be a separate `anchor` param?** Using `lhsTarget` as anchor simplifies the API (no new param needed — you just pass the template element as the target).
3. **Ready to implement, or more discussion needed?**

---

## Human Response I

> **Should `toggleInert` set the `inert` attribute (HTML5 inert) or `disabled` property?** `be-switched` currently uses `disabled`. The `inert` attribute is broader (hides from a11y tree entirely). Both? Configurable?

To my surprise, you are right, it seems to be disabling if applicable:


```JavaScript
/**
 * @param {Array<Element>} children
 * @param {boolean | undefined} toggleInert
 * @param {'add' | 'remove'} verb
 */
function changeVisibility(children, toggleInert, verb) {
    const disable = verb === 'remove' ? true : false;
    for (const child of children) {
        child.classList[verb]('be-switched-hide');
        if (toggleInert && 'disabled' in child && /** @type {any} */ (child).disabled === !disable) {
            /** @type {any} */ (child).disabled = disable;
        }
    }
}
```

I definitely think we should instead make the toggleInert option use the actual inert property.

I'm having a harder time seeing the use case for disabling, but it should be a separate option, toggleDisabled.  I could see it being more useful if we an option to not set the hidden property, which would make the most sense if hideClass is specified.

>  **For `'after'` mode, should `lhsTarget` serve as the anchor, or should there be a separate `anchor` param?** Using `lhsTarget` as anchor simplifies the API (no new param needed — you just pass the template element as the target).

Yes, I agree.

If there is no more doubts, then please implement.


