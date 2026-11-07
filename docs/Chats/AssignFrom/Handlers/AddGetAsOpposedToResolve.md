# Add get as opposed to resolve

---

## Human Ask

Keep the resolve option in the handler configuration.  It invokes the async resolveValues, which yields the thread during the await

But add support for a get section that uses getValues, no yielding of the thread.

Can this be done without much duplicate code?

---

## Response

### Yes — Minimal Code Change

The relevant section in `processHandlerCommands.ts` is:

```ts
let resolvedParams: Record<string, any> = {};
if (config.resolve) {
    resolvedParams = await resolveValues(config.resolve, options.from, {
        withMethods: options.withMethods,
        aka: options.aka,
        protocols: options.protocols
    });
}
```

Adding `get` support is just one additional block:

```ts
let resolvedParams: Record<string, any> = {};
if (config.get) {
    resolvedParams = getValues(config.get, options.from, {
        withMethods: options.withMethods,
        aka: options.aka,
        protocols: options.protocols
    });
}
if (config.resolve) {
    const asyncResolved = await resolveValues(config.resolve, options.from, {
        withMethods: options.withMethods,
        aka: options.aka,
        protocols: options.protocols
    });
    Object.assign(resolvedParams, asyncResolved);
}
```

That's it — `getValues` is already imported (or easily importable) and has the same signature as `resolveValues` minus the `async`/`await`. Zero duplicate code — both call the same underlying path resolution logic.

### Behavior

- `get` — resolved synchronously via `getValues`. No thread yield.
- `resolve` — resolved asynchronously via `resolveValues`. Yields to microtask queue.
- Both can coexist — `get` runs first (sync), `resolve` runs second (async), results are merged.

### Usage

```js
'?.querySelector?.tbody =>': {
    do: 'builtIns.manageTemplateList',
    get: {
        forEach: '?.rankings',
        instantiate: 'globalThis://country-ranking',
    },
    resolve: {
        // Only things that genuinely need async protocols
        remoteConfig: 'api://settings'
    },
    fromEachItem: { ... }
}
```

For most handlers (lazyLoad, join, manageTemplateList), everything can go in `get` — avoiding the `await resolveValues` yield entirely. `resolve` becomes the escape hatch for genuinely async resolution.

### Implementation Cost

- One `import { getValues } from './getValues.js'` at the top of `processHandlerCommands.ts`
- ~5 lines of new code (the `if (config.get)` block)
- No duplicate logic — just calling the already-existing sync function

### Shall I implement?

---

## Human Response I

Please Implement.

## Implementation Notes

Now add the `config.get` block before the existing `config.resolve` block:

Done. The change:

- `config.get` → processed synchronously via `getValues` (no yield)
- `config.resolve` → processed asynchronously via `resolveValues` (yields)
- Both can coexist — `get` results are computed first, `resolve` results merge on top

Handlers can now choose: put time-sensitive params in `get`, async-protocol params in `resolve`.

## Human Response II

Great.  Can you update the documentation to reflect this?

## Implementation Notes II

Now let me also add a brief note to the handler usage example section showing both `get` and `resolve`:

Done. Updated the README:
- "How it works" now lists both `get` (step 4, sync) and `resolve` (step 5, async) as separate steps
- Added a dedicated explanation block showing when to use each, with an example of both coexisting on the same handler config
