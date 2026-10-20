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

## Bruce's Response I

I agree with all your recommendations, including the opt-in style option for o2h.  Please proceed, including updating the demo.  I recognize I will need to publish the new version of assign-gingerly to see it working.  Or feel free to add a package.json to the [root folder](../../../../../../) and install the spa-ssi folder and use spa-ssi's server side include to include [imports.html](../../../../../../o2h/imports.html) so it points to the peer folder, so we don't have to keep publishing.  Tat would be better if you are able to do that.

## Claude's Implementation Notes

Done, as recommended, including the workspace server, so nothing needs publishing to see it work. Nothing is committed.

**Results:**
- **assign-gingerly:** full suite **165 passed, 6 skipped** (in the scratch copy, as before). The new `tests/apply-residue.html` is 15 / 15 in Chromium, Firefox and WebKit. `tsc --noEmit` is clean.
- **o2h:** `npm test` gives **6 passed, 6 skipped**, run against the sibling assign-gingerly through the workspace server. `tsc` is clean.
- **The o2h demo**, through the workspace server in Chromium:
  - **before:** 3 elements pending, with the links bar and the rocket card hidden (space kept), the rest visible;
  - **after "Apply the residue":** 0 pending, everything visible;
  - the card's button reaches its `RocketManager` (`heightLabel` 70 m → 71 m);
  - no console errors.

### assign-gingerly

- **New `applyResidue(container, residue, options, permissionProcessor?)`** (`applyResidue.ts`, exported from the index and as `assign-gingerly/applyResidue.js`). For each `[data-residue]` element (the container included, if marked):
  1. **Managers first:** an entry's `ish` is assigned, and the element's `itemscope` name is awaited through the registry (`registry` option first).
  2. **The rest of the entry** is applied with `assignFrom`. **The host is the closest manager** (the element's own, or an ancestor's), else `options.from`, as in Tree. That's what lets the card's button call `increaseHeightByOne`.
  3. **It waits until the element is ready:** `whenSettled(element)` and **`whenEventsBound(element)`**.
  4. **Then it removes the mark.** This happens per element, after anything that touched `class`. A marked element with no entry is unmarked right away.
- **New `whenEventsBound(element)`** (`assignGingerly.ts`, exported from the index). Event listeners attach once their module has loaded, and resolving a dynamic `import()` can take longer than one task. A first version that waited one macrotask failed in all three browsers. `bindEvent` now records its pending attachment per element; errors are still reported as before.
- **`RESIDUE_ATTRIBUTE`** (`'data-residue'`) is exported. o2h has the same constant, since the published 0.0.102 doesn't have it.
- **`builtIns.scope`** removes an element's mark after its first bind (with a manager, or without).
- **Docs:**
  - **`tree.md`:** *Server Side Rendering* now describes the marks, plus a new subsection, *Finishing server HTML on the client: `applyResidue`*, with the CSS and `@media (scripting: enabled)`.
  - **`scope.md`:** *Pending marks*, including "apply a residue before taking a scope over".
  - **`event-binding.md`:** `whenEventsBound`.

### o2h

- **Marks instead of paths.** An element with leftovers gets `data-residue="eN"`, and the residue is now `{ eN: pattern }`. `at` and the `elementOffset` option are gone, since nothing depends on them yet.
- **`style: true`** prepends `RESIDUE_STYLE`: `<style>@media (scripting: enabled) { [data-residue] { visibility: hidden; } }</style>`. It's opt-in. `RESIDUE_ATTRIBUTE` and `RESIDUE_STYLE` are exported, and typed in `types/o2h/types.d.ts` (**the submodule**).
- **Tests:**
  - **Unit:** the marks in the HTML, the new residue shape, and the style option.
  - **Equivalence:** o2h's HTML is now finished with **`applyResidue`** before it's compared. It checks that no marks are left behind, and that the rocket card's button reaches its manager.
- **The demo:**
  - `style: true`;
  - "Apply the residue" calls `applyResidue` (the pending parts appear);
  - the same-DOM check ignores the style element, the marks and the manager `itemscope`;
  - its import map comes from the include (below).
- **README:** the residue and `applyResidue`, `style`, and *Within the beGingerly workspace*.

### The workspace (`c:\git\beGingerly`)

| | |
|---|---|
| **`package.json`** | `npm run serve` (spa-ssi 0.0.28, installed), serving the whole folder |
| **`imports.html`** | The import map `"assign-gingerly/": "/assign-gingerly/"`: the sibling repo |
| **`README.md`** | What the folder is for, and the example URL http://localhost:8000/o2h/demo/ |

**How it switches:** o2h's pages (`demo/index.html`, `tests/equivalence.html`) now say `<!-- #include virtual="/imports.html" -->`. spa-ssi resolves that against the folder being **served**:
- **served from o2h:** o2h's own `imports.html`, which maps to `/node_modules/assign-gingerly/` (published);
- **served from the workspace:** the workspace's, which maps to the sibling.

So the same pages work both ways. The sibling's **built `.js`** is what gets served, which your watch build keeps current.

**o2h's `playwright.config.ts`:**
- **When `../node_modules/spa-ssi` exists** (inside the workspace), it serves the workspace folder on **port 8090** (so it doesn't collide with assign-gingerly's tests on 8000), with `baseURL` `…/o2h/`.
- **Otherwise,** it serves o2h on 8000 as before.

The test navigates relative to `baseURL`, so it works either way.

### Things to know

- **Outside the workspace,** o2h's browser test and demo need an assign-gingerly with `applyResidue`, i.e. **the next published version**. Bump o2h's dependency then. The Node tests and `o2h()` itself only use what 0.0.102 has.
- **A manager's text still isn't re-bound on the client.** Its events reach it now, but when `ctx.rebind()` runs (e.g. after "Increase by one"), nothing re-applies the server-rendered card. The click changes the manager's state (the log shows it), not the card. `builtIns.scope` can do that rebinding; wiring o2h's output to it is the natural next step. That's noted in `tree.md`.
- **Residue values go through `assignFrom`,** so a *string* value that looks like a reference (`'?.x'`) would be resolved rather than taken literally. That's unchanged from before.
- **A stray server:** while testing, a server from an earlier o2h Playwright run was still holding port 8000. spa-ssi then quietly takes the next free port, which made a later run hit the wrong server. If tests ever fail across the board, check for leftover `serve.js` processes.

**To do on your side:**
1. **`git add`:**
   - in assign-gingerly: `applyResidue.ts` and `tests/apply-residue.*`;
   - in o2h: `imports.html`, if you haven't.
2. **Commit `types/o2h/types.d.ts`** in o2h's `types` submodule.
3. **Publish assign-gingerly** when convenient, then bump o2h to it.