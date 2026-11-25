# Dispatching to another element: `dispatch.to`

Follows on from [AddEventListener](../AddEventListener.md) and [DispatchSupport](./DispatchSupport.md).

---

## AI Proposal

**Status:** proposal only. Nothing in the repo has been changed.

### The problem

An event binding's `dispatch` can only fire from the element with the listener (`lhs.dispatchEvent(evt)`, at the end of [handlers/addEventListener.ts](../../../../../handlers/addEventListener.ts)).

That isn't enough when the listener's job is to change *another* element and then announce it. [chip-away](https://github.com/bahrus/chip-away) is the motivating case. Each chip's ✕ deselects an `<option>` in a `<select>` elsewhere on the page:

```JS
['button', { ' +=': {
    on: 'click',
    '?.selected': false,            // the host is the <option>, so this works
    dispatch: { type: 'change' }    // fires from the button: the <select> never sees it
} }]
```

Setting `option.selected` from script fires no event, so whoever does it has to dispatch `change` on the `<select>`. Today that needs JavaScript. It's the first gap found in exploring chip-away as JSON only (chip-away's `Chats/UseTreeInsteadOfChipAwayElement.md`).

### The proposal

Add an optional **`to`** to `DispatchEventConfig`: a path to the `EventTarget` to dispatch from.

```JS
dispatch: { type: 'change', to: '?.closest?.select' }
```

```TypeScript
export interface DispatchEventConfig {
    type?: string,
    /** What to dispatch from. A path, resolved against the host when the event fires. Default: the element with the listener. */
    to?: string | EventTarget,
    ...
}
```

| `to` | Dispatches from |
|---|---|
| omitted | The element with the listener, as today |
| `'?.'` | The host itself |
| `'?.closest?.select'` | A path from the host (`closest` in `withMethods`) |
| `'$parent'`, `'$root?.x'` | The enclosing VMs. In a Tree repeat over a select's options, `$parent` is the select, with no `withMethods` needed |
| `'$0?.form'` | A path from the target (the first argument to `assignFrom`) |
| an `EventTarget` | That object (from JavaScript) |

For chip-away: each option's ✕ uses `to: '?.closest?.select'`, and "clear all", whose host is the select, uses `to: '?.'`.

### Semantics

1. **Resolved against the host** (`options.from`). Bare shorthand keys already go *to* the host, so a path from the host reads consistently. In Tree, the host is the item, which is usually the natural starting point.

2. **Resolved when the event fires, before `call` and the assignments run.** At bind time would be too early: the host's references may not exist yet. *After* the assignments is risky: an assignment may move or remove the very thing the path starts from (removing an item, say), so `closest` would find nothing. The dispatch itself still happens last, as now.

3. **Not resolved when it's under `get`.** `get.dispatch` is resolved at bind time, so there a path has already become an `EventTarget` by then. That works without extra code, but captures the target early. I'd document top-level `dispatch` as the form to use.

4. **Nothing found:** `console.warn` naming the path, and no dispatch. I'd rather not fall back to the listening element, since that fires an event somewhere the author didn't ask for. A warning rather than a throw, because a missing target (an element already removed) can be legitimate.

5. **Not an `EventTarget`:** the same warning. I'd test `instanceof EventTarget`, so `window`, `document`, or a VM that extends `EventTarget` all work.

6. **One target.** A list of elements could be supported later (`@each`?). I'd leave it out until there's a need.

7. **Inherited options** apply (`withMethods`, `aka`, `pipes`, `fromStack`, and so on), as they do for the vectors.

8. **Permissions:** the path goes through `getValue` with the permission processor, so restricted methods are respected while resolving. `dispatchEvent` is called directly, as today.

### Implementation sketch

In `attachEventListener`:

```TypeScript
lhs.addEventListener(eventName, (event: Event) => {
    if (stopPropagation) event.stopPropagation();
    if (preventDefault) event.preventDefault();

    const dispatchConfig = dispatch || getDispatch;
    // Before anything runs: an assignment may move what the path starts from
    const dispatchFrom = resolveDispatchTarget(dispatchConfig?.to, lhs, host, target, inheritedOptions, permissionProcessor);

    ... // call, then the vectors, unchanged

    if (dispatchConfig?.type) {
        ...
        if (dispatchFrom instanceof EventTarget) dispatchFrom.dispatchEvent(evt);
        else console.warn(`addEventListener: dispatch "to" (${String(dispatchConfig.to)}) is not an EventTarget; "${dispatchConfig.type}" was not dispatched.`);
    }
}, ...);

function resolveDispatchTarget(to, lhs, host, target, options, permissionProcessor) {
    if (to === undefined) return lhs;
    if (typeof to !== 'string') return to;
    return getValue(to, host, { ...options, root: target, permissionProcessor });
}
```

That's about 10 lines, in a module that only loads when an event binding is used. Nothing else in the package needs to change: config objects other than `get` already arrive unresolved (`isEventBinding`), and compiled trees treat event bindings as opaque.

### What I checked

I patched a copy of `handlers/addEventListener.js` (0.0.109) and served it only to a test browser (Chromium):

| Config | Result |
|---|---|
| Today, `{ type: 'change' }`, and with an ignored `to` | Select's listener: 0 calls |
| Patched, no `to` | 0 calls, as today |
| `to: '?.closest?.select'` | 1 call, after the option was deselected |
| `to: '$parent'` (a Tree repeat over the options) | 1 call, after the option was deselected |
| `to: '?.nope'` | Warning, no call |

The chip-away JSON prototype (with its three function pipes), with `to` added, passes its 10 example pages. After clicking a chip's ✕, a `change` listener on the select now fires once (it was 0). The prototype also no longer needs its extra `change` listener on the host.

**Not checked:** `'$0'`, an `EventTarget` instance as `to`, `get.dispatch`, permissions, Firefox and WebKit.

### Related things I noticed

These are separate, and I'd decide on each independently. The first two matter for chip-away.

1. **`eventCtr` as a string does nothing.** The type allows `string`, but the code only honors a function, so JSON always gets a `CustomEvent`. A real `change` is a plain `Event`. *Suggestion:* accept the names of a small set of constructors (`'Event'`, `'CustomEvent'`, perhaps `'InputEvent'`), and warn for others. I tried `eventCtr: 'Event'` in the same patch and it worked.

2. **`composed` defaults to `true`.** A real `change` isn't composed. With the default, a `change` re-fired on a select inside a shadow root would leak out. Configs can say `composed: false`, so this needs documenting more than changing. ([DispatchSupport](./DispatchSupport.md) sketched `false` as the default, but changing it now could break users.)

3. **The documentation says `dispatch` runs "after processing all assignment vectors". It doesn't, for dynamic ones.** `fromLHS`, `fromHost`, `fromTarget` and `fromEvent` apply after an `import()`, so `dispatch` gets there first. **Measured:** with `fromLHS: { '?.v': '?.dataset?.v' }`, a listener for the dispatched event still saw the *old* value on the first click. Static keys (like chip-away's) aren't affected. *Suggestion:* either await those imports before dispatching, or import `assignFrom` when the listener is attached so the vectors run synchronously. The second also keeps the dispatch within the original event, so I prefer it.

4. **`dispatch` inside a vector** (`fromLHS: { dispatch }`) is in the types, but never runs. Either implement it or remove it from `AssignDispatchVector`.

5. **The `key` option isn't in the types** (`get.key` in `AddEventListenerConfig`), though it's documented and used.

6. **I found no tests for `dispatch`** in `tests/event-binding.*`.

### Suggested tests

- Without `to`: fires from the listening element (a regression test, since there's none now).
- `to` with a host path, `'?.'`, `'$parent'`, `'$0'`, and an `EventTarget`.
- The target is resolved before the assignments: an assignment that detaches the host's element doesn't change where the event goes.
- Static assignments are visible to the dispatched event's listeners.
- A path leading nowhere, and one leading to something that isn't an `EventTarget`: warning, no dispatch.
- In `builtIns.tree`: a repeat over a select's options, rerun several times, dispatches once per click.

### Documentation

`docs/event-binding.md`, "Dispatching Custom Events": add `to` (and correct the ordering sentence, per item 3).

### Naming

I chose **`to`** to match `toHost` / `toLHS` / `toTarget`. The alternative I considered was `from`, as in "dispatch from", but `from` already means "where values are read".

### Questions

1. Is `to` the right name?
2. Resolve before the assignments (as proposed), or after?
3. Warn when nothing is found, or throw?
4. Should I include related items 1 and 3 in the same change? I'd include 1, as chip-away wants it, and do 3 separately since it changes timing.

## Bruce's Response I

> 1. Is `to` the right name?

I also think `from` reads more naturally, but I see your point about the `from` prefix being associated with assignFrom actions.

What are some negatives of using `at`?

If there are some significant negatives, let me think further before implementing.

> 2. Resolve before the assignments (as proposed), or after?

Let's go with before, where dispatch already happens.

> 3. Warn when nothing is found, or throw?

Warn.

> 4. Should I include related items 1 and 3 in the same change? I'd include 1, as chip-away wants it, and do 3 separately since it changes timing.

I agree.  Do related item 1.

Please add further clarifications needed below, or if none needed, implementation notes.



## Claude's Response I

### Negatives of `at`

1. **It's already an option name.** `at` in `assignFrom` options finds elements by child index (`at: { title: [0] }`), and can appear in the same event config, under `withOptions`. This is the main one. The two don't collide: different level, and different shape (an object of index paths, versus a path or an `EventTarget`).
2. **It breaks the pattern of `toHost` / `toLHS` / `toTarget`.** Though those say where values are *assigned*, so being different arguably helps.
3. **It could be read as a time** ("dispatch at 5 o'clock"). Unlikely, given path values.

In its favor: the specs use this word ("*fire an event* named `change` *at* the select", "at target").

**I don't think these are significant, so I went ahead with `at`.** If the first one bothers you, renaming is small: the type, `handlers/addEventListener.ts`, its tests and its docs.

### Implementation notes

- **`handlers/addEventListener.ts`:**
  - **`dispatch.at`**, as proposed for `to`. It's resolved when the event fires, before `call` and the assignments.
  - **I read "before, where dispatch already happens" as being about resolving only.** The dispatch itself still comes last, where it was. Please say if you meant the dispatch should move.
  - **Nothing found, or not an `EventTarget`:** a warning, and no dispatch. The assignments still run.
  - **`eventCtr` by name** (related item 1): `'Event'` and `'CustomEvent'`. Any other string warns, and a `CustomEvent` is dispatched, as before. I left out `'InputEvent'`: without passing `data` and `inputType` through, it would add little.
- **`types/assign-gingerly/types.d.ts`:** `at`, and comments. This is in the `types` submodule, so it needs its own commit. I left the copy under `inferencer/types` alone.
- **`docs/event-binding.md`:** `at`, `eventCtr`, and the ordering sentence, which now describes what happens today (related item 3).
- **`tests/event-binding.html`:** tests 7–14, covering your answers and the proposal's suggested tests, plus a restricted method in the path, and `eventCtr`.

I edited only sources. Your running `tsc --watch` rebuilt `handlers/addEventListener.js`.

### Test results

Run on a copy of the repo, built there (the type check is clean):

- **Event binding:** 51 of 51 checks pass, in Chromium, Firefox and WebKit.
- **Full suite, first run:** 180 passed, 18 skipped, and 3 failed, all in Firefox, `event-binding` among them. Its 51 checks had passed; the errors I could see were Firefox crashing or closing as the test ended.
- **Reruns:** those three passed three times in a row, and the full suite without the benchmarks passed (179, 16 skipped). The original code passed the full suite twice (183, 18 skipped), so I can't show that the flakiness predates this change, but it looks like load during the benchmarks.

**Not done:** related items 2–6 (3 separately, as agreed), and trying it in chip-away itself.
