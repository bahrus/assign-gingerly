# Nested Support

## Bruce's Ask

Because of the ability of paths to point to sub objects, nested support is already there with the tree as far as binding to the vm.

However, it can become quite verbose.  

We can also use a nested builtIns.tree, correct?  That's all fine and good, except now we have nested asynchronous fire and forget processes taking place.  In my mind, the reason for allowing asynchronous fire and forget is there primarily so that if someone using assign gingerly's assignFrom doesn't use a feature, they don't incur the cost.  But in the nested scenario, can we avoid an await, since the tree handler has already been loaded?

If not, I am starting to wonder if tree support is so fundamental to assignFrom, that it should be switched to a sync op using =& ?

Let me know your thoughts below.

## Claude's Response

**Short answer:** yes, we can avoid the await, and I don't think tree needs to move to ` =&` to get there. The awaits a nested tree hits today all come from how `processHandlerCommands` is written. Nothing in the nested case actually needs them.

### What a nested tree does today

A child pattern like `{ ' =>': { do: 'builtIns.tree', map: {...} } }` isn't plain, so `applyPattern` in [handlers/tree.ts](../../../../../handlers/tree.ts) sends it through the sync `assignFrom`. That call then:

1. Finds the ` =>` key and calls `withHandlerCommands`. That is already synchronous once `processHandlerCommands.js` is cached (see `cachedProcessHandlerCommands` in [assignFrom.ts](../../../../../assignFrom.ts)).
2. Enters `processHandlerCommands`, which is an `async` function. Every `await` in it yields a microtask, even when the value is already there:
   - `await resolveFromHandlers(...)`: usually resolves to `undefined` right away, but it still yields.
   - `await loadBuiltIn('builtIns.tree')`: the class is already in `handlerCache` (the outer tree is running, so it must have been loaded), but this still yields.
   - `await handler.assign(...)`: `TreeHandler.assign` returns `void`, and this still yields before the return-value step.

So the inner tree gets built two or three microtasks after the outer `assign()` returns. That happens before paint, so nobody sees a flash. Still, there are three problems:
- The outer tree "finishes" while its nested trees are still empty, so the sync guarantee in the tree docs ("Fully synchronous inside `assign()`") stops being true at the first level of nesting.
- Each nesting level adds more deferral, and every rebind of the outer tree queues a new set of promises per nested tree.
- An error in a nested tree goes to `reportError` through `trackPending` instead of being thrown to whoever called the outer tree.

**A sharper problem I found along the way:** `assignFromAsync` caches `processHandlerCommands` in its own variable (`_processHandlerCommands`), separate from `cachedProcessHandlerCommands` in `assignFrom.ts`. If the outer tree started from `assignFromAsync`, which is what the tree docs' own example uses, then the first nested tree goes through a real `import()` in the sync `assignFrom`. By the comment in `withHandlerCommands`, that pushes it to a *later task*, not just a microtask, so a frame could render before it's filled. Either fix below should also make the two modules share one cache. For example, `assignFromAsync` could set the cache in `assignFrom.ts`, or both could read it from one small module.

### Recommendation: run handler commands synchronously when possible

Split `processHandlerCommands` so it runs synchronously and only moves into async when something actually returns a promise:

- Resolve the handler without awaiting when possible. A class in `options.handlers` or a cached built-in is used directly. Only an uncached path or built-in falls back to `import()`.
- `config.resolve` stays async, because it's async by definition. `config.get` is already sync.
- `prepare?.(config)`: await only when it returns a promise. It already works this way.
- `handler.assign(...)`: await only when the result is thenable. Otherwise do the return-value assignment right away.
- `assignFrom` calls the sync runner directly. It only falls back to `trackPending` when the runner hands back a promise.

Why I prefer this:
- **Nested trees become fully synchronous with no API change.** `tree.js` is always loaded by the time a nested tree runs, and `TreeHandler.assign` is sync.
- **The cost model stays the same.** Someone who never uses tree still never loads `tree.js`. You pay one dynamic import the first time, and nothing after that.
- **It isn't specific to tree.** Every handler with a sync `assign`, like `rangeSelector` or `manageTemplateList` if theirs are sync, gets the same benefit on later calls.
- **` =>` still means "may be async"**, and ` =&` still means "never async, guaranteed". That split stays clean.

One thing to note: on the *first* top-level use, the outer tree is still async because of the import. Only nested and repeat calls become sync. I think that's the right trade.

A cheaper but narrower alternative: `applyPattern` could notice a ` =>` key with `do: 'builtIns.tree'` and call `new TreeHandler(config).assign(...)` itself, since it *is* that class. This fixes only nested tree, and it duplicates `processHandlerCommands`' LHS-path and permission logic, so I'd only do it as a stopgap.

### Why I'd hold off on ` =&` for tree

- `syncOps/registry.ts` imports its ops statically. That's the whole guarantee: no `import()`, ever. Registering tree there would make every `assignFrom` user load `tree.ts`, `treeSpec.ts`, `markerUtils.ts`, `placeNodes.ts` and `handleIshProperty.ts`, which is exactly the cost the lazy ` =>` map exists to avoid.
- `compile: true` relies on `prepare()` lazily importing `compileTree.js`. A ` =&` tree would have to import the compiler statically too, or not support `compile`.
- `microJoin` already shows the in-between option: a sync op that renders into `ctx.lhsTarget`. If tree ever does become a ` =&` op, I'd suggest opt-in registration, where importing `handlers/tree.js` adds `tree` to `SYNC_OPS` and ` =&` with `tree:` throws a clear error if it hasn't been imported. Then sync is guaranteed and you only pay for it when you import it. But with the change above, I don't think that's needed yet.

### On verbosity

Separate from the async question: I'd also consider a shorthand where a nested map in the spec stands for a nested tree, so a nested tree doesn't have to be written out as `{ ' =>': { do: 'builtIns.tree', map } }`. For example, the children slot could take `{ map, ... }`, telling it apart from a repeat object by having `map` and no `each`. `normalize` in [handlers/treeSpec.ts](../../../../../handlers/treeSpec.ts) would turn that into a nested `TreeHandler` call internally. That skips handler-command dispatch entirely and makes the async question moot for that form. If you want this, I'm happy to sketch the exact spec shape.

### Proposed next steps

1. Make `processHandlerCommands` run synchronously when possible, as described above, and have `assignFrom` use the sync result.
2. Share the `processHandlerCommands` cache between `assignFrom` and `assignFromAsync`.
3. Add a test: an outer tree with a nested `builtIns.tree` child, where the inner DOM must already exist synchronously right after the outer `assignFrom` returns, on both the first call and on rebind.
4. (Optional) The nested-map shorthand for verbosity.

## Bruce's Response I

Please implement all four steps.


## Claude's Response II

All four steps are implemented. I edited only the `.ts` and `.d.ts` sources; your watch build regenerated the `.js`. `tsc --noEmit` is clean, and the full suite passes: 52/52 on Chromium, and the tree, compile-tree, when-settled and new nested-tree pages pass on Chromium, Firefox and WebKit.

### 1. ` =>` handlers run synchronously when they can

- [processHandlerCommands.ts](../../../../../processHandlerCommands.ts) is no longer an `async` function. It runs keys and configs in order, synchronously, and returns `undefined` when everything finished. The first step that really has to wait returns a promise, and the rest continues in it. That step is one of: loading a module, `resolve`, a promise from `prepare`, or a promise from `assign`. Order is unchanged either way.
- `loadBuiltIn` returns the cached class directly. Import-path handlers in `options.handlers` are now cached by path too, so they're also sync after the first load.
- [assignFrom.ts](../../../../../assignFrom.ts): `runHandlerCommands` replaces `withHandlerCommands`, and only work that's still pending goes to `trackPending` / `whenSettled`.
- **Error behaviour is unchanged.** A handler that throws synchronously is still reported through `reportError`, never thrown to the caller of `assignFrom`, and later configs for that key don't run. For `#[x]` handler keys, one element's failure doesn't stop the others.
- The result is that a nested ` =>` builtIns.tree is always synchronous. While a tree is running, `tree.js` and `processHandlerCommands.js` are always loaded.

### 2. One shared `processHandlerCommands` cache

`assignFrom.ts` exports `loadHandlerCommands()`, which returns the function directly once it's loaded and a promise otherwise. `assignFromAsync` uses it instead of keeping its own `_processHandlerCommands`. So when a tree starts from `assignFromAsync`, its nested trees no longer wait for a fresh `import()` in the sync `assignFrom`.

### 3. Tests

- New [tests/nested-tree.html](../../../../../tests/nested-tree.html) and `nested-tree.spec.ts`, 31 assertions:
  - Test 1 runs on a fresh page started by `assignFromAsync`, which checks the shared cache.
  - Nested ` =>` trees are rendered and rebound before `assignFrom` returns, at one and two levels deep, with elements reused and nothing left for `whenSettled`.
  - The shorthand tests are listed under step 4.
- [tests/when-settled.html](../../../../../tests/when-settled.html) gets three new tests: a sync handler's return value is applied before return; a sync throw is reported, not thrown, and stops later configs; a sync → async → sync chain stays in order. Test 1 still holds, because it runs before anything is loaded. I reworded its comment to say so.

I didn't run the new tests against the old code to watch them fail. Test 1 of `nested-tree.html` is the one that should catch the cache problem.

### 4. Nested-map shorthand

```js
person: ['section', { className: 'card' }, {
    map: { name: ['h2', '?.'], tags: ['ul', {}, { each: ['li', '?.'] }] },
}],
```

- The type is `NestedTreeSpecification = Omit<TreeConfig, 'do' | 'resolve'>`. It's told apart from a repeat by having `map` and no `each`. `normalize` now returns it as a 7th tuple element.
- Tree renders it with `new TreeHandler(nested).assign(container, …)`, skipping handler dispatch, so it's always synchronous. It rebinds in place, and switching a key between static children, a repeat and a nested tree rebuilds the element. Manager `ctx.rebind()` and `compile` clones handle it too: `compileTree` records `nested` on the compiled node and doesn't treat the element as owning its content.
- I also fixed a small leak: `TreeHandler.assign` now always sets its own compiled variant, so an enclosing tree's variant no longer carries over into a nested tree.
- Docs: a new "Nested Trees" section in [docs/tree.md](../../../../../docs/tree.md), a README bullet, and corrected wording about ` =>` timing in the README, `docs/sync-ops.md` and `docs/tree.md`.

### Things to look at

- `types/` is a git submodule, so the `treeTypes.d.ts` change needs committing there. I didn't touch the copy under `inferencer/types/`. If that copy is kept in sync by hand, it needs the same change.
- A nested shorthand tree's own `compile: true` can't load the compiler, because there's nowhere to await. It only takes effect once something else has loaded the compiler, such as an enclosing `compile` tree. Otherwise it gives the existing one-time warning.
- The children slot in the `` tree`…` `` DX template doesn't produce the shorthand yet. It still produces the existing notation.
- Nothing is committed.
