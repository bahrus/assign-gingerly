# builtIns.scope

`builtIns.scope` binds an **existing** element's scope, typically server-rendered markup, against a sub-value of the view model, optionally through an [itemscope manager](../README.md#itemscope-managers-chrome-146).

[`builtIns.tree`](./tree.md) *creates* a scope from a spec. `builtIns.scope` takes over one that's already there. The same manager class works with both.

**Demo:** [demos/ssr-manager-demo.html](../demos/ssr-manager-demo.html). Run `npm run serve`, then open `/demos/ssr-manager-demo.html`.

## Example

The server rendered this. The attributes say what's what:

```html
<section itemprop="rocket" itemscope="rocket-manager" class="card rocket">
    <h3 itemprop="title">Rocket: Falcon 9</h3>
    <div class="spec">
        <span class="label">Height</span>
        <button type="button" class="inc">Increase by one</button>
        <span itemprop="heightLabel">70 m</span>
    </div>
</section>
```

```JavaScript
import { assignFromAsync, ItemscopeRegistry } from 'assign-gingerly';

class RocketManager {
    #extraMeters = 0;
    #rebind;
    constructor(element, initVals, { rebind }) {
        Object.assign(this, initVals);   // vm.rocket
        this.#rebind = rebind;
    }
    get title() { return `Rocket: ${this.name}`; }
    get heightLabel() { return `${this.height.meters + this.#extraMeters} m`; }
    increaseHeightByOne() { this.#extraMeters++; this.#rebind(); }
}

await assignFromAsync(details, {
    '?.querySelector?.section =>': {
        do: 'builtIns.scope',
        bind: {
            infer: { byItemprop: true },
            pattern: { '?.querySelector?.button +=': { on: 'click', call: 'increaseHeightByOne' } },
            withMethods: ['querySelector'],
        },
    },
}, {
    from: vm,
    withMethods: ['querySelector'],
    registry: { itemscopeRegistry: new ItemscopeRegistry({ 'rocket-manager': RocketManager }) },
});
```

What happens:
1. **The value** is `vm.rocket`, from `itemprop="rocket"`.
2. **The manager** is `rocket-manager`, from `itemscope="rocket-manager"`. It's attached as `section.ish`, constructed with `vm.rocket`, and given `ctx.rebind()`.
3. **The binding** runs `assignFrom(section, bind.pattern, { …bind, from: theManager })`:
   - `infer` fills `title` and `heightLabel` from the manager's getters;
   - the pattern makes the button call `increaseHeightByOne` on the manager.
4. **Rebinding:** `increaseHeightByOne` calls `ctx.rebind()`, which re-runs step 3.

## Config

```TypeScript
interface ScopeConfig {
    do: 'builtIns.scope';
    get?: { value?: string };                // what the scope binds to (default: from[itemprop])
    ish?: string | ManagerClass;             // the manager (default: the itemscope attribute's name)
    bind?: { pattern?: Pattern } & AssignFromOptions;   // minus from / fromStack
}
```

| What | Default | Override |
|---|---|---|
| **The value** | `from[itemprop]`, from the element's `itemprop` attribute | `get: { value: '?.path' }`; `get: { value: '?.' }` for the whole `from` |
| **The manager** | The name in `itemscope="…"`, if any | `ish: 'name'` or `ish: SomeClass` |
| **The scope's view model** (`from` inside `bind`) | The manager instance, if there's a manager; else the value | (none) |

- **No value, no guess:** with neither an `itemprop` nor `get.value`, it throws, and the message says to add one (`get: { value: '?.' }` to keep the whole `from`).
- **Managers are optional.** A bare `itemscope`, or none at all, means the value itself is the view model: "zoom in on a sub-object, and bind it".
- **Manager names** resolve through the [`registry` option](./code-interjection.md#the-registry-option) first. An unregistered name is **waited for**, as for `ish`, which is why this is a ` =>` handler. A class is used directly and registered nowhere.

## The binding

`bind` is one `assignFrom` call on the element:
- **`bind.pattern`** is its pattern.
- **The other `bind` keys are its options:** `infer`, `withMethods`, `pin`, `aka`, ….
- **`from`** is the scope's view model.
- **Inherited from the outer call:** `pipes`, `protocols`, `registry`, `handlers`, `signal` and `aka`.

**Inside the scope:**
- **`$parent`** is the outer `from`, and **`$root`** the top-level one, with or without `itemscope`.
- **Event bindings** (` +=`) have the view model as their host, so `call` reaches manager methods. They get default dedup keys, so running again replaces the listeners rather than stacking them. As everywhere, a listener is attached once the event-binding module has loaded, just after the call.
- **`infer: { byItemprop: true }`** binds every itemprop in the element's own scope that the view model has, **getters included**. See [inferred-assignments.md](./inferred-assignments.md#infer-all-keys).

## `infer` keeps its covenant

`infer` never enters a nested `itemscope` by itself, and `builtIns.scope` doesn't change that. Stepping into a scope is explicit: you target the scope's element with `builtIns.scope`.

An outer `infer` and `builtIns.scope` combine naturally:
- **The outer `infer`** fills the outer itemprops. For an element like `<section itemprop="rocket" itemscope="rocket-manager">`, it also routes `vm.rocket` into `section.ish`.
- **`builtIns.scope`** then binds the inside. It reuses a manager that's already attached.

## Pending marks (`data-residue`)

Server-rendered markup (e.g. from [o2h](https://github.com/bahrus/o2h)) can mark elements still waiting for something with `data-residue`, which CSS can hide until then. `builtIns.scope` removes the element's mark after its first bind. So a manager's scope stays hidden until it's really bound against the manager.

If the page also has a residue, apply it first with [`applyResidue`](./tree.md#finishing-server-html-on-the-client-applyresidue): once the mark is gone, `applyResidue` no longer finds the element.

## Rebinding and reruns

| Event | What happens |
|---|---|
| The manager calls `ctx.rebind()` | `bind` re-runs against the manager |
| An async `onAssigned` settles | `bind` re-runs |
| The same `assignFrom` runs again (new data) | The new value is assigned to `el.ish` (merged into the same manager) or becomes the new view model; `bind` re-runs. The manager is attached only once. |

**Outside `builtIns.tree` and `builtIns.scope`**, a manager attached by a bare `el.ish = …` still gets `ctx.rebind()`, as a no-op. So a manager written for Tree, with `constructor(el, initVals, { rebind })`, works anywhere.
