# Event bindings from several hosts on one element: `get.key` and `keyScope`

Follows on from [AddEventListener](../AddEventListener.md) and [DispatchTo](./DispatchTo.md).

---

## AI Proposal

**Status:** proposal only. Nothing else in the repo has been changed.

### What `get.key` is

`get.key` is how an event binding avoids being added twice. It comes from "Preventing Duplicate Event Handlers" in [AddEventListener](../AddEventListener.md): when the same `assignFrom` call is repeated, only the last one should prevail.

Without it, each call adds another listener:

```JS
const vm = { els: [select], n: 0 };
const pattern = { '?.els?.@each +=': { on: 'change', '?.n +=': 1 } };

assignFrom(vm, pattern, { from: vm });
assignFrom(vm, pattern, { from: vm });
assignFrom(vm, pattern, { from: vm });
// one change event: vm.n === 3
```

With a key, each call aborts the previous listener that has the same key on the same element:

```JS
{ on: 'change', get: { key: 'k' }, '?.n +=': 1 }
// the same three calls, one change event: vm.n === 1
```

**You rarely write it yourself,** which may be why it's easy to forget. `builtIns.tree` and `builtIns.scope` add one to every event binding that lacks it (`withEventKeys` in [handlers/eventKeys.ts](../../../../../handlers/eventKeys.ts)), because they re-apply patterns on every run.

**How it's stored** ([handlers/addEventListener.ts](../../../../../handlers/addEventListener.ts)):

```TypeScript
const keyMap = new WeakMap<Element, Map<string, AbortController>>();   // element → key → controller
```

### The problem: two hosts, one element

The host (`options.from`) isn't part of that lookup. That's fine when each element belongs to one host, as with elements Tree created. It isn't when several hosts listen to an element **none of them owns**.

Two chip-aways showing the same select, for example one in the page and one in a summary panel:

```html
<select id=colors multiple>
    <option selected>Red</option>
    <option>Green</option>
</select>

<chip-away for=colors></chip-away>
<chip-away for=colors></chip-away>
```

In the JSON-only chip-away prototype, each instance listens to the selects it references, and re-renders when one changes:

```JS
{
    ifKeyIn: ['selects'],
    assign: {
        '?.selects?.@each +=': {
            on: 'change',
            get: { key: 'chip-away' },   // this merge reruns whenever `selects` changes
            '?.rev +=': 1                // bump the host's `rev`, which triggers a re-render
        }
    }
}
```

Both instances run the same config, so both use the key `chip-away` on the same `<select>`:

| Step | `keyMap` for `#colors` | Listening |
|---|---|---|
| First chip-away binds | `chip-away` → its controller | First |
| Second chip-away binds | Aborts the first's controller, stores its own | **Second only** |
| The user selects Green | | First still shows Red; second shows Red, Green |

Nothing is logged. The author can't see the collision coming either, since each instance is correct on its own.

### The proposal

Let a binding say that its key is per host:

```JS
get: { key: 'chip-away', keyScope: 'host' }
```

| `keyScope` | A new binding replaces the one with the same key on the same element… |
|---|---|
| omitted | from **any** host, as today |
| `'host'` | from the **same** host |

```TypeScript
get?: {
    /** Dedup: a new binding with this key replaces the previous one on the same element. */
    key?: string,
    /** 'host': replace only a binding from the same host (`options.from`). Default: from any host. */
    keyScope?: 'host',
    ...
}
```

(`key` isn't in the types today, so this adds both.)

### Why it's opt-in

It would be simpler to always include the host, but the current behavior is needed. Often a rerun has a **new** host that should replace the old one: a fresh view model from an API, or a Tree item whose value changed. Measured, with a new `from` object on each call:

| | Old host | New host |
|---|---|---|
| `key` alone, as today | 0 calls | 1 call |
| `key` with `keyScope: 'host'` | **1 call** (stale, and still listening) | 1 call |

So the rule of thumb for the docs would be:
- **The host is replaced between runs** (view models, Tree items): `key` alone.
- **The host stays, and the element is shared** (a custom element listening to elements outside itself): `keyScope: 'host'`.

### Semantics

1. **Nothing changes without `keyScope`.** Tree's and scope's default keys are unaffected.
2. **The two kinds don't see each other.** A host-scoped `chip-away` and a plain `chip-away` on one element coexist.
3. **`keyScope` without `key`** does nothing. I'd `console.warn`, since it's certainly a mistake.
4. **A host that's a primitive** (an array of strings in a repeat) can't key a `WeakMap`. I'd fall back to today's behavior.
5. **An unknown `keyScope` value:** a warning, and today's behavior.
6. **Memory:** hosts are held weakly by the lookup. But the listener itself holds its host for as long as the element lives. `keyScope` doesn't change that; see item 1 under "Related".

### Implementation sketch

```TypeScript
const keyMap = new WeakMap<Element, Map<string, AbortController>>();
const hostKeyMap = new WeakMap<Element, WeakMap<object, Map<string, AbortController>>>();

function keysFor(lhs: Element, host: any, keyScope: unknown): Map<string, AbortController> {
    if (keyScope === 'host' && host !== null && (typeof host === 'object' || typeof host === 'function')) {
        let hosts = hostKeyMap.get(lhs);
        if (!hosts) hostKeyMap.set(lhs, hosts = new WeakMap());
        let keys = hosts.get(host);
        if (!keys) hosts.set(host, keys = new Map());
        return keys;
    }
    let keys = keyMap.get(lhs);
    if (!keys) keyMap.set(lhs, keys = new Map());
    return keys;
}
```

`attachEventListener` then uses `keysFor(lhs, host, keyScope)` where it now looks in `keyMap`. Everything else stays as it is.

### Alternatives

**No code change: a key that's a path.** `get` is resolved against the host when binding, so this already works today, if each host has a unique string:

```JS
get: { key: '?.uid' }     // measured: two hosts, each bound 3 times → 1 call each
```

The catch is that the host needs a `uid`, and JSON alone can't generate one.

**`key: '?.'`, the host itself as the key,** also works today, by accident: the `Map` accepts any key. Measured: two hosts, each bound 3 times → 1 call each. Two catches:
- **One binding per element and host.** A `change` and an `input` binding with `key: '?.'` collide, as they have the same key. Measured: only one survives.
- **The map holds the host strongly** while the element lives.

For chip-away, which has one binding per select, `'?.'` would do. I'd still prefer `keyScope`, because it reads as what it means and has no such trap.

**A composite key, `key: ['?.', 'change']`,** would need nested maps too, and array paths only resolve through `assignFrom`. No simpler than `keyScope`.

### What I checked

A patched copy of 0.0.110's `handlers/addEventListener.js`, served only to a test browser (Chromium):

| | Today | With `keyScope: 'host'` |
|---|---|---|
| One host, key, bound 3 times | 1 call | (unchanged without `keyScope`) |
| Two hosts, same key, each bound 3 times | One host gets 1 call, the other **0** | 1 call each |
| Chip-away prototype: two on one select, then a second option selected | 1 chip and 2 chips | **2 and 2** |
| Chip-away prototype, its 10 example pages | Pass | Pass |

That prototype still uses its three function pipes. It ran on 0.0.110, with `dispatch.at`: a `change` listener on the select fires once when a chip is removed, so gap 1 is closed.

**Not checked:** the warnings, primitive hosts, `assignGingerly` without `assignFrom`, Firefox and WebKit.

### Related things I found

Each is separate.

1. **`key` makes `abortController` do nothing.** With both, the code takes the `key` branch and never looks at `abortController`. Measured: after `abort()`, the listener still fires (without `key`, it stops). This matters to chip-away, which needs both: `key` for reruns, and a controller to stop listening on disconnect. *Suggestion:* stop on either, with `AbortSignal.any([controller.signal, abortController.signal])`. I tried that in the same patch, and it worked, also together with `keyScope` (aborting one host's left the other's alone).

2. **The first bindings on a page can attach out of order, so the wrong one can win.** Until `handlers/addEventListener.js` has loaded, each binding makes its own `import()`, and the promises don't settle in call order. Measured with four bindings on one element, over 6 runs each: with `@each`, the order was 3, 4, 1, 2 in five runs and 4, 2, 1, 3 in one; without it, 3, 4, 1, 2 in all six. (An earlier batch had a few runs in call order, so it varies.) With `key`, "the last call prevails" then fails: I saw the **first** of two hosts win. Once the module is loaded, the order is right. *Suggestion:* keep the `import()` promise in a module-level variable in `assignGingerly.ts`, so that every binding waits on the same one:

   ```TypeScript
   let eventModule: Promise<typeof import('./handlers/addEventListener.js')> | undefined;
   // in bindEvent:
   (eventModule ??= import('./handlers/addEventListener.js')).then(...)
   ```

   With that, the order was right in 8 of 8 runs, both ways. One thing to handle: if the import fails, clear the variable so a later call can retry.

3. **Nothing stops listening to an element that's no longer relevant**, for example a select dropped from `for`. Item 1 gives JSON a way to stop *if* the host has a controller, but I found no declarative way to make one per connection. That may be roundabout's job.

I'd do 1 and 2 along with `keyScope`, as all three are about a keyed listener ending when it should. 2 is a bug that can affect anyone today.

### Suggested tests

- `key` alone: replaces across reruns, and across hosts (regression).
- `keyScope: 'host'`: two hosts both hear the event; each is still deduped on its own reruns.
- A plain and a host-scoped binding with the same key coexist.
- Primitive host, missing `key`, unknown `keyScope`.
- `key` with `abortController`: aborting stops the listener; a later rerun with a fresh controller listens again.
- Several bindings made before the module loads: attach order, and the last one prevailing. This needs a fresh page, since the module stays loaded.

### Documentation

`docs/event-binding.md`, "Dedup with `key`": the rule of thumb above, and the two-hosts example.

### Questions

1. Is `keyScope: 'host'` good, or would you prefer something shorter, such as `perHost: true`? I chose a string so that other scopes could be added.
2. Should related items 1 and 2 go in the same change?
3. Is the fallback for a primitive host acceptable, or should it warn?

## Bruce's Response I

> 1. Is `keyScope: 'host'` good,

Yes, it's fine.

> 2. Should related items 1 and 2 go in the same change?

Yes, please.

> 3. Is the fallback for a primitive host acceptable, or should it warn?

Fallback


## Claude's Implementation Notes I

No clarifications were needed. `keyScope: 'host'` is in, along with related items 1 and 2.

### What changed

- **`handlers/addEventListener.ts`:**
  - **`keyScope: 'host'`**, with a second lookup (element → host → key), as sketched. A primitive host falls back silently. An unknown value, or `keyScope` without a `key`, warns.
  - **`key` with `abortController`** (item 1): either one stops the listener, through `AbortSignal.any`. Binding a key again doesn't abort the author's controller, and binding with a controller that's already aborted attaches nothing. `AbortSignal.any` is only called when a binding has both.
- **`assignGingerly.ts`** (item 2): all bindings wait on one `import()` promise, so they attach in call order. A failed load clears it, so a later binding can retry.
- **`types/assign-gingerly/types.d.ts`:** `key` and `keyScope`. This is in the `types` submodule, so it needs its own commit. I left the copy under `inferencer/types` alone.
- **`docs/event-binding.md`:** the two-hosts example, the rule of thumb, and how `key` and `abortController` combine.
- **Tests:** 15–21 in `tests/event-binding.html`, and a new page and spec, `tests/event-binding-order`, which needs the module not to be loaded yet.

I edited only sources. Your `tsc --watch` rebuilt the two `.js` files.

### Test results

Run on a copy of the repo, built there (the type check is clean), in Chromium, Firefox and WebKit:

- **Event binding:** 66 of 66 checks, 3 runs in each browser.
- **Order:** passes, 3 runs in each browser. With the previous `assignGingerly.js` it fails, with orders such as `2,7,8,1,4,6,3,5`, so it does catch the bug.
- **Full suite:** 186 passed, 18 skipped, none failed. (The Firefox failures I noted in DispatchTo didn't recur.)

### Not done or not tested

- **The retry after a failed import** has no test. A browser may also remember the failure itself, in which case clearing the promise doesn't help.
- **Chip-away** itself: I didn't run the prototype against this.
- **Related item 3** (stopping on elements that are no longer relevant): left as is. A host-scoped listener also keeps its host alive until it's aborted or the element goes.
- **Noticed:** `get.options.signal` overrides both `key` and `abortController`, because the options are spread over the signal. That was already so, and I left it. The same `AbortSignal.any` would fix it.
