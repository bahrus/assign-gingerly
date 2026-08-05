# Remove Residual Of Async Getter

---

## Human Ask

I've decided that the code that was in assignFeatures.ts:

```JS
function installFeatureGetter(
    ctr: Function,
    key: string,
    featuresRegistry: FeaturesRegistry
): void {
    Object.defineProperty(ctr.prototype, key, {
        get: function (this: any) {
            ...
```

was too complicated.

I removed the large logic for handling the case of the spawn class still not having been resolved by the time the code gets into assignFeatures.ts.  It should now resolve during defineFeatures, and placed in cache.  

Some additional cleanup work is needed.

1.  The following two tests are failing now:  
    1.  tests\assign-features-advanced.spec.ts:4:3
    2.  tests\assign-features.spec.ts:4:3

Possibly I missed some holes in the logic. So we need to investigate the cause of the failures.  Perhaps some tests are no longer needed.

2.  Remove support for "whenFeatureReady" as that was only applicable for loading the spawn class in the getter.

3.  Simplify the README.md

Let's focus first on tests/assign-features.html

Please investigate first 

tests/assign-features.html

The error is right here in assignFeature.js

```JS
const resolvedSpawn = spawns?.get(key);
if (!resolvedSpawn) {
    throw 'NI';
}
```

Is defineFeatures being called first?  Why not?  Is the test valid in other words.

Please don't burn many tokens on this at all.  Just point me to the the most likely cause, and where console.log's in the appropriate place would help confirm.

Or do you see an obvious fix?

---

## Kimi Response

Likely cause: `assignFeatures` no longer populates `resolvedSpawnCache`, but it now throws `NI` when the cache misses. In `tests/assign-features.html`, `defineWithFeatures` is **not** called at all — the test calls `customElements.assignFeatures(TestEl, { photoTaker: { spawn: PhotoTakerImpl } })` directly after `customElements.define`. So `resolvedSpawnCache.get(TestEl)` is empty, and the first feature access throws `NI`.

I don’t see a `defineFeatures` function in the repo; only `defineWithFeatures`. `defineWithFeatures` does populate the cache before calling `assignFeatures`, but that path is not used by the test.

Where to put `console.log`s to confirm:

- `assignFeatures.ts` / `assignFeatures.js` right before `throw 'NI'` — log `ctr.name`, `key`, and whether `resolvedSpawnCache.has(ctr)`.
- `defineWithFeatures.ts` / `defineWithFeatures.js` at the top and where it does `resolvedSpawnCache.set(NewClass, ...)` — to verify it is never reached.
- In `tests/assign-features.html`, in the first test — log the order of `define` and `assignFeatures`.

The obvious fix is to make `assignFeatures` handle the synchronous case itself: when `resolvedSpawn` is missing, look at `injection.spawn` / `optIn.fallbackSpawn`, and if it is a plain constructor, put it in `resolvedSpawnCache` and use it. That restores the direct `customElements.assignFeatures(...)` API without reintroducing the old async getter complexity.

If the intention is that direct `assignFeatures` calls are no longer supported and everyone must go through `defineWithFeatures`, then the tests are invalid and need to be rewritten or removed.

---


## Human Response I

Your diagnosis seems to be correct.  I think the issue is that there is / was duplicate code between defineWithFeatures and assignFeatures.

I tested defineWithFeatures and it works great for my real world test cases so far, when defining custom elements.  In particular, I added support for spawning from a string import path.

I don't think I have any real world usage of using assignFeatures without passing through defineWithFeatures.  

But I do still want to be able to assign features to a class prototype even if it isn't to be used as a custom element.

The key is that the features that are actually configured (but not all of the  supported features defined by static method of the base class) must be spawned before installing the getters and setters on the prototype.

There should be only one place in the code where the spawn logic takes place, and everything else should be able to find the class constructor via a cache or some other mechanism.

I think in the end defineWithFeatures, which is working perfectly, should become a very thin wrapper around awaiting for assignFeatures to finish, then do the customElements.define.

Can you please see if refactoring the logic to make that work is feasible?

Please add any comments below in this git-committable chat.  Can you add to AGENTS.md that I like to carry out chats through read me files so I have a record of the chats in git (since I switch between different AI providers?)

---

## Kimi Response II

Yes, the refactor is feasible and the duplication is real. The clean end state is:

- **`assignFeatures` owns all spawn resolution** — constructor, string import path, and async spawner — and caches the resolved constructor in `resolvedSpawnCache` keyed by the target class.
- **`defineWithFeatures` becomes a thin wrapper** — wait for the base class, create the subclass, optionally run `onSubclassCreated`, await `assignFeatures(NewClass, config.assignFeatures, registry.featuresRegistry)`, then `registry.define(tagName, NewClass)`.

### What changes in `assignFeatures`

Before installing any getters, resolve the spawn for each configured feature key (not every key in `supportedFeatures`, only the ones in the incoming `features` map). For each key:

1. If `features[key].spawn` is provided:
   - async function? await it.
   - string? use `findClassPrototypeInPath` to resolve it.
   - constructor? use it directly.
2. Otherwise fall back to `supportedFeatures[key].fallbackSpawn` with the same three cases.
3. Store the resolved constructor in `resolvedSpawnCache.get(ctr).set(key, ResolvedClass)`.

If any resolution is async, `assignFeatures` returns a `Promise<void>`; otherwise it stays synchronous. The existing async handling for `onAssigned` can be folded into the same “do we need to await anything?” check.

### Why this keeps direct `assignFeatures` working

Non-custom-element classes can still call `assignFeatures(MyClass, { feature: { spawn: MyImpl } })`. The spawn is resolved (trivially, since it is a constructor), cached, and the getter is installed. No `defineWithFeatures` is required.

### Why `defineWithFeatures` becomes thin

It no longer needs to build `resolvedSpawns`, construct `featuresMap`, or know about `isAsyncSpawn`. It just delegates to `assignFeatures`, which already has the registry and the supported-features map.

### Suggested order of work

1. Add a `resolveSpawnsForFeatures(ctr, features, registry)` helper inside `assignFeatures.ts` (or as a standalone module if useful elsewhere). It returns `{ resolved: Map<string, Function>, async: boolean }` or a Promise that resolves to the map.
2. Update `assignFeatures` to call this helper before installing getters, then remove the duplicated `throw 'NI'` / `resolvedSpawnCache` lookup in both the getter and the registration loops. The getter can still read the cache, but it can also trust the cache is populated because `assignFeatures` populated it.
3. Simplify `defineWithFeatures` to the wrapper described above.
4. Update the tests in `tests/assign-features.html` and `tests/assign-features-advanced.html` so that `customElements.assignFeatures` is called **before** `customElements.define` (and before creating instances), because getters must be on the prototype before instances are constructed. Several tests currently call `define` first; those will fail even after the cache fix because pre-upgrade own-properties will shadow the getter.
5. Remove the `whenFeatureReady` lifecycle method and `pendingFeatures`/`FEATURE_ERROR` plumbing since async spawns are now resolved before the getter is installed.
6. Then simplify `README.md` to reflect the single-entry API.

### Caveats

- `assignFeatures` will need to import `findClassPrototypeInPath` and `isAsyncSpawn`. Keep `isAsyncSpawn` in `utils` since it is already shared.
- The existing sync fast path in `assignFeatures` can be preserved: if every spawn is a constructor and there are no `onAssigned` hooks, it runs synchronously.
- Be careful not to resolve `fallbackSpawn` for features that are not configured. The current `defineWithFeatures` only iterates over the keys in `config.assignFeatures`, which is correct; `assignFeatures` should do the same.

I’ll proceed with the code changes if you confirm, and I’ll also update `AGENTS.md` with the chat-record preference.

---

## Human Response II

Please implement.

---

## Kimi Response III

Implemented. Summary of changes:

### Code changes

- **`assignFeatures.ts`**: now owns all spawn resolution. A new `resolveAndCacheSpawns` helper resolves constructors, async functions, and import-path strings before any getters are installed, caching the result in `resolvedSpawnCache`. Removed the `throw 'NI'` paths, `FEATURE_ERROR`, `pendingFeatures`, and the `whenFeatureReady`/`featuresConfig` plumbing. `assignFeatures` returns `Promise<void> | undefined`.
- **`defineWithFeatures.ts`**: simplified to a thin wrapper — wait for base class, create subclass, optionally call `onSubclassCreated`, `await assignFeatures(NewClass, af, reg.featuresRegistry)`, then `reg.define(tagName, NewClass)`.
- **`resolveAndAssignFeatures.ts`**: reduced to a backward-compatible wrapper that delegates to `assignFeatures`.
- **`types/assign-gingerly/types.d.ts`**: removed `FeaturesClassConfig` and `whenFeatureReady` from `SupportedFeatureConfig`.
- **`AGENTS.md`**: added a note that design chats are carried out in git-committable markdown files so the conversation survives across AI providers.

### Test changes

- **`tests/assign-features.html`**: reordered every test so `customElements.assignFeatures` is called before `customElements.define`.
- **`tests/assign-features-advanced.html`**: made all test functions async, reordered `assignFeatures`/`define`, removed the `whenFeatureReady` tests, and updated async-spawn tests to reflect that the real instance is returned after `await assignFeatures` instead of a placeholder.

### README changes

- Removed the placeholder/async-resolution detail section and the `whenFeatureReady` section.
- Added a concise async-spawn section noting that `assignFeatures` returns a Promise and the real class is resolved before the getter is installed.
- Updated examples to show `assignFeatures` before `define`.
- Updated the API reference to show `Promise<void> | undefined` return type and to remove `lifecycleKeys`/`whenFeatureReady`.
- Replaced `whenFeatureReady` examples in the `withAsyncMethods` section with a generic async-method example.

### Verification

- `npx playwright test tests/assign-features.spec.ts tests/assign-features-advanced.spec.ts` — passed (23 + 13 tests, all browsers).
- `npx playwright test` — all 87 tests passed across chromium, firefox, and webkit.

### Note on JS files

I also wrote matching `.js` versions of `assignFeatures.js` and `defineWithFeatures.js` so the tests could run before your TypeScript watcher/build regenerated them. If your build process is active, it may overwrite those files with compiled output from the updated `.ts` sources.


