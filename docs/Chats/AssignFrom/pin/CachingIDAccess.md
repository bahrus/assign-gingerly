# Caching ID Access

---
## Human Ask

The page /demos/experiments/getElementById-vs-querySelector-perf.html largely confirms what we might expect as far how to optimize repeated access to an element, starting from the shadowRoot, say:

Chrome 150:

<table>
                    <tbody><tr>
                        <th>Method</th>
                        <th>10 elements</th><th>100 elements</th><th>1000 elements</th><th>5000 elements</th>                    </tr>
            <tr><td>shadowRoot.getElementById(id)</td><td class="fastest">46.0 ns</td><td class="">47.0 ns</td><td class="">106.0 ns</td><td class="">100.0 ns</td></tr><tr><td>shadowRoot.querySelector(#id)</td><td class="">46.0 ns</td><td class="fastest">44.0 ns</td><td class="">144.0 ns</td><td class="">144.0 ns</td></tr><tr><td>shadowRoot.querySelector(.class)</td><td class="fastest">36.0 ns</td><td class="">167.0 ns</td><td class="">3760.0 ns</td><td class="">9660.0 ns</td></tr><tr><td>WeakRef.deref() (single cached ref)</td><td class="">13.0 ns</td><td class="">17.0 ns</td><td class="">20.0 ns</td><td class="fastest">11.0 ns</td></tr><tr><td>Map&lt;id, WeakRef&gt;.get(id).deref()</td><td class="">16.0 ns</td><td class="">17.0 ns</td><td class="">24.0 ns</td><td class="fastest">12.0 ns</td></tr><tr><td>Direct reference (baseline)</td><td class="">3.0 ns</td><td class="">3.0 ns</td><td class="">6.0 ns</td><td class="">2.0 ns</td></tr></tbody></table>


Firefox 152:

<table>
                    <tbody><tr>
                        <th>Method</th>
                        <th>10 elements</th><th>100 elements</th><th>1000 elements</th><th>5000 elements</th>
                    </tr>
            <tr><td>shadowRoot.getElementById(id)</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td></tr><tr><td>shadowRoot.querySelector(#id)</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td></tr><tr><td>shadowRoot.querySelector(.class)</td><td class="fastest">50.0 ns</td><td class="">130.0 ns</td><td class="">1250.0 ns</td><td class="">6810.0 ns</td></tr><tr><td>WeakRef.deref() (single cached ref)</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="">30.0 ns</td><td class="fastest">20.0 ns</td></tr><tr><td>Map&lt;id, WeakRef&gt;.get(id).deref()</td><td class="fastest">20.0 ns</td><td class="">30.0 ns</td><td class="fastest">20.0 ns</td><td class="">40.0 ns</td></tr><tr><td>Direct reference (baseline)</td><td class="">0.0 ns</td><td class="">0.0 ns</td><td class="">0.0 ns</td><td class="">0.0 ns</td></tr></tbody></table>

Playwright Safari on Windows:

<table>
    <tbody>
        <tr>
            <th>Method</th>
            <th>10 elements</th>
            <th>100 elements</th>
            <th>1000 elements</th>
            <th>5000 elements</th>
        </tr>
        <tr>
            <td>shadowRoot.getElementById(id)</td>
            <td class="">20.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>shadowRoot.querySelector(#id)</td>
            <td class="">320.0 ns</td>
            <td class="">300.0 ns</td>
            <td class="">310.0 ns</td>
            <td class="fastest">260.0 ns</td>
        </tr>
        <tr>
            <td>shadowRoot.querySelector(.class)</td>
            <td class="fastest">290.0 ns</td>
            <td class="">880.0 ns</td>
            <td class="">7390.0 ns</td>
            <td class="">17770.0 ns</td>
        </tr>
        <tr>
            <td>WeakRef.deref() (single cached ref)</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>Map&lt;id, WeakRef&gt;.get(id).deref()</td>
            <td class="">40.0 ns</td>
            <td class="">30.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>Direct reference (baseline)</td>
            <td class="">10.0 ns</td>
            <td class="">0.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="">0.0 ns</td>
        </tr>
    </tbody>
</table>

To summarize:

Safari is the most dramatic result:

- **`getElementById` — 10ns flat.** Fastest of the three engines for DOM ID lookup.
- **`querySelector('#id')` — 260-320ns.** Surprisingly, Safari's `querySelector` with an ID selector is **30x slower** than `getElementById`. Unlike Chrome/Firefox where they're in the same ballpark, WebKit clearly doesn't optimize `querySelector('#id')` into an ID lookup.
- **`querySelector('.class')` — scales to 17,770ns at 5000 elements.** Worst of all three engines at scale.
- **WeakRef/Map — 10ns.** Matches `getElementById` exactly. At the timer resolution floor.

### Cross-Engine Summary

| Method | Chrome (5000) | Firefox (5000) | Safari (5000) |
|--------|--------------|----------------|---------------|
| getElementById | 100ns | 20ns | 10ns |
| querySelector(#id) | 144ns | 40ns | 260ns |
| querySelector(.class) | 9,660ns | 6,810ns | 17,770ns |
| WeakRef (single) | 11ns | 20ns | 10ns |
| Map<id, WeakRef> | 12ns | 40ns | 10ns |

**Conclusions:**

1. **Never use `querySelector('.class')` in a hot path.** All engines agree — it's 100-1700x slower than alternatives at scale.
2. **`querySelector('#id')` is NOT equivalent to `getElementById`** — Safari proves this definitively (30x difference). Always prefer `getElementById`.
3. **WeakRef caching is universally optimal** — matches or beats `getElementById` on every engine. The Map lookup overhead is negligible.
4. **The WeakRef + Map strategy is the clear winner** for any handler that repeatedly resolves elements: ~10-12ns across all engines, with automatic GC cleanup and a cheap `getElementById` fallback on cache miss.

So for this package to be optimal for repeated calls, ideally there would be a way to point to DOM elements by id and cache them with weak maps, especially the lhs of all the functions (assign-gingerly, assign-tentatively, and assign-from).

## Very Tentative Proposal:

Scenario I.  Element without an ID

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="happyMood">
                    <div>I am happy</div>
                    <div>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: false
}

assignFrom(document.body, {
    '#[x] =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
        }
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
    withIds: {
        x: {
            qry: '.mainView',
        }
    }
})
```

The id will *not* be set to x, that's like a variable.  It will be set to as predictable and small an id as possible (not a guid), unique within the rootNode.

### Scenario II ID already present

```html
<html>
    <head>...</head>
    <body>
        <div .mainView id=myUniqueId>
            My Mood:
            <div .mainView>
                <?start name="happyMood">
                    <div>I am happy</div>
                    <div>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: false
}

assignFrom(document.body, {
    '#[x] =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
        }
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
    withIds: {
        x: {
            qry: '#myUniqueId',
        }
    }
})
```

---

## Feedback / Questions

### The Core Idea

A `#[x]` syntax in LHS paths that resolves to a cached element reference via `Map<variable, WeakRef>`. On first access, the element is found via a query (defined in `withIds`), assigned an ID if it doesn't have one, cached as a WeakRef, and on subsequent calls resolved via `getElementById` + WeakRef — giving you ~10ns repeated access instead of the querySelector cost.

This is smart. It separates "how to find the element the first time" from "how to reference it cheaply on subsequent calls."

### What I Like

1. **The variable indirection (`#[x]`)** — the pattern references a stable variable name, not a CSS selector or ID string. This means the pattern object stays clean and selector details live in `withIds`.

2. **Auto-ID assignment** — if the element doesn't have an ID, one is generated. This means the caching strategy works regardless of whether the author put IDs on their elements.

3. **WeakRef cache miss → fallback to `getElementById`** — the generated/existing ID provides a stable O(1) lookup path that doesn't degrade.

4. **Scope: rootNode** — the ID uniqueness and lookup are scoped to the rootNode (document or shadowRoot), which aligns with how IDs work natively.

### Questions / Concerns

1. **Where does the initial query run?**  
   In Scenario I, `qry: '.mainView'` — what is this queried against? The `target` (first argument to `assignFrom`)? The rootNode of the target? It matters because if `target` is `document.body`, `querySelector('.mainView')` on the body is different from `shadowRoot.querySelector('.mainView')`.
   
   My assumption: the query runs against the same target that was passed to `assignFrom` (or its rootNode). Worth being explicit.

2. **When does the initial query + ID assignment happen?**  
   - Eagerly (all `withIds` entries resolved at the start of `assignFrom` before processing patterns)?
   - Lazily (only when `#[x]` is first encountered during path evaluation)?
   
   Eager seems simpler and avoids ordering issues (e.g., a pattern that creates the element before another pattern references it via `#[x]`).

3. **ID generation strategy — "as predictable and small as possible"**  
   You mentioned not using a GUID, just something unique within the rootNode. Ideas:
   - Sequential counter per rootNode: `_a0`, `_a1`, `_a2`, ...
   - Based on the variable name: `_x`, `_y`, `_z` (but what if multiple `assignFrom` calls use the same variable name for different elements?)
   - Hash of the query string (deterministic, but potentially long)
   
   I'd suggest a short prefix + counter scoped to the rootNode: `_ag0`, `_ag1`, etc. (`ag` for assign-gingerly). This is short, predictable, and avoids collisions with author-defined IDs (the underscore prefix is rarely used by humans).

4. **Scenario II — `qry: '#myUniqueId'`**  
   If the element already has an ID, is the `qry` necessary at all? Could it just be:
   ```js
   withIds: {
       x: '#myUniqueId'  // shorthand: string = ID selector
   }
   ```
   Or even:
   ```js
   withIds: {
       x: 'myUniqueId'  // just the ID, no #
   }
   ```
   The object form (`{ qry: '...' }`) would be for the "find by class/attribute and assign an ID" case. The string form would be for "element already has an ID, just cache it."

5. **Multiple `assignFrom` calls sharing the same cache?**  
   If `assignFrom` is called repeatedly (e.g., on each reactive update), does the `withIds` cache persist across calls? It should — that's the whole point. Where does the cache live?
   - On the rootNode itself (e.g., `rootNode.__agIdCache`)?
   - In a module-level `WeakMap<rootNode, Map<variable, WeakRef>>`?
   
   A module-level WeakMap keyed by rootNode makes sense — it's GC-friendly (if the rootNode is removed, the whole cache is collected) and doesn't pollute the DOM object.

6. **Interaction with `withMethods` and `?.` paths**  
   Currently, `?.querySelector?..mainView` resolves the element inline during path evaluation. With `#[x]`, the path becomes just `#[x]` — the element is pre-resolved. Does this mean `#[x]` replaces the entire LHS path? Or can it be combined:
   ```js
   '#[x]?.querySelector?..childElement =>': { ... }
   ```
   i.e., `#[x]` resolves the cached element, then further path evaluation continues from there?

   I'd say: `#[x]` is a **root anchor** that replaces the starting point of path evaluation. Further `?.` segments can chain off it. This gives you cached access to a parent, then cheap navigation from there.

7. **Does this belong in `assignFrom` only, or also `assignGingerly`?**  
   The `withIds` option adds a resolution/caching layer. `assignGingerly` is synchronous and doesn't do resolution — it just merges. So `withIds` feels like an `assignFrom` concern (it resolves references before assignment). But `assignGingerly`'s `withMethods` already does querySelector inline... so there might be a case for it there too.
   
   My suggestion: start with `assignFrom` only. If demand arises for `assignGingerly`, the cache layer could be extracted into a shared utility.

### Suggested API Refinement

```js
assignFrom(document.body, {
    '#[x] =>': {
        do: 'builtIns.lazyLoad',
        resolve: { if: '?.isHappy', instantiate: 'globalThis://happyMood' }
    },
    // Can also chain from a cached element:
    '#[x]?.querySelector?..child?.textContent': '?.message'
}, {
    from: myVM,
    withMethods: ['querySelector'],
    withIds: {
        x: { qry: '.mainView' },           // find by class, auto-assign ID, cache
        y: 'myUniqueId',                    // already has ID, just cache the WeakRef
        z: { qry: '[data-route="home"]' },  // find by attribute
    }
});
```

### Implementation Sketch

```ts
// Module-level cache
const idCacheMap = new WeakMap<Node, Map<string, { id: string; ref: WeakRef<Element> }>>();

function resolveWithIds(
    target: Element | Document | ShadowRoot,
    withIds: Record<string, string | { qry: string }>
): Map<string, Element> {
    const rootNode = target.getRootNode() as Document | ShadowRoot;
    let cache = idCacheMap.get(rootNode);
    if (!cache) {
        cache = new Map();
        idCacheMap.set(rootNode, cache);
    }

    const resolved = new Map<string, Element>();

    for (const [varName, config] of Object.entries(withIds)) {
        const cached = cache.get(varName);
        if (cached) {
            const el = cached.ref.deref();
            if (el) {
                resolved.set(varName, el);
                continue;
            }
            // Cache miss — WeakRef was collected, re-lookup by ID
            const el2 = rootNode.getElementById(cached.id);
            if (el2) {
                cache.set(varName, { id: cached.id, ref: new WeakRef(el2) });
                resolved.set(varName, el2);
                continue;
            }
        }

        // First time — run the query
        const qry = typeof config === 'string' ? `#${config}` : config.qry;
        const el = (target as Element).querySelector?.(qry) ?? rootNode.querySelector(qry);
        if (!el) continue;

        // Ensure it has an ID
        let id = el.id;
        if (!id) {
            id = generateUniqueId(rootNode);
            el.id = id;
        }

        cache.set(varName, { id, ref: new WeakRef(el) });
        resolved.set(varName, el);
    }

    return resolved;
}
```

### Summary

The concept is sound and well-motivated by the perf data. Key decisions needed:

1. Where does the initial query run? (target vs rootNode)
2. Eager or lazy resolution of `withIds`?
3. ID generation format (suggest `_ag0`, `_ag1`, ...)
4. Shorthand for elements that already have IDs?
5. Can `#[x]` chain with further `?.` path segments?
6. `assignFrom` only, or shared with `assignGingerly`?

---

## Human Response I

> Where does the initial query run?

Good question.  Actually, on thinking about this question, I would like to propose an amendment.  Scratch that, on reading further, you provided a better idea, which I endorse:

### Scenario I - no id on the element in question:

Same as before

```JS
assignFrom(oElement, {...}
, {
    ...
    withIds: {
        x: {
            qry: '.mainView',
        }
    }
})
```

Definitely, qry should be run from the target, passed in argument, oElement in this case.

### Scenario II ID already present

```JS
assignFrom(oElement, {...}
, {
    ...
    withIds: {
        x: 'myUniqueId',
    }
})
```

That way there's no ambuity that we can use the faster getElementById to find the element that has the id.  Our performance tests show that's faster.

Here I'm more torn where the query should run from.  I think it is more in keeping with the concept of "assign" that we are only assigning things on the first argument, and within the first argument, with no side effects outside.  So I think still from oElement, the first assed in argument target.

If that argument isn't a DOM element, we could just let the browser throw an error when it tries to invoke the search for now.  Hopefully, the developer will understand why the error occurred from the context.  Maybe later we can throw a more explanatory error.  But regardless, the assign function should fail.

> **When does the initial query + ID assignment happen?** 

Another good question.  I agree eagerly seems easier, but if I squint my eyes, I could see scenarios where a developer would want a chain of processing, creating an element with one pattern, referencing it in the next.  Let's go with lazily if that doesn't add many lines of code.

> **ID generation strategy — "as predictable and small as possible"** 

`_ag0`, `_ag1`, etc. sounds good to me.

> Where does the cache live?

I agree:  a module-level `WeakMap<rootNode, Map<variable, WeakRef>>`

> **Interaction with `withMethods` and `?.` paths** 

Yes, I think the id substitution should have to begin the string, but after that, support for these would be great:

```js
'#[x]?.querySelector?..childElement =>': { ... }
```

**Does this belong in `assignFrom` only, or also `assignGingerly`?**

Let's go with your suggestion:  assignFrom only for now.  Since assignFrom is fundamentally asynchronous, the module can be imported dynamically on demand, ideally.  If use cases for assignGingerly become strong, the same module could be imported synchronously.


---

## Kiro's Response I

All clear. Summary of decisions:

| Question | Decision |
|----------|----------|
| Initial query scope | Runs against `target` (first argument to `assignFrom`) |
| Eager vs lazy | **Lazy** — resolve `#[x]` on first encounter during path evaluation |
| ID generation | `_ag0`, `_ag1`, ... (counter scoped to rootNode) |
| Shorthand | String = existing ID (`x: 'myUniqueId'`), Object = query + auto-ID (`x: { qry: '.mainView' }`) |
| Chaining | Yes — `#[x]` anchors the start, `?.` segments continue from there |
| Scope | `assignFrom` only for now |
| Cache location | Module-level `WeakMap<rootNode, Map<variable, { id, WeakRef }>>` |
| Error handling | Let browser throw naturally on non-DOM targets |

This is well-scoped and ready to implement when you're ready to move it out of TODO. The lazy resolution adds a few lines (resolve on first `#[x]` encounter rather than upfront) but fits naturally into the existing path evaluation flow in `processHandlerCommands` and the normal key processing.

Shall I implement this now, or park it for later?
