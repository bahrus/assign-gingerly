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
    }
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
