# Styling Incompletely Rendered Elements

## Bruce's Ask

I think there needs to be way of indicating parts of the rendered HTML that still need to be applied from the residue.

I think adding a class with a common name, shared between assign-gingerly and o2h, might be the way -- not-hydrated?  Something else?

I think the most common styling would be:

```css
.not-hydrated {
    visibility: hidden;
}
```

After applying the residue, we should remove this class.  We need to make sure this is done after any className might have been set.

Please let me know your thoughts below.

## Claude's Response

**Agreed that the pending parts need a mark.** But I'd use an **attribute rather than a class**, and let it do a second job too.

### 1. An attribute, not a class

A class lives in the same place as the element's own classes, which is exactly the ordering problem you spotted:
- **Assigning `className`** (a manager's rebind, `builtIns.scope`'s bind, a later Tree run) replaces the whole class list. So it can drop the mark *before* the element is ready, or, if re-applied, put it back.
- **Removing the class** has to happen *after* every `className` assignment, which is hard to guarantee once async work (managers, listeners) is involved.

An attribute avoids that entirely. Nothing in a pattern touches it unless asked, and removing it can't disturb `class`. The CSS is just as easy:

```css
[data-residue] { visibility: hidden; }
```

(Attribute and class selectors have the same specificity, so overriding it works the same way.)

### 2. Let the mark also be the address

Today o2h's residue addresses elements by **child-index paths** (`at: { e1: [7, 1, 1] }`). That works, but it's fragile:
- markup inserted by other code shifts the paths;
- the container's existing children need `elementOffset`;
- paths can't reach into `<template>` content.

If the mark carries the residue key, `data-residue="e1"`, the client simply finds `[data-residue]` elements. **One attribute then marks "pending" and says "which entry"**, and the paths aren't needed at all.

```html
<section itemscope="rocket-manager" class="card rocket" data-residue="e3">…
    <button type="button" class="inc" data-residue="e2">Increase by one</button>
```

`pin`'s `{ qry }` form could find them today, but it **auto-assigns an `id`** to every element it pins, which isn't something to leave behind. Hence the helper below.

### 3. An `applyResidue` helper here (the import side)

This is "bringing data into elements", so it belongs in assign-gingerly. It's small:

```js
import { applyResidue } from 'assign-gingerly/applyResidue.js';

await applyResidue(container, residue, { from: host, registry });
```

1. **Apply** each `[data-residue="eN"]` element's entry with `assignFrom(element, entry, options)`.
2. **Wait for that element's async work,** since that's what "ready" means:
   - the manager attached (its `ish` setup settled);
   - event listeners attached (the ` +=` module loads on demand);
   - handlers settled (`whenSettled`).
3. **Then remove `data-residue`** from that element. It's removed per element, so each part shows as soon as it's ready rather than all at the end.

Because the mark is removed last, after anything the residue or the manager did to `class`, your ordering requirement holds by construction.

**`builtIns.scope` should do the same**: when it takes over an element marked `data-residue`, it removes the mark after its first bind. Then a manager's card stays hidden until its subtree is really bound against the manager, which is exactly the "incompletely rendered" case.

### 4. Don't hide content from clients that never run the script

`visibility: hidden` with no script means crawlers and no-JS readers never see those parts. They'd also stay hidden if a script fails. So I'd recommend this CSS instead:

```css
@media (scripting: enabled) {
    [data-residue] { visibility: hidden; }
}
```

The `scripting` media feature is supported in current Chromium, Firefox and Safari. Two more notes on the style:
- **`visibility: hidden` is a good default,** better than `display: none`, because it keeps the layout, so nothing jumps when the part appears.
- **Some might prefer `opacity`, or `pointer-events: none`** for parts whose only residue is an event listener, e.g. a button that's visible but inert until wired. The attribute lets authors choose.

### 5. What's marked

**Only elements with a residue entry.** A manager's element hides its whole subtree (visibility inherits), which covers subtrees the server rendered from raw values. Elements needing nothing are visible immediately.

**o2h could also offer, as an option, to emit the default `<style>` rule** alongside the HTML, so a page works without the author adding CSS. I'd leave it off by default, since pages usually have their own stylesheet.

### Questions

1. **An attribute rather than a class?** If yes, is the name **`data-residue`** (it ties to o2h's "residue") OK, or would you prefer `data-pending` or `data-not-hydrated`?
2. **Replace `at` paths with the attribute in o2h's residue?** o2h is new, so there's nothing to stay compatible with.
3. **`applyResidue` in assign-gingerly,** removing the mark per element once its manager, listeners and handlers have settled? **And `builtIns.scope`** removing it after its first bind?
4. **o2h's default `<style>`:** an opt-in option, or not at all?