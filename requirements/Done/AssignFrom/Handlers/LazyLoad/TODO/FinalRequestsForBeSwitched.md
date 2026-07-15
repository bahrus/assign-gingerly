# Final Requests (?) From be-switched

---

## Human Ask

I asked kiro in the be-switched project to take a close look at the changes we've made, to see if there are any remaining gaps.

Here was the response:

---

## be-switched Ask

Now let me examine the actual updated code in `assign-gingerly`:

Now let me also check the current `transitionHelper.js` in this version:

Now let me check the package.json exports to confirm `markerUtils.js` is exported:

Good — `markerUtils.js` is properly exported. Now let me re-read the current `be-switched.js` to see exactly what we need to change:

Now I have a complete picture. Let me analyze the gaps and provide my assessment.

---

Here's my analysis after studying both documents and the updated code:

## What `LazyLoadHandler` Now Supports (v0.0.56)

- `method: 'after'` — inserts markers as siblings after `lhsTarget` (via `createMarkersSibling`/`findMarkersSibling`)
- `transitional` + `hideClass` — CSS-class-based show/hide with view transitions
- `toggleInert` — sets/removes the `inert` attribute
- `toggleDisabled` — sets/removes `disabled` on form elements
- `showNodes` / `hideNodes` — protected methods (overridable via subclass)
- `markerName` — explicit control over marker naming

## Remaining Gaps for `be-switched` to Fully Delegate

### 1. Template source: `remoteContent` resolution

`be-switched` uses `enhancedElement.remoteContent || enhancedElement.content` as its template source. The handler expects an `HTMLTemplateElement` or `DocumentFragment` passed via `instantiate`. This isn't really a gap in `assign-gingerly` — `be-switched` just needs to pass the resolved content. A `DocumentFragment` works fine.

**No change needed in assign-gingerly.** ✅

### 2. The `hiddenStyle` property (custom CSS for the hide class)

`be-switched` has a configurable `hiddenStyle` prop that determines what CSS the `.be-switched-hide` class contains (defaulting to `display: none`). It passes this to `ensureHideStyle`. The handler's `hideNodes` method calls `ensureHideStyle(lhsTarget.getRootNode(), hideClass)` — but without a `hideCss` parameter.

Looking at the handler code:
```js
ensureHideStyle(lhsTarget.getRootNode(), hideClass);
```

It doesn't pass through a custom CSS string. `ensureHideStyle` defaults to `display: none`, which is fine for most cases. But `be-switched` lets users customize this (e.g., `opacity: 0; height: 0`).

**Gap:** The handler needs a `hideCss` param (or `be-switched` calls `ensureHideStyle` itself before delegating, which it already does in `onFalse`). Since `be-switched` can just call `ensureHideStyle` before calling the handler, this is workable without a change. But it would be cleaner if the handler accepted `hideCss`.

**Suggested change in assign-gingerly:** Add `hideCss` to `resolvedParams` and pass it through to `ensureHideStyle` in `hideNodes`. Minor.

### 3. The `toggleInert` semantic mismatch

`be-switched`'s `toggleInert` currently sets `disabled` (not `inert`). The updated handler uses the actual `inert` attribute for `toggleInert` and has a separate `toggleDisabled`. Per the discussion, you agreed to move to proper `inert`. So `be-switched` should just use `toggleInert: true` from the handler. 

**No gap** — just a behavioral change in `be-switched` (which you wanted). ✅

### 4. The marker name: what to use for `be-switched` templates?

With `method: 'after'`, the handler derives the marker name as:
```js
const name = markerName ?? getMarkerName(instantiate) ?? (lhsTarget.id || 'anonymous');
```

For `be-switched`, `lhsTarget` is the template element, and `instantiate` would be the `DocumentFragment` (from `template.content`). `getMarkerName` on a DocumentFragment returns `'anonymous'`. So the fallback is `lhsTarget.id || 'anonymous'`.

If the template has an `id`, it works naturally. If not (many `be-switched` templates don't have IDs), multiple anonymous templates in the same parent would collide.

**Gap:** Need a way to ensure unique marker names for templates without explicit IDs.

**Options:**
- a) `be-switched` generates a unique ID for the template if it doesn't have one (lightweight, self-contained).
- b) Pass `markerName` explicitly using something like `id-generation` (already a dependency).
- c) The handler could auto-generate a unique marker name when it would otherwise be `'anonymous'`.

**Suggested change in assign-gingerly:** When `method === 'after'` and the computed name would be `'anonymous'`, auto-generate a unique name (e.g., `_ag_${counter++}`) and store it on the anchor element via a data attribute (e.g., `data-ag-marker`) so it can be found again on the next call. This eliminates the need for callers to manage naming.

### 5. No `'after'` mode equivalent of "has already been cloned" check

In `be-switched`, the check `enhancedElement.hasAttribute(idRefAttr)` serves as a fast "has this template already been instantiated?" guard. With markers, the equivalent is `findMarkersSibling` returning non-null — the handler already does this internally. So this is fine.

**No gap.** ✅

### 6. The `.value` property and class toggling on the template element

`be-switched` sets:
- `enhancedElement.value = true/false` (for custom element integration)
- `enhancedElement.classList.add/remove('be-switched-on'/'be-switched-off')`

These are enhancement-specific state reflections. They don't belong in the generic handler.

**No change needed in assign-gingerly.** `be-switched` would do this before/after calling the handler. ✅

### 7. The `#determineIfEmpty` guard (preload / empty template check)

This is `be-switched`-specific logic. No change needed in the handler — `be-switched` checks this before deciding whether to call the handler at all.

**No gap.** ✅

---

## Summary: What Needs to Change in `assign-gingerly`

| # | Gap | Severity | Suggested Fix |
|---|-----|----------|---------------|
| 1 | `hideCss` not passable through handler | Low | Add optional `hideCss` param to `resolvedParams`, pass to `ensureHideStyle` in `hideNodes` |
| 2 | Anonymous marker name collision for `method: 'after'` | Medium | Auto-generate unique name when computed name is `'anonymous'` in `after` mode; persist via data attribute on anchor |

### Instructions for the `assign-gingerly` Kiro session:

**Change 1: Add `hideCss` to `resolvedParams`**

In `handlers/lazyLoad.ts` (and `.js`):
- Add `hideCss?: string` to the destructured params (defaults to `undefined`)
- In `hideNodes`, change `ensureHideStyle(lhsTarget.getRootNode(), hideClass)` to `ensureHideStyle(lhsTarget.getRootNode(), hideClass, hideCss)`
- This lets consumers like `be-switched` pass custom CSS (e.g., `hideCss: 'display: none'` or `hideCss: 'opacity: 0; height: 0'`)

**Change 2: Auto-generate unique marker names in `'after'` mode**

In the `assign` method, when computing the name:
```js
const name = markerName ?? getMarkerName(instantiate) ?? (lhsTarget.id || 'anonymous');
```

If the result is `'anonymous'` AND `method === 'after'`:
- Check if `lhsTarget` has a `data-ag-marker` attribute — if so, use that value
- Otherwise, generate a unique name (e.g., `_ag_${globalCounter++}`), store it on `lhsTarget.dataset.agMarker`, and use it
- This ensures repeated `assign()` calls for the same anchor find the same markers

---

Once those two changes are made, `be-switched` can fully delegate to `LazyLoadHandler`:

```js
import { LazyLoadHandler } from 'assign-gingerly/handlers/lazyLoad.js';

// In onTrue:
const handler = new LazyLoadHandler({});
await handler.assign(enhancedElement, {
    if: true,
    instantiate: contentToClone,
    method: 'after',
    transitional: transitional2,
    hideClass: 'be-switched-hide',
    hideCss: hiddenStyle,
    toggleInert: !!toggleInert,
});

// In onFalse:
await handler.assign(enhancedElement, {
    if: false,
    instantiate: contentToClone,
    method: 'after',
    transitional: transitional2,
    hideClass: 'be-switched-hide',
    hideCss: hiddenStyle,
    toggleInert: !!toggleInert,
});
```

And then `getIdRefChildren`, `changeVisibility`, the `idRefAttr` property, and all ID-management logic can be removed from `be-switched`.

Want me to hold on the `be-switched` refactoring until those two changes are done in `assign-gingerly`, or is there anything else you'd like me to look at?

---

## Human Ask, continued

Do these requests make sense?  Any concerns?