# Itemscope Tree Phase III — `static onAssigned`

Carried over from [Phase II](./ItemscopeTreePhaseII.md) ("Feedback / Questions II") so it can be considered separately. Nothing here is implemented yet.

## Background

Since Phase II, `ish` accepts values of any type. Without a hook, values are merged naively:

| Value | First set (`initVals = Object.assign({}, v)`) | Later sets (`assignGingerly(instance, v)`) |
|---|---|---|
| `'ab'` | `{0:'a', 1:'b'}` | `{0:'a', 1:'b'}` |
| `['x','y']` | `{0:'x', 1:'y'}` | `{0:'x', 1:'y'}` |
| `42`, `true` | `{}` | no-op |
| `null`, `undefined` | `{}` | skipped (Phase II) |

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

