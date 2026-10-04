# DOM Element Isms Handler Phase I - Initial Instantiation

## Bruce

I'm not set on the name for this, so very open to suggestions.

## Use Case

The typical use case is a JSON object is retrieved from an API, and we want to 

1.  Map the JSON object to a DOM tree the first time
2.  Update the DOM with a retrieval of new JSON

This can be handled by a specific rendering technology like template literals.  That is not what this handler focuses on.  Instead, the assumption is that we will want each (or at least some) nodes to be managed by an itemscope manager class.  The class itself my very well use template literals.  

From the point of view of this handler, we assume there is a registered itemscope manager, tied to the name of the property.

## Simple example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```TS
const vm = {
    image:{
        url: 'https:...',
        description: 'Lunar Surface'
    }
}

class ImageHandler {
    static instantiate(image: Image, ctx: TBD){
        const img = document.createElement('img');
        const {url, description} = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

customElements.itemscopeRegistry.define('image', {
    manager: ImageHandler
});

await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.DEIsms',
    }
}, {
    from: vm
})
```

This would result in:

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

Sketch of what this does:

1.  Iterates through all the top level keys of vm (by default).
2.  Checks if a matching Itemscope is found matching the key.  If none found, ignores it.
3.  Checks if (in this case) the details already has an element with itemscope=image.  If so, skip for now (phase II).
4.  Checks if class has a static method instantiate.  If not skips

Some assumptions:

By default, use the customElementRegistry of the first argument (I think we call that the "target").

## Future Phase

Support pulling from a section of the vm.
Support updates.

Let me know what clarifications are needed first before implementing, below.

---

## Feedback / Questions

### How it fits today

- The handler can be lazy-loaded like the others by adding `'builtIns.DEIsms': './handlers/DEIsms.js'` (or whatever name we pick) to `BUILT_IN_MAP` in `processHandlerCommands.ts`. With `'?. =>'` and no `get`/`resolve`, it would read the VM straight from `options.from`, which `assign(lhsTarget, resolvedParams, options)` already receives.
- The registry lookup can reuse the pattern already in `assignGingerly.ts`, `getHost.ts` and `handleIshProperty.ts`: `target.customElementRegistry?.itemscopeRegistry ?? customElements.itemscopeRegistry`. That matches your "use the target's registry" assumption.
- One wrinkle: `ItemscopeManager` is currently typed as `new (element, initVals) => T`, and the class is constructed later by the `ish` setter in `handleIshProperty.ts`. This proposal adds an optional **static** `instantiate` on that same class. That works fine, but it means the class has two jobs: a factory (static) and a per-element manager (instance). Questions 3 and 4 below come from that.

### Questions

1. **Expected output.** The "would result in" HTML is the same as the input. I assume you meant:
   ```html
   <details id=api-response>
       <summary>API Response</summary>
       <img itemscope=image src="https:..." alt="Lunar Surface">
   </details>
   ```
   Is that right? In particular, should the handler **add `itemscope=image`** to the returned element if `instantiate` didn't? Step 3 (skip if one already exists) only works on a second call if that attribute is present, so I'd suggest the handler always sets it.

2. **Also add `itemprop=image`?** The key is the property name in the VM, so microdata-wise `itemprop` is arguably the more accurate attribute, and `itemscope` is the manager name. They happen to be the same here. Should we:
   - (a) set only `itemscope=<key>` (simplest, matches what you wrote), or
   - (b) set both `itemprop=<key>` and `itemscope=<key>`, so Phase II can match on `itemprop` and leave room for a later key→manager mapping that differs?

   I lean toward (b).

3. **Should the `ish` manager also be instantiated?** Once the `<img itemscope=image>` exists, should the handler also set `img.ish = image` so `new ImageHandler(img, image)` runs through the existing `ish` path? That would give a natural Phase II update path (`img.ish = newImage`, which `assignGingerly`s into the manager). Or is Phase I strictly "call static `instantiate`, insert the result, done"?

4. **The `instantiate` contract:**
   - May it be **async** (return a Promise)? I'd `await` it either way.
   - May it return a `DocumentFragment` or multiple nodes, or only a single `Element`? If it returns a fragment, where does `itemscope` go, given question 1?
   - What should `ctx` contain? My proposal: `{ target, key, from, options, registry }`. Anything else?
   - If it returns `null`/`undefined`, skip silently?

5. **Where to insert.** Should it use `appendChild` on the target, which puts it after `<summary>` here? Should we support `method: 'prepend' | 'after'` the way `lazyLoad` does, or leave that for later?

6. **"Already has an element" scope.** Should that check cover **direct children only** (`:scope > [itemscope=image]`) or any descendant? I'd go with direct children, so nested scopes further down the tree don't block a top-level one.

7. **Which values qualify.** The example value is an object. What should happen for:
   - primitives (`title: 'foo'` with a registered `title` manager): pass them through, or skip?
   - `null`/`undefined`: skip, I assume.
   - arrays: call `instantiate` once per item, or skip until a later phase (this overlaps with `manageTemplateList`)?

8. **Unregistered keys.** You said "ignores it". The existing `ish` path *waits* for registration (`waitForEvent`). I assume ignoring is the intent, so lazily registered managers would be missed if they weren't defined at call time. Is that acceptable for Phase I? An opt-in `await: true` that uses `registry.whenDefined` could come later.

9. **Key order.** Insert in `Object.keys(vm)` order? That seems the obvious choice; I'm just confirming.

### Naming suggestions

"DEIsms" reads as DOM Element + `ish`. A few alternatives that say what it does:

| Name | Rationale |
|------|-----------|
| `builtIns.instantiateScopes` | Says exactly what Phase I does; keeps "instantiate" from the static method |
| `builtIns.scaffold` | Builds the DOM skeleton from the data shape |
| `builtIns.mountScopes` | "Mount" is familiar, and fits Phase II updates too |
| `builtIns.itemscopeTree` | Ties it to the itemscope registry |
| `builtIns.populate` | Short, and pairs naturally with later updates |

My preference is **`builtIns.mountScopes`**, because it still fits once updates are supported. `instantiateScopes` would only describe Phase I.

Once the questions above are settled I'll implement `handlers/<name>.ts`, add the `BUILT_IN_MAP` entry, a config type in `types/assign-gingerly/types.d.ts`, an emoji alias in `DX/emojis.ts` if you want one, and a Playwright test.


## Bruce's Response

> 1. **Expected output.**

Yes, good inferring, expected output:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img itemscope=image src="https:..." alt="Lunar Surface">
</details>
```

> 2. **Also add `itemprop=image`?** 

This is an excellent question.

I'm inclined to answer this way:  If the matching element that ?. points to (details in this case) has an itemscope attribute, then yes, add the itemprop attribute.

I wonder if, bar the mapping configuration that you allude to, we should adopt a default name, so that rather than searching the registry for image, it should search for "ImageISM", so tht the developer would by default be expected to do:

```JS
customElements.itemscopeRegistry.define('ImageISM', {
    manager: ImageHandler
});
```

What do you think?

> 3. **Should the `ish` manager also be instantiated?**

Yes, good point, I think it's not too much of a stretch to include that with Phase I.

> 4. **The `instantiate` contract:**
>   - May it be **async** (return a Promise)? I'd `await` it either way.

Because of the performance issues we faced with the ManageTemplateList handler, that forced us to provide [first class support for synch processing with assignFrom](/Chats/AssignFrom/ImplementTheSynchronousAssignFrom.md), I think we should default to synchronous until we face a slam dunk case where async support is needed (later phase perhaps).

> - May it return a `DocumentFragment` or multiple nodes, or only a single `Element`? If it returns a fragment, where does `itemscope` go, given question 1?

Let's go with a single node for Phase I, with some planning thoughts where applicable to support multiple in the future.  Maybe put it into an array with a single element, so that it would be easy to add in the future.  Only the first element should get the itemscope attribute.  We would probably want to use the itemref attribute should we decide to really support multiple nodes.

>    - What should `ctx` contain? My proposal: `{ target, key, from, options, registry }`. Anything else?

Let's go with that.

- If it returns `null`/`undefined`, skip silently?

Yes, if not an instance of HTMLElement, skip silently.

> 5. **Where to insert.** Should it use `appendChild` on the target, which puts it after `<summary>` here? Should we support `method: 'prepend' | 'after'` the way `lazyLoad` does, or leave that for later?

appendChild only for now.

> 6. **"Already has an element" scope.** Should that check cover **direct children only** (`:scope > [itemscope=image]`) or any descendant? 

Agreed, children only.

7. **Which values qualify.** The example value is an object. What should happen for:

Only for NonArray Objects for Phase I.  Skip others.

>  8. **Unregistered keys.** You said "ignores it". 

Skip it.  No waiting.

> 9. **Key order.** Insert in `Object.keys(vm)` order? That seems the obvious choice; I'm just confirming.

Agreed.

Naming.  I like the `builtIns.itemscopeTree` the most.  Subject to change, but I'm 90% happy with that suggestion.

If we are on the same page, please add your implementation notes below.

---

## Implementation Notes

We're on the same page for everything except one point: the `ImageISM` naming has a knock-on effect that needs your sign-off. It's covered first.

### On the `ImageISM` default name

I like the convention:

- It keeps generic VM keys (`image`, `user`, `item`) from accidentally colliding with unrelated managers in the registry.
- It makes "this manager takes part in `itemscopeTree`" an explicit opt-in, readable from the registration alone.

**But it conflicts with the expected output.** The existing `ish` path (`handleIshProperty.ts`) uses the element's `itemscope` attribute value **as the registry key**. Since you want the `ish` manager instantiated in Phase I (Q3), the element has to carry the name it was registered under:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img itemscope=ImageISM src="https:..." alt="Lunar Surface">
</details>
```

This also lines up with microdata semantics: `itemprop` holds the **property** (`image`), and the `itemscope` value is effectively the **type** (`ImageISM`). When the target itself has `itemscope` (your rule for Q2), we'd get:

```html
<div itemscope=ProfileISM>
    <img itemprop=image itemscope=ImageISM ...>
</div>
```

**Proposal:** adopt `<PascalCasedKey>ISM`, derived by a single internal function, `toManagerName(key)`: `image` → `ImageISM`, `heroImage` → `HeroImageISM`. The explicit key→manager mapping stays a future phase, and that function is the one place it would plug in. Note that `itemscope` attribute matching is case-sensitive, so the casing has to be exact.

> **Please confirm:** `itemscope=ImageISM` (not `itemscope=image`) on the generated element.

### Module and registration

| File | Change |
|------|--------|
| `handlers/itemscopeTree.ts` | New. Exports `ItemscopeTreeHandler` with a **synchronous** `assign()` |
| `processHandlerCommands.ts` | Add `'builtIns.itemscopeTree': './handlers/itemscopeTree.js'` to `BUILT_IN_MAP` |
| `handleIshProperty.ts` | Extract a sync helper (see "Instantiating the `ish` manager synchronously" below) |
| `types/assign-gingerly/types.d.ts` | `ItemscopeTreeConfig`, `ItemscopeTreeContext`, optional static `instantiate` on `ItemscopeManager` |
| `DX/emojis.ts` | `'🌳': 'builtIns.itemscopeTree'` (unused so far), if you want an emoji alias |
| `tests/itemscope-tree.html` + `.spec.ts` | New Playwright tests |
| `README.md` | Section for the new built-in |

The handler module itself is still loaded through the async `loadBuiltIn`; that can't be avoided, and it's cached after first use. Everything inside `assign()` is synchronous: no `await`, and `instantiate` isn't awaited.

### Types (in `types.d.ts`)

```ts
export interface ItemscopeTreeContext {
    target: Element;
    key: string;
    from: any;
    options: AssignFromOptions;
    registry: ItemscopeRegistry;
}

export type ItemscopeManager<T = any> = {
    new (element: HTMLElement, initVals?: Partial<T>): T;
    /** Optional factory used by builtIns.itemscopeTree. Synchronous by contract. */
    instantiate?(value: any, ctx: ItemscopeTreeContext): HTMLElement | null | undefined;
}

export interface ItemscopeTreeConfig extends HandlerConfig {
    do: 'builtIns.itemscopeTree';
}
```

### Algorithm for `assign(lhsTarget, resolvedParams, options)`

```ts
assign(target, _resolvedParams, options) {
    const { from } = options;
    if (!(target instanceof Element) || from === null || typeof from !== 'object') return;

    const registry = target.customElementRegistry?.itemscopeRegistry
        ?? customElements.itemscopeRegistry;
    if (!registry) return;

    const addItemprop = target.hasAttribute('itemscope');

    // One pass over direct children → Set of existing itemscope values (Q6).
    // O(children + keys), no selector escaping needed.
    const existing = new Set<string>();
    for (const child of target.children) {
        const v = child.getAttribute('itemscope');
        if (v) existing.add(v);
    }

    for (const key of Object.keys(from)) {                 // Q9: key order
        const value = from[key];
        if (value === null || typeof value !== 'object' || Array.isArray(value)) continue; // Q7
        const managerName = toManagerName(key);
        if (existing.has(managerName)) continue;           // Phase II territory
        const config = registry.get(managerName);
        if (!config) continue;                             // Q8: no waiting
        const { manager } = config;
        if (typeof manager.instantiate !== 'function') continue;

        const result = manager.instantiate(value, { target, key, from, options, registry });
        if (!(result instanceof HTMLElement)) continue;    // Q4: skip silently

        const nodes = [result];                            // array-shaped for future multi-node
        const [first] = nodes;
        first.setAttribute('itemscope', managerName);      // overwrites anything instantiate set
        if (addItemprop) first.setAttribute('itemprop', key);
        for (const node of nodes) target.appendChild(node); // Q5: appendChild only
        existing.add(managerName);

        defineIshCore(first, config, options, assignGingerly);
        first.ish = value;                                 // constructs manager (Q3)
    }
}
```

Notes:
- **Order of operations:** instantiate → set attributes → `appendChild` → `ish`. The manager constructor therefore runs on a connected element, so it can look at its parent or host if it needs to.
- **Future multiple nodes:** only `first` gets `itemscope`/`itemprop`. When we support more nodes, the others would get `id`s and `first` would get an `itemref` pointing at them, as you suggested.
- **`instanceof HTMLElement`:** this excludes SVG/MathML elements. That's fine for Phase I; flag it if you'd rather use `Element`.

### Instantiating the `ish` manager synchronously

Today, assigning `{ish: value}` through `assignGingerly` is **async**: it dynamically imports `handleIshProperty.js`, and `defineIshProperty` may `await waitForEvent`. Going through that path would break the sync default.

The handler already holds `config` from `registry.get()`, so I'd split `defineIshProperty` into:

- `defineIshCore(element, config, options, assignGingerlyFn)`: **sync**. It contains the existing `Object.defineProperty(element, 'ish', {get, set})` body unchanged, with the queue and the `new config.manager(element, initVals)` on first set.
- `defineIshProperty(...)`: the existing async wrapper. It keeps the registry lookup and `waitForEvent`, then calls `defineIshCore`.

The handler imports `defineIshCore` statically, which is fine because the handler module is itself lazily loaded. The `ish` behavior stays identical; it just gains a sync entry point.

One gap: the registry's `_trackSetup` / `whenDefined` bookkeeping isn't involved here, since there's no promise to track. I think that's correct, but say so if something relies on it.

### Tests (`tests/itemscope-tree.html` + `.spec.ts`)

1. Basic: `image` → `<img itemscope=ImageISM src alt>` appended after `<summary>`.
2. `img.ish` is an `ImageHandler` instance constructed with `image` as `initVals`.
3. Second call with the same VM → no duplicate (direct-child check).
4. A nested descendant `[itemscope=ImageISM]` (not a direct child) does **not** block creation.
5. Target with `itemscope` → `itemprop=image` added; without it → no `itemprop`.
6. Skips: unregistered key; array value; primitive; `null`; manager without `instantiate`; `instantiate` returning `null` or a text node.
7. Multiple keys → appended in `Object.keys` order.
8. Scoped registry: target's `customElementRegistry.itemscopeRegistry` is preferred over the global one.
9. `camelCase` key → `PascalCaseISM` lookup.

### Deferred (Phase II+)

- Updating existing scopes (the `existing.has(...)` branch → set `ish = value`).
- Pulling from a section of the VM (e.g. `get: { from: '?.section' }` overriding `options.from`).
- Explicit key→manager mapping, multi-node with `itemref`, async `instantiate`, insert `method`, waiting for late registration, arrays.

## Bruce's Response II

> **Please confirm:** `itemscope=ImageISM` (not `itemscope=image`) on the generated element.

Confirmed.

---

## Implementation Summary

Phase I is implemented as described in the notes above. The `.ts` files are edited; the `.js` is left to your build.

| File | Change |
|------|--------|
| `handlers/itemscopeTree.ts` | **New.** `ItemscopeTreeHandler` (sync `assign()`) and the exported `toManagerName(key)` |
| `handleIshProperty.ts` | Extracted the sync `defineIshCore(element, config, options, assignGingerlyFn)`; `defineIshProperty` now calls it after its async lookup/wait |
| `processHandlerCommands.ts` | `BUILT_IN_MAP` entry, plus a **path-resolution fix** (see below) |
| `types/assign-gingerly/types.d.ts` | Optional static `instantiate` on `ItemscopeManager`, new `ItemscopeTreeContext` and `ItemscopeTreeConfig` |
| `DX/emojis.ts` | `🌳` → `builtIns.itemscopeTree` (the doc table also gained the missing `📊` row) |
| `tests/itemscope-tree.html` + `.spec.ts` | **New.** 24 assertions covering tests 1–9 from the notes, plus the overwriting of an `itemscope` set by `instantiate`, and the `🌳` alias |
| `README.md` | New "Built-in handler: `builtIns.itemscopeTree`" section after `rangeSelector` |

### Pre-existing bug found: built-in handlers couldn't load

`loadBuiltIn` passed `BUILT_IN_MAP` paths such as `./handlers/lazyLoad.js` to `findClassPrototypeInPath`. That function does the `import()` inside `utils/findClassPrototypeInPath.js`, so the path resolved to **`/utils/handlers/...`**, which returns a 404. This affected every `builtIns.*` handler, not just the new one; there were no tests for them in `tests/` to catch it.

The fix, in `loadBuiltIn`:

```ts
const cls = await findClassPrototypeInPath(new URL(path, import.meta.url).pathname, handlerCriteria);
```

The path now resolves relative to `processHandlerCommands.js` and still passes through `isAllowedImportPath` (a same-origin `/handlers/...` path).

This fix assumes the package is served from the page's origin. If assign-gingerly were loaded from a CDN, `isAllowedImportPath` checks the path against `document.baseURI`, while `import()` resolves it against the CDN module. That mismatch predates this change, but it's worth revisiting: built-ins come from a fixed internal map, so arguably they shouldn't go through the allow-list at all.

### Build note

`tsconfig.json` only reaches modules through static imports from `index.ts`, so `handlers/itemscopeTree.ts` isn't covered by `tsc -p .`. The same is true of the other lazily loaded handlers, such as `microDataJoin` and `lazyLoad`. Whatever build produces those `.js` files will need to pick this one up too.

### Verified

- `tsc --noEmit` is clean for the project, and for the new handler together with `index.ts`.
- Compiled into a scratch directory (the repo's `.js` was untouched) and run in Chromium:
  - `itemscope-tree`: **24/24**
  - `itemscope-managers` (regression check of the `ish` refactor): **22/22**
- Not run: the full Playwright suite, and Firefox/WebKit.

## Bruce's Response -- Unit Test Failing

npm run test itemscope-tree

is failing.  I did compile the typescript.

Please investigate.

---

## Investigation: why the test failed

**Cause:** `handlers/itemscopeTree.js` was never generated. This is the gap described in the "Build note" above. `tsconfig.json` only compiles what's reachable via static imports from its `include` list. `itemscopeTree` is only ever loaded dynamically, via the `BUILT_IN_MAP` string, so `tsc -p .` skipped it. The browser then got the dev server's 404 page (served as `text/plain`) instead of a module:

```
Loading module from "http://localhost:8000/handlers/itemscopeTree.js" was blocked because of a disallowed MIME type ("text/plain").
```

My earlier run passed because I compiled that file explicitly into a scratch directory, which hid the problem.

**Fix:** I added `"handlers/itemscopeTree.ts"` to `include` in `tsconfig.json`. Your running `tsc` watcher picked up the change and emitted `handlers/itemscopeTree.js`.

**Results:**
- `npx playwright test itemscope-tree`: 3/3 passed (chromium, firefox, webkit; 24/24 assertions each).
- Full `npx playwright test`: **114/114 passed**, including the `loadBuiltIn` path change.

**Why not `"handlers/*.ts"`:** I tried it first, and it's arguably the better long-term entry, since it would keep new handlers from hitting this again. But it surfaces an existing type error that's unrelated to this work:

```
handlers/lazyLoadSwitch.ts(59,11): error TS2416: Property 'assign' in type 'LazyLoadSwitchHandler'
is not assignable to the same property in base type 'LazyLoadHandler'.
  Type 'LazyLoadResolvedParams' is missing the following properties from type
  'LazyLoadSwitchResolvedParams': lhs, rhs
```

`lazyLoad.js`, `microDataJoin.js` and `rangeSelector.js` exist only from earlier builds; nothing in the current `tsconfig.json` would regenerate them. If you'd like, I can switch to `"handlers/*.ts"` and fix the `lazyLoadSwitch` typing as a separate change.
