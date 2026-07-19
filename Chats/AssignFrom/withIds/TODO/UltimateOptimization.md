# Ultimate Optimization

---

# Human Ask

I am perplexed how to create an authoring utility to help make use of this feature robust to UI redesign, but perhaps you have some ideas on that.

The easier thing to implement, though is the following optimization:

```html
<form id=oForm>
    <label>My Label</label>
    <input>
</form>
```

```JS
assignFrom(oForm, {
    '#[b]?.htmlFor': '#[a]?.id'
}, {
    ...
    withIds: {
        a: [0, 1],
        b: [0, 2]
    },
    withMethods: ['querySelector']
})
```

So if the rhs of the expressions inside the withIds is an array, assume it it lists the sequence of index of element children.

How much weight would this add?  Do you agree, that without the added one-time download time of that code, it is the fastest way to specify the element?

Any idea how to improve the DX for this during build time / server side rendering time?  Assume the html is defined as a const variable using a (tagged) template literal to define it.

---

## AI Response

### Is indexed child traversal the fastest way?

Yes — `element.children[i]` is essentially a direct memory offset into the element's child list. It's O(1) per step and doesn't involve any string parsing, selector matching, or tree walking. The total cost for `[0, 1]` is two property accesses — effectively ~2-4ns. That's faster than:

- `getElementById` (~10-100ns)
- `WeakRef.deref()` (~10-40ns)
- `querySelector` (~3,000-17,000ns)

The only thing faster would be a pre-cached direct reference (which is what the WeakRef gives you on subsequent calls). So indexed traversal is the optimal *first-access* strategy — and combined with the existing WeakRef caching, subsequent accesses remain at ~10ns.

### Weight cost

Minimal. The resolution logic is:

```JS
// In resolveIdVariable, new branch for array config:
if (Array.isArray(config)) {
    let current = target;
    for (const idx of config) {
        if (!current) break;
        current = current.children[idx];
    }
    return current;  // then cache as usual
}
```

That's ~8 lines. No new imports, no new modules. The array type check (`Array.isArray`) is one of the cheapest operations in JS.

Total weight added to `resolveIdRef.ts`: maybe 150 bytes minified. Negligible.

### Do I agree it's the fastest?

For first access, yes — nothing beats direct child indexing short of having a pre-existing reference. The cost hierarchy:

```
First access:
  children[i][j]     ~2-4ns    ← proposed
  getElementById     ~10-100ns  ← current string form
  querySelector      ~3,000-17,000ns ← current qry form

Subsequent access (all forms, via WeakRef cache):
  WeakRef.deref()    ~10-40ns
```

So the array form gives you 10-100× faster *first access* vs getElementById, and 1000× faster vs querySelector. After that, all forms converge to WeakRef speed.

### DX for build time / tagged template literals

This is the interesting challenge. The indexed path `[0, 1]` is fragile — adding a `<div>` wrapper or reordering elements breaks it. You need a way to *derive* the indices from the authored HTML at build time.

**Idea: A tagged template literal that computes indices**

```TS
import { indexedTemplate } from 'assign-gingerly/indexedTemplate.js';

const { html, ids } = indexedTemplate`
    <form>
        <label ${'labelEl'}>My Label</label>
        <input ${'inputEl'}>
    </form>
`;

// html = '<form><label>My Label</label><input></form>'
// ids = { labelEl: [0, 0], inputEl: [0, 1] }
```

The tagged template:
1. Parses the HTML structure at build time (or server-side)
2. Each `${'name'}` interpolation marks an element for indexing
3. Computes the child-index path from root to each marked element
4. Returns clean HTML (markers removed) + the `ids` map ready for `withIds`

**How it stays robust to redesign:**

- You author `${'labelEl'}` right on the element — it's visually tied to the DOM structure
- If you reorder elements, the tag re-computes indices automatically
- The names (`labelEl`, `inputEl`) are stable references that don't change when structure changes
- At build time, the compiler evaluates the tag and emits static `ids` constants — zero runtime parsing

**Usage:**

```TS
const { html, ids } = indexedTemplate`...`;

// At runtime (e.g., in a custom element):
this.shadowRoot.innerHTML = html;
assignFrom(this.shadowRoot.firstElementChild, pattern, {
    from: vm,
    withIds: ids,  // { labelEl: [0, 0], inputEl: [0, 1] }
});
```

**Build-time optimization:**

A Babel/TypeScript transformer could evaluate `indexedTemplate` at compile time, replacing:

```TS
const { html, ids } = indexedTemplate`<form><label ${'a'}>...</label><input ${'b'}></form>`;
```

with:

```TS
const html = '<form><label>...</label><input></form>';
const ids = { a: [0, 0], b: [0, 1] };
```

Zero runtime overhead — the HTML parsing happens once during build, and the output is just string + object literals.

### Alternative: marker attributes stripped at build time

```TS
const template = html`
    <form>
        <label ref="labelEl">My Label</label>
        <input ref="inputEl">
    </form>
`;
```

A build plugin scans for `ref="..."` attributes, computes child indices, strips the attributes from the output HTML, and generates the `withIds` map. This is closer to how frameworks like Solid.js handle template compilation.

### Summary

| Aspect | Assessment |
|--------|-----------|
| Runtime speed | Fastest possible first-access (~2-4ns per step) |
| Code weight | ~150 bytes minified |
| DX concern | Fragile to structural changes without tooling |
| Tooling solution | Tagged template that computes indices from marked elements |
| Build optimization | Compiler evaluates tag statically → zero runtime parsing |

The implementation is trivial; the DX tooling is the real project. I'd suggest implementing the array form in `resolveIdRef` now (cheap, fast, useful for generated configs) and tackling the `indexedTemplate` tag as a separate follow-up when you're ready to build the authoring tool.

---

## Human Response I

Please implement the array coordinates for now, and briefly mention in README.md.  Thanks for the thoughts on authoring.  Will think further about it.  

---

## Implementaation Notes

I need to update the `WithIdConfig` type and add the array form handling. Let me see the type definition:

Now add the array form handling in the resolution logic:

Now update the JS file:

Let me verify no TS errors:

Now let me run the existing `rhs-id-ref` tests plus a quick inline test to confirm the array form works:

Existing tests still pass. Let me add a quick test for the array form to the same test file:

All 13 tests pass (10 existing + 3 new array form tests). Let me run across all browsers:

13/13 across all browsers. Done — the array form for `withIds` is implemented:

- `withIds: { a: [1] }` → `target.children[1]`
- `withIds: { a: [0, 0] }` → `target.children[0].children[0]`

~6 lines added to `resolveIdRef.ts` / `.js`. Once resolved, the element is cached via WeakRef just like the other forms — so subsequent accesses are still ~10ns.