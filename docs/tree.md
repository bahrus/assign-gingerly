# builtIns.tree

A handler that builds a small tree of elements from a view model, and rebinds it in place on later calls. Each `map` entry pairs a VM key with an **element specification**: a tag name, or a tuple of tag, assignFrom pattern, and static children.

Tree adds no microdata and doesn't adopt existing (server-rendered) markup. It aims at simple scenarios.

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

## Element Specifications

```TypeScript
type ElementSpecification =
    | Header
    | [Header, Pattern]
    | [Header, Pattern, ElementSpecification[]];

type Header = tagName | { tag: tagName; ish?: string | ManagerClass };   // see Itemscope Managers below
```

- **The pattern** is an [assignFrom](./assignFrom.md) pattern applied to the created element, with `from` set to **the key's VM value**. So `'?.small'` above reads `vm.patch.small`.
- **Children** are static structure. Their patterns resolve against **the same value as their parent**:

  ```JavaScript
  rocket: ['section', { className: 'card' }, [
      ['h3', { textContent: '?.name' }],     // vm.rocket.name
      ['p',  { textContent: '?.type' }],     // vm.rocket.type
  ]]
  ```

- **The whole VM** is available as `$parent` (and `$root`, for a top-level tree), at every depth: `'$parent?.upcoming'`. See [root-references.md](./root-references.md).
- **`template` elements** receive their children in `.content`, not as light-DOM children.
- **Patterns set properties** (via assignGingerly), not attributes.
- **Formatting** (dates, units, conditional text) comes from [pipes](./pipes.md) passed in the options: `'?.date_utc?.parseDate?.longUtc'`.
- **Don't combine `textContent` with children**: setting `textContent` replaces them. Tree puts them back on the next call, after the text.

Bare class headers and `$:` headers are reserved for a later phase and throw for now. Use `{ tag, ish }` instead.

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
}
```

The types live in `types/assign-gingerly/treeTypes.d.ts`.

## Performance Notes

- Everything inside the handler is synchronous.
- Patterns with only plain keys (no ` =>`, ` ?=`, ` =&`, ` =*` or `#[x]` keys) skip assignFrom's key categorization: the result is cached per pattern object, and they go straight to `getValues` + `assignGingerly`. Other patterns go through `assignFrom`.
