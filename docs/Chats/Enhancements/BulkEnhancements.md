# Bulk Enhancements

---

## Human Ask

First of all, I'm not sure the documentation in README.md provides sufficient guidance on using assignGingerly to apply an enhancement with parameters, that don't use symbols (and the symbols make it difficult to use with JSON).  The README.md does showcase:

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    style: {
      height: '40px'
    },
    enh: {
      mellowYellow?.madAboutFourteen': true
    }
}, {
    registry: EnhancementRegistry
});
```

I guess the demonstration of mellowYellow?.madAboutFourteen': true is fairly clear.  Maybe it is sufficient, not sure.

Regardless, all the examples provided work best with assignGingerly when there's one or more values that need to be passed to the enhancement.  But what if we just want to do a bulk, parameterless enhancement of multiple elements?

Additionally, it does require a separate step to register the mellowYellow enhancement.

## Support for phase II distributing property values by name

I was considering the "Phase II" item that was left standing in the phase I [inferred assignments](../SubObjectDistributing.md):

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: ['firstName', 'lastName'],  // phase II
}
```

The thing is, I'm not sure one way downward assignment of values from the host to input elements has enough use cases to warrant carving out a whole convenience approach to it, not nearly as much as for itemprop, especially with support for ish/itemscope managers.

Don't get me wrong -- I'm not that opposed -- even if it is used infrequently, since the code would be loaded on demand, I think maybe the benefits outweigh the negiglible harms.  In fact, one scenario where I think it would be quite useful is for readonly / disabled inputs with type=checkbox.

So I will likely create a separate document for this phase II requirement, now that I think about it.  Let me know your thoughts.

Instead, what I'm thinking about is a more common requirement -- things like two-way bindings.  Two-way bindings are kind of out of scope for something that is assigning in one direction, which the term "assign" strongly implies.  Except that we are providing paths for "assigning" enhancements.

One "parameterless" enhancement I'm thinking we would want to assign in bulk would be [be-bound](https://raw.githubusercontent.com/bahrus/be-bound/refs/heads/baseline/README.md).  Note the many examples where no specific instructions are provided.  It infers what to do, and in fact is using the inferencer library which has since been ported into this package. 

So this requirement is searching for a convenient way to enhance a bulk number of elements with one or more parameterless enhancements.  These could not only be applied to editable input or form-associated custom elements, but also things like span's with itemprop attributes but also with contenteditable attributes.

This would **not** benefit from any caching for rapid updates with subsequent changes to the vm.  It might in fact make sense to support this beyond assignFrom, even supporting it for assignGingerly.

I have some ideas for how I could see providing that convenience, but I wanted to get your ideas first, so I don't bias your thinking (if that is of concern?).

---

## Feedback

### The Problem Distilled

You want to say: "take these N elements inside a container and enhance them all with enhancement X (no parameters needed)." The enhancement does the rest (e.g., `be-bound` infers what to bind based on the element's name, type, itemprop, etc.).

Currently, enhancing a single element requires either:
- Symbol-based: `element.set[mySymbol] = value` (not JSON-friendly)
- `enh` path: `{ '?.enh?.mellowYellow?.someProp': true }` (verbose, one-at-a-time)
- Explicit `element.enh.get(registryItem)` (imperative)

None of these are ergonomic for "enhance 20 elements with the same enhancement, no parameters."

### My Ideas (Unbiased by Yours)

#### Idea 1: `enhance` Option on `assignFrom` / `assignGingerly`

A top-level option that applies enhancements to matched elements in bulk:

```ts
await assignFrom(shadowRoot, {}, {
    from: vm,
    enhance: {
        // Key = enhKey or import path to register
        'be-bound': {
            match: '[name]',           // CSS selector for elements to enhance
            // config: {},             // optional per-element config (omit for parameterless)
        },
        'be-observant': {
            match: '[itemprop]',
        }
    }
});
```

Or even simpler for parameterless:

```ts
enhance: {
    'be-bound': '[name]',              // shorthand: string = match selector
    'be-observant': '[itemprop]',
}
```

**How it works:**
1. For each entry in `enhance`, find all elements matching the selector within the target
2. Filter by scope perimeter (respect itemscope boundaries if relevant)
3. For each matched element, call `element.enh.get(registryItem)` — which triggers lazy spawn if not already enhanced
4. If config is provided, pass it as initVals

**Pros:** Declarative, bulk, JSON-friendly (enhKey is a string, selector is a string).
**Cons:** Requires the enhancement to be registered already (or auto-loaded by enhKey).

#### Idea 2: `enhance` as Part of `inferredAssignments`

Piggyback on the existing inference machinery:

```ts
inferredAssignments: {
    byItemprop: ['name', 'email'],
    enhance: {
        'be-bound': { match: '[name]' },
    }
}
```

This keeps all the "find elements and do things" logic together. But it's conceptually different — inferring *values* vs applying *enhancements* are distinct operations.

#### Idea 3: Standalone `enhanceAll` Function

A dedicated utility, not tied to `assignFrom`:

```ts
import { enhanceAll } from 'assign-gingerly/enhanceAll.js';

enhanceAll(shadowRoot, {
    'be-bound': '[name]',
    'be-observant': '[itemprop]',
});
```

**Pros:** Can be used with `assignGingerly` (as you noted), not coupled to `assignFrom`.
**Cons:** Another function to learn. But it's focused and clear.

#### Idea 4: Enhancement Auto-Apply via Registry Config

When registering an enhancement, declare *where* it should auto-apply:

```ts
enhancementRegistry.push({
    spawn: BeBound,
    enhKey: 'be-bound',
    autoApply: '[name]',  // auto-enhance any matching element when assignGingerly touches it
});
```

Then `assignGingerly` (or `assignFrom`) checks the registry for any `autoApply` configs and enhances matching elements within the target. This is the most "automatic" approach — zero extra syntax at call time.

**Pros:** Define once, applies everywhere. Zero ceremony at each `assignFrom` call.
**Cons:** Implicit magic. Hard to know what's happening without checking the registry.

### My Recommendation

**Idea 1 (the `enhance` option)** is the sweet spot:
- Explicit — you see at the call site what's being enhanced
- Bulk — one selector covers many elements
- JSON-friendly — all strings
- Works for both `assignFrom` and `assignGingerly` (add to `IAssignGingerlyOptions`)
- Supports both parameterless and parameterized enhancements
- Scope perimeter can be applied (or not, based on config)

The shorthand form for parameterless is just a selector string:

```ts
assignGingerly(shadowRoot, {
    '?.someProperty': 'value'
}, {
    enhance: {
        'be-bound': '[name]',
    }
});
```

### On `byName` (Phase II)

I agree — creating a separate document makes sense. The downward value-push for named inputs is a different concern from bulk enhancement. Both are useful but serve different purposes. `byName` for readonly/disabled inputs with initial values is legitimate (form pre-fill), even if less common than itemprop.

### On `assignGingerly` Support

Agree that this should work beyond `assignFrom`. The `enhance` option on `IAssignGingerlyOptions` would apply after all normal assignments are processed — a post-assignment enhancement step. For `assignGingerly` it could be synchronous (just trigger `enh.get` which lazily spawns). For `assignFrom` it's already async anyway.

### Questions

1. **Does Idea 1 (`enhance` option with selector) resonate?** Or does one of the others feel more right?
2. **For auto-loading: should the enhKey be sufficient to find the enhancement (assuming it's registered)?** Or should `enhance` also support an import path for lazy-loading the enhancement module?
3. **Scope perimeter:** Should `enhance` respect itemscope boundaries by default, or only when explicitly requested?
4. **Should I hold off and hear your ideas first?** You mentioned having some — happy to compare approaches.

---

## Human Response I

I think Idea 1 is definitely going in the right direction, and some of the questions you raise are quite apt.  

In fact, it made me realize that to some degree, we (I blame myself) are "reinventing the wheel" of [mount-observer's emc scripts](https://github.com/bahrus/mount-observer#element-mount-configuration-emc-scripts):

```html
<!-- Define enhancement configuration -->
<script type="emc">
{
    "matching": ".interactive",
    "enhConfig": {
        "spawn": "./my-enhancement.js",
        "enhKey": "myEnhancement"
    }
}
</script>

<!-- Elements matching the selector get enhanced -->
<div class="interactive">This will be enhanced</div>
<div class="interactive">This too</div>
```

Each enhancement package I define includes one or more such "emc" json files.  For example, [this is an emc for be-bound](https://raw.githubusercontent.com/bahrus/be-bound/refs/heads/baseline/emc.json).

Those emc files can do much, much more than css matching.  They can observe browser media queries, for example, and observe viewport "intersections" so that the enhancement is only loaded when it scrolls into view.

I'm thinking that assignFrom could support a tiny fraction of what mount-observer supports, basically, the exact features exhibited above (including withAttr support within the enhConfig). But allow for overriding the "match", and only consider the withAttrs if "parse" is specified, maybe allow for other overrides as well (phase II?).   

```ts
await assignFrom(shadowRoot, {}, {
    from: vm,
    enhance: [
        {
            EMCImportJSON: 'be-bound/emc.json',
            matching: '[name]' //overrides matching in the emc.json
            parse: false,//default -- don't parse attributes. true is Phase II
        },
        {
            EMCImportJSON: 'be-observant/emc.json',
            matching: '[itemprop]',
            
        }
    ]
});
```





---

## Response to Human Response I

### The EMC JSON Approach — Good Direction

This is smart. Rather than inventing a new config format, you're reusing the existing EMC (Element Mount Configuration) structure that enhancement packages already publish. `assignFrom` just needs to:

1. Dynamically import the EMC JSON
2. Extract the `enhConfig` (spawn path, enhKey, withAttrs)
3. Find matching elements (using `matching` override or the EMC's own selector)
4. Spawn the enhancement on each matched element

This means every enhancement that already has an `emc.json` works out of the box — no new registration step needed.

### How I'd Implement It

```ts
interface EnhanceConfig {
    /** Path to the EMC JSON file (dynamic import) */
    EMCImportJSON: string;
    /** Override the CSS selector from the EMC (optional) */
    matching?: string;
    /** Whether to parse attributes via withAttrs (default: false) */
    parse?: boolean;
}
```

Processing:

```ts
async function processEnhance(
    target: Element,
    enhance: EnhanceConfig[]
): Promise<void> {
    for (const entry of enhance) {
        // 1. Import the EMC JSON
        const emc = (await import(entry.EMCImportJSON, { with: { type: 'json' } })).default;
        const { enhConfig } = emc;

        // 2. Determine the selector
        const selector = entry.matching ?? enhConfig.matching ?? '*';

        // 3. Find matching elements
        const elements = target.querySelectorAll(selector);

        // 4. For each element, spawn the enhancement
        for (const el of elements) {
            // Get or create the enhancement instance
            const registryItem = await resolveRegistryItem(enhConfig, target);
            (el as any).enh.get(registryItem);

            // If parse: true, also parse attributes via withAttrs
            if (entry.parse && enhConfig.withAttrs) {
                // Parse attributes into initVals and apply
                // (reuse existing parseWithAttrs infrastructure)
            }
        }
    }
}
```

### Key Design Points

1. **Dynamic JSON import:** `import('be-bound/emc.json', { with: { type: 'json' } })` uses import assertions. This requires the environment to support JSON modules (modern browsers do, Node 18+ does). If not available, a `fetch` fallback could work.

2. **Enhancement registration:** The EMC's `enhConfig.spawn` is a bare specifier path to the enhancement module. The system would need to:
   - Check if the enhKey is already registered in the element's enhancement registry
   - If not, dynamically import the spawn module and register it
   
   This mirrors what mount-observer does — lazy load + register on first encounter.

3. **Scope perimeter:** Should `matching` respect itemscope boundaries? For `be-bound` with `[name]`, you probably want all matching elements regardless of nesting (form elements don't have the same scoping concept as itemprop). I'd say: **no scope perimeter by default** for `enhance`. Let the selector do the filtering.

4. **`parse: false` (default):** Most parameterless enhancements don't need attribute parsing — they infer everything. `parse: true` would trigger the full `withAttrs` parsing pipeline from the EMC config. Good phase II boundary.

### On `assignGingerly` Support

For `enhance` to work with `assignGingerly`, the enhancement spawning would need to be synchronous (or fire-and-forget async). Since `enh.get(registryItem)` triggers lazy spawn which may be async (dynamic import of the enhancement module), this is inherently async.

Options:
- **`assignGingerly`:** Fire-and-forget the enhancement. `assignGingerly` stays synchronous, but the enhancements are applied asynchronously in the background.
- **`assignFrom`:** `await` the enhancement processing (already async).

This matches how `assignGingerly` currently handles the `ish` property — fire-and-forget async setup.

### On Import Assertions for JSON

One concern: `import('be-bound/emc.json', { with: { type: 'json' } })` might not work in all environments. Alternatives:
- `fetch` the JSON and parse it (works everywhere but requires the file to be served)
- Have the EMC as a `.js` module that exports the object (no import assertion needed)

Many of your packages might already have both formats. If not, a small wrapper works:
```js
// be-bound/emc.js
export default { "enhConfig": { ... }, "customData": { ... } };
```

### Questions

1. **JSON import or `.js` module?** Should `EMCImportJSON` support both, or should we recommend `.js` wrappers for broader compatibility?
2. **How to resolve the enhancement's registry item from the EMC?** Should `assignFrom` register it in the element's enhancementRegistry if not already present?
3. **Should `enhance` apply scope perimeter, or just use the raw querySelectorAll?**
4. **Ready to implement, or more discussion needed?**

---

## Human Response II

First, I think it would make sense to also adopt your Idea 3, I think:

Define a separate module / function:

```JS
await enhanceAll(shadowRoot, [
    {
        EMCImportJSON: 'be-bound/emc.json',
        matching: '[name]' //overrides matching in the emc.json
        parse: false,//default -- don't parse attributes. true is Phase II
    },
    {
        EMCImportJSON: 'be-observant/emc.json',
        matching: '[itemprop]',
        
    }
]);
```

assignFrom would call out to it.

Maybe we can consider alternative names.  First, EMCImportJSON is a bit long but descriptive.  Any better alternatives?

> **JSON import or `.js` module?**

Let's continue to treat this as a forward looking library, and assume and require that JSON import is supported, (it's fine to fail in an ugly way if it isn't), and not support any js alternative.

> Should `assignFrom` register it in the element's enhancementRegistry if not already present?

Yes (and enanceAll).  Perhaps if a use case arises, we can introduce another override like (noRegister).

> **Should `enhance` apply scope perimeter, or just use the raw querySelectorAll?**

querySelectorAll.  We should spell out no support for "beVigilant", and point to mount-observer for such support.

---

## Response to Human Response II

### On `EMCImportJSON` Naming

It is descriptive but long. Alternatives:

| Name | Meaning | Feel |
|------|---------|------|
| `EMCImportJSON` | Full description | Clear but verbose |
| `emc` | Short for Element Mount Configuration | Very short, might be unclear to newcomers |
| `emcPath` | The path to the EMC file | Shorter, hints at it being a path |
| `from` | "Enhance from this config" | Collides with `options.from` |
| `config` | Generic | Too generic |
| `src` | Source path (like `<script src>`) | Short, familiar HTML concept |
| `import` | "Import this EMC" | Reserved word (but fine as object key) |
| `emcSrc` | EMC source path | Short enough, descriptive |

**My pick: `emc`**

It's the established term in your ecosystem. Anyone using mount-observer already knows what EMC means. And it's 3 characters:

```ts
await enhanceAll(shadowRoot, [
    { emc: 'be-bound/emc.json', matching: '[name]' },
    { emc: 'be-observant/emc.json', matching: '[itemprop]' },
]);
```

If you want slightly more clarity without full verbosity, `emcSrc` works too.

### On the Function Name: `enhanceAll`

`enhanceAll` is clear and action-oriented. Alternatives considered:

| Name | Feel |
|------|------|
| `enhanceAll` | "Enhance all matching elements" — clear |
| `applyEnhancements` | More formal, slightly long |
| `enhance` | Too generic as a standalone export |
| `mount` | Collides with mount-observer concept |
| `bulkEnhance` | Emphasizes the bulk aspect |

I'd stick with **`enhanceAll`**.

### On the `enhance` Option Name in `assignFrom`

When it's an option on `assignFrom`, should it also be called `enhance`?

```ts
await assignFrom(shadowRoot, {}, {
    from: vm,
    enhance: [...]  // calls enhanceAll internally
});
```

`enhance` as an option name is short and clear. It parallels `inferredAssignments` as a "post-processing" step.

### Summary — Final Naming Proposal

| Thing | Name |
|-------|------|
| Standalone function | `enhanceAll` |
| Option on assignFrom/assignGingerly | `enhance` |
| Config field for EMC path | `emc` |
| Config field for selector override | `matching` |
| Config field for attribute parsing | `parse` (default: `false`) |

```ts
// Standalone:
import { enhanceAll } from 'assign-gingerly/enhanceAll.js';
await enhanceAll(shadowRoot, [
    { emc: 'be-bound/emc.json', matching: '[name]' },
]);

// As assignFrom option:
await assignFrom(shadowRoot, {}, {
    from: vm,
    enhance: [
        { emc: 'be-bound/emc.json', matching: '[name]' },
    ]
});
```

Does `emc` work as the field name, or do you prefer something else?

---

## Human Response III

I agree with all your recommendations.  emc and enhanceAll for function, enhance within assignFrom.


