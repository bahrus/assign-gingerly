# Template Weaving

## Bruce's Ask -- Brainstorming

The [demo that was created showcasing use of the ItemscopeTree](../../../../../../demos/itemscope-tree-demo.html) was a bit discouraging.  The developer ergonomics seem pretty bad.

I'm thinking that something that could help would be to provide [be-decked-with](https://github.com/bahrus/be-decked-with) capability:

```html
<template id="spec-template">
    <div class="spec">
        <span class="label"></span>
        <slot></slot>
    </div>
</template>

<script>
    class HeightManager extends TBD {
        static instantiate() { return document.createElement('span'); }
        render() {
            this.itempropEl.textContent =
                this.units === 'metric' ? `${this.meters} m` : `${this.feet} ft`;
        }
    }
    ...
    const pattern = {
        '?. =>': {
            do: 'builtIns.itemscopeTree',
            map: {
                patch: PatchImage,
                name: 'MissionTitle',
                status: StatusBadge,
                date_utc: LaunchDate,
                details: Details,
                links: LinksBar,
                rocket: RocketCard,
                crew: CrewList,
                cores: CoreList,
                failures: FailureList,
                height: {
                    spawn: HeightManager,
                    itemscopeTemplate: globalThis['spec-template']
                }
            }
        }
    };
</script>
```

What this would do is generate:

```html
<div class="spec" itemscope=HeightManager>
    <span class="label"></span>
    <span itemprop=height>30 ft</span>
</div>
```

What do you think?  Would this help?  Is there something else that would give more bang for the buck?  Please add your thoughts below.

---

## Claude's Thoughts

**Short version:** template weaving helps, but only for 3 of the demo's 13 classes (`HeightManager`, `MassManager`, `EnginesManager`), and as drafted it has two structural problems: the microdata comes out inverted, and re-runs aren't idempotent. Generalizing it from "weave a value into a template" to **"`instantiate` can be declarative"** gets more out of the same work. The biggest wins overall, though, are in the boilerplate every class repeats and in the array-valued managers.

### First, a bug the proposal is circling

`spec()` in the current demo now returns `template.content.cloneNode(true)`, which is a **`DocumentFragment`**, not an `HTMLElement`. The handler checks `result instanceof HTMLElement` and **silently skips** the key, so Height, Mass and Engines no longer render. (The commented-out `h('div', …)` line was the verified version.) Both the "silently skipped" rule and the fact that "I just want to clone a template" is the natural move are DX findings in their own right:

- **Cheap fix:** accept a fragment whose only element child is one element (ignoring whitespace text), and unwrap it.
- **Dev aid:** `console.warn` when `instantiate` returns something non-null that isn't usable. Returning `null` stays the silent "skip me" signal.

### On the proposal as drafted

**1. The microdata is inverted.** In

```html
<div class="spec" itemscope=HeightManager>
    <span class="label"></span>
    <span itemprop=height>30 ft</span>
</div>
```

`height` becomes a property of the *HeightManager item* (the nearest `itemscope` ancestor), not of the rocket/specs container. The `div` has no `itemprop`, so it isn't linked to its parent at all. It also breaks two mechanisms the handler relies on:

- **Idempotency:** with `map`, existing elements are found by a **direct child** carrying `itemprop=<key>`. The wrapper has none, so "Run again" would append a second Height row.
- **CSS placement:** the demo's grid selectors are `#launch > [itemprop=…]`.

**2. Suggested shape: the template is inert chrome, and the manager lives on the woven-in element.**

```html
<div class="spec">
    <span class="label">Height</span>
    <span itemprop=height itemscope=HeightManager>70 m</span>
</div>
```

- The semantics are correct: `height` is a property of the enclosing item.
- The manager only ever touches its own element (`this.element.textContent = …`). No `querySelector('.value')`, and no separate `itempropEl` concept.
- Idempotency needs the existence check to change from "direct child with `itemprop=k`" to **"a descendant with `itemprop=k` whose nearest `itemscope` ancestor is the target"**. That is microdata's own property-scoping rule, so it's principled rather than a special case. It also stops matching properties inside nested items, which a plain descendant query would get wrong.
- The cost: `:scope > [itemprop]` CSS no longer reaches woven elements. That's acceptable, since grid placement is a layout concern and the wrapper can carry its own class.

**3. Put the template on the class, not (only) on the map entry.** The three spec managers are all found by the `<Key>ISM` **naming convention** inside `RocketCard`, not through `map`, so `map.height.itemscopeTemplate` would never apply to them. Also, all three share the same template, so repeating it per entry is exactly the boilerplate we're trying to remove:

```js
class UnitSpec {
    static itemscopeTemplate = 'spec-template';   // id, resolved via target.getRootNode()
    ...
}
```

Keep the map-entry object form `{ spawn, itemscopeTemplate }` as an override. Resolve string ids against `ctx.target.getRootNode()` rather than `globalThis['spec-template']`. Named access on `window` is fragile and doesn't see into shadow roots, and this way the template stays scoped the same way the registry already is.

**4. The label is never filled.** The template's `.label` is empty and nothing in the proposal populates it, so you'd need a template per label, which defeats the purpose. Options, cheapest first:

- **Named slots filled from static data:** `<slot name="label"></slot>` plus `static slots = { label: 'Height' }`, where a string becomes a text node.
- **Key-derived:** the `label` slot defaults to the humanized key (`date_utc` → "Date utc"). That's handy but too magic for anything user-facing.
- **A hook:** `static weave(chrome, value, ctx)`, called once after cloning, for anything irregular.

The default `<slot>` (unnamed) receives the `instantiate()` result. If there's no `instantiate`, a plain `<span>` would be a reasonable default for primitives.

### What would give more bang for the buck

Ranked by value ÷ effort, judged against the demo's code:

| # | Change | What it removes from the demo | Effort |
|---|---|---|---|
| 1 | Accept single-element fragments, and warn on unusable `instantiate` results | The silent Height/Mass/Engines failure; makes `<template>` usable today | Tiny |
| 2 | **`instantiate` can be declarative**: `static instantiate = 'h2'` (tag name) or `static itemscopeTemplate = 'id'` (clone), with slot weaving as the optional extra on top | Most of the `static instantiate() { return h(…) }` bodies; the `spec()` helper | Small |
| 3 | **A tiny base class** (or the handler setting `instance.element` itself) plus **instance-level** `onAssigned(value, ctx)` as an alternative to `static onAssigned(instance, value, ctx)` | The 9× repeated `constructor(element) { this.element = element; }`, and the awkward `instance.element…` indirection | Small |
| 4 | **Built-in primitive managers** reusing `microDataJoin`'s type → element mapping (string → `span`, number → `data`, Date/ISO → `time`, null → placeholder) | `MissionTitle`, `LaunchDate`, `Details`: three whole classes become map entries like `name: '🌳text'` or `{ tag: 'h2' }` | Medium |
| 5 | **Arrays delegate to `manageTemplateList`**: a map entry like `crew: { itemTemplate: 'crew-item', key: 'name' }` | `CrewList`, `CoreList`, `FailureList`: the most imperative code in the demo, with keyed reconciliation for free | Medium |
| 6 | **Update existing elements on re-run** (already on the roadmap): when an element exists, assign `el.ish = value` instead of skipping | `RocketCard`'s `if (!ctx.initial) return` workaround; makes "Run again" with a new VM meaningful | Medium (needs the update semantics settled) |

**My recommendation:** do **1** now. Do **2 + 3** together as the next phase, and build your template weaving as the slot-filling half of #2, with the placement corrections above. With just those, the spec trio collapses to roughly:

```html
<template id="spec-template">
    <div class="spec"><span class="label"><slot name="label"></slot></span><slot></slot></div>
</template>
```

```js
class UnitSpec extends ItemscopeManagerBase {
    static itemscopeTemplate = 'spec-template';
    static instantiate = 'span';
    #units = 'metric';
    get units() { return this.#units; }
    set units(v) { this.#units = v; this.render(); }
}
class HeightManager extends UnitSpec {
    static slots = { label: 'Height' };
    render() { this.element.textContent = this.units === 'metric' ? `${this.meters} m` : `${this.feet} ft`; }
}
```

After that, **4 and 5** are where most of the remaining demo code lives. #5 matters most because it reuses a handler that already exists and is already tested, rather than adding new surface area.

**One open question for you:** should a woven template be allowed to contain *multiple* slots that each receive a different VM key? For example, one row template showing `meters` and `feet` side by side. That overlaps with `microDataJoin` and with the roadmap's "several nodes per key / `itemref`" item. I'd keep v1 to one managed element per template, and treat multi-slot as the bridge to `itemref` later.

