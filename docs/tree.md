# builtIns.tree

A handler that builds a small tree of elements from a view model, and rebinds it in place on later calls. Each `map` entry pairs a VM key with an **element specification**: a tag name, or a tuple of tag, assignFrom pattern, and static children.

Tree adds no microdata and doesn't adopt existing (server-rendered) markup. It aims at simple scenarios.

**For large lists,** see [Compiling (`compile`)](#compiling-compile-experimental): an opt-in mode that clones precompiled templates, with static parts baked in, instead of creating each element.

**Demo:** [demos/tree-demo.html](../demos/tree-demo.html) builds a launch summary from a JSON API response. Run `npm run serve`, then open `/demos/tree-demo.html`.

Design discussion: `Chats/AssignFrom/Handlers/TODO/TreeScope/Tree.md`.

## Basic Example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JavaScript
const vm = {
    patch: { small: './data/mission-patch.svg', alt: 'Demo Mission 7 patch' },
};

await assignFromAsync(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            patch: ['img', { src: '?.small', alt: '?.alt' }],
        }
    }
}, { from: vm });
```

Result:

```html
<details id=api-response>
    <summary>API Response</summary>
    <!--?start name="tree"--><img src="./data/mission-patch.svg" alt="Demo Mission 7 patch"><!--?end-->
</details>
```

Use `assignFromAsync` when you need the tree to exist after the `await`. The sync `assignFrom` starts handlers fire-and-forget.

The `🌲` emoji alias works too, when `builtInEmoji` is passed as `handlers`.

## Targets

The target can be an **element**, a **`ShadowRoot`**, or any other **`DocumentFragment`**, so a web component can render straight into its shadow root:

```JavaScript
await assignFromAsync(this.shadowRoot, { '?. =>': { do: 'builtIns.tree', map: { … } } }, { from: this });
```

- **Managers resolve through the target's registry:** `{ tag, ish }` headers look the name up in the target's `customElementRegistry` (so a shadow root with a **scoped** registry uses its own managers), then fall back to the global one.
- **Plain fragments move:** when a plain `DocumentFragment` is appended somewhere, its content, including Tree's markers, moves with it. Later calls should target the new parent, where Tree finds its markers and rebinds in place. Calling Tree on the emptied fragment starts a new tree.

## Element Specifications

```TypeScript
type ElementSpecification =
    | Header
    | [Header, Pattern | string]
    | [Header, Pattern | string, ElementSpecification[] | Repeat];   // static children, or a repeat (see Arrays below)

type Header = tagName | { tag: tagName; ish?: string | ManagerClass };   // see Itemscope Managers below
type Repeat = { each: ElementSpecification; of?: string; key?: string; empty?: ElementSpecification };
```

- **The pattern** is an [assignFrom](./assignFrom.md) pattern applied to the created element, with `from` set to **the key's VM value**. So `'?.small'` above reads `vm.patch.small`.
- **A string in the pattern slot is `textContent`**: `['h3', 'Crew']` (literal) or `['b', '?.name']` (a path, reference or pipe, resolved like any RHS value). It's shorthand for `{ textContent: … }`.
- **Shorter keys inside pattern objects:** give the tree config an `aka`, e.g. `aka: { _: 'textContent' }`, and write `{ className: 'name', _: '?.' }`, `'_ ?=': [...]` or `'_ =&': { join: [...] }`. It's merged over `options.aka` and applies to this tree's patterns only. Like any `aka`, it also rewrites RHS path segments, so pick an alias that isn't also a data key.
- **Children** are static structure. Their patterns resolve against **the same value as their parent**:

  ```JavaScript
  rocket: ['section', { className: 'card' }, [
      ['h3', { textContent: '?.name' }],     // vm.rocket.name
      ['p',  { textContent: '?.type' }],     // vm.rocket.type
  ]]
  ```

- **The whole VM** is available as `$parent` (and `$root`, for a top-level tree), at every depth: `'$parent?.upcoming'`. See [root-references.md](./root-references.md).
- **`template` elements** receive their children in `.content`, not as light-DOM children.
- **Patterns set properties** (via assignGingerly). For attributes, use the [` :=` operator](./attribute-operator.md): `{ 'class :=': 'card', 'aria-label :=': '?.label' }`. Literal ` :=` values are what a future compile step can bake into a template, so prefer them for statics.
- **Formatting** (dates, units, conditional text) comes from [pipes](./pipes.md) passed in the options: `'?.date_utc?.parseDate?.longUtc'`.
- **Don't combine `textContent` with children**: setting `textContent` replaces them. Tree puts them back on the next call, after the text.

Bare class headers and `$:` headers are reserved for a later phase and throw for now. Use `{ tag, ish }` instead.

## Arrays

Put a **repeat object** in the children slot, in place of the array of static children:

```JavaScript
crew: ['ul', { className: 'crew' }, {
    each: ['li', {}, [
        ['strong', { textContent: '?.name' }],
        ['span',   { textContent: '?.role' }],
    ]],
    key: '?.name',
}],

failures: ['ul', {}, {
    each:  ['li', { textContent: '?.reason' }],
    empty: ['li', { className: 'muted', textContent: 'No failures recorded.' }],
}],

links: [{ tag: 'nav', ish: 'links-manager' }, {}, [
    ['ul', {}, { of: '?.linkList', each: ['li', {}, [['a', { href: '?.href', textContent: '?.name' }]]], key: '?.name' }],
]],
```

| Field | Meaning |
|---|---|
| `each` (required) | The specification stamped once per item. It can have children, a `{ tag, ish }` header (one manager per item, each with its own `ctx.rebind()`), and nested repeats. |
| `of` | Path to the array (any iterable), relative to the element's value. Default `'?.'`: the value itself. Anything nullish or not iterable counts as empty. |
| `key` | Path into each item that identifies it across calls (`'?.id'`, or `'?.'` for primitives). Default: the index. Duplicate keys log one warning and fall back to the index for the duplicates. |
| `empty` | Rendered **instead of** the items when there are none. |

- **Inside `each`:** `?.` is the **item**, and `$parent` is the **object holding the array**: the VM for a top-level key like `crew`, or the value `of` was resolved against (e.g. the links manager). `$root` is unchanged.
- **The repeating element owns its content.** Its own pattern still applies (resolving against its value, e.g. `title: '?.length'`), but it can't also have static children.
- **Reconciliation on later calls:** items whose key is still present are rebound in place (and moved if needed), new keys are created, missing keys are removed, and `empty` comes and goes as the array empties and fills.
- **Synchronous**, like the rest of Tree, so the lists are rendered as soon as `assignFromAsync` resolves.

### When `manageTemplateList` is still the better fit

Native arrays are the default. Delegating a list to [`builtIns.manageTemplateList`](./manage-template-list.md) (as a ` =>` handler key in the list element's pattern) still makes sense when:
- **the item markup lives in HTML:** a `<template>` in the page, possibly server-rendered, and possibly filled by `infer` (e.g. by `itemprop`);
- **an item is several sibling elements**, such as `<dt>` / `<dd>` pairs (`configs`), whereas a Tree `each` is one element;
- **a very long list needs time-slicing** (`yieldEvery`), or `waitForSettled`;
- **removed items should be hidden rather than discarded** (`forget: false`).

The trade-off is that the handler runs asynchronously. Inside Tree it's fire-and-forget, so the list fills in just after the tree. [demos/tree-demo-with-managed-template-list.html](../demos/tree-demo-with-managed-template-list.html) shows that approach.

## Itemscope Managers as View Models

An object header `{ tag, ish }` attaches an [itemscope manager](../README.md#itemscope-managers-chrome-146) to the element. The manager then acts as the **view model for that element's subtree**: the element's own pattern and its children's patterns resolve against the **manager instance** (`el.ish`) instead of the raw value. Computed values are just getters, and the structure stays in the config, so managers don't render DOM.

```JavaScript
class RocketManager {
    static is = 'rocket-manager';
    #metric = true;
    #rebind;
    constructor(element, initVals, { rebind }) {
        Object.assign(this, initVals);   // the raw vm.rocket
        this.#rebind = rebind;
    }
    get metric() { return this.#metric; }
    set metric(value) { this.#metric = value; this.#rebind(); }
    get heightLabel() { return this.#metric ? `${this.height.meters} m` : `${this.height.feet} ft`; }
}
customElements.itemscopeRegistry.define(RocketManager.is, { manager: RocketManager });

map: {
    rocket: [{ tag: 'section', ish: 'rocket-manager' }, { className: 'card' }, [
        ['span', { textContent: '?.heightLabel' }],   // a getter on the manager
    ]],
}
```

- **`ish`** is a **registered name** (keeps the config JSON) or a **class**. A class is registered automatically under `Class.is ?? Class.name`; a name registered to a different class throws, and so does an unregistered name.
- **No `itemscope` attribute** is set. The manager is attached directly through the element's `ish` property.
- **The manager is structure.** It's attached once, when the element is created. A different `ish` (like a different tag) rebuilds the element.
- **Every call** assigns the key's value to `el.ish`, with the usual `ish` semantics: the first value constructs the manager, and later values merge into it (or go to a static `onAssigned`). The subtree is then re-applied against the instance.
- **`$parent` / `$root`** inside the subtree still refer to the enclosing VM(s), not to the manager.

### `ctx.rebind()`

The manager receives a context with **`rebind()`**: as the constructor's third argument, and merged into `onAssigned`'s `ctx`. Calling it re-applies the element's own pattern and its children's patterns against the manager, without a tree rerun. Call it after changing the manager's own state, typically from a setter (above: `rocketEl.ish.metric = false`). State kept on the manager survives later tree reruns.

Calls made while Tree itself is binding that element (for example from the constructor) are ignored, since Tree is about to bind it anyway.

### Async `onAssigned`

`onAssigned` may return a promise. Tree binds the subtree **immediately**, with whatever state the synchronous part of `onAssigned` set, and then **calls `rebind()` by itself once the promise settles** (after any values queued behind it). For example, a links bar can show "verifying…" right away and "✓ verified" when the check finishes.

See [demos/tree-demo.html](../demos/tree-demo.html): the rocket card and the links bar each have a manager.

## Events

An element's own pattern can bind its events with an empty ` +=` LHS. The listener's **host is the element's `from`** — inside a manager subtree, the manager instance — so a button can call a manager method directly:

```JavaScript
rocket: [{ tag: 'section', ish: 'rocket-manager' }, {}, [
    ['span', '?.heightLabel'],
    ['button', { _: 'Increase by one', ' +=': { on: 'click', call: 'increaseHeightByOne' } }],
]]
```

- No `itemscope` attribute or DOM host lookup is involved; the host comes from the data context.
- **Reruns don't stack listeners:** Tree gives each `' +='` binding without a `get.key` a default dedup key, so re-applying the pattern replaces the listener (and its host is always the current `from` — which matters outside manager subtrees, where the VM value changes between calls).
- The manager method typically updates its own state and calls `ctx.rebind()`.

See [event-binding.md](./event-binding.md) for the full ` +=` event syntax.

## Keys

| Situation | Behavior |
|---|---|
| Order | Map order, then `'*'` keys (below) in VM key order |
| Value is `null` / `undefined` | Skipped (an existing element is removed), unless `keepNullish: true` |
| Map key missing from the VM | Skipped as above, with a `console.warn` on the tree's first render (likely a typo) |

### Default specification: `'*'`

The `'*'` key applies to every VM key the map doesn't name. A `'*'` specification without a pattern gets `{ textContent: '?.' }`, so this gives a "just show me the data" view in one line:

```JavaScript
map: { name: ['h2', { textContent: '?.' }], '*': 'span' }
// { id: 'demo-7', name: 'Demo Mission 7', flight: 7 }
// → <h2>Demo Mission 7</h2><span>demo-7</span><span>7</span>
```

Object values render as `[object Object]` with the default pattern. Give `'*'` its own pattern, or map those keys explicitly.

## Second and Later Calls

Tree remembers the elements it created, keyed by its start marker. On later calls it walks the specification and those elements in lockstep, and **re-applies each pattern in place**. Nothing is queried or diffed:

- A key whose **structure** changed (a different tag, or a different number of children) is rebuilt; the rest stay untouched. Structure is compared structurally, so a config written inline (new objects on every call) still rebinds in place.
- A key whose value **appears or disappears** is created or removed, in map order.
- An element **removed or moved by other code** is rebuilt.
- Markers found **without remembered state** (cloned or server-rendered markup) are cleared and the tree is rebuilt. Tree doesn't adopt existing markup.

### Several trees in one target

Give each config its own `markerName` (default `'tree'`):

```JavaScript
{ '?. =>': { do: 'builtIns.tree', markerName: 'summary', map: { /* ... */ } } }
```

## Config

```TypeScript
interface TreeConfig extends HandlerConfig {
    do: 'builtIns.tree';
    map: Record<string, ElementSpecification>;
    markerName?: string;    // default 'tree'
    keepNullish?: boolean;  // default false
    aka?: Record<string, string>;  // aliases for this tree's patterns, merged over options.aka
    compile?: boolean | string;    // experimental: clone compiled templates (see below)
}
```

The types live in `types/assign-gingerly/treeTypes.d.ts`.

## Compiling (`compile`, experimental)

```JavaScript
const map = { launch: ['article', { 'class :=': 'card' }, [['h3', { 'class :=': 'title', _: '?.name' }], /* … */]] };

assignFrom(host, { '?. =>': { do: 'builtIns.tree', compile: true, aka: { _: 'textContent' }, map } }, { from: vm });
```

With `compile`, Tree compiles the map once ([`handlers/compileTree.ts`](../handlers/compileTree.ts)) into flat `<template>`s, one per key and one per repeat `each` / `empty`. It then **creates each element by cloning its template**, instead of calling `createElement` and assigning every key.

**What's baked into the templates**, and so costs nothing per instance:
- literal `textContent`, including the string shorthand and keys aliased to it (`_`);
- literal ` :=` attributes;
- `microJoin`'s static text and element shells, when the first call's VM has every value. The element types come from that VM's values. If a later value has another type, `microJoin` just re-renders that element.

**Everything else is applied per instance, as before.** That includes literal *properties*: write statics as attributes (`'class :=': 'card'`, not `className: 'card'`) to get them baked.

**Rebinding, managers, events and repeats behave exactly as without `compile`.** Only creation changes.

**Rules and differences:**
- **Treat the map's specifications as immutable.** To change one, replace it with a new object. A template is used only for the exact spec object it was compiled from (anything else falls back to `createElement`), but an object edited *in place* isn't noticed. This is the same assumption Tree already makes when it skips literals on rebind.
- **Define the map once** (e.g. at module level). Compiled templates are cached per `map` object, so a map literal recreated on every call is recompiled every time. That still works, but there's no gain.
- **Custom elements** are created with `document.importNode`, which upgrades them before Tree sets any property, so setters run as with `createElement`. Two differences:
  - every element of an instance is constructed before any pattern is applied;
  - baked attributes are already present at construction, so they arrive through `attributeChangedCallback`.
- **Attribute order:** baked attributes come before per-instance ones. That's visible in `outerHTML`, though not to selectors or `getAttribute`.
- **Permissions:** with a permission processor, a literal attribute it would refuse isn't baked. It's applied, and refused, per instance, as without `compile`.
- **The value:** `compile: 'some-name'` currently works like `true`. The name is reserved for server-rendered templates (planned).
- **Loading:** the compiler (`handlers/compileTree.js`) is only downloaded for trees with `compile`, so trees without it don't pay for it.

### When it helps: measured

Compiling speeds up **creating** elements. Rebinding is unchanged, by design. How much depends on how much of the markup is static, and on how much of the time is the browser's own layout and paint.

**Static-heavy cards, build only** ([`demos/tree-benchmark.html`](../demos/tree-benchmark.html)): 16 elements, 3 bound values, 24 statics. One fresh page per approach, 3 runs × 11 samples, `?layout=0`.

| Create (vs. today's Tree) | Chromium | Firefox | WebKit |
|---|---|---|---|
| `compile`, statics written as ` :=`, 1,000 cards | 1.18–1.42× faster | 1.60–1.92× | 1.60–1.70× |
| the same, 10,000 cards | 1.19–1.21× | 1.78–1.94× | 1.71–1.83× |
| `compile` with property statics (`className: …`) | ~1.0× (no gain) | 1.30–1.39× | 1.25–1.32× |
| compiled, vs. hand-written template cloning | 1.06–1.19× of it | 1.13–1.18× | 1.17–1.25× |

**Rows with layout** ([`demos/js-framework-benchmark-tree.html`](../demos/js-framework-benchmark-tree.html)): the js-framework-benchmark rows, timed until the next frame is rendered. 9 samples per page.

| Tree → Tree `compile` (ms) | Chromium | Firefox |
|---|---|---|
| Create 1,000 | 24.0 → 23.5 | 23 → 22 |
| Append 1,000 | 46.7 → 31.2 | 34 → 28 |
| Create 10,000 | 296.9 → 261.3 | 259 → 224 |

**What this says:**
- **The gain comes from baking, not from cloning.** Write statics as ` :=` attributes and literal text. In Chromium, whose `createElement` is fast, compiling *without* ` :=` statics gains nothing.
- **Compiled Tree is close to the floor:** within ~1.1–1.25× of hand-written template cloning.
- **Layout and paint shrink the visible gain.** With rows rendered on screen, a large part of each total is the browser's work. The benchmark pages show both a **total** and a **script** time (until the rows are handed to the browser), and offer **`?cv`** (`content-visibility: auto` on rows), which removes most off-screen layout.
- **Use it for large or frequently created lists with static markup.** For small trees the one-time compile isn't worth it.

## Performance Notes

- Everything inside the handler is synchronous.
- **Fast path:** a pattern whose keys are all plain property names (after `aka`), and whose values are all literals or `?.` paths, is compiled once per pattern object and applied directly: each path is navigated, and each value assigned. `getValues` and `assignGingerly` are skipped, with the same results. That's most Tree patterns (`{ className: 'card', _: '?.name' }`, string patterns). Anything else (operator keys, `$root` / `$parent` / `$0`, `!` negation, protocols, object values) falls back as described next. So do calls with `withMethods`, `akaMethods`, substitutions, `pin` / `at`, or a permission processor. A path segment that's aliased or names a pipe is resolved through `getValue`.
- Other patterns with only plain keys skip assignFrom's key categorization (cached per pattern object) and go straight to `getValues` + `assignGingerly`. Patterns with operator keys go through `assignFrom`.
- **Literal keys aren't re-applied on rebind.** When an element is rebound with the *same pattern object* (and the same effective `aka`) as last time, its literal values (`className: 'card'`, `['dt', 'Height']`) are skipped, because they can't have changed. Only the bound values are re-applied. The one consequence: if other code changes such a property directly, a rerun won't restore it. Configs written inline (new objects on every call) always re-apply everything.
- **Unchanged text isn't rewritten.** On the fast path, `textContent` is only assigned when the text actually differs. Re-assigning the same string would replace the text node for nothing (and fire `MutationObserver`s). Other properties are always assigned, so setters keep running as before.
