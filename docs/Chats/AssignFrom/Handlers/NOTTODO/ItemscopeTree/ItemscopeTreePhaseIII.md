# Itemscope Tree Phase III — `static onAssigned`

Carried over from [Phase II](./ItemscopeTreePhaseII.md) ("Feedback / Questions II") so it can be considered separately. Nothing here is implemented yet.

## Background

Since Phase II, `ish` accepts values of any type. Without a hook, values are merged naively:

| Value | First set (`initVals = Object.assign({}, v)`) | Later sets (`assignGingerly(instance, v)`) |
|---|---|---|
| `'ab'` | `{0:'a', 1:'b'}` | `{0:'a', 1:'b'}` |
| `['x','y']` | `{0:'x', 1:'y'}` | `{0:'x', 1:'y'}` |
| `42`, `true` | `{}` | no-op |
| `null`, `undefined` | `{}` | skipped (Phase II) |V

The goal is to let a manager class decide how a value is applied.

## Proposal

```ts
class ImageHandler {
    constructor(element, initVals) { ... }
    static onAssigned(instance: ImageHandler, value: any, ctx: IshAssignContext) {
        // developer decides how a value (string, array, object, undefined…) is applied
    }
}

/** In types.d.ts, per the AGENTS.md "callback / hook contexts get a named type" rule */
export interface IshAssignContext {
    /** The element whose `ish` was set */
    element: HTMLElement;
    /** Whether this is the value that constructed the instance */
    initial: boolean;
    /** The options in effect */
    options: IAssignGingerlyOptions | undefined;
}
```

This lives in the `ish` setter in `defineIshCore` (`handleIshProperty.ts`), so it applies to **every** `ish` user, not just itemscopeTree. That's intended.

**When `manager.onAssigned` exists:**
- **First set:** `new Manager(element)` with **no `initVals`**, then `Manager.onAssigned(instance, value, { initial: true, … })`. This gives the developer one code path for both the first value and updates.
  - If several values were queued before the manager was registered (the lazy path in `defineIshProperty`), `onAssigned` is called once per value, in order, rather than merging them first.
- **Later sets:** `Manager.onAssigned(instance, value, { initial: false, … })` replaces `assignGingerly`. It's called for `null`/`undefined` too, since the developer decides.
- **Return values:** a returned Promise is awaited inside the existing queue, so values stay in order. The first call stays synchronous unless `onAssigned` itself is async.

**When it doesn't exist:** the table above, unchanged.

## Leanings so far (from Phase II)

- **A.** The constructor gets no `initVals` when `onAssigned` exists. You agreed, pending further thought.
- **B.** The `ctx` shape and the name `IshAssignContext`. You agreed, pending further thought.
- **C.** It lands as its own change. That's this document.

## Bruce's Response

Everything makes sense, and I think I concur with all the recommendations, with one possible exception.

Can you please explain in more detail what is meant by:

> - **Return values:** a returned Promise is awaited inside the existing queue, so values stay in order. The first call stays synchronous unless `onAssigned` itself is async.
---

## Clarification: "Return values"

That bullet was too compressed. It covers three things: **when** `onAssigned` runs relative to `el.ish = v`, **what happens if it's `async`**, and **ordering when values arrive faster than they're handled.**

### How the setter works today

From `defineIshCore`:

```ts
set(newValue) {
    valueQueue.push(newValue);
    if (!managerInstance) {
        managerInstance = new config.manager(element, initVals);   // ← synchronous
        valueQueue.length = 0;
    } else {
        (async () => {                                              // ← fire-and-forget
            while (valueQueue.length > 0) {
                const queuedValue = valueQueue.shift();
                if (queuedValue == null) continue;
                await assignGingerlyFn(managerInstance, queuedValue, options);
            }
        })();
    }
}
```

- **First set: synchronous.** When `el.ish = v` returns, the manager exists. itemscopeTree relies on this.
- **Later sets: asynchronous.** They're handed to an async function that isn't awaited (a setter can't return a promise). Each value is still applied *at the start* of a loop iteration, before the first `await`, so in practice the first queued value is applied in the same tick, but the code doesn't promise that.

### What changes with `onAssigned`

**1. The first set stays synchronous**, *if `onAssigned` is a normal function*:

```ts
managerInstance = new Manager(element);
Manager.onAssigned(managerInstance, value, { initial: true, ... });   // runs to completion here
```

When `el.ish = v` returns, the value has been fully applied. This is what "the first call stays synchronous" meant.

**2. If `onAssigned` is `async`, the setter can't wait for it.** Setters return nothing; there's nowhere to hand back the Promise. So:

```ts
static async onAssigned(instance, value) {
    instance.render(value);           // runs synchronously, during el.ish = v
    const data = await fetch(...);    // ← setter has already returned by here
    instance.enrich(data);            // runs later
}
```

The code before the first `await` runs during the assignment, and the rest runs later. That's normal JavaScript; nothing can make the setter wait. The only thing *we* control is point 3.

**3. Ordering: "awaited inside the queue".** Suppose values arrive faster than an async `onAssigned` finishes:

```ts
el.ish = 'A';   // onAssigned(A) starts, awaits a fetch
el.ish = 'B';   // arrives while A is still in flight
```

- **Without awaiting:** `onAssigned(B)` starts while A is still pending. If B's fetch returns first, A finishes last and **overwrites B**, so the element shows stale data.
- **With "awaited inside the queue":** B waits in the queue until A's Promise settles, then `onAssigned(B)` runs. Each value is fully handled before the next starts, so the last value assigned is the last one applied.

### A flaw in the current code this exposes

Today, **every** later set starts its *own* drain loop (`(async () => { while ... })()` inside the setter). With `assignGingerly` that's harmless, because it's synchronous, so each loop applies its value before yielding. With an async `onAssigned`, two loops could run at once, which breaks point 3. The implementation needs **a single drain loop at a time**: a `draining` flag, and a setter that only starts a loop when none is running.

### Two decisions this leaves

**D. Should later sets be synchronous when nothing is pending?** I recommend yes. Right now later sets go through the async loop even when it isn't needed. Proposal: if the queue is empty and no async `onAssigned` is in flight, call `onAssigned` (or `assignGingerly`) **directly in the setter**, and only queue when something is still pending.

- This makes updates as synchronous as the first set, which matters for the planned itemscopeTree updates (`el.ish = newValue` would apply immediately).
- It also fits the "default to synchronous" stance from the ManageTemplateList performance work.
- Applying the same fast path to the default (`assignGingerly`) case is a small behavior change: later sets become reliably same-tick instead of practically same-tick. Include that, or limit it to `onAssigned`?

**E. Errors from an async `onAssigned`.** A rejected Promise inside the fire-and-forget loop is an unhandled rejection, and today it would also **stop the loop**, stranding any queued values. Proposal: catch it, report it with `console.error` plus an asynchronous rethrow (the same pattern `assignGingerly` uses for `handleIshProperty` errors), and continue with the next value. Errors from a *synchronous* `onAssigned` on the fast path simply throw out of the `el.ish = v` assignment, as they would from any setter.

### Something to verify during implementation

The proposal says that values queued before the manager was registered are each passed to `onAssigned` in order. Looking at the code again, `defineIshProperty` waits for registration *before* defining the setter, so `valueQueue` likely never holds more than one value on the first set. I'll trace the lazy path, including two `assignGingerly(el, { ish })` calls before registration (the existing "queue" test), and confirm before relying on it. The intended behavior is unchanged: every value reaches `onAssigned`, in order.

*(Minor: there's a stray `V` at the end of the `null`/`undefined` row of the Background table.)*

## Bruce's Response II

Can we first do a check if the onAssigned is async or not, using isAsyncSpawn, and if not, apply it synchronously?  Would that require a lot of refactoring?

The reason I want this is there's a performance hit if we do await repeatedly, for no reason.
---

## Response: detecting async `onAssigned`

**Short answer:** yes to the goal (no `await` at all for a synchronous `onAssigned`), and it's **not much refactoring**: it's confined to the `ish` setter in `defineIshCore`, roughly 30 lines. But I'd recommend checking the **return value** rather than using `isAsyncSpawn`, for two reasons.

### 1. `isAsyncSpawn` would misclassify `onAssigned`

```ts
export function isAsyncSpawn(fn) {
    if (fn.constructor.name === 'AsyncFunction') return true;
    if (fn.prototype === undefined) return true;   // ← arrow / non-constructor ⇒ "async"
    return false;
}
```

The second rule is a heuristic for *spawners* (where an arrow function is assumed to return `Promise<Constructor>`). But **methods have no `.prototype`**, so `static onAssigned(instance, value) { ... }`, a perfectly synchronous method, would be classified as async. Every `onAssigned` would take the slow path.

The narrower check (`fn.constructor.name === 'AsyncFunction'`) has the opposite problem. It misses:
- an ordinary function that **returns a Promise** (`static onAssigned(i, v) { return fetch(...).then(...); }`);
- `async` methods **transpiled** for older targets (TypeScript/Babel below ES2017 turn them into plain functions using `__awaiter`).

Those would be wrongly treated as synchronous, and the ordering guarantee (point 3 above) would silently break.

### 2. Checking the return value is exact, and just as cheap

Whether `onAssigned` is async or not, we have to *call* it. Calling an `async` function also runs it synchronously up to its first `await`. So the only real question is whether to wait for the result, and the result itself answers that precisely:

```ts
const result = Manager.onAssigned(managerInstance, value, ctx);
if (result && typeof result.then === 'function') {
    // Async: hold later values in the queue until this settles
    pending = result;
} // else: done — no await, no microtask, nothing queued
```

The setter, with the single drain loop from the earlier section:

```ts
set(newValue) {
    if (managerInstance !== null && newValue === managerInstance) return;
    if (pending) { valueQueue.push(newValue); return; }   // async call in flight: preserve order
    apply(newValue);                                       // synchronous fast path
}

function apply(value) {
    // first value: construct, then onAssigned({ initial: true }); later: onAssigned / assignGingerly
    const result = ...;
    if (result && typeof result.then === 'function') {
        pending = result;
        drain();             // one loop: awaits pending, then applies queued values in order
    }
}
```

| `onAssigned` | Path | `await`s |
|---|---|---|
| Synchronous method (the common case) | Called directly in the setter | **none** |
| `async` method, or one returning a Promise | Called directly; later values queue until it settles | one per in-flight async call |
| None (default `assignGingerly` merge) | Same fast path (`assignGingerly` is synchronous) | **none** |

This is decision **D** from the earlier section, made precise. Your performance concern also argues for applying it to the default `assignGingerly` path, which today pays for an `await` plus an extra async function on every later set for no reason. I'd include it.

### Decisions

- **F.** Use return-value (thenable) detection instead of `isAsyncSpawn`?
- **D.** Apply the synchronous fast path to the default `assignGingerly` path too? I recommend yes.
- **E.** Error handling as proposed: a synchronous throw propagates out of `el.ish = v`; a rejected Promise is logged and rethrown asynchronously, and the queue continues.

If all three are yes, I'll implement Phase III. That covers `onAssigned` (A, B), the fast path, the single drain loop, and the check on the lazy-registration path, with tests for a sync `onAssigned` (asserting no microtask is needed), an async `onAssigned` (ordering), and a Promise-returning plain method.

## Bruce's Response III

Yes to F, D, E.  Please proceed with implementation and add your implementation notes below.

---

## Implementation Notes

Implemented as agreed (A, B, D, E, F).

### Changes

| File | Change |
|------|--------|
| `handleIshProperty.ts` | `defineIshCore` rewritten (described below); new `reportAsync` / `isThenable` helpers; guard in `defineIshProperty` against defining the property twice (see "Lazy-registration path") |
| `types/assign-gingerly/types.d.ts` | `ItemscopeManager.onAssigned?(instance, value, ctx: IshAssignContext): void \| PromiseLike<void>`; new `IshAssignContext { element, initial, options }` |
| `tests/itemscope-managers.html` | Tests 19–23: **16 new assertions** (suite now 38) |
| `README.md` | "Validation and Error Handling": documents synchronous application, `onAssigned`, async ordering and errors |

### How the setter now works

```ts
set(newValue) {
    if (managerInstance !== null && newValue === managerInstance) return;
    if (pending) { valueQueue.push(newValue); return; }   // async onAssigned in flight
    const result = apply(newValue);                        // synchronous fast path
    if (isThenable(result)) { pending = true; drain(result); }
}
```

- **`apply(value)`**, all synchronous:
  - **First value with `onAssigned`:** `new Manager(element)` (no `initVals`), then `onAssigned(instance, value, { element, initial: true, options })`.
  - **First value without it:** `new Manager(element, Object.assign({}, value))`.
  - **Later values:** `onAssigned(..., { initial: false })` if it exists. Otherwise `assignGingerly(instance, value)`, skipping `null`/`undefined`.
- **Async detection (F)** looks at the return value. Only when `apply` returns a thenable does anything get awaited. `onAssigned` is called with `this` set to the manager class, so `this` inside a static method works.
- **`drain(inFlight)`** is the single loop:
  - It awaits the in-flight Promise.
  - It then applies queued values synchronously, until one of them returns another thenable, which it awaits in turn.
  - Finally it clears `pending`. Only the setter starts it, and only when `pending` was false, so there's never more than one loop.
- **Errors (E):** a synchronous throw propagates out of `el.ish = v`. A rejection, or a throw while draining, goes to `reportAsync` (`console.error`, plus `setTimeout(() => { throw err })`, the same pattern `assignGingerly` uses for `handleIshProperty`), and draining continues.

### Behavior change (D)

Without `onAssigned`, later sets used to go through a fire-and-forget async function that awaited `assignGingerly`. They're now applied **directly in the setter**, so there's no async function and no `await`. Code that read the value right after `el.ish = v` used to rely on timing; it now gets a guarantee. No existing tests depended on the old asynchrony.

### Lazy-registration path (the check promised earlier)

Traced as suspected. `defineIshProperty` waits for registration *before* defining the setter, so `valueQueue` never held more than one value on the first set, and the "merge queued values into `initVals`" code was effectively dead.

But tracing it showed a real issue. With two `assignGingerly(el, { ish })` calls before registration (existing Test 18), **both** calls wait, and **both** call `defineIshCore`. The second `Object.defineProperty` replaced the first, discarding whatever instance the first had created. Test 18 passed only because of microtask ordering: both values happened to land on the second definition.

`defineIshProperty` now returns early if `'ish' in element` after the wait. So both values go through one setter: the first constructs the instance, and the second is applied synchronously on top of it. Test 18 still checks the result (`prop1` and `prop2` both present), and it no longer depends on timing.

### Tests added (`tests/itemscope-managers.html`)

| # | What it checks |
|---|---|
| 19 | Synchronous `onAssigned`: constructor gets no `initVals`; the first value (a string) is passed as-is with `initial: true` and `ctx.element`; a later set is applied **before the next line runs**; `null` is passed through; the instance is kept |
| 20 | Default merge: a later set is applied synchronously |
| 21 | `async onAssigned` with uneven delays: applied in assignment order, never more than one call in flight |
| 22 | A plain method returning a Promise: detected as async via its return value; order kept, never more than one in flight |
| 23 | A synchronous throw propagates out of the assignment; an async rejection is reported and the queue continues (`first,slow,after`) |

### Verified

- `tsc --noEmit -p .` is clean.
- `npx playwright test itemscope`: 6/6 (chromium, firefox, webkit). itemscope-managers is 38/38, itemscope-tree 49/49.
- Full `npx playwright test`: **114/114 passed**.

As before, the `.js` was regenerated by your `tsc` watcher; I edited only `.ts`, `.html` and `.md`.

## Bruce's Response

Can you start adding documentation for this handler?  I think the vast bul of it should be in the docs folder, and a brief intro in README.md should link to it.

---

## Documentation

- **New: [`docs/itemscope-tree.md`](../../../../../docs/itemscope-tree.md)**, the full reference, following the structure of `docs/manage-template-list.md`. It covers:
  - Import, including the `🌳` alias
  - A basic example
  - A comparison table of the naming convention vs `map`
  - `map` details: order, missing keys, class vs string entries, one class under several keys, `static itemscope`, the bundler renaming caveat, integer-key order
  - The `instantiate` contract and the `ItemscopeTreeContext` table
  - "How It Works", step by step
  - Integration with `ish` / `onAssigned`
  - Registries
  - An errors table
  - Types
  - A roadmap
- **README:** the `builtIns.itemscopeTree` section is cut down to an intro, the basic example, four key points and a link to the doc. The general `ish` / `onAssigned` behavior stays in the README's Itemscope Managers section, since it isn't specific to this handler, and the doc links to it.
