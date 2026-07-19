# Inferenced Assignment by Name

---

## Human Ask

Strictly speaking, using itemprop attributes on input elements doesn't appear to me to be conforming 100% to the microdata specs.  Am I wrong?  I very well could be.

Primarily for that reason, I think we should 

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: ['firstName', 'lastName'], // or true
}
```

By default, I think there should not be any donut hole scoping.  

But there are scenarios (for example, itemscope managers) that might want to support donut hole scoping.  To do so:

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: {
        props: ['firstName', 'lastName'], // or true?
        outside: 'fieldset'
    } 
}
```

I think this will require enhancing the ['@'] method in inferencer.

---

## AI Response

### On the microdata spec question

You're not wrong to be cautious. The microdata spec ([WHATWG HTML](https://html.spec.whatwg.org/multipage/microdata.html)) says `itemprop` defines "the property of an item." For form elements, the spec does define how to extract the "value" of an itemprop'd element — e.g., `<input itemprop="email">` yields `element.value`. So it's technically *conforming* to put `itemprop` on inputs. But it's semantically awkward — you're declaring "this input IS the email property" rather than "this input receives the email value." In practice, `name` is the established attribute for form element identity, and `itemprop` is for microdata semantics (structured data for search engines).

So yes — `byName` for form elements and `byItemprop` for display/microdata elements is the correct separation.

### Design assessment

**`byName: ['firstName', 'lastName']` (simple form)**

Clean. Queries `[name="${key}"]` within the target, uses the inferencer to determine the right property (`value`, `checked`, `selectedIndex`, etc.). No donut-hole scoping by default — just a flat querySelectorAll.

**`byName: { props: [...], outside: 'fieldset' }` (scoped form)**

Makes sense for complex forms where nested fieldsets group related controls. `outside: 'fieldset'` means "don't descend into fieldset boundaries that aren't ours" — same donut-hole concept as itemscope but with a different boundary element.

### The `['@']` method already does this

Looking at the inferencer code:

```ts
['@'](nameAttr: string, scopeBoundary?: string){
    const candidates = this.enhancedElement.querySelectorAll(`[name="${nameAttr}"]`);
    const filtered = scopeBoundary
        ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
        : Array.from(candidates);
    return filtered.map(x => new Infer(x, nameAttr));
}
```

This is exactly the API you need. The `scopeBoundary` parameter maps directly to `outside`:
- `byName: ['firstName']` → call `['@']('firstName')` (no boundary)
- `byName: { props: ['firstName'], outside: 'fieldset' }` → call `['@']('firstName', 'fieldset')`

So the inferencer doesn't need enhancement — the `['@']` method already supports optional scope boundaries. What's needed is the glue in `inferredAssignments.ts` / `processInferredAssignments` to:

1. Detect `byName` in the options
2. Normalize the config (array form vs object form)
3. Call `['@'](propName, scopeBoundary?)` for each prop
4. For each returned `Infer` instance, read `.valueProperty` and assign the source value

### Implementation scope

This is primarily a change in `inferredAssignments.ts` (the processing logic) — not the inferencer submodule. The inferencer's `['@']` method is already ready.

Estimated work:
- ~20-30 lines in `processInferredAssignments` to handle the `byName` option
- Type update in `types.d.ts` for the config shape
- No changes to the `inferencer/` submodule needed

### One question: `true` for byName?

For `byItemprop: true`, you enumerate all keys on the source object. For `byName: true`, what does "all" mean? All keys of `options.from`? That could be noisy for complex VMs. I'd suggest:
- `byName: true` → all own enumerable string keys of `from` (same behavior as `byItemprop: true`)
- But document that `byName: true` can be expensive for large source objects since it queries `[name="x"]` for every key

### Summary

| Aspect | Assessment |
|--------|-----------|
| Inferencer changes | None — `['@']` already supports name + scope boundary |
| Processing changes | ~20-30 lines in `inferredAssignments.ts` |
| Type changes | Add `byName` to `InferredAssignmentsConfig` in types.d.ts |
| Donut hole | `outside` maps directly to `scopeBoundary` param |
| Default scoping | None (flat querySelectorAll) — correct for forms |

---

## Human Response I

> One question: `true` for byName?

Let's go with your suggestion

Please implement and update the documentation.

---

## AI Response II

Done. Implemented `byName` for inferred assignments.

**Files modified:**
- `inferredAssignments.ts` / `.js` — added `byName` to the config interface + processing logic (~25 lines)
- `docs/inferred-assignments.md` — replaced "Future: byName (Phase II)" placeholder with full documentation

**Supported forms:**
- `byName: ['firstName', 'lastName']` — array of keys, no scoping
- `byName: true` — all own keys from `from` source
- `byName: { props: ['firstName'], outside: 'fieldset' }` — with donut-hole scoping

**How it works:**
- Uses the inferencer's `['@']` method (queries `[name="x"]`, optional scope boundary)
- Setting `match.value = x` uses `inferValueProperty` to determine the correct property (`value`, `checked`, `selectedIndex`, `dateTime`, etc.)
- No changes to the inferencer submodule — it already had the API

**No new tests added** (per your general instruction). The feature is exercised through the same code path as `byItemprop` — just using `['@']` instead of `['|']`.

---

## Human Response II

Looking at the inferencer.ts in the inferencer folder, I think maybe we can reduce the footprint by having some or all of them ('[|]', '[@]') call a private method, passing in just the query or something?


---

## AI Response III

Yes, absolutely. Looking at the methods, `['@']`, `['%']`, `['#']`, and `['.']` are all identical except for the query string construction. They all:

1. `querySelectorAll(someSelector)`
2. Optionally filter by `withScopePerimeter`
3. Map to `new Infer(x, propName)`

`['|']` is slightly different (always applies scoping with a default boundary), but could also use the shared helper.

A refactored version:

```ts
#queryScoped(selector: string, propName: string, scopeBoundary?: string): Infer[] {
    const candidates = this.enhancedElement.querySelectorAll(selector);
    const filtered = scopeBoundary
        ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
        : Array.from(candidates);
    return filtered.map(x => new Infer(x, propName));
}

['|'](itempropAttr: string, scopeBoundary: string = '[itemscope]') {
    return this.#queryScoped(`[itemprop="${itempropAttr}"]`, itempropAttr, scopeBoundary);
}

['@'](nameAttr: string, scopeBoundary?: string) {
    return this.#queryScoped(`[name="${nameAttr}"]`, nameAttr, scopeBoundary);
}

['%'](partAttr: string, scopeBoundary?: string) {
    return this.#queryScoped(`[part~="${partAttr}"]`, partAttr, scopeBoundary);
}

['#'](id: string, scopeBoundary?: string) {
    return this.#queryScoped(`#${id}`, id, scopeBoundary);
}

['.'](className: string, scopeBoundary?: string) {
    return this.#queryScoped(`.${className}`, className, scopeBoundary);
}
```

**Savings:** ~20 lines removed, replaced by one 6-line private method. The minified footprint drops by roughly 200-300 bytes since the duplicated filter/map logic compresses into a single function call.

**Caveat:** This is inside the `inferencer/` submodule, so it needs to be done as a change to that repo. But it's a pure refactor — no API change, no behavior change. Want me to make the change?

---

## Human Response IV

Yes, please.  Also, new requirement:

Can you allow for a more concise confiruation alternative (both should work):

```ts
inferredAssignments: {
    '|': ['user'],  // or true
    '@': {
        props: ['firstName', 'lastName'], // or true?
        outside: 'fieldset'
    } 
}
```

Those symbols relate to [another WHATWG proposal](https://github.com/WICG/webcomponents/issues/1013) I have with regards to template instantiation.

---

## AI Response IV

Done. Both changes implemented:

**1. Inferencer refactor** (`inferencer/inferencer.ts` / `.js`):
- Extracted `#queryScoped(selector, propName, scopeBoundary?)` private method
- All 5 query methods (`['|']`, `['@']`, `['%']`, `['#']`, `['.']`) now delegate to it
- ~20 lines removed, ~6 lines added

**2. Concise aliases** (`inferredAssignments.ts` / `.js`):
- `'|'` is an alias for `byItemprop`
- `'@'` is an alias for `byName`
- Resolution: `byItemprop ?? config['|']` and `byName ?? config['@']`
- Both forms work interchangeably; verbose names take precedence if both specified

**Usage:**
```ts
// Verbose
inferredAssignments: { byItemprop: ['user'], byName: ['firstName'] }

// Concise
inferredAssignments: { '|': ['user'], '@': ['firstName'] }

// Mixed
inferredAssignments: { '|': true, '@': { props: ['email'], outside: 'fieldset' } }
```

Documentation updated in `docs/inferred-assignments.md`.
