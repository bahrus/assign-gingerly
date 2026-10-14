# Finding Host Should Taken Into Account Itemscope Managers

## Bruce's Ask

Suppose we want to place a button in the demo, just to the right of the "Height" label, that says "Increase by one".  So we add a method to the RocketManager:  increaseHeightByOne.

I would like to use the += operator to attach that event handler, so clicking on the button invokes the method.

I suspect the current code that finds the host won't find the RocketManager, because we aren't adding the rocket-manager attribute.  I'm not necessarily recommending we have a knee jerk reaction to this, and use this as a reason to add the attribute automatically.  Unless you honestly think that is the best solution.

Can you investigate how this could work, and provide your recommendation for the best solution to this below?

## Claude's Investigation

### Short answer

**No attribute is needed, and host-finding isn't actually involved.** ` +=` event binding doesn't search the DOM for a host. It uses **`options.from`** as the host (`attachEventListener(lhs, config, target, options.from ?? target, …)` in `assignGingerly.ts`). Inside a Tree manager's subtree, `options.from` *is* the manager instance, because that's what "the manager is the subtree's view model" means. So a button inside the rocket card would already get `RocketManager` as its host. `getHost()` (`closest('[itemscope]')`) is exported but **not used internally anywhere**. It's a utility for server-rendered/hydration scenarios.

So I'd **not** add the attribute. But making the button work exposed **two pre-existing bugs in ` +=` event binding** and **two Tree-specific gaps**, and they need fixing first.

### What I tested

These are real runs against the current build in Chromium, using the documented example from `docs/event-binding.md`:

```js
assignFrom(root, {
    '?.querySelector?.button +=': { on: 'click', '?.isHappy =!': '.', fromLHS: { '?.age +=': '?.dataset?.diff' } },
}, { from: host, withMethods: ['querySelector'] });
```

| Variant | Result after a click | Expected |
|---|---|---|
| The documented `'?.querySelector?.button +='` | **No listener at all**: `isHappy` false, `age` unchanged | `isHappy` true, `age` + 5 |
| The same config through a plain property path, `'?.btn +='` | `isHappy` true ✓, but **`age` becomes `null`** | `age` + 5 |

### The bugs and gaps

1. **Bug: an LHS ending in a method's argument never binds** (`'?.querySelector?.button +='`).
   - **Cause:** this is the same `lastSegmentConsumed` bug I just fixed in `resolveLhsPath`, but this time in `assignGingerly`'s own operator path. `evaluatePathWithMethods` returns the `<button>` and flags the consumed segment, then the code looks up `button['button']` (`undefined`), so the "Element LHS" check fails.
   - **Scope:** the same pattern likely affects other operator branches in `assignGingerly` that use `evaluatePathWithMethods` (` -=`, ` =!`, …), so I'd fix it in one shared place.
   - **Coverage:** no end-to-end test covers ` +=` event binding; the existing tests call `attachEventListener` directly.
2. **Bug: `assignFrom` resolves event-config paths at *bind* time.**
   - **Cause:** the ` +=` key is a "normal" key, so `assignFrom` passes its RHS (the whole event config) through `getValues`. That recurses into the plain object and resolves `fromLHS: { '?.age +=': '?.dataset?.diff' }` against `from`, *before* any event fires, so `fromLHS` / `fromHost` / `fromEvent` read the wrong source.
   - **Effect:** that's why `age` became `null`.
   - **Fix:** `getValues` (or `assignFrom`) should leave event configs (an object with `on`, under a ` +=` key) unresolved, so they keep their event-time semantics.
3. **Tree gap: an element can't bind its own events.** ` +=` needs a path to a property *holding* an element; `'?. +='` (the element itself) throws. In Tree, the natural place for the button's binding is **the button's own pattern**. Binding from the section's pattern (`'?.querySelector?.button +='`) doesn't work either, because on creation Tree applies the parent's pattern *before* its children exist. Proposed fix: an empty LHS (`' +='` or `'?. +='`) means "the target itself".
4. **Tree gap: reruns would stack listeners.** Tree re-applies every pattern on every call, so each rerun would add another click listener. With bugs 1–3 fixed, I'd expect one click to call the method *N* times after *N* reruns. `get: { key }` dedup exists, but users would have to remember it every time. Proposed fix: **Tree supplies a default dedup key** per element and binding when there isn't one, so a rerun *replaces* the listener. As a bonus, the host is always the current `from`, which matters for non-manager subtrees, where the VM object changes between calls. For manager subtrees it's the same instance anyway.

### What the button would then look like

```js
class RocketManager {
    // …
    increaseHeightByOne() {
        this.height = { ...this.height, meters: this.height.meters + 1, feet: +(this.height.feet + 3.28084).toFixed(1) };
        this.#rebind();   // the card re-renders without a tree rerun
    }
}

// inside the rocket card's children, next to the Height label
['button', { _: 'Increase by one', ' +=': { on: 'click', '?.increaseHeightByOne': [] } }],
```

- The host is the `RocketManager` (the subtree's `from`), and the static vector calls the method. That needs `increaseHeightByOne` in `withMethods`; an array value spreads as the call's arguments.
- **An optional nicety:** a `call` field in the event config, `{ on: 'click', call: 'increaseHeightByOne' }`, would call `host[method](event)` without the `withMethods` ceremony. It's small, readable and JSON-friendly. I'd add it only if you like it.

### If a DOM-side lookup is ever needed

Some code may need to find "the nearest manager" from an arbitrary element (not via `from`). In that case, I'd extend `getHost` to also stop at an ancestor that has an own `ish` property (which `defineIshCore` defines), rather than adding the attribute everywhere. It's a cheap `parentElement` walk. Nothing needs this today, though.

### Recommendation and proposed order

1. **Fix bug 1** (method-argument LHS in `assignGingerly`'s operator paths), with an end-to-end ` +=` test.
2. **Fix bug 2** (don't pre-resolve event configs in `assignFrom`), with a test of the documented `fromLHS` example.
3. **Tree: allow `' +='` on the element itself, plus a default dedup key** (gaps 3 and 4).
4. **Demo:** add the "Increase by one" button to the rocket card.
5. **Optional:** the `call` shorthand.

Bugs 1 and 2 affect the documented event-binding feature everywhere, not just in Tree, so they're worth fixing regardless. I didn't change anything yet, because 1 and 2 touch core `assignGingerly` / `assignFrom` behavior. Shall I go ahead with 1–4? And do you want 5?

## Bruce's Response I

I really like the 5. idea (call shorthand).

So please implement all 5 changes and add your implementation notes below.

## Claude's Implementation Notes

All five are done. Writing the end-to-end tests turned up a **third** pre-existing event-binding bug, which is fixed too.

### 1. Method-argument LHS in `assignGingerly`'s operator paths

`'?.querySelector?.button +='` now binds.
- **The fix:** when `evaluatePathWithMethods` reports `lastSegmentConsumed`, the call's result *is* the LHS.
- **Branches fixed:** the ` +=` branch (event binding only, since there's no parent/key to add a value to) and the ` Y=` (merge) branch.
- **Cleanup:** the three copies of the inline "attach listener" code are now two helpers, `isEventConfig` and `bindEvent`.

### 2. Event configs aren't pre-resolved

`getValues` and `resolveValues` now recognize a ` +=` entry whose value has `on` (`isEventBinding`, exported from `getValues.ts`). For those, they resolve **only the `get` block** at bind time, which keeps `get.abortController: '?.myController'` working (tested). The vectors are left for event time.

### 3. (New) The vector source was overridden by the inherited `from`

Found by the end-to-end test after fixing 1 and 2. In `addEventListener.ts`, `processVector` built `{ from: source, ...inheritedOptions }`, so the inherited options' `from` (the host) **replaced** the vector's source. `fromLHS` / `fromTarget` / `fromEvent` therefore all read the host. It's now `{ ...inheritedOptions, ...vector.withOptions, from: source }`.

With 1–3 fixed, the documented example works: `host.isHappy` toggles, and `host.age` goes 10 → 15. That's numeric ` +=` with `"5"`; I'd initially expected string concatenation.

### 4. Tree: self-binding and a default dedup key

- **Self-binding:** an empty LHS (`' +='` or `'?. +='`) binds on the target itself. This is in `assignGingerly`, so it works everywhere, not just in Tree.
- **Default dedup key:** Tree gives every `' +='` binding without a `get.key` a default key (`builtIns.tree:<pattern key>`), so a rerun **replaces** the listener. The keyed pattern is cached per pattern object, so it isn't rebuilt on every call. A side benefit: the host is always the current `from`. That's tested for a non-manager subtree, where the VM object changes between calls and the click updates the *latest* one.

### 5. `call` shorthand

`{ on: 'click', call: 'increaseHeightByOne' }` calls `host[call](event)` **before** the vectors, with no `withMethods` needed.
- A method the permission processor restricts is **skipped** (the rest of the listener still runs).
- A name that isn't a method on the host throws inside the listener.
- It's in `AddEventListenerConfig` (types) and in the reserved keys.

### Demo

`tree-demo.html` has an **"Increase by one"** button right after the Height label:

```js
spec('Height', '?.heightLabel', ['button', {
    type: 'button', className: 'inc', _: 'Increase by one',
    ' +=': { on: 'click', call: 'increaseHeightByOne' },
}]),
```

- `RocketManager.increaseHeightByOne()` keeps a private `#extraMeters` (manager state, like `metric`), logs, and calls `ctx.rebind()`. `heightLabel` adds it in both units.
- `spec()` gained an optional third argument, for an element placed after the label.
- The host is the card's `RocketManager`. No attribute, no `getHost`.

Checked in Chromium, Firefox and WebKit:
- two clicks give **72 m**, and the toggle shows **236.2 ft**;
- the value **survives "Run again"**;
- after reruns, **one click = one call**;
- the button sits right after the label;
- all other buttons behave as before, with no console errors and no horizontal scroll at 390 px.

### Tests

- **New `tests/event-binding.html` (+ spec):** 6 scenarios, 11 assertions:
  - the documented example via `assignFrom` and `assignFromAsync` (`fromLHS` at event time);
  - `get.abortController` still resolved at bind time;
  - `' +='` / `'?. +='` self-binding;
  - `call` (receives the event, runs before vectors);
  - ` Y=` through `'?.querySelector?.button'`.
- **`tests/tree.html`:** 2 new scenarios (35 in total, **108 assertions**):
  - a button calling a manager method, with one call per click after reruns, and state surviving reruns;
  - in a non-manager subtree, the host follows the latest VM value.
- Both pages pre-load the listener module, so the short waits after binding aren't racing a first-time module fetch. Without that, one browser was flaky.
- **Full suite: 123 passed** (120 + the new spec in 3 browsers). `tsc` is clean, in a scratch copy; no `.js` touched.

### Docs

- **`docs/event-binding.md`:** binding on the target itself, `call`, the host inside Tree manager subtrees, and "when paths are resolved" (`get` at bind time, vectors at event time).
- **`docs/tree.md`:** a new "Events" section (host = `from` / manager, default dedup key, `ctx.rebind()`).

As usual, the repo's generated `.js` is stale until you rebuild.

